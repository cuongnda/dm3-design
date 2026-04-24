package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/audit"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/mqtt"
	"github.com/duali/dm3-backend/pkg/objectstore"
)

// deviceLogUploadExpiry is how long the presigned PUT URL in cmd.logs stays
// valid. Long enough for a device on a slow link to collect, gzip and upload
// several MB of logs; short enough that a leaked URL is mostly harmless.
const deviceLogUploadExpiry = 10 * time.Minute

// deviceLogDownloadExpiry is how long the presigned GET URL returned to the
// admin UI stays valid once the upload is complete. Short enough that an
// operator sharing the URL with a colleague has to re-request it a few
// minutes later.
const deviceLogDownloadExpiry = 15 * time.Minute

// DeviceLogHandlers exposes the HTTP surface for the remote-log pull feature.
// See docs/architecture/mqtt-protocol.md §6.7 for the wire spec and
// docs/specs/devices/android-terminal.md §13.3 for device-side behaviour.
type DeviceLogHandlers struct {
	db          *db.DB
	mqtt        *mqtt.Client
	audit       *audit.Logger
	putPresign  MediaPresigner               // to sign PUT URL for device upload
	getPresign  objectstore.GetURLPresigner  // to sign GET URL for admin download
}

func NewDeviceLogHandlers(database *db.DB, mqttClient *mqtt.Client, auditLog *audit.Logger, putPresign MediaPresigner, getPresign objectstore.GetURLPresigner) *DeviceLogHandlers {
	return &DeviceLogHandlers{
		db:         database,
		mqtt:       mqttClient,
		audit:      auditLog,
		putPresign: putPresign,
		getPresign: getPresign,
	}
}

// requestLogRequest is the JSON body for POST /devices/{id}/logs/request.
// Every field is optional — an empty body means "send me whatever you have".
type requestLogRequest struct {
	FromTS   *int64 `json:"from_ts,omitempty"`   // Unix ms
	ToTS     *int64 `json:"to_ts,omitempty"`     // Unix ms
	LinesMax *int   `json:"lines_max,omitempty"` // cap on lines (device enforces)
	LevelMin string `json:"level_min,omitempty"` // info|warn|error; "" = no filter
}

type deviceLogRequestDTO struct {
	ID              string    `json:"id"`
	RequestID       string    `json:"request_id"`
	DeviceID        string    `json:"device_id"`
	Status          string    `json:"status"`
	ObjectKey       string    `json:"object_key"`
	UploadExpiresAt time.Time `json:"upload_url_expires_at"`
	FromTS          *int64    `json:"from_ts,omitempty"`
	ToTS            *int64    `json:"to_ts,omitempty"`
	LinesMax        *int      `json:"lines_max,omitempty"`
	LevelMin        string    `json:"level_min,omitempty"`
	LinesUploaded   *int64    `json:"lines_uploaded,omitempty"`
	Bytes           *int64    `json:"bytes,omitempty"`
	ErrorMessage    string    `json:"error_message,omitempty"`
	RequestedByEmail string   `json:"requested_by_email,omitempty"`
	SentAt          time.Time `json:"sent_at"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
	DownloadURL     string    `json:"download_url,omitempty"` // filled only on the detail endpoint
}

// RequestDeviceLog handles POST /api/v1/gateway/devices/{id}/logs/request
//
// Flow:
//  1. Resolve device (tenant-scoped via JWT or cross-tenant for sysadmin).
//  2. Generate request_id + presign PUT URL to MinIO.
//  3. Insert a device_log_requests row in status='sent'.
//  4. Publish cmd.logs MQTT command embedding the URL + filters.
//  5. Return the row so the UI can poll /logs/{request_id} for completion.
func (h *DeviceLogHandlers) RequestDeviceLog(w http.ResponseWriter, r *http.Request) {
	deviceDBID := chi.URLParam(r, "id")

	var req requestLogRequest
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			httputil.Error(w, http.StatusBadRequest, "invalid request body")
			return
		}
	}
	if req.LevelMin != "" {
		switch req.LevelMin {
		case "info", "warn", "error":
		default:
			httputil.Error(w, http.StatusBadRequest, "level_min must be info|warn|error")
			return
		}
	}
	if req.LinesMax != nil && (*req.LinesMax <= 0 || *req.LinesMax > 1000000) {
		httputil.Error(w, http.StatusBadRequest, "lines_max must be between 1 and 1000000")
		return
	}

	// Tenant-scope when a company JWT is present; sysadmin paths call this
	// without cid and see every tenant's devices.
	query := `SELECT tenant_id::text, device_id FROM dm3_devices.devices WHERE id = $1::uuid`
	args := []any{deviceDBID}
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid != "" {
		query += " AND tenant_id = $2::uuid"
		args = append(args, cid)
	}
	var tenantID, deviceID string
	if err := h.db.Pool.QueryRow(r.Context(), query, args...).Scan(&tenantID, &deviceID); err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}

	if h.mqtt == nil {
		httputil.Error(w, http.StatusServiceUnavailable, "mqtt broker not configured")
		return
	}
	if h.putPresign == nil {
		httputil.Error(w, http.StatusServiceUnavailable, "object storage not configured")
		return
	}

	requestID := uuid.NewString()
	uploadURL, objectKey, uploadExpiresAt, perr := IssueDeviceLogPutURL(
		r.Context(), h.putPresign, tenantID, deviceID, requestID, deviceLogUploadExpiry,
	)
	if perr != nil {
		slog.Error("RequestDeviceLog: presign failed", "error", perr, "device", deviceID)
		httputil.Error(w, http.StatusInternalServerError, "failed to presign upload url")
		return
	}

	actorID, actorEmail := audit.ActorFromContext(r.Context())

	var rowID string
	if err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_devices.device_log_requests
			(tenant_id, device_db_id, device_id, request_id, status, object_key,
			 upload_url_expires_at, from_ts, to_ts, lines_max, level_min,
			 requested_by, requested_by_email, sent_at)
		 VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'sent', $5,
			 $6, $7, $8, $9, NULLIF($10,''),
			 $11, $12, now())
		 RETURNING id`,
		tenantID, deviceDBID, deviceID, requestID, objectKey,
		uploadExpiresAt,
		tsFromMs(req.FromTS), tsFromMs(req.ToTS),
		req.LinesMax, req.LevelMin,
		nullableUUID(actorID), actorEmail,
	).Scan(&rowID); err != nil {
		slog.Error("RequestDeviceLog: insert failed", "error", err, "device", deviceID)
		httputil.Error(w, http.StatusInternalServerError, "failed to create log request")
		return
	}

	// Build the cmd.logs payload. Device fields mirror those saved above so
	// it can locally truncate / filter without needing another round-trip.
	data := map[string]any{
		"request_id":        requestID,
		"upload_url":        uploadURL,
		"object_key":        objectKey,
		"upload_expires_at": uploadExpiresAt.UTC().Format(time.RFC3339),
		"content_type":      "application/gzip",
	}
	if req.FromTS != nil {
		data["from_ts"] = *req.FromTS
	}
	if req.ToTS != nil {
		data["to_ts"] = *req.ToTS
	}
	if req.LinesMax != nil {
		data["lines_max"] = *req.LinesMax
	}
	if req.LevelMin != "" {
		data["level_min"] = req.LevelMin
	}
	dataBytes, _ := json.Marshal(data)

	envelope := MQTTEnvelope{
		Version: 1,
		ID:      uuid.NewString(),
		TS:      time.Now().UnixMilli(),
		Src:     "server:device-gateway",
		Type:    "cmd.logs",
		Data:    dataBytes,
	}
	envBytes, _ := json.Marshal(envelope)

	topic := fmt.Sprintf("dm/%s/device/%s/cmd", tenantID, deviceID)
	pubCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	slog.Info("RequestDeviceLog: publishing cmd.logs",
		"topic", topic, "request_id", requestID, "object_key", objectKey)
	if err := h.mqtt.Publish(pubCtx, topic, 1, envBytes); err != nil {
		slog.Error("RequestDeviceLog: mqtt publish failed",
			"error", err, "topic", topic, "request_id", requestID)
		_, _ = h.db.Pool.Exec(context.Background(),
			`UPDATE dm3_devices.device_log_requests
			 SET status='failed', error_message=$2, completed_at=now(), updated_at=now()
			 WHERE id=$1::uuid`,
			rowID, "mqtt publish failed: "+err.Error())
		httputil.Error(w, http.StatusInternalServerError, "failed to dispatch command")
		return
	}

	h.audit.LogFromRequest(r, "device.log_request", "device_log_request", rowID, deviceID,
		"success", nil, map[string]any{"request_id": requestID})

	dto := deviceLogRequestDTO{
		ID:               rowID,
		RequestID:        requestID,
		DeviceID:         deviceID,
		Status:           "sent",
		ObjectKey:        objectKey,
		UploadExpiresAt:  uploadExpiresAt,
		FromTS:           req.FromTS,
		ToTS:             req.ToTS,
		LinesMax:         req.LinesMax,
		LevelMin:         req.LevelMin,
		RequestedByEmail: actorEmail,
		SentAt:           time.Now(),
	}
	httputil.JSON(w, http.StatusAccepted, dto)
}

// ListDeviceLogRequests handles GET /api/v1/gateway/devices/{id}/logs
// Returns the 50 most recent log requests for this device (tenant-scoped).
func (h *DeviceLogHandlers) ListDeviceLogRequests(w http.ResponseWriter, r *http.Request) {
	deviceDBID := chi.URLParam(r, "id")

	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	// Resolve tenant + human device_id for the UI; also enforces tenant isolation.
	var tenantID, deviceID string
	if err := h.db.Pool.QueryRow(r.Context(),
		`SELECT tenant_id::text, device_id FROM dm3_devices.devices
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		deviceDBID, cid,
	).Scan(&tenantID, &deviceID); err != nil {
		httputil.Error(w, http.StatusNotFound, "device not found")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id::text, request_id::text, device_id, status, object_key,
			upload_url_expires_at,
			EXTRACT(EPOCH FROM from_ts)*1000,
			EXTRACT(EPOCH FROM to_ts)*1000,
			lines_max, COALESCE(level_min,''),
			lines_uploaded, bytes, COALESCE(error_message,''),
			COALESCE(requested_by_email,''),
			sent_at, completed_at
		 FROM dm3_devices.device_log_requests
		 WHERE device_db_id = $1::uuid AND tenant_id = $2::uuid
		 ORDER BY sent_at DESC LIMIT 50`,
		deviceDBID, tenantID)
	if err != nil {
		slog.Error("ListDeviceLogRequests: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()

	out := []deviceLogRequestDTO{}
	for rows.Next() {
		var dto deviceLogRequestDTO
		var fromMs, toMs *float64
		if err := rows.Scan(
			&dto.ID, &dto.RequestID, &dto.DeviceID, &dto.Status, &dto.ObjectKey,
			&dto.UploadExpiresAt,
			&fromMs, &toMs,
			&dto.LinesMax, &dto.LevelMin,
			&dto.LinesUploaded, &dto.Bytes, &dto.ErrorMessage,
			&dto.RequestedByEmail,
			&dto.SentAt, &dto.CompletedAt,
		); err != nil {
			slog.Error("ListDeviceLogRequests: scan failed", "error", err)
			continue
		}
		if fromMs != nil {
			v := int64(*fromMs)
			dto.FromTS = &v
		}
		if toMs != nil {
			v := int64(*toMs)
			dto.ToTS = &v
		}
		out = append(out, dto)
	}
	httputil.JSON(w, http.StatusOK, map[string]any{"items": out})
}

// GetDeviceLogRequest handles GET /api/v1/gateway/devices/{id}/logs/{request_id}
// Returns the row + a presigned GET URL when status='uploaded'.
func (h *DeviceLogHandlers) GetDeviceLogRequest(w http.ResponseWriter, r *http.Request) {
	deviceDBID := chi.URLParam(r, "id")
	requestID := chi.URLParam(r, "request_id")

	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	var dto deviceLogRequestDTO
	var fromMs, toMs *float64
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT r.id::text, r.request_id::text, r.device_id, r.status, r.object_key,
			r.upload_url_expires_at,
			EXTRACT(EPOCH FROM r.from_ts)*1000,
			EXTRACT(EPOCH FROM r.to_ts)*1000,
			r.lines_max, COALESCE(r.level_min,''),
			r.lines_uploaded, r.bytes, COALESCE(r.error_message,''),
			COALESCE(r.requested_by_email,''),
			r.sent_at, r.completed_at
		 FROM dm3_devices.device_log_requests r
		 WHERE r.request_id = $1::uuid
		   AND r.device_db_id = $2::uuid
		   AND r.tenant_id = $3::uuid`,
		requestID, deviceDBID, cid,
	).Scan(
		&dto.ID, &dto.RequestID, &dto.DeviceID, &dto.Status, &dto.ObjectKey,
		&dto.UploadExpiresAt,
		&fromMs, &toMs,
		&dto.LinesMax, &dto.LevelMin,
		&dto.LinesUploaded, &dto.Bytes, &dto.ErrorMessage,
		&dto.RequestedByEmail,
		&dto.SentAt, &dto.CompletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httputil.Error(w, http.StatusNotFound, "log request not found")
			return
		}
		slog.Error("GetDeviceLogRequest: query failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if fromMs != nil {
		v := int64(*fromMs)
		dto.FromTS = &v
	}
	if toMs != nil {
		v := int64(*toMs)
		dto.ToTS = &v
	}

	// Only issue a download URL when the device has successfully uploaded.
	if dto.Status == "uploaded" && h.getPresign != nil {
		signCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		u, perr := h.getPresign.PresignedGetURL(signCtx, dto.ObjectKey, deviceLogDownloadExpiry)
		if perr != nil {
			slog.Warn("GetDeviceLogRequest: presign get failed",
				"error", perr, "key", dto.ObjectKey)
		} else {
			dto.DownloadURL = u.String()
		}
	}

	httputil.JSON(w, http.StatusOK, dto)
}

// handleLogAck processes cmd.logs.resp arriving on dm/{tid}/device/{did}/cmd/resp.
// Called from the MQTT command-response dispatcher in mqtt_handler.go.
//
// Expected payload shape (see mqtt-protocol.md §6.7):
//
//	{
//	  "v": 1,
//	  "type": "cmd.logs.resp",
//	  "ref": "<original cmd.logs id>",   // not used for lookup; request_id is authoritative
//	  "status": "ok|error",
//	  "data": {
//	    "request_id":    "<uuid>",        // REQUIRED — primary key into device_log_requests
//	    "object_key":    "...",           // echo of the key the device uploaded to
//	    "lines_uploaded": 8542,
//	    "bytes":          234567,
//	    "error":          "upload_failed|no_logs|..."   // only when status=error
//	  }
//	}
type cmdLogsAckData struct {
	RequestID     string `json:"request_id"`
	ObjectKey     string `json:"object_key"`
	LinesUploaded *int64 `json:"lines_uploaded,omitempty"`
	Bytes         *int64 `json:"bytes,omitempty"`
	Error         string `json:"error,omitempty"`
}

func handleLogAck(ctx context.Context, database *db.DB, tenantID, deviceID string, env MQTTEnvelope) {
	var data cmdLogsAckData
	if err := json.Unmarshal(env.Data, &data); err != nil {
		slog.Warn("cmd.logs.resp: bad data payload", "error", err, "device", deviceID)
		return
	}
	if data.RequestID == "" {
		slog.Warn("cmd.logs.resp: missing request_id", "device", deviceID)
		return
	}

	status := strings.TrimSpace(env.Status)
	if status == "" {
		status = "ok"
	}
	outcome := "uploaded"
	errorMsg := ""
	if status != "ok" {
		outcome = "failed"
		if data.Error != "" {
			errorMsg = data.Error
		} else if env.Error != "" {
			errorMsg = env.Error
		} else {
			errorMsg = "device reported failure"
		}
	}

	// Tenant-scoped UPDATE — a spoofed ack from another tenant's device can't
	// flip the status here because the WHERE clause pins the tenant_id.
	tag, err := database.Pool.Exec(ctx,
		`UPDATE dm3_devices.device_log_requests
		 SET status         = $1,
		     lines_uploaded = COALESCE($2, lines_uploaded),
		     bytes          = COALESCE($3, bytes),
		     error_message  = NULLIF($4,''),
		     completed_at   = now(),
		     updated_at     = now()
		 WHERE request_id  = $5::uuid
		   AND tenant_id   = $6::uuid
		   AND device_id   = $7`,
		outcome, data.LinesUploaded, data.Bytes, errorMsg,
		data.RequestID, tenantID, deviceID)
	if err != nil {
		slog.Error("cmd.logs.resp: update failed", "error", err, "request_id", data.RequestID)
		return
	}
	if tag.RowsAffected() == 0 {
		slog.Warn("cmd.logs.resp: no matching request row",
			"tenant_id", tenantID, "device", deviceID, "request_id", data.RequestID)
		return
	}
	slog.Info("cmd.logs.resp: processed",
		"device", deviceID, "request_id", data.RequestID, "status", outcome,
		"lines_uploaded", deref64(data.LinesUploaded), "bytes", deref64(data.Bytes))
}

// ─── helpers ────────────────────────────────────────────────────────────────

func tsFromMs(ms *int64) any {
	if ms == nil {
		return nil
	}
	return time.UnixMilli(*ms)
}

func nullableUUID(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func deref64(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}
