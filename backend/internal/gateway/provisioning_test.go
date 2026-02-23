package gateway

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-key"

func TestGenerateDeviceJWT(t *testing.T) {
	tokenStr, err := generateDeviceJWT("dev-123", "company-456", "terminal", testSecret)
	if err != nil {
		t.Fatalf("generateDeviceJWT error: %v", err)
	}
	if tokenStr == "" {
		t.Fatal("empty token")
	}

	// Parse and validate
	token, err := jwt.ParseWithClaims(tokenStr, &deviceJWTClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(testSecret), nil
	})
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	claims := token.Claims.(*deviceJWTClaims)
	if claims.Sub != "device:dev-123" {
		t.Errorf("sub = %q, want device:dev-123", claims.Sub)
	}
	if claims.CID != "company-456" {
		t.Errorf("cid = %q, want company-456", claims.CID)
	}
	if claims.DID != "dev-123" {
		t.Errorf("did = %q, want dev-123", claims.DID)
	}
	if claims.DType != "terminal" {
		t.Errorf("dtype = %q, want terminal", claims.DType)
	}
	if len(claims.Permissions) != 4 {
		t.Errorf("permissions len = %d, want 4", len(claims.Permissions))
	}
	// Should expire in ~24h
	if claims.ExpiresAt.Time.Before(time.Now().Add(23 * time.Hour)) {
		t.Error("token expires too soon")
	}
}

func TestQRTokenClaims(t *testing.T) {
	expiresAt := time.Now().Add(30 * time.Minute)
	claims := qrTokenClaims{
		Purpose: "device_activation",
		DID:     "dev-123",
		CID:     "company-456",
		DType:   "terminal",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "dm3",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("sign error: %v", err)
	}

	// Parse back
	parsed, err := jwt.ParseWithClaims(tokenStr, &qrTokenClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(testSecret), nil
	})
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	qr := parsed.Claims.(*qrTokenClaims)
	if qr.Purpose != "device_activation" {
		t.Errorf("purpose = %q, want device_activation", qr.Purpose)
	}

	// Wrong secret should fail
	_, err = jwt.ParseWithClaims(tokenStr, &qrTokenClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte("wrong-secret"), nil
	})
	if err == nil {
		t.Error("expected error with wrong secret")
	}
}

func TestQRTokenExpiry(t *testing.T) {
	claims := qrTokenClaims{
		Purpose: "device_activation",
		DID:     "dev-123",
		CID:     "company-456",
		DType:   "terminal",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Minute)), // expired
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-31 * time.Minute)),
			Issuer:    "dm3",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, _ := token.SignedString([]byte(testSecret))

	_, err := jwt.ParseWithClaims(tokenStr, &qrTokenClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(testSecret), nil
	})
	if err == nil {
		t.Error("expected error for expired token")
	}
}

func TestSha256Hash(t *testing.T) {
	h := sha256Hash("test-token")
	if len(h) != 64 {
		t.Errorf("hash length = %d, want 64", len(h))
	}
	// Same input = same hash
	if sha256Hash("test-token") != h {
		t.Error("hash not deterministic")
	}
	// Different input = different hash
	if sha256Hash("other-token") == h {
		t.Error("different inputs produced same hash")
	}
}

func TestHMACValidation(t *testing.T) {
	secret := "dm3-bootstrap-v1-dev-secret"

	payload := map[string]any{
		"type":        "device.register",
		"rid":         "000001",
		"device_type": "terminal",
		"timestamp":   1771509000,
		"nonce":       "test-nonce",
	}

	// Compute HMAC
	canonical, _ := json.Marshal(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(canonical)
	expectedHMAC := hex.EncodeToString(mac.Sum(nil))

	// Add hmac to payload
	payload["hmac"] = expectedHMAC
	fullPayload, _ := json.Marshal(payload)

	// Simulate validation: remove hmac, recompute
	var raw map[string]any
	json.Unmarshal(fullPayload, &raw)
	delete(raw, "hmac")
	canonical2, _ := json.Marshal(raw)
	mac2 := hmac.New(sha256.New, []byte(secret))
	mac2.Write(canonical2)
	computed := hex.EncodeToString(mac2.Sum(nil))

	if !hmac.Equal([]byte(computed), []byte(expectedHMAC)) {
		t.Error("HMAC validation failed")
	}

	// Wrong secret should fail
	mac3 := hmac.New(sha256.New, []byte("wrong-secret"))
	mac3.Write(canonical2)
	wrongHMAC := hex.EncodeToString(mac3.Sum(nil))
	if hmac.Equal([]byte(wrongHMAC), []byte(expectedHMAC)) {
		t.Error("wrong secret should produce different HMAC")
	}
}
