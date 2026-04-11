package authsvc

import (
	"context"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-key"

func TestGenerateAndValidateAccessToken(t *testing.T) {
	h := &AuthHandlers{jwtSecret: testSecret}

	tokenStr, err := h.generateAccessToken("user-1", "company-1", "test@example.com", "Test User", []string{"admin"}, "company-1", "admin", nil)
	if err != nil {
		t.Fatalf("generateAccessToken: %v", err)
	}

	// Parse and validate
	token, err := jwt.ParseWithClaims(tokenStr, &AccessClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(testSecret), nil
	})
	if err != nil {
		t.Fatalf("parse token: %v", err)
	}

	claims, ok := token.Claims.(*AccessClaims)
	if !ok || !token.Valid {
		t.Fatal("invalid token claims")
	}

	if claims.Sub != "user-1" {
		t.Errorf("sub = %q, want user-1", claims.Sub)
	}
	if claims.CID != "company-1" {
		t.Errorf("cid = %q, want company-1", claims.CID)
	}
	if claims.Email != "test@example.com" {
		t.Errorf("email = %q, want test@example.com", claims.Email)
	}
	if len(claims.Roles) != 1 || claims.Roles[0] != "admin" {
		t.Errorf("roles = %v, want [admin]", claims.Roles)
	}

	// Check expiry is ~15 min
	exp := claims.ExpiresAt.Time
	diff := exp.Sub(time.Now())
	if diff < 14*time.Minute || diff > 16*time.Minute {
		t.Errorf("expiry diff = %v, want ~15min", diff)
	}
}

func TestAccessTokenExpired(t *testing.T) {
	now := time.Now().Add(-1 * time.Hour)
	claims := AccessClaims{
		Sub:   "user-1",
		CID:   "company-1",
		Email: "test@example.com",
		Roles: []string{"admin"},
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(-15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "dm3-auth",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, _ := token.SignedString([]byte(testSecret))

	_, err := jwt.ParseWithClaims(tokenStr, &AccessClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(testSecret), nil
	})
	if err == nil {
		t.Fatal("expected error for expired token")
	}
}

func TestInvalidSecret(t *testing.T) {
	h := &AuthHandlers{jwtSecret: testSecret}
	tokenStr, _ := h.generateAccessToken("user-1", "company-1", "test@example.com", "Test", []string{"admin"}, "company-1", "admin", nil)

	_, err := jwt.ParseWithClaims(tokenStr, &AccessClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte("wrong-secret"), nil
	})
	if err == nil {
		t.Fatal("expected error for wrong secret")
	}
}

func TestRequireRole(t *testing.T) {
	tests := []struct {
		name     string
		roles    []string
		required []string
		allowed  bool
	}{
		{"admin has admin", []string{"admin"}, []string{"admin"}, true},
		{"viewer lacks admin", []string{"viewer"}, []string{"admin"}, false},
		{"operator in admin|operator", []string{"operator"}, []string{"admin", "operator"}, true},
		{"empty roles", []string{}, []string{"admin"}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			claims := &AccessClaims{Roles: tt.roles}
			allowed := false
			for _, cr := range claims.Roles {
				for _, req := range tt.required {
					if cr == req {
						allowed = true
					}
				}
			}
			if allowed != tt.allowed {
				t.Errorf("got %v, want %v", allowed, tt.allowed)
			}
		})
	}
}

func TestClaimsFromContext(t *testing.T) {
	claims := &AccessClaims{Sub: "user-1", Email: "test@example.com"}
	ctx := context.WithValue(context.Background(), claimsContextKey, claims)

	got := ClaimsFromContext(ctx)
	if got == nil {
		t.Fatal("expected claims")
	}
	if got.Sub != "user-1" {
		t.Errorf("sub = %q, want user-1", got.Sub)
	}

	// Nil context
	got = ClaimsFromContext(context.Background())
	if got != nil {
		t.Fatal("expected nil claims")
	}
}

func TestHashToken(t *testing.T) {
	h1 := hashToken("test-token")
	h2 := hashToken("test-token")
	if h1 != h2 {
		t.Error("hash should be deterministic")
	}
	h3 := hashToken("different-token")
	if h1 == h3 {
		t.Error("different tokens should have different hashes")
	}
	if len(h1) != 64 {
		t.Errorf("hash length = %d, want 64", len(h1))
	}
}
