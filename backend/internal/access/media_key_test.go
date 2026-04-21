package access

import (
	"encoding/json"
	"testing"
)

func TestIsOwnTenantMediaKey(t *testing.T) {
	const (
		tenantA = "00000000-0000-0000-0000-000000000001"
		tenantB = "00000000-0000-0000-0000-000000000002"
		devA    = "term-a"
		devB    = "term-b"
	)

	cases := []struct {
		name   string
		key    string
		tenant string
		device string
		want   bool
	}{
		{"own tenant own device snapshot", "events/" + tenantA + "/" + devA + "/snapshot/abc.jpg", tenantA, devA, true},
		{"own tenant own device clip", "events/" + tenantA + "/" + devA + "/clip/xyz.mp4", tenantA, devA, true},
		{"cross tenant", "events/" + tenantB + "/" + devA + "/snapshot/abc.jpg", tenantA, devA, false},
		{"own tenant cross device", "events/" + tenantA + "/" + devB + "/snapshot/abc.jpg", tenantA, devA, false},
		{"legacy base64 payload", "/9j/4AAQSkZJRgABAQAAAQ...", tenantA, devA, false},
		{"empty key", "", tenantA, devA, false},
		{"empty tenant", "events/" + tenantA + "/" + devA + "/snapshot/abc.jpg", "", devA, false},
		{"empty device", "events/" + tenantA + "/" + devA + "/snapshot/abc.jpg", tenantA, "", false},
		{"missing prefix", tenantA + "/" + devA + "/snapshot/abc.jpg", tenantA, devA, false},
		{"prefix confusion", "events/" + tenantA + "-fake/" + devA + "/snapshot/abc.jpg", tenantA, devA, false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := isOwnTenantMediaKey(c.key, c.tenant, c.device)
			if got != c.want {
				t.Errorf("isOwnTenantMediaKey(%q, %q, %q) = %v, want %v",
					c.key, c.tenant, c.device, got, c.want)
			}
		})
	}
}

// TestAccessLogDataDecodesClipObjectKey asserts the wire tag matches the
// doc (mqtt-protocol.md §4.1). Without this, firmware authors would see
// "clip_object_key" documented but the field silently dropped on ingest.
func TestAccessLogDataDecodesClipObjectKey(t *testing.T) {
	raw := []byte(`{"photo":"p","clip_object_key":"events/t/d/clip/x.mp4"}`)
	var ald accessLogData
	if err := json.Unmarshal(raw, &ald); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if ald.ClipObjectKey != "events/t/d/clip/x.mp4" {
		t.Errorf("ClipObjectKey: got %q", ald.ClipObjectKey)
	}
	if ald.PhotoRef != "p" {
		t.Errorf("PhotoRef: got %q", ald.PhotoRef)
	}
}
