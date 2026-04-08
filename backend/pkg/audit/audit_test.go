package audit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNilLoggerSafe(t *testing.T) {
	var l *Logger
	// All methods must be no-ops on nil receiver
	l.Log(Entry{Action: "test"})
	l.LogFromRequest(httptest.NewRequest(http.MethodGet, "/", nil), "test", "entity", "1", "name", "success", nil, nil)
	l.Close()
}

func TestDiff(t *testing.T) {
	old := map[string]any{"name": "Alice", "email": "a@b.com", "password": "secret123"}
	new := map[string]any{"name": "Bob", "email": "a@b.com", "password": "newpass"}

	oldDiff, newDiff := Diff(old, new)

	// password should be excluded
	if _, ok := oldDiff["password"]; ok {
		t.Error("password should be excluded from old diff")
	}
	if _, ok := newDiff["password"]; ok {
		t.Error("password should be excluded from new diff")
	}

	// name should be present (it changed)
	if oldDiff["name"] != "Alice" {
		t.Errorf("expected old name Alice, got %v", oldDiff["name"])
	}
	if newDiff["name"] != "Bob" {
		t.Errorf("expected new name Bob, got %v", newDiff["name"])
	}

	// email should NOT be present (unchanged)
	if _, ok := oldDiff["email"]; ok {
		t.Error("email should not be in diff (unchanged)")
	}
}

func TestDiffNils(t *testing.T) {
	old, new := Diff(nil, nil)
	if old != nil || new != nil {
		t.Error("expected nil diffs for nil inputs")
	}
}

func TestIPFromRequest(t *testing.T) {
	tests := []struct {
		name     string
		xff      string
		xri      string
		remote   string
		expected string
	}{
		{"X-Forwarded-For", "1.2.3.4, 5.6.7.8", "", "9.9.9.9:1234", "1.2.3.4"},
		{"X-Real-Ip", "", "10.0.0.1", "9.9.9.9:1234", "10.0.0.1"},
		{"RemoteAddr", "", "", "192.168.1.1:5555", "192.168.1.1"},
		{"Invalid XFF fallback", "not-an-ip", "", "8.8.8.8:80", "8.8.8.8"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/", nil)
			r.RemoteAddr = tt.remote
			if tt.xff != "" {
				r.Header.Set("X-Forwarded-For", tt.xff)
			}
			if tt.xri != "" {
				r.Header.Set("X-Real-Ip", tt.xri)
			}
			got := IPFromRequest(r)
			if got != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, got)
			}
		})
	}
}

func TestActorFromContext(t *testing.T) {
	// No claims in context
	id, email := ActorFromContext(context.Background())
	if id != "" || email != "" {
		t.Error("expected empty actor from empty context")
	}
}

func TestNilIfEmpty(t *testing.T) {
	if nilIfEmpty("") != nil {
		t.Error("expected nil for empty string")
	}
	if nilIfEmpty("abc") != "abc" {
		t.Error("expected 'abc' for non-empty string")
	}
}

func TestNilIP(t *testing.T) {
	if nilIP("") != nil {
		t.Error("expected nil for empty IP")
	}
	if nilIP("not-an-ip") != nil {
		t.Error("expected nil for invalid IP")
	}
	if nilIP("1.2.3.4") != "1.2.3.4" {
		t.Error("expected '1.2.3.4' for valid IP")
	}
}

func TestItoa(t *testing.T) {
	tests := []struct {
		in  int
		out string
	}{
		{1, "1"}, {9, "9"}, {10, "10"}, {42, "42"}, {100, "100"}, {140, "140"},
	}
	for _, tt := range tests {
		if got := itoa(tt.in); got != tt.out {
			t.Errorf("itoa(%d) = %q, want %q", tt.in, got, tt.out)
		}
	}
}

func TestBufferDrop(t *testing.T) {
	// Create a logger with a tiny buffer to test drop behavior
	l := &Logger{
		service: "test",
		ch:      make(chan Entry, 1),
		done:    make(chan struct{}),
	}
	// Don't start the run goroutine so channel fills up

	l.Log(Entry{Action: "first"})  // fills buffer
	l.Log(Entry{Action: "second"}) // should be dropped silently

	if len(l.ch) != 1 {
		t.Errorf("expected 1 entry in channel, got %d", len(l.ch))
	}
}

func TestToJSONB(t *testing.T) {
	// nil -> nil
	if toJSONB(nil) != nil {
		t.Error("expected nil for nil input")
	}
	// empty map -> nil
	if toJSONB(map[string]any{}) != nil {
		t.Error("expected nil for empty map")
	}
	// valid map -> JSON bytes
	result := toJSONB(map[string]any{"key": "value"})
	if result == nil {
		t.Error("expected non-nil for valid map")
	}
}
