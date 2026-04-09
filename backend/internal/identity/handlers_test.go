package identity

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
)

const testTenantID = "00000000-0000-0000-0000-000000000001"

func setupTestDB(t *testing.T) *db.DB {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://dm3:dm3secret@localhost:5433/dm3?sslmode=disable"
	}
	database, err := db.Connect(context.Background(), dbURL)
	if err != nil {
		t.Skipf("database not available: %v", err)
	}
	return database
}

func setupRouter(h *IdentityHandlers) http.Handler {
	r := httputil.NewRouter()

	// Inject test auth context so handlers see a valid tenant
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authsvc.WithClaims(r.Context(), &authsvc.AccessClaims{
				Sub:   "test-user",
				CID:   testTenantID,
				Email: "test@example.com",
				Role:  "primary_manager",
				Roles: []string{"primary_manager"},
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Use(authsvc.RequireCompany())

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/users", h.ListUsers)
		r.Post("/users", h.CreateUser)
		r.Get("/users/sync", h.SyncUsers)
		r.Get("/users/{id}", h.GetUser)
		r.Put("/users/{id}", h.UpdateUser)
		r.Delete("/users/{id}", h.DeleteUser)

		r.Get("/users/{id}/credentials", h.ListCredentials)
		r.Post("/users/{id}/credentials", h.CreateCredential)
		r.Get("/users/{id}/credentials/{credID}", h.GetCredential)
		r.Put("/users/{id}/credentials/{credID}", h.UpdateCredential)
		r.Delete("/users/{id}/credentials/{credID}", h.DeleteCredential)

		r.Get("/groups", h.ListGroups)
		r.Post("/groups", h.CreateGroup)
		r.Get("/groups/{id}", h.GetGroup)
		r.Put("/groups/{id}", h.UpdateGroup)
		r.Delete("/groups/{id}", h.DeleteGroup)
		r.Get("/groups/{id}/members", h.ListGroupMembers)
		r.Post("/groups/{id}/members", h.AddGroupMember)
		r.Delete("/groups/{id}/members/{userID}", h.RemoveGroupMember)

		r.Get("/stats", h.GetStats)
	})
	return r
}

func TestPersonsCRUD(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	h := NewIdentityHandlers(database, nil, nil, nil)
	router := setupRouter(h)

	// Create
	body := `{"first_name":"John","last_name":"Doe","email":"john@test.com","department":"Engineering"}`
	req := httptest.NewRequest("POST", "/api/v1/users", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("create user: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var user map[string]any
	json.Unmarshal(w.Body.Bytes(), &user)
	userID := user["id"].(string)

	// Get
	req = httptest.NewRequest("GET", "/api/v1/users/"+userID, nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("get user: expected 200, got %d", w.Code)
	}

	// List with search
	req = httptest.NewRequest("GET", "/api/v1/users?search=John", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("list users: expected 200, got %d", w.Code)
	}

	var listResp map[string]any
	json.Unmarshal(w.Body.Bytes(), &listResp)
	pagination, _ := listResp["pagination"].(map[string]any)
	if pagination == nil || pagination["total"].(float64) < 1 {
		t.Fatal("expected at least 1 user in search results")
	}

	// Update
	body = `{"position":"Sales Manager"}`
	req = httptest.NewRequest("PUT", "/api/v1/users/"+userID, bytes.NewBufferString(body))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("update user: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify update by fetching the user
	req = httptest.NewRequest("GET", "/api/v1/users/"+userID, nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	var getResp map[string]any
	json.Unmarshal(w.Body.Bytes(), &getResp)
	updated, _ := getResp["user"].(map[string]any)
	if updated == nil || updated["position"] != "Sales Manager" {
		t.Fatalf("expected position Sales Manager, got %v", updated["position"])
	}

	// Delete
	req = httptest.NewRequest("DELETE", "/api/v1/users/"+userID, nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("delete user: expected 200, got %d", w.Code)
	}

	// Verify deleted
	req = httptest.NewRequest("GET", "/api/v1/users/"+userID, nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("get deleted user: expected 404, got %d", w.Code)
	}
}

func TestCredentialsCRUD(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	h := NewIdentityHandlers(database, nil, nil, nil)
	router := setupRouter(h)

	// Create user first
	body := `{"first_name":"Jane","last_name":"Smith","email":"jane@test.com"}`
	req := httptest.NewRequest("POST", "/api/v1/users", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	var user map[string]any
	json.Unmarshal(w.Body.Bytes(), &user)
	userID := user["id"].(string)
	defer func() {
		req := httptest.NewRequest("DELETE", "/api/v1/users/"+userID, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
	}()

	// Create credential
	body = `{"type":"card","value":"CARD-12345"}`
	req = httptest.NewRequest("POST", fmt.Sprintf("/api/v1/users/%s/credentials", userID), bytes.NewBufferString(body))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("create credential: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var cred map[string]any
	json.Unmarshal(w.Body.Bytes(), &cred)
	credID := cred["id"].(string)

	// List credentials
	req = httptest.NewRequest("GET", fmt.Sprintf("/api/v1/users/%s/credentials", userID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("list credentials: expected 200, got %d", w.Code)
	}

	// Get credential
	req = httptest.NewRequest("GET", fmt.Sprintf("/api/v1/users/%s/credentials/%s", userID, credID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("get credential: expected 200, got %d", w.Code)
	}

	// Invalid type
	body = `{"type":"invalid","value":"xxx"}`
	req = httptest.NewRequest("POST", fmt.Sprintf("/api/v1/users/%s/credentials", userID), bytes.NewBufferString(body))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("invalid credential type: expected 400, got %d", w.Code)
	}

	// Delete credential
	req = httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/users/%s/credentials/%s", userID, credID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete credential: expected 204, got %d", w.Code)
	}
}

func TestGroupsCRUD(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	h := NewIdentityHandlers(database, nil, nil, nil)
	router := setupRouter(h)

	// Create group
	body := `{"name":"VIP Group","description":"VIP access holders"}`
	req := httptest.NewRequest("POST", "/api/v1/groups", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("create group: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var group map[string]any
	json.Unmarshal(w.Body.Bytes(), &group)
	groupID := group["id"].(string)

	// Create a user to add as member
	body = `{"first_name":"Member","last_name":"One","email":"member@test.com"}`
	req = httptest.NewRequest("POST", "/api/v1/users", bytes.NewBufferString(body))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	var user map[string]any
	json.Unmarshal(w.Body.Bytes(), &user)
	userID := user["id"].(string)

	// Add member
	body = fmt.Sprintf(`{"user_id":"%s"}`, userID)
	req = httptest.NewRequest("POST", fmt.Sprintf("/api/v1/groups/%s/members", groupID), bytes.NewBufferString(body))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("add member: expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// List members
	req = httptest.NewRequest("GET", fmt.Sprintf("/api/v1/groups/%s/members", groupID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("list members: expected 200, got %d", w.Code)
	}

	// Get group (should have member_count=1)
	req = httptest.NewRequest("GET", "/api/v1/groups/"+groupID, nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	var gotGroup map[string]any
	json.Unmarshal(w.Body.Bytes(), &gotGroup)
	if gotGroup["member_count"].(float64) != 1 {
		t.Fatalf("expected member_count 1, got %v", gotGroup["member_count"])
	}

	// Remove member
	req = httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/groups/%s/members/%s", groupID, userID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("remove member: expected 204, got %d", w.Code)
	}

	// Cleanup
	httptest.NewRequest("DELETE", "/api/v1/users/"+userID, nil)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, httptest.NewRequest("DELETE", "/api/v1/users/"+userID, nil))

	req = httptest.NewRequest("DELETE", "/api/v1/groups/"+groupID, nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete group: expected 204, got %d", w.Code)
	}
}

func TestSyncEndpoint(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	h := NewIdentityHandlers(database, nil, nil, nil)
	router := setupRouter(h)

	// Sync with epoch gets all
	req := httptest.NewRequest("GET", "/api/v1/users/sync?since=2000-01-01T00:00:00Z", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("sync: expected 200, got %d", w.Code)
	}

	var resp map[string]any
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["timestamp"] == nil {
		t.Fatal("sync response missing timestamp")
	}

	// Invalid since format
	req = httptest.NewRequest("GET", "/api/v1/users/sync?since=invalid", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("invalid since: expected 400, got %d", w.Code)
	}
}

func TestStatsEndpoint(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	h := NewIdentityHandlers(database, nil, nil, nil)
	router := setupRouter(h)

	req := httptest.NewRequest("GET", "/api/v1/stats", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("stats: expected 200, got %d", w.Code)
	}

	var stats map[string]any
	json.Unmarshal(w.Body.Bytes(), &stats)
	if stats["total_users"] == nil {
		t.Fatal("stats missing total_users")
	}
}

func TestValidation(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	h := NewIdentityHandlers(database, nil, nil, nil)
	router := setupRouter(h)

	// Missing required fields
	body := `{"first_name":"Only"}`
	req := httptest.NewRequest("POST", "/api/v1/users", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("missing last_name: expected 400, got %d", w.Code)
	}

	// Invalid JSON
	req = httptest.NewRequest("POST", "/api/v1/users", bytes.NewBufferString("{invalid"))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("invalid json: expected 400, got %d", w.Code)
	}

	// Not found
	req = httptest.NewRequest("GET", "/api/v1/users/00000000-0000-0000-0000-000000000099", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("not found: expected 404, got %d", w.Code)
	}
}

func TestManagedIdentityAssetObjectKey(t *testing.T) {
	tests := []struct {
		name   string
		raw    string
		want   string
		wantOK bool
	}{
		{name: "public path", raw: "/photos/tenants/t1/identity/users/u1/photo.png", want: "tenants/t1/identity/users/u1/photo.png", wantOK: true},
		{name: "bare key", raw: "tenants/t1/identity/users/u1/avatar.jpg", want: "tenants/t1/identity/users/u1/avatar.jpg", wantOK: true},
		{name: "reject traversal", raw: "/photos/../secret.txt", want: "", wantOK: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := managedIdentityAssetObjectKey(tt.raw)
			if got != tt.want || ok != tt.wantOK {
				t.Fatalf("managedIdentityAssetObjectKey(%q) = (%q, %v), want (%q, %v)", tt.raw, got, ok, tt.want, tt.wantOK)
			}
		})
	}
}

func TestIdentityImageExtension(t *testing.T) {
	ext, contentType, ok := identityImageExtension("", "avatar.jpeg", []byte(""))
	if !ok || ext != ".jpg" || contentType != "image/jpeg" {
		t.Fatalf("identityImageExtension by filename = (%q, %q, %v)", ext, contentType, ok)
	}
	if _, _, ok := identityImageExtension("application/pdf", "avatar.pdf", []byte("not image")); ok {
		t.Fatal("expected pdf upload to be rejected")
	}
}
