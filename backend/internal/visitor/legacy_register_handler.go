package visitor

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Request / response shapes ───────────────────────────────────────────────
//
// The shapes below intentionally mirror the legacy demasterpro.com
// `/register-visit` contract that the .NET LPR desktop app was originally
// built against (see lpr-desktop-app/LPRApplication/Models/RabbitMQMessages.cs
// — VisitorRequest / VisitorCard / VisitorResponse). They are frozen here so
// the deployed kiosks can keep working without a firmware push.
//
// Mapping of the .NET app's integer enums onto DM3 primitives — the plate
// branch intentionally bypasses dm3_visitor.temp_credentials because DM3's
// parking plugin owns vehicle-plate access (see docs/specs/operate/parking.md
// and dm3_parking.parking_vehicles). Door-access cards stay in the visitor
// plugin where they belong.
//
//   cardType = 1   → door access card. Inserted into
//                    dm3_visitor.temp_credentials (type='card'). Flows to
//                    devices via cfg.visitor_sync.
//   cardType = 6   → license plate. Inserted into
//                    dm3_parking.parking_vehicles linked to the visitor.
//                    Access at the barrier is granted by parking-svc's LPR
//                    event path (ParkingMatchPlate), NOT by cfg.visitor_sync.
//                    visits.vehicle_plate is still populated for UX.
//   accessGroupId  → ignored; we use the tenant's visitor_settings
//                    default_access_areas instead.
//   visitType      → ignored; always treated as a walk-in visit.

type legacyVisitorCard struct {
	CardID      string `json:"cardId"`
	CardType    int    `json:"cardType"`
	IssueCount  int    `json:"issueCount"`
	CardStatus  int    `json:"cardStatus"`
	Description string `json:"description"`
}

type legacyRegisterVisitorRequest struct {
	AccessGroupID    int                 `json:"accessGroupId"` // ignored, see note above
	VisitorName      string              `json:"visitorName"`
	StartDate        string              `json:"startDate"`  // "dd.MM.yyyy HH:mm:ss"
	EndDate          string              `json:"endDate"`    // "dd.MM.yyyy HH:mm:ss"
	VisitReason      string              `json:"visitReason"`
	VisitType        string              `json:"visitType"` // ignored
	NationalIDNumber string              `json:"nationalIdNumber"`
	BirthDay         string              `json:"birthDay"`  // "dd.MM.yyyy"
	Address          string              `json:"address"`
	Avatar           string              `json:"avatar"`    // base64-encoded face photo (optional)
	CardList         []legacyVisitorCard `json:"cardList"`
}

// legacyRegisterVisitorResponse carries the fields the .NET client deserialises
// into its VisitorResponse DTO. We return both the legacy int `visitId` (a
// deterministic 31-bit hash of the real UUID so the kiosk's local SQLite key
// stays stable) and the authoritative `visit_id` UUID so newer clients can
// migrate. `qrCode` reuses the DM3 visit.qr_token.
type legacyRegisterVisitorResponse struct {
	QRCode                string `json:"qrCode"`
	ImageQRCode           string `json:"imageQrCode"`
	VisiteeName           string `json:"visiteeName"`
	VisiteeDepartmentName string `json:"visiteeDepartmentName"`
	VisitID               int64  `json:"visitId"`
	VisitUUID             string `json:"visit_id"` // new canonical field for future clients
}

// ─── Handler ─────────────────────────────────────────────────────────────────

// LegacyRegisterVisitor is the kiosk-auth-only adapter endpoint for the
// LPR desktop app's POST /register-visit call. It translates the legacy
// payload into the modern dm3_visitor primitives:
//
//   1. Resolve the tenant from the kiosk bearer token.
//   2. Upsert the visitor in dm3_visitor.visitors (matched on national_id
//      when present so repeat walk-ins reuse the master record).
//   3. Optionally decode the base64 face photo and upload it to MinIO under
//      tenants/{tid}/visitor/visitors/{visitor_id}/photo.{ext}.
//   4. Resolve default host / access areas from dm3_visitor.visitor_settings.
//   5. Insert dm3_visitor.visits with status='approved' (operator-at-kiosk
//      implies explicit approval).
//   6. Insert dm3_visitor.temp_credentials with the plate or card UID.
//   7. Publish dm3.visitor.{tid}.visit.approved so VisitorConsumer in
//      device-gateway fans out a cfg.visitor_sync to online devices.
//
// Failure modes are mapped to HTTP 4xx/5xx with a JSON error body matching
// httputil.Error. Partial inserts are protected by a DB transaction.
func (h *VisitorHandlers) LegacyRegisterVisitor(w http.ResponseWriter, r *http.Request) {
	tenantID := KioskTenantIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "kiosk auth required")
		return
	}

	// Optional sanity check: ?companyCode=<code> must match the token's tenant.
	// Allows the kiosk to catch accidentally-reused tokens across tenants.
	if code := strings.TrimSpace(r.URL.Query().Get("companyCode")); code != "" {
		var resolvedTenant string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT id::text FROM dm3_auth.tenants WHERE code = $1`, code).Scan(&resolvedTenant)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				httputil.Error(w, http.StatusBadRequest, "unknown companyCode")
				return
			}
			slog.Error("legacy register: tenant lookup failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "internal error")
			return
		}
		if resolvedTenant != tenantID {
			httputil.Error(w, http.StatusForbidden, "companyCode does not match kiosk token tenant")
			return
		}
	}

	var req legacyRegisterVisitorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	firstName, lastName := splitVisitorName(req.VisitorName)
	if firstName == "" && lastName == "" {
		httputil.Error(w, http.StatusBadRequest, "visitorName is required")
		return
	}

	if len(req.CardList) == 0 || strings.TrimSpace(req.CardList[0].CardID) == "" {
		httputil.Error(w, http.StatusBadRequest, "cardList with at least one cardId is required")
		return
	}
	legacyCardType := req.CardList[0].CardType
	isPlate, err := isLegacyPlateCardType(legacyCardType)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	credValue := strings.TrimSpace(req.CardList[0].CardID)

	// Parse timestamps. The kiosk emits DateTime.MaxValue ("31.12.9999 ...")
	// for an open-ended end date — we cap that at +24h to keep the temp
	// credential from living forever.
	expectedArrival := parseLegacyDateTime(req.StartDate, time.Now().UTC())
	expectedDeparture := parseLegacyDateTime(req.EndDate, expectedArrival.Add(24*time.Hour))
	if expectedDeparture.Year() > 2100 {
		expectedDeparture = expectedArrival.Add(24 * time.Hour)
	}
	if !expectedDeparture.After(expectedArrival) {
		expectedDeparture = expectedArrival.Add(24 * time.Hour)
	}

	purpose := purposeFromLegacyPurpose(req.VisitReason, isPlate)

	// Resolve defaults that the legacy payload does not carry.
	settings, err := h.loadKioskDefaults(r.Context(), tenantID)
	if err != nil {
		slog.Error("legacy register: load settings", "tenant_id", tenantID, "error", err)
		httputil.Error(w, http.StatusInternalServerError, "visitor settings unavailable")
		return
	}
	if settings.DefaultHostUserID == nil || *settings.DefaultHostUserID == "" {
		httputil.Error(w, http.StatusPreconditionFailed,
			"visitor_settings.default_host_user_id is not configured; cannot create kiosk walk-in")
		return
	}

	// Upsert visitor. We match on (tenant_id, national_id) when we have one
	// so repeat walk-ins reuse the master record and its visit_count bumps.
	visitorID, err := h.upsertKioskVisitor(r.Context(), tenantID, firstName, lastName,
		trimmedNilIfEmpty(req.NationalIDNumber), trimmedNilIfEmpty(req.Address))
	if err != nil {
		slog.Error("legacy register: upsert visitor failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to create visitor")
		return
	}

	// Optional avatar upload. Failures here are soft — the registration still
	// succeeds, just without a photo, because the operator has already typed
	// the credential and the door should open on the next read.
	if req.Avatar != "" && h.objects != nil {
		if photoRef, upErr := h.uploadKioskAvatar(r.Context(), tenantID, visitorID, req.Avatar); upErr != nil {
			slog.Warn("legacy register: avatar upload failed",
				"visitor_id", visitorID, "error", upErr)
		} else {
			_, _ = h.db.Pool.Exec(r.Context(),
				`UPDATE dm3_visitor.visitors SET photo_ref = $2, updated_at = now()
				 WHERE id = $1::uuid AND tenant_id = $3::uuid`,
				visitorID, photoRef, tenantID)
		}
	}

	// Create the visit + temp credential inside a single transaction so we
	// never end up with a visit row dangling without a credential.
	qrToken, err := generateQRToken()
	if err != nil {
		slog.Error("legacy register: qr token", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	tx, err := h.db.Pool.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		slog.Error("legacy register: begin tx", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	var visitID string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO dm3_visitor.visits
		  (tenant_id, visitor_id, host_user_id, purpose, purpose_note,
		   status, expected_arrival, expected_departure, qr_token, qr_expires_at,
		   access_areas, escort_required, vehicle_plate, host_approved, host_approved_at)
		VALUES
		  ($1::uuid, $2::uuid, $3::uuid, $4, $5,
		   'approved', $6, $7, $8, $9,
		   $10::uuid[], false, $11, true, now())
		RETURNING id::text
	`,
		tenantID, visitorID, *settings.DefaultHostUserID, purpose,
		trimmedNilIfEmpty(req.VisitReason),
		expectedArrival, expectedDeparture, qrToken, expectedDeparture,
		settings.DefaultAccessAreas,
		plateIf(isPlate, credValue),
	).Scan(&visitID)
	if err != nil {
		slog.Error("legacy register: insert visit failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to create visit")
		return
	}

	// Credential insert branches on the legacy cardType. Plate credentials
	// belong to the parking plugin (dm3_parking.parking_vehicles); door-access
	// cards go to the visitor plugin (dm3_visitor.temp_credentials). Keeping
	// the split here means the existing parking-svc LPR flow and the
	// cfg.visitor_sync flow each continue to own their half without the
	// kiosk adapter muddying the boundary.
	var tempCredID string
	if isPlate {
		if err := upsertParkingVisitorVehicle(r.Context(), tx, tenantID, visitorID, credValue); err != nil {
			slog.Error("legacy register: upsert parking vehicle failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to register vehicle")
			return
		}
	} else {
		err = tx.QueryRow(r.Context(), `
			INSERT INTO dm3_visitor.temp_credentials
			  (tenant_id, visit_id, visitor_id, type, holder_type, value, status, valid_from, valid_until)
			VALUES
			  ($1::uuid, $2::uuid, $3::uuid, 'card', 'visitor', $4, 'active', $5, $6)
			RETURNING id::text
		`, tenantID, visitID, visitorID, credValue, expectedArrival, expectedDeparture).Scan(&tempCredID)
		if err != nil {
			slog.Error("legacy register: insert temp credential failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to create credential")
			return
		}
		if _, err := tx.Exec(r.Context(),
			`UPDATE dm3_visitor.visits SET temp_credential_id = $2::uuid WHERE id = $1::uuid`,
			visitID, tempCredID); err != nil {
			slog.Error("legacy register: link temp credential failed", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to link credential")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("legacy register: commit failed", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Fan-out to devices: the existing VisitorConsumer in device-gateway
	// listens for visit.approved and pushes cfg.visitor_sync.
	visitorName := strings.TrimSpace(firstName + " " + lastName)
	h.publishEvent(r.Context(), tenantID, EventVisitApproved, map[string]any{
		"tenant_id":          tenantID,
		"visit_id":           visitID,
		"visitor_id":         visitorID,
		"visitor_name":       visitorName,
		"access_areas":       settings.DefaultAccessAreas,
		"expected_arrival":   expectedArrival,
		"expected_departure": expectedDeparture,
	})

	if h.audit != nil {
		credentialKind := "card"
		if isPlate {
			credentialKind = "plate"
		}
		h.audit.LogFromRequest(r, "visitor.kiosk_register", "visit", visitID, visitorName, "success", nil,
			map[string]any{
				"credential_kind":      credentialKind,
				"temp_credential_id":   tempCredID,
				"source":               "lpr-kiosk",
			})
	}

	// Response: legacy shape so the deployed .NET client keeps working.
	httputil.JSON(w, http.StatusOK, legacyRegisterVisitorResponse{
		QRCode:      qrToken,
		ImageQRCode: "",
		VisiteeName: visitorName,
		VisitID:     hashUUIDTo31BitInt(visitID),
		VisitUUID:   visitID,
	})
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// kioskDefaults is what we need off visitor_settings to fill the gaps in the
// legacy payload. Missing rows are treated as "no defaults configured".
type kioskDefaults struct {
	DefaultHostUserID   *string
	DefaultAccessAreas  []string
}

func (h *VisitorHandlers) loadKioskDefaults(ctx context.Context, tenantID string) (kioskDefaults, error) {
	var d kioskDefaults
	err := h.db.Pool.QueryRow(ctx, `
		SELECT default_host_user_id::text,
		       COALESCE(default_access_areas, '{}'::uuid[])
		FROM dm3_visitor.visitor_settings
		WHERE tenant_id = $1::uuid
	`, tenantID).Scan(&d.DefaultHostUserID, &d.DefaultAccessAreas)
	if errors.Is(err, pgx.ErrNoRows) {
		return d, nil
	}
	return d, err
}

// upsertKioskVisitor is the national_id-first variant of upsertVisitor. The
// .NET kiosk always has a CCCD number to match on; the existing email/phone-
// keyed upsert in visit_handlers.go would create a duplicate row for every
// walk-in since the kiosk usually omits email/phone.
func (h *VisitorHandlers) upsertKioskVisitor(ctx context.Context, tenantID, firstName, lastName string, nationalID, address *string) (string, error) {
	if nationalID != nil && *nationalID != "" {
		var id string
		err := h.db.Pool.QueryRow(ctx, `
			WITH existing AS (
				SELECT id FROM dm3_visitor.visitors
				WHERE tenant_id = $1::uuid AND national_id = $4
				LIMIT 1
			), updated AS (
				UPDATE dm3_visitor.visitors v
				SET first_name = $2, last_name = $3,
				    visit_count = v.visit_count + 1,
				    last_visit_at = now(),
				    updated_at = now()
				WHERE v.id = (SELECT id FROM existing)
				RETURNING v.id
			), inserted AS (
				INSERT INTO dm3_visitor.visitors
				  (tenant_id, first_name, last_name, national_id, watchlist_status, visit_count, last_visit_at)
				SELECT $1::uuid, $2, $3, $4, 'none', 1, now()
				WHERE NOT EXISTS (SELECT 1 FROM existing)
				RETURNING id
			)
			SELECT id FROM updated
			UNION ALL
			SELECT id FROM inserted
			LIMIT 1
		`, tenantID, firstName, lastName, *nationalID).Scan(&id)
		if err != nil {
			return "", fmt.Errorf("upsert visitor by national_id: %w", err)
		}
		_ = address // reserved for future use; no address column on visitors today
		return id, nil
	}

	// No national_id — always insert a new row (matches walk-in behavior).
	var newID string
	err := h.db.Pool.QueryRow(ctx, `
		INSERT INTO dm3_visitor.visitors
		  (tenant_id, first_name, last_name, watchlist_status, visit_count, last_visit_at)
		VALUES ($1::uuid, $2, $3, 'none', 1, now())
		RETURNING id::text
	`, tenantID, firstName, lastName).Scan(&newID)
	if err != nil {
		return "", fmt.Errorf("insert kiosk visitor: %w", err)
	}
	return newID, nil
}

// uploadKioskAvatar decodes the base64 payload, validates it looks like an
// image, and uploads to MinIO under the tenant-prefixed key convention.
// Returns the object key (not a URL) — the sync_visitor path presigns it.
// The payload is capped at 2 MB to keep a rogue kiosk from flooding MinIO.
const kioskAvatarMaxBytes = 2 << 20

func (h *VisitorHandlers) uploadKioskAvatar(ctx context.Context, tenantID, visitorID, b64 string) (string, error) {
	// Tolerate data-URI prefixes ("data:image/jpeg;base64,...").
	if idx := strings.Index(b64, ","); idx >= 0 && strings.HasPrefix(b64, "data:") {
		b64 = b64[idx+1:]
	}
	b64 = strings.TrimSpace(b64)

	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		// Retry with URL-safe encoding since some .NET helpers emit that.
		raw, err = base64.URLEncoding.DecodeString(b64)
		if err != nil {
			return "", fmt.Errorf("avatar not valid base64: %w", err)
		}
	}
	if len(raw) == 0 {
		return "", fmt.Errorf("avatar is empty after decode")
	}
	if len(raw) > kioskAvatarMaxBytes {
		return "", fmt.Errorf("avatar exceeds %d bytes", kioskAvatarMaxBytes)
	}

	ct := http.DetectContentType(raw)
	ext, ok := imageExtForContentType(ct)
	if !ok {
		return "", fmt.Errorf("avatar content-type %q not supported", ct)
	}

	objectKey := fmt.Sprintf("tenants/%s/visitor/visitors/%s/photo%s", tenantID, visitorID, ext)

	if err := h.objects.PutObject(ctx, objectKey, bytes.NewReader(raw), int64(len(raw)), ct); err != nil {
		return "", fmt.Errorf("put object: %w", err)
	}
	return objectKey, nil
}

func imageExtForContentType(ct string) (string, bool) {
	switch ct {
	case "image/jpeg":
		return ".jpg", true
	case "image/png":
		return ".png", true
	case "image/webp":
		return ".webp", true
	case "image/gif":
		return ".gif", true
	default:
		return "", false
	}
}

// isLegacyPlateCardType reports whether the .NET kiosk's integer enum
// designates a license plate (cardType=6) vs a door access card (cardType=1).
// Unknown values are rejected with a 400 so an accidental enum drift in the
// device doesn't silently miscategorise credentials.
func isLegacyPlateCardType(t int) (bool, error) {
	switch t {
	case 1:
		return false, nil
	case 6:
		return true, nil
	default:
		return false, fmt.Errorf("unsupported cardType %d (expected 1=card or 6=license_plate)", t)
	}
}

// purposeFromLegacyPurpose maps the kiosk's free-form visitReason to one of
// the dm3_visitor.visits.chk_visit_purpose allowlist values. Vehicle entries
// map to `delivery` (the closest existing enum), everything else defaults
// to `other`.
func purposeFromLegacyPurpose(reason string, isPlate bool) string {
	if isPlate || strings.Contains(strings.ToLower(strings.TrimSpace(reason)), "xe") {
		return "delivery"
	}
	return "other"
}

// parseLegacyDateTime parses the .NET kiosk's "dd.MM.yyyy HH:mm:ss" format.
// Returns fallback on parse failure so a malformed timestamp doesn't block
// an otherwise-valid registration.
func parseLegacyDateTime(raw string, fallback time.Time) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	layouts := []string{
		"02.01.2006 15:04:05",
		"02.01.2006 15:04",
		"02.01.2006",
		time.RFC3339,
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return t
		}
	}
	return fallback
}

// splitVisitorName breaks "Nguyễn Văn A" into ("Nguyễn Văn", "A"). The DB
// requires both first_name and last_name; if the kiosk sends a single token
// we duplicate it rather than failing.
func splitVisitorName(full string) (string, string) {
	full = strings.TrimSpace(full)
	if full == "" {
		return "", ""
	}
	parts := strings.Fields(full)
	if len(parts) == 1 {
		return parts[0], parts[0]
	}
	last := parts[len(parts)-1]
	first := strings.Join(parts[:len(parts)-1], " ")
	return first, last
}

// plateIf populates the visits.vehicle_plate column when the credential is a
// license plate, so UI that lists visits can show the plate without joining
// to dm3_parking.parking_vehicles.
func plateIf(isPlate bool, value string) *string {
	if !isPlate {
		return nil
	}
	v := value
	return &v
}

// upsertParkingVisitorVehicle writes the plate into dm3_parking.parking_vehicles
// linked to a visitor (not a user). Per docs/specs/operate/parking.md this is
// the canonical home for plate credentials in DM3 — parking-svc publishes
// `matched_by='plate'` access events when the barrier LPR camera reads it.
//
// Matching key is (tenant_id, normalized_plate): the table already has a
// unique index there, so a duplicate plate for the same tenant updates the
// existing row (rebinding it to the current visitor) rather than erroring.
// Runs inside the caller's transaction so a failed insert rolls back the
// visit too.
func upsertParkingVisitorVehicle(ctx context.Context, tx pgx.Tx, tenantID, visitorID, plate string) error {
	raw := strings.TrimSpace(plate)
	if raw == "" {
		return fmt.Errorf("plate is empty")
	}
	normalized := normalizeParkingPlate(raw)

	_, err := tx.Exec(ctx, `
		INSERT INTO dm3_parking.parking_vehicles
		  (tenant_id, visitor_id, plate_number, normalized_plate,
		   type, category, registration_status)
		VALUES
		  ($1::uuid, $2::uuid, $3, $4, 'car', 'visitor', 'visitor')
		ON CONFLICT (tenant_id, normalized_plate) DO UPDATE
		   SET visitor_id    = EXCLUDED.visitor_id,
		       owner_user_id = NULL,
		       category      = 'visitor',
		       registration_status = 'visitor',
		       updated_at    = now()
	`, tenantID, visitorID, raw, normalized)
	return err
}

// normalizeParkingPlate produces the case/punctuation-insensitive form of a
// plate used as the parking_vehicles uniqueness key. Kept simple: upper-case,
// strip whitespace and the common delimiters operators use freely ("30A-123"
// → "30A123"). Matches the convention used by parking-svc (see ParkingMatchPlate).
func normalizeParkingPlate(raw string) string {
	out := strings.ToUpper(strings.TrimSpace(raw))
	out = strings.NewReplacer(" ", "", "-", "", ".", "", ",", "").Replace(out)
	return out
}

// hashUUIDTo31BitInt returns a deterministic positive int31 derived from the
// first 4 bytes of a UUID. Used to populate the legacy response's `visitId`
// field, which the .NET client declares as `int`. 2^31 values is ample for
// a single kiosk's lifetime, and the full UUID is still carried on the new
// `visit_id` field for callers that can consume it.
func hashUUIDTo31BitInt(uuidStr string) int64 {
	hex := strings.ReplaceAll(strings.TrimSpace(uuidStr), "-", "")
	if len(hex) < 8 {
		return 0
	}
	raw, err := decodeHexPrefix(hex, 4)
	if err != nil {
		return 0
	}
	n := binary.BigEndian.Uint32(raw)
	return int64(n & 0x7fffffff)
}

func decodeHexPrefix(h string, nBytes int) ([]byte, error) {
	return hex.DecodeString(h[:nBytes*2])
}

// trimmedNilIfEmpty is nilIfEmpty but trims first — the kiosk sends
// space-padded fields that would otherwise slip past the existing helper.
func trimmedNilIfEmpty(s string) *string {
	return nilIfEmpty(strings.TrimSpace(s))
}
