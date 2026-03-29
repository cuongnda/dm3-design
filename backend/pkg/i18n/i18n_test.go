package i18n

import (
	"context"
	"testing"
)

func TestBasicTranslation(t *testing.T) {
	// Manually set up translations for testing
	translations["en"] = map[string]string{
		"auth.invalid_credentials": "Invalid email or password",
		"validation.required_field": "{{field}} is required",
	}
	translations["vi"] = map[string]string{
		"auth.invalid_credentials": "Email hoặc mật khẩu không đúng",
		"validation.required_field": "{{field}} là bắt buộc",
	}

	tests := []struct {
		name     string
		locale   string
		key      string
		params   map[string]string
		expected string
	}{
		{
			name:     "English translation",
			locale:   "en",
			key:      "auth.invalid_credentials",
			expected: "Invalid email or password",
		},
		{
			name:     "Vietnamese translation",
			locale:   "vi", 
			key:      "auth.invalid_credentials",
			expected: "Email hoặc mật khẩu không đúng",
		},
		{
			name:     "Fallback to English",
			locale:   "fr", // unsupported language
			key:      "auth.invalid_credentials",
			expected: "Invalid email or password",
		},
		{
			name:     "Parameter interpolation in English",
			locale:   "en",
			key:      "validation.required_field",
			params:   map[string]string{"field": "Email"},
			expected: "Email is required",
		},
		{
			name:     "Parameter interpolation in Vietnamese",
			locale:   "vi",
			key:      "validation.required_field", 
			params:   map[string]string{"field": "Email"},
			expected: "Email là bắt buộc",
		},
		{
			name:     "Missing key returns key itself",
			locale:   "en",
			key:      "missing.key",
			expected: "missing.key",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := WithLocale(context.Background(), tt.locale)
			
			var result string
			if tt.params != nil {
				result = T(ctx, tt.key, tt.params)
			} else {
				result = T(ctx, tt.key)
			}
			
			if result != tt.expected {
				t.Errorf("T() = %v, expected %v", result, tt.expected)
			}
		})
	}
}

func TestLocaleNormalization(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"en", "en"},
		{"en-US", "en"},
		{"en-GB", "en"},
		{"vi", "vi"},
		{"vi-VN", "vi"},
		{"fr", "en"}, // fallback to default
		{"", "en"},   // fallback to default
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			ctx := WithLocale(context.Background(), tt.input)
			locale := getLocaleFromContext(ctx)
			
			if locale != tt.expected {
				t.Errorf("WithLocale(%s) = %v, expected %v", tt.input, locale, tt.expected)
			}
		})
	}
}