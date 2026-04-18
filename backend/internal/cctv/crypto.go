package cctv

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

// CredentialCipher encrypts/decrypts RTSP passwords using AES-256-GCM.
// The key is read from env CCTV_CREDENTIAL_KEY (base64-encoded 32 bytes).
type CredentialCipher struct {
	key []byte
}

// NewCredentialCipher validates the base64-encoded key and returns a CredentialCipher.
// The decoded key must be exactly 32 bytes for AES-256.
func NewCredentialCipher(keyB64 string) (*CredentialCipher, error) {
	key, err := base64.StdEncoding.DecodeString(keyB64)
	if err != nil {
		return nil, fmt.Errorf("cctv: decode credential key: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("cctv: credential key must be 32 bytes, got %d", len(key))
	}
	return &CredentialCipher{key: key}, nil
}

// Encrypt encrypts plaintext using AES-256-GCM and returns nonce || ciphertext || tag.
// Returns nil for empty plaintext (cameras with no auth store NULL).
func (c *CredentialCipher) Encrypt(plaintext string) ([]byte, error) {
	if plaintext == "" {
		return nil, nil
	}

	block, err := aes.NewCipher(c.key)
	if err != nil {
		return nil, fmt.Errorf("cctv: create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("cctv: create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("cctv: generate nonce: %w", err)
	}

	// Seal appends ciphertext+tag to nonce
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return ciphertext, nil
}

// Decrypt decrypts a nonce || ciphertext || tag blob and returns the plaintext.
// Returns empty string for nil input (NULL stored in DB).
func (c *CredentialCipher) Decrypt(ciphertext []byte) (string, error) {
	if ciphertext == nil {
		return "", nil
	}

	block, err := aes.NewCipher(c.key)
	if err != nil {
		return "", fmt.Errorf("cctv: create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("cctv: create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("cctv: ciphertext too short")
	}

	nonce, data := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, data, nil)
	if err != nil {
		return "", fmt.Errorf("cctv: decrypt: %w", err)
	}

	return string(plaintext), nil
}
