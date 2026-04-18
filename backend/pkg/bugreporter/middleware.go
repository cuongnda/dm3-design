package bugreporter

import (
	"bytes"
	"log/slog"
	"net/http"
)

// responseCapture wraps http.ResponseWriter to capture status code and error body.
type responseCapture struct {
	http.ResponseWriter
	statusCode int
	body       bytes.Buffer
	written    bool
}

func (rc *responseCapture) WriteHeader(code int) {
	rc.statusCode = code
	rc.written = true
	rc.ResponseWriter.WriteHeader(code)
}

func (rc *responseCapture) Write(b []byte) (int, error) {
	if !rc.written {
		rc.statusCode = http.StatusOK
		rc.written = true
	}
	// Capture body for 5xx errors only
	if rc.statusCode >= 500 {
		rc.body.Write(b)
	}
	return rc.ResponseWriter.Write(b)
}

// Middleware returns an HTTP middleware that reports 5xx errors to DV Tasks.
// If reporter is nil, it's a no-op passthrough.
func Middleware(reporter *Reporter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if reporter == nil {
			return next // no-op if reporter is disabled
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rc := &responseCapture{ResponseWriter: w, statusCode: http.StatusOK}

			// Recover panics and report them
			defer func() {
				if err := recover(); err != nil {
					stack := CaptureStack()
					slog.Error("panic recovered", "error", err, "path", r.URL.Path)

					reporter.Report(BugReport{
						StatusCode: http.StatusInternalServerError,
						Method:     r.Method,
						Path:       r.URL.Path,
						Error:      formatPanicError(err),
						Stack:      stack,
						UserAgent:  r.UserAgent(),
						RemoteAddr: r.RemoteAddr,
					})

					// Return 500 to client
					http.Error(w, "internal server error", http.StatusInternalServerError)
				}
			}()

			next.ServeHTTP(rc, r)

			// Report 5xx errors
			if rc.statusCode >= 500 {
				errBody := rc.body.String()
				if errBody == "" {
					errBody = http.StatusText(rc.statusCode)
				}
				reporter.Report(BugReport{
					StatusCode: rc.statusCode,
					Method:     r.Method,
					Path:       r.URL.Path,
					Error:      errBody,
					Stack:      "", // no stack for non-panic errors
					UserAgent:  r.UserAgent(),
					RemoteAddr: r.RemoteAddr,
				})
			}
		})
	}
}

func formatPanicError(err any) string {
	switch v := err.(type) {
	case error:
		return v.Error()
	case string:
		return v
	default:
		return "unknown panic"
	}
}
