package gateway

import (
	"net/http"
	"testing"
)

func TestParsePagination(t *testing.T) {
	tests := []struct {
		query     string
		wantPage  int
		wantLimit int
	}{
		{"", 1, 50},
		{"page=2&limit=20", 2, 20},
		{"page=0&limit=0", 1, 50},
		{"page=-1&limit=300", 1, 50},
		{"page=abc&limit=xyz", 1, 50},
		{"page=5&limit=100", 5, 100},
	}

	for _, tt := range tests {
		t.Run(tt.query, func(t *testing.T) {
			r, _ := http.NewRequest("GET", "/?"+tt.query, nil)
			page, limit := parsePagination(r)
			if page != tt.wantPage {
				t.Errorf("page = %d, want %d", page, tt.wantPage)
			}
			if limit != tt.wantLimit {
				t.Errorf("limit = %d, want %d", limit, tt.wantLimit)
			}
		})
	}
}

func TestIsUniqueViolation(t *testing.T) {
	if isUniqueViolation(nil) {
		t.Error("nil error should not be unique violation")
	}
}
