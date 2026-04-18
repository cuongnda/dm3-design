package cctv

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestAccessEventSubjectParsing verifies the subject-parsing contract the
// consumer relies on: tenant_id is the third dotted segment of
// dm3.devices.{tenant_id}.{device_id}.evt, and non-UUID tenant segments are
// rejected.
func TestAccessEventSubjectParsing(t *testing.T) {
	tests := []struct {
		name       string
		subject    string
		wantTenant string
		wantOK     bool
	}{
		{
			name:       "valid subject",
			subject:    "dm3.devices.11111111-2222-3333-4444-555555555555.device-abc.evt",
			wantTenant: "11111111-2222-3333-4444-555555555555",
			wantOK:     true,
		},
		{
			name:    "non-uuid tenant segment",
			subject: "dm3.devices.not-a-uuid.device-abc.evt",
			wantOK:  false,
		},
		{
			name:    "too few segments",
			subject: "dm3.devices.foo",
			wantOK:  false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			parts := strings.SplitN(tc.subject, ".", 5)
			ok := len(parts) >= 5 && uuidRegex.MatchString(parts[2])
			if ok != tc.wantOK {
				t.Fatalf("ok = %v, want %v for %q", ok, tc.wantOK, tc.subject)
			}
			if ok && parts[2] != tc.wantTenant {
				t.Fatalf("tenant = %q, want %q", parts[2], tc.wantTenant)
			}
		})
	}
}

// TestAccessEventPayloadDecode verifies we can decode the outer envelope and
// inner access.log payload without loss of the identifiers we key on.
func TestAccessEventPayloadDecode(t *testing.T) {
	raw := []byte(`{
		"v": 1,
		"id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		"ts": 1700000000000,
		"src": "ctrl-001",
		"type": "access.log",
		"data": {"event_id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","door_id":"door-1"}
	}`)

	var evt deviceEvent
	if err := json.Unmarshal(raw, &evt); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}
	if evt.Type != "access.log" {
		t.Fatalf("type = %q, want access.log", evt.Type)
	}
	if evt.ID != "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" {
		t.Fatalf("id = %q", evt.ID)
	}

	var payload accessLogData
	if err := json.Unmarshal(evt.Data, &payload); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	if payload.EventID != evt.ID {
		t.Fatalf("payload event_id mismatch: %q vs %q", payload.EventID, evt.ID)
	}
	if payload.DoorID != "door-1" {
		t.Fatalf("door_id = %q", payload.DoorID)
	}
}

// TestNonAccessLogIgnored ensures that events of other types would short-circuit
// (caller checks evt.Type != "access.log" before DB work).
func TestNonAccessLogIgnored(t *testing.T) {
	raw := []byte(`{"v":1,"type":"heartbeat","data":{}}`)
	var evt deviceEvent
	if err := json.Unmarshal(raw, &evt); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if evt.Type == "access.log" {
		t.Fatalf("expected non-access.log event")
	}
}
