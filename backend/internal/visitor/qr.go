package visitor

import (
	crypto_rand "crypto/rand"
	"encoding/hex"
)

// generateQRToken creates a cryptographically random 64-character hex string
// suitable for use as a visit QR token.
func generateQRToken() (string, error) {
	b := make([]byte, 32)
	if _, err := crypto_rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
