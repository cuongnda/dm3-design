package audit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

// mockPublisher captures published messages for testing.
type mockPublisher struct {
	mu       sync.Mutex
	messages [][]byte
}

func (m *mockPublisher) Publish(_ context.Context, _ string, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := make([]byte, len(data))
	copy(cp, data)
	m.messages = append(m.messages, cp)
	return nil
}

func (m *mockPublisher) count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.messages)
}

func TestNilLoggerSafe(t *testing.T) {
	var l *Logger
	// All methods must be no-ops on nil receiver
	l.Log(Entry{Action: "test"})
	l.LogFromRequest(httptest.NewRequest(http.MethodGet, "/", nil), "test", "entity", "1", "name", "success", nil, nil)
	l.Close()
}

func TestLogPublishesToNATS(t *testing.T) {
	pub := &mockPublisher{}
	l := New(pub, "test-svc")

	l.Log(Entry{Action: "test.create", EntityType: "widget", Status: "success"})
	l.Close() // flushes

	if pub.count() != 1 {
		t.Errorf("expected 1 published message, got %d", pub.count())
	}
}

func TestLogSetsServiceAndStatus(t *testing.T) {
	pub := &mockPublisher{}
	l := New(pub, "my-svc")

	l.Log(Entry{Action: "test"}) // no Service or Status set
	l.Close()

	if pub.count() != 1 {
		t.Fatal("expected 1 message")
	}
	// The JSON should contain "my-svc" and "success"
	msg := string(pub.messages[0])
	if !contains(msg, `"service":"my-svc"`) {
		t.Errorf("expected service my-svc in message: %s", msg)
	}
	if !contains(msg, `"status":"success"`) {
		t.Errorf("expected status success in message: %s", msg)
	}
}

func TestDiff(t *testing.T) {
	old := map[string]any{"name": "Alice", "email": "a@b.com", "password": "secret123"}
	new := map[string]any{"name": "Bob", "email": "a@b.com", "password": "newpass"}

	oldDiff, newDiff := Diff(old, new)

	if _, ok := oldDiff["password"]; ok {
		t.Error("password should be excluded from old diff")
	}
	if _, ok := newDiff["password"]; ok {
		t.Error("password should be excluded from new diff")
	}
	if oldDiff["name"] != "Alice" {
		t.Errorf("expected old name Alice, got %v", oldDiff["name"])
	}
	if newDiff["name"] != "Bob" {
		t.Errorf("expected new name Bob, got %v", newDiff["name"])
	}
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
	id, email := ActorFromContext(context.Background())
	if id != "" || email != "" {
		t.Error("expected empty actor from empty context")
	}
}

func TestBufferDrop(t *testing.T) {
	pub := &mockPublisher{}
	l := &Logger{
		pub:     pub,
		service: "test",
		subject: "dm3.audit.test",
		ch:      make(chan []byte, 1),
		done:    make(chan struct{}),
	}
	// Don't start the run goroutine so channel fills up

	l.Log(Entry{Action: "first", EntityType: "x"})  // fills buffer
	l.Log(Entry{Action: "second", EntityType: "x"}) // should be dropped

	if len(l.ch) != 1 {
		t.Errorf("expected 1 entry in channel, got %d", len(l.ch))
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
