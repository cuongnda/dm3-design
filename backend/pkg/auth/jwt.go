package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	Sub      string   `json:"sub"`
	TID      string   `json:"tid"`
	CID      string   `json:"cid,omitempty"`
	Email    string   `json:"email"`
	Name     string   `json:"name,omitempty"`
	Roles    []string `json:"roles"`
	Role     string   `json:"role,omitempty"`
	jwt.RegisteredClaims

	// Compat aliases
	UserID   string `json:"-"`
	TenantID string `json:"-"`
}

// Populate compat fields after parsing.
func (c *Claims) Fixup() {
	c.UserID = c.Sub
	c.TenantID = c.TID
}

func GenerateToken(userID, email, tenantID string, roles []string, secret string) (string, error) {
	claims := Claims{
		UserID:   userID,
		Email:    email,
		TenantID: tenantID,
		Roles:    roles,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "dm3",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func ValidateToken(tokenString, secret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	claims.Fixup()
	return claims, nil
}
