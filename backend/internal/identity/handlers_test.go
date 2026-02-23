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

	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
)

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
	// Run migrations
	_ = database.RunMigrations(context.Background(), "../../../pkg/db/migrations")
	return database
}

func setupRouter(h *Handlers) http.Handler {
	r := httputil.NewRouter()
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/persons", h.ListPersons)
		r.Post("/persons", h.CreatePerson)
		r.Get("/persons/sync", h.SyncPersons)
		r.Get("/persons/{id}", h.GetPerson)
		r.Put("/persons/{id}", h.UpdatePerson)
		r.Delete("/persons/{id}", h.DeletePerson)

		r.Get("/persons/{id}/credentials", h.ListCredentials)
		r.Post("/persons/{id}/credentials", h.CreateCredential)
		r.Get("/persons/{id}/credentials/{credID}", h.GetCredential)
		r.Put("/persons/{id}/credentials/{credID}", h.UpdateCredential)
		r.Delete("/persons/{id}/credentials/{credID}", h.DeleteCredential)

		r.Get("/groups", h.ListGroups)
		r.Post("/groups", h.CreateGroup)
		r.Get("/groups/{id}", h.GetGroup)
		r.Put("/groups/{id}", h.UpdateGroup)
		r.Delete("/groups/{id}", h.DeleteGroup)
		r.Get("/groups/{id}/members", h.ListGroupMembers)
		r.Post("/groups/{id}/members", h.AddGroupMember)
		r.Delete("/groups/{id}/members/{personID}", h.RemoveGroupMember)

		r.Get("/stats", h.GetStats)
	})
	return r
}

func TestPersonsCRUD(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	h := NewHandlers(database, nil)
	router := setupRouter(h)

	// Create
	body := `{"first_name":"John","last_name":"Doe","email":"john@test.com","department":"Engineering"}`
	req := httptest.NewRequest("POST", "/api/v1/persons", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("create person: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var person map[string]any
	json.Unmarshal(w.Body.Bytes(), &person)
	personID := person["id"].(string)

	// Get
	req = httptest.NewRequest("GET", "/api/v1/persons/"+personID, nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("get person: expected 200, got %d", w.Code)
	}

	// List with search
	req = httptest.NewRequest("GET", "/api/v1/persons?search=John", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("list persons: expected 200, got %d", w.Code)
	}

	var listResp map[string]any
	json.Unmarshal(w.Body.Bytes(), &listResp)
	if listResp["total"].(float64) < 1 {
		t.Fatal("expected at least 1 person in search results")
	}

	// Update
	body = `{"department":"Sales"}`
	req = httptest.NewRequest("PUT", "/api/v1/persons/"+personID, bytes.NewBufferString(body))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("update person: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var updated map[string]any
	json.Unmarshal(w.Body.Bytes(), &updated)
	if updated["department"] != "Sales" {
		t.Fatalf("expected department Sales, got %v", updated["department"])
	}

	// Delete
	req = httptest.NewRequest("DELETE", "/api/v1/persons/"+personID, nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("delete person: expected 204, got %d", w.Code)
	}

	// Verify deleted
	req = httptest.NewRequest("GET", "/api/v1/persons/"+personID, nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("get deleted person: expected 404, got %d", w.Code)
	}
}

func TestCredentialsCRUD(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	h := NewHandlers(database, nil)
	router := setupRouter(h)

	// Create person first
	body := `{"first_name":"Jane","last_name":"Smith","email":"jane@test.com"}`
	req := httptest.NewRequest("POST", "/api/v1/persons", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	var person map[string]any
	json.Unmarshal(w.Body.Bytes(), &person)
	personID := person["id"].(string)
	defer func() {
		req := httptest.NewRequest("DELETE", "/api/v1/persons/"+personID, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
	}()

	// Create credential
	body = `{"type":"card","value":"CARD-12345"}`
	req = httptest.NewRequest("POST", fmt.Sprintf("/api/v1/persons/%s/credentials", personID), bytes.NewBufferString(body))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("create credential: expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var cred map[string]any
	json.Unmarshal(w.Body.Bytes(), &cred)
	credID := cred["id"].(string)

	// List credentials
	req = httptest.NewRequest("GET", fmt.Sprintf("/api/v1/persons/%s/credentials", personID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("list credentials: expected 200, got %d", w.Code)
	}

	// Get credential
	req = httptest.NewRequest("GET", fmt.Sprintf("/api/v1/persons/%s/credentials/%s", personID, credID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("get credential: expected 200, got %d", w.Code)
	}

	// Invalid type
	body = `{"type":"invalid","value":"xxx"}`
	req = httptest.NewRequest("POST", fmt.Sprintf("/api/v1/persons/%s/credentials", personID), bytes.NewBufferString(body))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("invalid credential type: expected 400, got %d", w.Code)
	}

	// Delete credential
	req = httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/persons/%s/credentials/%s", personID, credID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete credential: expected 204, got %d", w.Code)
	}
}

func TestGroupsCRUD(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	h := NewHandlers(database, nil)
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

	// Create a person to add as member
	body = `{"first_name":"Member","last_name":"One"}`
	req = httptest.NewRequest("POST", "/api/v1/persons", bytes.NewBufferString(body))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	var person map[string]any
	json.Unmarshal(w.Body.Bytes(), &person)
	personID := person["id"].(string)

	// Add member
	body = fmt.Sprintf(`{"person_id":"%s"}`, personID)
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
	req = httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/groups/%s/members/%s", groupID, personID), nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("remove member: expected 204, got %d", w.Code)
	}

	// Cleanup
	httptest.NewRequest("DELETE", "/api/v1/persons/"+personID, nil)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, httptest.NewRequest("DELETE", "/api/v1/persons/"+personID, nil))

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

	h := NewHandlers(database, nil)
	router := setupRouter(h)

	// Sync with epoch gets all
	req := httptest.NewRequest("GET", "/api/v1/persons/sync?since=2000-01-01T00:00:00Z", nil)
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
	req = httptest.NewRequest("GET", "/api/v1/persons/sync?since=invalid", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("invalid since: expected 400, got %d", w.Code)
	}
}

func TestStatsEndpoint(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	h := NewHandlers(database, nil)
	router := setupRouter(h)

	req := httptest.NewRequest("GET", "/api/v1/stats", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("stats: expected 200, got %d", w.Code)
	}

	var stats map[string]any
	json.Unmarshal(w.Body.Bytes(), &stats)
	if stats["total_persons"] == nil {
		t.Fatal("stats missing total_persons")
	}
}

func TestValidation(t *testing.T) {
	database := setupTestDB(t)
	defer database.Close()

	h := NewHandlers(database, nil)
	router := setupRouter(h)

	// Missing required fields
	body := `{"first_name":"Only"}`
	req := httptest.NewRequest("POST", "/api/v1/persons", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("missing last_name: expected 400, got %d", w.Code)
	}

	// Invalid JSON
	req = httptest.NewRequest("POST", "/api/v1/persons", bytes.NewBufferString("{invalid"))
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("invalid json: expected 400, got %d", w.Code)
	}

	// Not found
	req = httptest.NewRequest("GET", "/api/v1/persons/00000000-0000-0000-0000-000000000099", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("not found: expected 404, got %d", w.Code)
	}
}
