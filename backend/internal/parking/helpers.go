package parking

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

var vietnamesePlatePattern = regexp.MustCompile(`^[0-9]{2}[A-Z]{1,2}[0-9]?[- ]?[0-9]{3,5}(\.[0-9]{2})?$`)

func parsePagination(r *http.Request) (int, int) {
	page := 1
	limit := 20
	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	return page, limit
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func defaultMap(v map[string]any) map[string]any {
	if v == nil {
		return map[string]any{}
	}
	return v
}

func defaultSliceMap(v []map[string]any) []map[string]any {
	if v == nil {
		return []map[string]any{}
	}
	return v
}

func normalizePlate(input string) string {
	clean := strings.ToUpper(strings.TrimSpace(input))
	clean = strings.ReplaceAll(clean, " ", "")
	clean = strings.ReplaceAll(clean, ".", "")
	clean = strings.ReplaceAll(clean, "-", "")
	return clean
}

func looksLikePlate(normalized string) bool {
	if normalized == "" {
		return false
	}
	return vietnamesePlatePattern.MatchString(normalized)
}

func emptyToNil(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}
