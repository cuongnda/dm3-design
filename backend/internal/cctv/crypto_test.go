package cctv

import (
	"encoding/base64"
	"testing"
)

func validKeyB64() string {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	return base64.StdEncoding.EncodeToString(key)
}

func TestNewCredentialCipher(t *testing.T) {
	t.Run("valid 32-byte key", func(t *testing.T) {
		_, err := NewCredentialCipher(validKeyB64())
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
	})

	t.Run("invalid base64", func(t *testing.T) {
		_, err := NewCredentialCipher("not-valid-base64!!!")
		if err == nil {
			t.Fatal("expected error for invalid base64")
		}
	})

	t.Run("wrong key length (16 bytes)", func(t *testing.T) {
		short := base64.StdEncoding.EncodeToString(make([]byte, 16))
		_, err := NewCredentialCipher(short)
		if err == nil {
			t.Fatal("expected error for 16-byte key")
		}
	})
}

func TestCredentialCipher_RoundTrip(t *testing.T) {
	c, err := NewCredentialCipher(validKeyB64())
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name      string
		plaintext string
	}{
		{"short password", "s3cr3t"},
		{"long password", "a-very-long-rtsp-password-with-special-chars-!@#$%^&*()"},
		{"unicode", "パスワード123"},
		{"exactly 32 chars", "12345678901234567890123456789012"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ciphertext, err := c.Encrypt(tt.plaintext)
			if err != nil {
				t.Fatalf("Encrypt(%q): %v", tt.plaintext, err)
			}
			if ciphertext == nil {
				t.Fatal("expected non-nil ciphertext for non-empty plaintext")
			}

			got, err := c.Decrypt(ciphertext)
			if err != nil {
				t.Fatalf("Decrypt: %v", err)
			}
			if got != tt.plaintext {
				t.Errorf("round-trip mismatch: got %q, want %q", got, tt.plaintext)
			}
		})
	}
}

func TestCredentialCipher_EmptyInput(t *testing.T) {
	c, err := NewCredentialCipher(validKeyB64())
	if err != nil {
		t.Fatal(err)
	}

	t.Run("encrypt empty returns nil", func(t *testing.T) {
		ct, err := c.Encrypt("")
		if err != nil {
			t.Fatalf("Encrypt empty: %v", err)
		}
		if ct != nil {
			t.Errorf("expected nil ciphertext for empty input, got %v", ct)
		}
	})

	t.Run("decrypt nil returns empty string", func(t *testing.T) {
		pt, err := c.Decrypt(nil)
		if err != nil {
			t.Fatalf("Decrypt nil: %v", err)
		}
		if pt != "" {
			t.Errorf("expected empty string for nil ciphertext, got %q", pt)
		}
	})
}

func TestCredentialCipher_TamperDetection(t *testing.T) {
	c, err := NewCredentialCipher(validKeyB64())
	if err != nil {
		t.Fatal(err)
	}

	ct, err := c.Encrypt("original-password")
	if err != nil {
		t.Fatal(err)
	}

	// Flip a byte in the ciphertext body (after nonce)
	tampered := make([]byte, len(ct))
	copy(tampered, ct)
	tampered[len(tampered)-1] ^= 0xFF

	_, err = c.Decrypt(tampered)
	if err == nil {
		t.Fatal("expected error for tampered ciphertext")
	}
}

func TestCredentialCipher_WrongKey(t *testing.T) {
	c1, _ := NewCredentialCipher(validKeyB64())

	// Different key
	key2 := make([]byte, 32)
	for i := range key2 {
		key2[i] = byte(255 - i)
	}
	c2, _ := NewCredentialCipher(base64.StdEncoding.EncodeToString(key2))

	ct, err := c1.Encrypt("secret")
	if err != nil {
		t.Fatal(err)
	}

	_, err = c2.Decrypt(ct)
	if err == nil {
		t.Fatal("expected error when decrypting with wrong key")
	}
}

func TestCredentialCipher_CiphertextTooShort(t *testing.T) {
	c, err := NewCredentialCipher(validKeyB64())
	if err != nil {
		t.Fatal(err)
	}

	_, err = c.Decrypt([]byte{0x01, 0x02})
	if err == nil {
		t.Fatal("expected error for too-short ciphertext")
	}
}
