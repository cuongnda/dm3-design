package parking

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/duali/dm3-backend/internal/models"
)

const (
	EventSessionEntry   = "session.entry"
	EventSessionExit    = "session.exit"
	EventSessionPayment = "session.payment"
	EventRecognition    = "recognition"
	EventPassCreated    = "pass.created"
	EventBarrierCommand = "barrier.command"
)

func (h *ParkingHandlers) publishParkingEvent(ctx context.Context, eventType string, payload any) {
	if h.nats == nil {
		return
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	if err := h.nats.Publish(ctx, "dm3.parking."+eventType, b); err != nil {
		slog.Warn("parking event publish failed", "event", eventType, "error", err)
	}
}

func (h *ParkingHandlers) publishBarrierCommand(ctx context.Context, zoneID, deviceID string, cmd barrierCommand) error {
	if h.nats == nil {
		return nil
	}
	b, err := json.Marshal(cmd)
	if err != nil {
		return err
	}
	subject := fmt.Sprintf("dm3.parking.barrier.%s.%s.cmd", zoneID, deviceID)
	return h.nats.Publish(ctx, subject, b)
}

// barrierSyncPayload is published to dm3.parking.{tenant_id}.zone.barrier_sync
// when a parking zone is created or updated, so access-svc can auto-register
// barrier devices and create corresponding access points.
type barrierSyncPayload struct {
	TenantID     string           `json:"tenant_id"`
	ZoneID       string           `json:"zone_id"`
	ZoneName     string           `json:"zone_name"`
	ZoneCode     string           `json:"zone_code"`
	AccessZoneID *string          `json:"access_zone_id,omitempty"`
	EntryDevices []map[string]any `json:"entry_devices"`
	ExitDevices  []map[string]any `json:"exit_devices"`
	Deleted      bool             `json:"deleted"`
}

// publishBarrierSync publishes barrier device configuration to NATS so that
// access-svc can register/update barrier devices in the unified device registry.
func (h *ParkingHandlers) publishBarrierSync(ctx context.Context, tenantID string, payload barrierSyncPayload) {
	if h.nats == nil {
		return
	}
	b, err := json.Marshal(payload)
	if err != nil {
		slog.Warn("barrier sync marshal failed", "error", err)
		return
	}
	subject := fmt.Sprintf("dm3.parking.%s.zone.barrier_sync", tenantID)
	if err := h.nats.Publish(ctx, subject, b); err != nil {
		slog.Warn("barrier sync publish failed", "zone_id", payload.ZoneID, "error", err)
	}
}

// parkingAccessEventPayload is published to dm3.parking.{tenant_id}.access.{direction}
// so that access-svc can ingest parking entry/exit as unified access events.
type parkingAccessEventPayload struct {
	TenantID       string  `json:"tenant_id"`
	SessionID      string  `json:"session_id"`
	PlateNumber    string  `json:"plate_number"`
	VehicleID      *string `json:"vehicle_id,omitempty"`
	UserID         *string `json:"user_id,omitempty"`
	ZoneID         string  `json:"zone_id"`
	AccessZoneID   *string `json:"access_zone_id,omitempty"`
	DeviceID       *string `json:"device_id,omitempty"`
	MatchedBy      string  `json:"matched_by"`
	CredentialType string  `json:"credential_type"`
	Direction      string  `json:"direction"`
	Decision       string  `json:"decision"`
	Reason         string  `json:"reason"`
	Confidence     *float64 `json:"confidence,omitempty"`
	Time           int64   `json:"time"`
}

// matchedByToCredentialType converts a parking match type to an access credential type.
func matchedByToCredentialType(matchedBy string) string {
	switch matchedBy {
	case models.ParkingMatchNFC, models.ParkingMatchNFCPlate:
		return "nfc"
	case models.ParkingMatchRFID, models.ParkingMatchRFIDPlate:
		return "rfid"
	case models.ParkingMatchPlate, "anpr_auto":
		return "plate"
	default:
		return "manual"
	}
}

// decisionCodeToAccessDecision maps parking decision codes to access event decisions.
func decisionCodeToAccessDecision(code string) string {
	switch code {
	case "auto_allow", "resident_pass_allow", "exit_allow":
		return "granted"
	case "plate_mismatch", "exit_pending_payment":
		return "pending"
	default:
		return "granted"
	}
}

// publishParkingAccessEvent publishes a parking entry/exit as an access event
// to dm3.parking.{tenant_id}.access.{direction} on the PARKING NATS stream.
func (h *ParkingHandlers) publishParkingAccessEvent(ctx context.Context, session models.ParkingSession, direction, decisionCode, decisionReason string, deviceID *string) {
	if h.nats == nil {
		return
	}

	// Look up access_zone_id from parking zone
	var accessZoneID *string
	row := h.db.Pool.QueryRow(ctx,
		`SELECT access_zone_id::text FROM dm3_parking.parking_zones WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		session.ZoneID, session.TenantID)
	var azID string
	if err := row.Scan(&azID); err == nil && azID != "" {
		accessZoneID = &azID
	}

	// Look up owner_user_id from vehicle if available
	var userID *string
	if session.VehicleID != nil {
		row := h.db.Pool.QueryRow(ctx,
			`SELECT owner_user_id::text FROM dm3_parking.parking_vehicles WHERE id = $1::uuid AND tenant_id = $2::uuid`,
			*session.VehicleID, session.TenantID)
		var uid string
		if err := row.Scan(&uid); err == nil && uid != "" {
			userID = &uid
		}
	}

	payload := parkingAccessEventPayload{
		TenantID:       session.TenantID,
		SessionID:      session.ID,
		PlateNumber:    session.PlateNumber,
		VehicleID:      session.VehicleID,
		UserID:         userID,
		ZoneID:         session.ZoneID,
		AccessZoneID:   accessZoneID,
		DeviceID:       deviceID,
		MatchedBy:      session.MatchedBy,
		CredentialType: matchedByToCredentialType(session.MatchedBy),
		Direction:      direction,
		Decision:       decisionCodeToAccessDecision(decisionCode),
		Reason:         decisionReason,
		Confidence:     session.RecognitionConfidence,
		Time:           time.Now().UTC().UnixMilli(),
	}

	b, err := json.Marshal(payload)
	if err != nil {
		slog.Warn("parking access event marshal failed", "error", err)
		return
	}
	subject := fmt.Sprintf("dm3.parking.%s.access.%s", session.TenantID, direction)
	if err := h.nats.Publish(ctx, subject, b); err != nil {
		slog.Warn("parking access event publish failed", "direction", direction, "error", err)
	}
}
