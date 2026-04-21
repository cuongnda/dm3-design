package cctv

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/natsutil"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

// TungSonHandlers handles TungSon VIID protocol HTTP endpoints.
type TungSonHandlers struct {
	db          *db.DB
	audit       *audit.Logger
	nats        *natsutil.Client
	objectStore objectstore.Store
}

// NewTungSonHandlers constructs TungSonHandlers.
func NewTungSonHandlers(database *db.DB, auditLog *audit.Logger, natsClient *natsutil.Client, objStore objectstore.Store) *TungSonHandlers {
	return &TungSonHandlers{
		db:          database,
		audit:       auditLog,
		nats:        natsClient,
		objectStore: objStore,
	}
}

// lookupCamera finds a provisioned camera by its device_id (short code).
// Returns tenant_id and device UUID. Error if not found.
func (h *TungSonHandlers) lookupCamera(ctx context.Context, cameraID string) (tenantID, deviceUUID string, err error) {
	err = h.db.Pool.QueryRow(ctx,
		`SELECT d.tenant_id::text, d.id::text
		 FROM dm3_devices.devices d
		 WHERE d.device_id = $1 AND d.type = 'camera'
		 LIMIT 1`, cameraID,
	).Scan(&tenantID, &deviceUUID)
	return
}

// isCCTVEnabled checks if tenant has cctv plugin enabled.
func (h *TungSonHandlers) isCCTVEnabled(ctx context.Context, tenantID string) bool {
	var enabled bool
	_ = h.db.Pool.QueryRow(ctx,
		`SELECT 'cctv' = ANY(enabled_plugins) FROM dm3_auth.tenants WHERE id = $1::uuid`,
		tenantID,
	).Scan(&enabled)
	return enabled
}

// ensureCameraRow creates the dm3_cctv.cameras row if it doesn't exist yet.
// This handles the case where a camera was approved via the pending flow
// (which only creates the dm3_devices.devices row) and needs its CCTV-specific
// metadata initialized on first contact after approval.
// cameraID is the device short code (e.g. "45010001501") used to build the RTSP URL.
func (h *TungSonHandlers) ensureCameraRow(ctx context.Context, deviceUUID, tenantID, clientIP, cameraID string) {
	var exists bool
	_ = h.db.Pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM dm3_cctv.cameras WHERE device_id = $1::uuid AND tenant_id = $2::uuid)`,
		deviceUUID, tenantID,
	).Scan(&exists)
	if exists {
		return
	}

	// Read device model to determine RTSP URL format and protocol
	var model string
	_ = h.db.Pool.QueryRow(ctx,
		`SELECT COALESCE(model,'') FROM dm3_devices.devices WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		deviceUUID, tenantID,
	).Scan(&model)

	rtspURL, protocol := buildCameraDefaults(model, clientIP, cameraID)

	_, err := h.db.Pool.Exec(ctx,
		`INSERT INTO dm3_cctv.cameras (device_id, tenant_id, rtsp_url, rtsp_username, recording_mode, pre_roll_sec, post_roll_sec, camera_protocol, camera_ip, last_heartbeat_at)
		 VALUES ($1::uuid, $2::uuid, $3, 'admin', 'event_only', 10, 20, $5, $4::inet, now())`,
		deviceUUID, tenantID, rtspURL, clientIP, protocol,
	)
	if err != nil {
		slog.Warn("cctv: ensure camera row failed (may already exist)", "error", err, "device_id", deviceUUID)
	}
}

// buildCameraDefaults returns the default RTSP URL and camera_protocol based on device model.
func buildCameraDefaults(model, clientIP, cameraID string) (rtspURL, protocol string) {
	switch model {
	case "tungson":
		// TungSon: rtsp://{ip}:554/live_{device_id}_ch0_s0
		return fmt.Sprintf("rtsp://%s:554/live_%s_ch0_s0", clientIP, cameraID), "viid_tungson"
	case "tbvision":
		// TBVision: rtsp://{ip}:554/stream1
		return fmt.Sprintf("rtsp://%s:554/stream1", clientIP), "http_tbvision"
	default:
		// Generic RTSP camera
		return fmt.Sprintf("rtsp://%s:554/", clientIP), "rtsp_only"
	}
}

// viidResponse builds a standard VIID ResponseStatusObject JSON.
func viidResponse(requestURL, statusCode, statusString, id string, extendCmd int) VIIDResponseStatus {
	resp := VIIDResponseStatus{}
	resp.ResponseStatusObject.RequestURL = requestURL
	resp.ResponseStatusObject.StatusCode = statusCode
	resp.ResponseStatusObject.StatusString = statusString
	resp.ResponseStatusObject.ID = id
	if extendCmd > 0 {
		resp.ResponseStatusObject.ExtendCmd = extendCmd
	}
	return resp
}

// HandleRegister handles POST /VIID/System/Register
// If camera not provisioned -> insert into pending_registrations.
// If provisioned -> update IP and status.
func (h *TungSonHandlers) HandleRegister(w http.ResponseWriter, r *http.Request) {
	var req VIIDRegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	cameraID := req.RegisterObject.DeviceID
	if cameraID == "" {
		httputil.Error(w, http.StatusBadRequest, "DeviceID is required")
		return
	}

	clientIP := audit.IPFromRequest(r)
	ctx := r.Context()

	tenantID, deviceUUID, err := h.lookupCamera(ctx, cameraID)
	if err != nil {
		// Camera not provisioned — add to pending_registrations if not already there
		var exists bool
		_ = h.db.Pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM dm3_devices.pending_registrations WHERE rid = $1 AND status = 'pending')`,
			cameraID,
		).Scan(&exists)
		if !exists {
			_, insertErr := h.db.Pool.Exec(ctx,
				`INSERT INTO dm3_devices.pending_registrations (rid, device_type, firmware_version, status, hardware_fingerprint)
				 VALUES ($1, 'camera', '', 'pending', '{}')`,
				cameraID,
			)
			if insertErr != nil {
				slog.Error("tungson: insert pending registration failed", "error", insertErr, "camera_id", cameraID)
			}
		}
		slog.Info("tungson: camera registered as pending", "camera_id", cameraID, "ip", clientIP)
		httputil.JSON(w, http.StatusOK, viidResponse("/VIID/System/Register", "1", "pending_approval", cameraID, 0))
		return
	}

	// Camera exists — ensure cctv row + update IP and heartbeat
	h.ensureCameraRow(ctx, deviceUUID, tenantID, clientIP, cameraID)

	_, _ = h.db.Pool.Exec(ctx,
		`UPDATE dm3_devices.devices SET status = 'online', last_seen = now(), updated_at = now()
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		deviceUUID, tenantID,
	)
	_, _ = h.db.Pool.Exec(ctx,
		`UPDATE dm3_cctv.cameras SET camera_ip = $3::inet, last_heartbeat_at = now()
		 WHERE device_id = $1::uuid AND tenant_id = $2::uuid`,
		deviceUUID, tenantID, clientIP,
	)

	slog.Info("tungson: camera registered", "camera_id", cameraID, "tenant_id", tenantID, "ip", clientIP)
	httputil.JSON(w, http.StatusOK, viidResponse("/VIID/System/Register", "0", "success", cameraID, 0))
}

// HandleKeepalive handles POST /VIID/System/Keepalive
// Updates heartbeat and returns ExtendCmd if sync is pending.
func (h *TungSonHandlers) HandleKeepalive(w http.ResponseWriter, r *http.Request) {
	var req VIIDKeepaliveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	cameraID := req.KeepaliveObject.DeviceID
	if cameraID == "" {
		httputil.Error(w, http.StatusBadRequest, "DeviceID is required")
		return
	}

	ctx := r.Context()
	tenantID, deviceUUID, err := h.lookupCamera(ctx, cameraID)
	if err != nil {
		// Not provisioned yet — respond with pending status
		httputil.JSON(w, http.StatusOK, viidResponse("/VIID/System/Keepalive", "1", "pending_approval", cameraID, 0))
		return
	}

	// Ensure cctv row exists + update heartbeat
	clientIP := audit.IPFromRequest(r)
	h.ensureCameraRow(ctx, deviceUUID, tenantID, clientIP, cameraID)

	_, _ = h.db.Pool.Exec(ctx,
		`UPDATE dm3_devices.devices SET status = 'online', last_seen = now()
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		deviceUUID, tenantID,
	)
	_, _ = h.db.Pool.Exec(ctx,
		`UPDATE dm3_cctv.cameras SET camera_ip = $3::inet, last_heartbeat_at = now()
		 WHERE device_id = $1::uuid AND tenant_id = $2::uuid`,
		deviceUUID, tenantID, clientIP,
	)

	// Check if cctv plugin is enabled
	if !h.isCCTVEnabled(ctx, tenantID) {
		httputil.JSON(w, http.StatusOK, viidResponse("/VIID/System/Keepalive", "0", "success", cameraID, 0))
		return
	}

	// Check if there are pending sync items
	var pendingCount int
	_ = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_cctv.camera_face_sync_queue
		 WHERE camera_device_id = $1::uuid AND status = 'pending'`,
		deviceUUID,
	).Scan(&pendingCount)

	extendCmd := 0
	if pendingCount > 0 {
		extendCmd = CmdAddFace
	}

	httputil.JSON(w, http.StatusOK, viidResponse("/VIID/System/Keepalive", "0", "success", cameraID, extendCmd))
}

// HandleExtendFaceList handles GET /VIID/Extend/ExtendFaceList
// Camera pulls user/face data from sync queue.
func (h *TungSonHandlers) HandleExtendFaceList(w http.ResponseWriter, r *http.Request) {
	cameraID := r.URL.Query().Get("DeviceID")
	if cameraID == "" {
		httputil.Error(w, http.StatusBadRequest, "DeviceID is required")
		return
	}

	size := 5
	if s := r.URL.Query().Get("Size"); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v > 0 {
			size = v
		}
	}

	ctx := r.Context()
	tenantID, deviceUUID, err := h.lookupCamera(ctx, cameraID)
	if err != nil {
		httputil.JSON(w, http.StatusOK, VIIDPersonList{})
		return
	}

	if !h.isCCTVEnabled(ctx, tenantID) {
		httputil.JSON(w, http.StatusOK, VIIDPersonList{})
		return
	}

	// Fetch pending sync queue entries
	rows, err := h.db.Pool.Query(ctx,
		`SELECT q.id, q.user_id::text, q.action
		 FROM dm3_cctv.camera_face_sync_queue q
		 WHERE q.camera_device_id = $1::uuid AND q.status = 'pending'
		 ORDER BY q.created_at ASC
		 LIMIT $2`,
		deviceUUID, size,
	)
	if err != nil {
		slog.Error("tungson: query face sync queue failed", "error", err)
		httputil.JSON(w, http.StatusOK, VIIDPersonList{})
		return
	}
	defer rows.Close()

	type syncEntry struct {
		ID     string
		UserID string
		Action string
	}
	var entries []syncEntry
	for rows.Next() {
		var e syncEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.Action); err != nil {
			slog.Error("tungson: scan sync entry failed", "error", err)
			continue
		}
		entries = append(entries, e)
	}

	if len(entries) == 0 {
		httputil.JSON(w, http.StatusOK, VIIDPersonList{})
		return
	}

	// Build person list
	persons := make([]VIIDPerson, 0, len(entries))
	var sentIDs []string

	for _, entry := range entries {
		if entry.Action == "delete" {
			// Delete: only need PersonID and Type=2
			var firstName string
			var deptName string
			_ = h.db.Pool.QueryRow(ctx,
				`SELECT COALESCE(u.first_name,''), COALESCE(d.name,'')
				 FROM dm3_identity.users u
				 LEFT JOIN dm3_identity.departments d ON d.id = u.department_id
				 WHERE u.id = $1::uuid AND u.tenant_id = $2::uuid`,
				entry.UserID, tenantID,
			).Scan(&firstName, &deptName)

			persons = append(persons, VIIDPerson{
				TaskID:   entry.UserID,
				PersonID: entry.UserID,
				Name:     firstName,
				GroupID:  deptName,
				Type:     2, // delete
			})
			sentIDs = append(sentIDs, entry.ID)
			continue
		}

		// Add: fetch user info + face credential
		var firstName, deptName string
		var avatarURL *string
		err := h.db.Pool.QueryRow(ctx,
			`SELECT COALESCE(u.first_name,''), COALESCE(d.name,''), u.avatar
			 FROM dm3_identity.users u
			 LEFT JOIN dm3_identity.departments d ON d.id = u.department_id
			 WHERE u.id = $1::uuid AND u.tenant_id = $2::uuid`,
			entry.UserID, tenantID,
		).Scan(&firstName, &deptName, &avatarURL)
		if err != nil {
			slog.Warn("tungson: user not found for sync", "user_id", entry.UserID, "error", err)
			sentIDs = append(sentIDs, entry.ID)
			continue
		}

		// Get face image base64 - look for face credential or avatar
		faceBase64 := ""
		fileFormat := "jpg"

		// Try face credential first
		var credValue *string
		_ = h.db.Pool.QueryRow(ctx,
			`SELECT value FROM dm3_identity.credentials
			 WHERE user_id = $1::uuid AND tenant_id = $2::uuid AND type = 'face' AND status = 'active'
			 ORDER BY created_at DESC LIMIT 1`,
			entry.UserID, tenantID,
		).Scan(&credValue)

		if credValue != nil && *credValue != "" {
			faceBase64 = *credValue
		} else if avatarURL != nil && *avatarURL != "" && h.objectStore != nil {
			// Avatar DB value is a public URL path (/photos/tenants/...),
			// strip /photos/ prefix to get the MinIO object key.
			objectKey := strings.TrimPrefix(*avatarURL, "/photos/")
			reader, _, getErr := h.objectStore.GetObject(ctx, objectKey)
			if getErr == nil && reader != nil {
				data, readErr := io.ReadAll(reader)
				_ = reader.Close()
				if readErr == nil && len(data) > 0 {
					faceBase64 = base64.StdEncoding.EncodeToString(data)
				}
			}
		}

		person := VIIDPerson{
			TaskID:   entry.UserID,
			PersonID: entry.UserID,
			Name:     firstName,
			GroupID:  deptName,
			Type:     0, // add
		}
		if faceBase64 != "" {
			person.SubImageList = &VIIDSubImageList{
				SubImageInfoObject: []VIIDSubImage{{
					Data:       faceBase64,
					FileFormat: fileFormat,
					ImageID:    entry.UserID,
					ShotTime:   time.Now().Format("20060102150405"),
					Type:       "11",
				}},
			}
		}
		persons = append(persons, person)
		sentIDs = append(sentIDs, entry.ID)
	}

	// Mark entries as sent
	for _, id := range sentIDs {
		_, _ = h.db.Pool.Exec(ctx,
			`UPDATE dm3_cctv.camera_face_sync_queue SET status = 'sent', sent_at = now()
			 WHERE id = $1::uuid`,
			id,
		)
	}

	resp := VIIDPersonList{}
	resp.PersonListObject.Person = persons
	httputil.JSON(w, http.StatusOK, resp)
}

// HandleFaceRecognition handles POST /VIID/Extend/ExtendFaceRecognition
// Camera reports face match -> publish access event to NATS.
func (h *TungSonHandlers) HandleFaceRecognition(w http.ResponseWriter, r *http.Request) {
	bodyBytes, readErr := io.ReadAll(r.Body)
	if readErr != nil {
		httputil.Error(w, http.StatusBadRequest, "failed to read body")
		return
	}
	slog.Debug("tungson: face recognition raw body", "size", len(bodyBytes), "body", string(bodyBytes[:min(len(bodyBytes), 500)]))

	var req VIIDFaceRecognitionRequest
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		slog.Error("tungson: face recognition decode failed", "error", err, "body_prefix", string(bodyBytes[:min(len(bodyBytes), 200)]))
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	personList := req.PersonRecognitionResultListObject.PersonRecognitionObject
	if len(personList) == 0 {
		httputil.JSON(w, http.StatusOK, "ok")
		return
	}

	ctx := r.Context()
	result := personList[0]
	cameraID := result.DeviceID

	tenantID, deviceUUID, err := h.lookupCamera(ctx, cameraID)
	if err != nil {
		httputil.JSON(w, http.StatusOK, "ok")
		return
	}

	// Upload snapshot to MinIO — use the largest available image.
	// Camera may send 1 image (face crop) or 2 (face crop + full frame).
	var photoRef string
	if h.objectStore != nil && result.SubImageList != nil && len(result.SubImageList.SubImageInfoObject) > 0 {
		// Prefer last image (full frame) if multiple, else use first
		idx := len(result.SubImageList.SubImageInfoObject) - 1
		imgData64 := result.SubImageList.SubImageInfoObject[idx].Data
		if imgData64 != "" {
			imgData, decErr := base64.StdEncoding.DecodeString(imgData64)
			if decErr == nil && len(imgData) > 0 {
				key := fmt.Sprintf("cctv-faces/%s/%s/recognition/%s/%d_%s.jpg",
					tenantID, deviceUUID,
					time.Now().Format("2006-01-02"),
					time.Now().UnixMilli(),
					result.PersonID,
				)
				if putErr := h.objectStore.PutObject(ctx, key, bytes.NewReader(imgData), int64(len(imgData)), "image/jpeg"); putErr == nil {
					photoRef = key
				} else {
					slog.Warn("tungson: upload recognition photo failed", "error", putErr)
				}
			}
		}
	}

	// Parse similarity string to float
	similarity, _ := strconv.ParseFloat(result.Similarity, 64)

	// Publish access.log event to NATS
	eventID := uuid.New().String()
	now := time.Now()

	eventPayload, _ := json.Marshal(map[string]any{
		"v":    1,
		"id":   eventID,
		"ts":   now.UnixMilli(),
		"src":  deviceUUID,
		"type": "access.log",
		"data": map[string]any{
			"method":          "face",
			"direction":       "entry",
			"decision":        "granted",
			"decided_locally": true,
			"user_id":         result.PersonID,
			"confidence":      similarity,
			"credentials":     []map[string]string{{"type": "face", "value": result.PersonID}},
			"photo":           photoRef,
		},
	})

	natsSubject := fmt.Sprintf("dm3.devices.%s.%s.evt", tenantID, deviceUUID)
	if err := h.nats.Publish(ctx, natsSubject, eventPayload); err != nil {
		slog.Error("tungson: publish face recognition event failed", "error", err)
	}

	// Publish to the dedicated CCTV WebSocket subject so device-gateway's
	// CCTVWebSocketConsumer can broadcast to the monitoring page in realtime.
	h.publishWSEvent(ctx, tenantID, deviceUUID, "access.log", eventPayload)

	slog.Info("tungson: face recognized",
		"camera_id", cameraID, "user_id", result.PersonID,
		"similarity", similarity, "tenant_id", tenantID)

	httputil.JSON(w, http.StatusOK, "ok")
}

// HandleUnknownFace handles POST /VIID/Faces
// Camera reports unknown face -> upload to MinIO + publish event.
func (h *TungSonHandlers) HandleUnknownFace(w http.ResponseWriter, r *http.Request) {
	var req VIIDUnknownFaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	faceObjects := req.FaceListObject.FaceObject
	if len(faceObjects) == 0 {
		httputil.JSON(w, http.StatusOK, "ok")
		return
	}

	ctx := r.Context()
	face := faceObjects[0]
	cameraID := face.DeviceID

	tenantID, deviceUUID, err := h.lookupCamera(ctx, cameraID)
	if err != nil {
		httputil.JSON(w, http.StatusOK, "ok")
		return
	}

	// Upload snapshot — use largest available image
	var photoRef string
	if h.objectStore != nil && face.SubImageList != nil && len(face.SubImageList.SubImageInfoObject) > 0 {
		idx := len(face.SubImageList.SubImageInfoObject) - 1
		imgData64 := face.SubImageList.SubImageInfoObject[idx].Data
		if imgData64 != "" {
			imgData, decErr := base64.StdEncoding.DecodeString(imgData64)
			if decErr == nil && len(imgData) > 0 {
				key := fmt.Sprintf("cctv-faces/%s/%s/unknown/%s/%d.jpg",
					tenantID, deviceUUID,
					time.Now().Format("2006-01-02"),
					time.Now().UnixMilli(),
				)
				if putErr := h.objectStore.PutObject(ctx, key, bytes.NewReader(imgData), int64(len(imgData)), "image/jpeg"); putErr == nil {
					photoRef = key
				}
			}
		}
	}

	// Publish unknown face event
	eventID := uuid.New().String()
	now := time.Now()

	eventPayload, _ := json.Marshal(map[string]any{
		"v":    1,
		"id":   eventID,
		"ts":   now.UnixMilli(),
		"src":  deviceUUID,
		"type": "access.log",
		"data": map[string]any{
			"method":          "face",
			"direction":       "entry",
			"decision":        "denied",
			"decided_locally": true,
			"reason":          "unknown_face",
			"confidence":      0,
			"photo":           photoRef,
		},
	})

	natsSubject := fmt.Sprintf("dm3.devices.%s.%s.evt", tenantID, deviceUUID)
	if err := h.nats.Publish(ctx, natsSubject, eventPayload); err != nil {
		slog.Error("tungson: publish unknown face event failed", "error", err)
	}

	// Publish to the dedicated CCTV WebSocket subject so device-gateway's
	// CCTVWebSocketConsumer can broadcast to the monitoring page in realtime.
	h.publishWSEvent(ctx, tenantID, deviceUUID, "access.log", eventPayload)

	slog.Info("tungson: unknown face detected", "camera_id", cameraID, "tenant_id", tenantID)
	httputil.JSON(w, http.StatusOK, "ok")
}

// publishWSEvent publishes an event to the dedicated CCTV WebSocket NATS subject
// (dm3.cctv.ws.{tenant_id}.{device_id}) so that device-gateway's
// CCTVWebSocketConsumer can broadcast it to WebSocket clients.
func (h *TungSonHandlers) publishWSEvent(ctx context.Context, tenantID, deviceUUID, eventType string, originalPayload []byte) {
	// Parse the original payload to extract the data field for the WS envelope.
	var envelope struct {
		Data json.RawMessage `json:"data"`
		TS   int64           `json:"ts"`
	}
	if err := json.Unmarshal(originalPayload, &envelope); err != nil {
		slog.Warn("tungson: failed to parse payload for ws publish", "error", err)
		return
	}

	wsPayload, _ := json.Marshal(map[string]any{
		"type":      eventType,
		"device_id": deviceUUID,
		"tenant_id": tenantID,
		"data":      envelope.Data,
		"time_ms":   envelope.TS,
	})

	wsSubject := fmt.Sprintf("dm3.cctv.ws.%s.%s", tenantID, deviceUUID)
	if err := h.nats.Publish(ctx, wsSubject, wsPayload); err != nil {
		slog.Error("tungson: publish ws event failed", "error", err, "subject", wsSubject)
	}
}

// HandleExtendConfirm handles POST /VIID/Extend/ExtendConfirm
// Camera confirms face add/delete operations.
func (h *TungSonHandlers) HandleExtendConfirm(w http.ResponseWriter, r *http.Request) {
	var req VIIDConfirmRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()
	confirms := req.ConfirmListObject.ConfirmObject
	for _, confirm := range confirms {
		cameraID := confirm.DeviceID
		_, deviceUUID, err := h.lookupCamera(ctx, cameraID)
		if err != nil {
			continue
		}

		if confirm.StatusCode == 0 {
			// Success
			_, _ = h.db.Pool.Exec(ctx,
				`UPDATE dm3_cctv.camera_face_sync_queue
				 SET status = 'confirmed', confirmed_at = now()
				 WHERE camera_device_id = $1::uuid AND user_id = $2::uuid AND status = 'sent'`,
				deviceUUID, confirm.TaskID,
			)
		} else {
			// Failed
			_, _ = h.db.Pool.Exec(ctx,
				`UPDATE dm3_cctv.camera_face_sync_queue
				 SET status = 'failed', error_message = 'camera rejected'
				 WHERE camera_device_id = $1::uuid AND user_id = $2::uuid AND status = 'sent'`,
				deviceUUID, confirm.TaskID,
			)
		}
	}

	httputil.JSON(w, http.StatusOK, "ok")
}
