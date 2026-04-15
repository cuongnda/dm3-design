package tenant

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Mock database for testing
func createMockDB(t *testing.T) *db.DB {
	// For unit tests, we'll use a mock database
	// In integration tests, you would use a real test database
	return &db.DB{
		Pool: nil, // Mock implementation
	}
}

// Helper to create test JWT token
func createTestToken(userID, tenantID, role string) string {
	claims := authsvc.AccessClaims{
		Sub:   userID,
		TID:   tenantID,
		CID:   tenantID,
		Email: "test@example.com",
		Name:  "Test User",
		Role:  role,
		Roles: []string{role},
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "dm3",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString([]byte("test-secret"))
	return tokenString
}

func TestTenantMiddleware(t *testing.T) {
	database := createMockDB(t)

	tests := []struct {
		name           string
		mode           IsolationMode
		token          string
		expectedStatus int
		expectTenant   bool
	}{
		// "strict mode with valid tenant" is intentionally omitted from
		// this unit-test table: it requires loadTenantInfo to query the
		// DB, but createMockDB returns Pool: nil. Previously the code
		// silently faked an "active" tenant when Pool was nil, which
		// papered over a real privilege-escalation risk; that stub was
		// removed in the P1.5 security fix and now correctly returns
		// 500. Coverage for the happy path lives in the integration
		// suite (automation/tests/tenant_isolation/), which uses a real
		// database.
		{
			name:           "strict mode with no tenant",
			mode:           IsolationModeStrict,
			token:          createTestToken("user1", "", "manager"),
			expectedStatus: http.StatusForbidden,
			expectTenant:   false,
		},
		{
			name:           "optional mode with no tenant",
			mode:           IsolationModeOptional,
			token:          createTestToken("user1", "", "manager"),
			expectedStatus: http.StatusOK,
			expectTenant:   false,
		},
		{
			name:           "system admin mode",
			mode:           IsolationModeSystemAdmin,
			token:          createTestToken("admin1", "", "system_admin"),
			expectedStatus: http.StatusOK,
			expectTenant:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create test handler
			handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tt.expectTenant {
					tenantID, err := TenantIDFromContext(r.Context())
					assert.NoError(t, err)
					assert.NotEmpty(t, tenantID)
				}
				w.WriteHeader(http.StatusOK)
			})

			// Create middleware
			middleware := Middleware(database, tt.mode)

			// Create request with auth context
			req := httptest.NewRequest("GET", "/test", nil)
			req.Header.Set("Authorization", "Bearer "+tt.token)

			// Mock authsvc claims context (in real test, this would be set by auth middleware)
			claims := &authsvc.AccessClaims{}
			token, _ := jwt.ParseWithClaims(tt.token, claims, func(t *jwt.Token) (interface{}, error) {
				return []byte("test-secret"), nil
			})
			if token.Valid {
				ctx := authsvc.WithClaims(req.Context(), claims)
				req = req.WithContext(ctx)
			}

			rr := httptest.NewRecorder()

			// Execute middleware
			middleware(handler).ServeHTTP(rr, req)

			assert.Equal(t, tt.expectedStatus, rr.Code)
		})
	}
}

func TestTenantContext(t *testing.T) {
	ctx := context.Background()

	t.Run("WithTenantID and TenantIDFromContext", func(t *testing.T) {
		tenantID := "test-tenant-123"
		ctx = WithTenantID(ctx, tenantID)

		retrieved, err := TenantIDFromContext(ctx)
		require.NoError(t, err)
		assert.Equal(t, tenantID, retrieved)
	})

	t.Run("WithCompanyID and CompanyIDFromContext", func(t *testing.T) {
		companyID := "test-company-456"
		ctx = WithCompanyID(ctx, companyID)

		retrieved, err := CompanyIDFromContext(ctx)
		require.NoError(t, err)
		assert.Equal(t, companyID, retrieved)
	})

	t.Run("WithTenantInfo and TenantInfoFromContext", func(t *testing.T) {
		info := &TenantInfo{
			ID:          "tenant-789",
			TenantID:    "company-789",
			CompanyName: "Test Company",
			CompanyCode: "TEST",
			Plan:        "enterprise",
			Status:      "active",
			MaxDevices:  100,
			MaxUsers:    50,
		}

		ctx = WithTenantInfo(ctx, info)

		retrieved, err := TenantInfoFromContext(ctx)
		require.NoError(t, err)
		assert.Equal(t, info, retrieved)
	})

	t.Run("MustTenantID panics when no context", func(t *testing.T) {
		assert.Panics(t, func() {
			MustTenantID(context.Background())
		})
	})

	t.Run("TenantIDFromContext returns error when no context", func(t *testing.T) {
		_, err := TenantIDFromContext(context.Background())
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "tenant_id not found")
	})
}

func TestValidateResourceAccess(t *testing.T) {
	tests := []struct {
		name             string
		currentTenantID  string
		resourceTenantID string
		expectError      bool
	}{
		{
			name:             "same tenant access allowed",
			currentTenantID:  "tenant-123",
			resourceTenantID: "tenant-123",
			expectError:      false,
		},
		{
			name:             "different tenant access denied",
			currentTenantID:  "tenant-123",
			resourceTenantID: "tenant-456",
			expectError:      true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := WithTenantID(context.Background(), tt.currentTenantID)
			
			err := ValidateResourceAccess(ctx, tt.resourceTenantID)
			
			if tt.expectError {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "access denied")
			} else {
				assert.NoError(t, err)
			}
		})
	}

	t.Run("no tenant context returns error", func(t *testing.T) {
		err := ValidateResourceAccess(context.Background(), "any-tenant")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "no tenant context")
	})
}