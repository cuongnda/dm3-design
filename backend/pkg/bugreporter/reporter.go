// Package bugreporter auto-reports 5xx errors to DV Tasks as bug tickets.
package bugreporter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"sync"
	"time"
)

// Config for DV Tasks integration.
type Config struct {
	// DV Tasks API base URL (e.g., "https://tasks.duali.vn/api")
	BaseURL string
	// Auth token for DV Tasks API
	Token string
	// Project ID in DV Tasks
	ProjectID string
	// Sprint ID (optional)
	SprintID string
	// Assignee ID (optional, auto-assign bugs)
	AssigneeID string
	// Service name (e.g., "auth-svc", "device-gateway")
	ServiceName string
	// Minimum interval between duplicate reports (default 1h)
	DedupeInterval time.Duration
	// Enable/disable reporting
	Enabled bool
}

// Reporter manages bug reporting to DV Tasks.
type Reporter struct {
	cfg    Config
	client *http.Client
	mu     sync.Mutex
	seen   map[string]time.Time // dedup: error fingerprint → last reported
}

// New creates a bug reporter. Returns nil if not enabled.
func New(cfg Config) *Reporter {
	if !cfg.Enabled || cfg.BaseURL == "" || cfg.Token == "" || cfg.ProjectID == "" {
		slog.Info("bugreporter: disabled (missing config or not enabled)")
		return nil
	}
	if cfg.DedupeInterval == 0 {
		cfg.DedupeInterval = 1 * time.Hour
	}
	slog.Info("bugreporter: enabled", "service", cfg.ServiceName, "project", cfg.ProjectID)
	return &Reporter{
		cfg:    cfg,
		client: &http.Client{Timeout: 10 * time.Second},
		seen:   make(map[string]time.Time),
	}
}

// BugReport contains error context.
type BugReport struct {
	StatusCode int
	Method     string
	Path       string
	Error      string
	Stack      string
	UserAgent  string
	RemoteAddr string
}

// Report sends a bug to DV Tasks (non-blocking).
func (r *Reporter) Report(report BugReport) {
	if r == nil {
		return
	}
	go r.reportAsync(report)
}

func (r *Reporter) reportAsync(report BugReport) {
	// Fingerprint for dedup: service + path + error message (first line)
	firstLine := report.Error
	if idx := strings.IndexByte(firstLine, '\n'); idx > 0 {
		firstLine = firstLine[:idx]
	}
	fingerprint := fmt.Sprintf("%s:%s:%s", r.cfg.ServiceName, report.Path, firstLine)

	r.mu.Lock()
	if lastSeen, ok := r.seen[fingerprint]; ok && time.Since(lastSeen) < r.cfg.DedupeInterval {
		r.mu.Unlock()
		slog.Debug("bugreporter: deduped", "path", report.Path, "error", firstLine)
		return
	}
	r.seen[fingerprint] = time.Now()
	// Cleanup old entries
	for k, v := range r.seen {
		if time.Since(v) > 24*time.Hour {
			delete(r.seen, k)
		}
	}
	r.mu.Unlock()

	title := fmt.Sprintf("[BUG][%s] %d %s %s — %s",
		r.cfg.ServiceName, report.StatusCode, report.Method, report.Path, firstLine)
	if len(title) > 200 {
		title = title[:200]
	}

	description := fmt.Sprintf(`## Auto-reported Bug

**Service:** %s
**Endpoint:** %s %s
**Status:** %d
**Time:** %s
**Client:** %s (%s)

### Error
`+"```"+`
%s
`+"```"+`

### Stack Trace
`+"```"+`
%s
`+"```",
		r.cfg.ServiceName,
		report.Method, report.Path,
		report.StatusCode,
		time.Now().UTC().Format(time.RFC3339),
		report.RemoteAddr, report.UserAgent,
		report.Error,
		truncate(report.Stack, 2000),
	)

	task := map[string]any{
		"title":       title,
		"description": description,
		"project_id":  r.cfg.ProjectID,
		"priority":    "high",
		"type":        "bug",
	}
	if r.cfg.SprintID != "" {
		task["sprint_id"] = r.cfg.SprintID
	}
	if r.cfg.AssigneeID != "" {
		task["assignee_id"] = r.cfg.AssigneeID
	}

	body, _ := json.Marshal(task)
	req, err := http.NewRequest("POST", r.cfg.BaseURL+"/tasks", bytes.NewReader(body))
	if err != nil {
		slog.Error("bugreporter: failed to create request", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+r.cfg.Token)

	resp, err := r.client.Do(req)
	if err != nil {
		slog.Error("bugreporter: failed to send", "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		slog.Warn("bugreporter: DV Tasks returned error", "status", resp.StatusCode)
		return
	}
	slog.Info("bugreporter: bug reported", "title", title[:min(80, len(title))])
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "\n... (truncated)"
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// CaptureStack returns current goroutine stack trace.
func CaptureStack() string {
	return string(debug.Stack())
}
