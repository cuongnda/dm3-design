package gateway

import "testing"

func TestBuildFirmwareObjectKey(t *testing.T) {
	got := buildFirmwareObjectKey("df970", "1.0.0_release.bin")
	want := "system/firmware/df970/1.0.0_release.bin"
	if got != want {
		t.Fatalf("buildFirmwareObjectKey() = %q, want %q", got, want)
	}
}

func TestSanitizeFirmwarePathSegment(t *testing.T) {
	if got := sanitizeFirmwarePathSegment(" ../weird/name.bin "); got != "_weird_name.bin" {
		t.Fatalf("sanitizeFirmwarePathSegment() = %q", got)
	}
}
