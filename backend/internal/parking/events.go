package parking

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
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
