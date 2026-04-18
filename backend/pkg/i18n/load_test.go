package i18n

import (
	"context"
	"testing"
)

func TestLoadTranslations(t *testing.T) {
	// Test loading actual translation files
	err := Load("locales")
	if err != nil {
		t.Fatalf("Failed to load translations: %v", err)
	}

	// Test some key translations exist
	ctx := WithLocale(context.Background(), "en")
	
	authMsg := T(ctx, "auth.invalid_credentials")
	if authMsg == "auth.invalid_credentials" {
		t.Error("Expected auth.invalid_credentials to be translated")
	}
	
	if authMsg != "Invalid email or password" {
		t.Errorf("Expected 'Invalid email or password', got '%s'", authMsg)
	}

	// Test Vietnamese
	ctx = WithLocale(context.Background(), "vi")
	authMsgVi := T(ctx, "auth.invalid_credentials")
	if authMsgVi != "Email hoặc mật khẩu không đúng" {
		t.Errorf("Expected 'Email hoặc mật khẩu không đúng', got '%s'", authMsgVi)
	}

	// Test parameter interpolation
	ctx = WithLocale(context.Background(), "en")
	fieldMsg := T(ctx, "validation.required_field", map[string]string{"field": "Email"})
	if fieldMsg != "Email is required" {
		t.Errorf("Expected 'Email is required', got '%s'", fieldMsg)
	}
}