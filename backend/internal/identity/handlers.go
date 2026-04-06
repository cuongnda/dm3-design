package identity

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/db"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
	"github.com/duali/dm3-backend/pkg/natsutil"
)

// Aliases for testability
var (
	ensureDir  = func(path string) error { return os.MkdirAll(path, 0755) }
	createFile = func(path string) (*os.File, error) { return os.Create(path) }
	copyFile   = func(dst io.Writer, src io.Reader) (int64, error) { return io.Copy(dst, src) }
)

type Handlers struct {
	db   *db.DB
	nats *natsutil.Client
}

func NewHandlers(database *db.DB, nats *natsutil.Client) *Handlers {
	return &Handlers{db: database, nats: nats}
}

// publishEvent publishes a NATS event for identity changes.
func (h *Handlers) publishEvent(subject string, data any) {
	if h.nats == nil {
		return
	}
	b, err := json.Marshal(data)
	if err != nil {
		slog.Error("marshal event error", "error", err)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.nats.Publish(ctx, subject, b); err != nil {
		slog.Error("nats publish error", "subject", subject, "error", err)
	}
}

// ─── Persons ─────────────────────────────────────────────────────────────────

func (h *Handlers) ListPersons(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	where := "WHERE 1=1"
	args := []any{}
	idx := 1

	if cid := authsvc.CompanyIDFromContext(r.Context()); cid != "" {
		where += fmt.Sprintf(" AND company_id = $%d::uuid", idx)
		args = append(args, cid)
		idx++
	}

	if v := r.URL.Query().Get("search"); v != "" {
		where += fmt.Sprintf(" AND (first_name ILIKE $%d OR last_name ILIKE $%d OR email ILIKE $%d)", idx, idx, idx)
		args = append(args, "%"+v+"%")
		idx++
	}
	if v := r.URL.Query().Get("department"); v != "" {
		where += fmt.Sprintf(" AND department = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("status"); v != "" {
		where += fmt.Sprintf(" AND status = $%d", idx)
		args = append(args, v)
		idx++
	}
	if v := r.URL.Query().Get("role"); v != "" {
		where += fmt.Sprintf(" AND role = $%d", idx)
		args = append(args, v)
		idx++
	}

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm3_identity.persons "+where, countArgs...).Scan(&total)

	query := fmt.Sprintf(`SELECT id, company_id, first_name, last_name, COALESCE(email,''), COALESCE(phone,''),
		COALESCE(department,''), COALESCE(role,''), COALESCE(employee_id,''), status, COALESCE(photo_url,''),
		created_at, updated_at
		FROM dm3_identity.persons %s ORDER BY last_name, first_name ASC LIMIT $%d OFFSET $%d`, where, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list persons query error", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}
	defer rows.Close()

	persons := []models.Person{}
	for rows.Next() {
		var p models.Person
		if err := rows.Scan(&p.ID, &p.CompanyID, &p.FirstName, &p.LastName, &p.Email, &p.Phone,
			&p.Department, &p.Role, &p.EmployeeID, &p.Status, &p.PhotoURL,
			&p.CreatedAt, &p.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		persons = append(persons, p)
	}
	httputil.Paginated(w, persons, total, page, limit)
}

type createPersonRequest struct {
	FirstName  string `json:"first_name"`
	LastName   string `json:"last_name"`
	Email      string `json:"email"`
	Phone      string `json:"phone"`
	Department string `json:"department"`
	Role       string `json:"role"`
	EmployeeID string `json:"employee_id"`
	Status     string `json:"status"`
}

func (h *Handlers) CreatePerson(w http.ResponseWriter, r *http.Request) {
	var req createPersonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_request_body")
		return
	}
	if req.FirstName == "" || req.LastName == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.first_last_name_required")
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}

	var p models.Person
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_identity.persons (first_name, last_name, email, phone, department, role, employee_id, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		 RETURNING id, company_id, first_name, last_name, COALESCE(email,''), COALESCE(phone,''),
		 COALESCE(department,''), COALESCE(role,''), COALESCE(employee_id,''), status, COALESCE(photo_url,''),
		 created_at, updated_at`,
		req.FirstName, req.LastName, nilIfEmpty(req.Email), nilIfEmpty(req.Phone),
		nilIfEmpty(req.Department), nilIfEmpty(req.Role), nilIfEmpty(req.EmployeeID), req.Status,
	).Scan(&p.ID, &p.CompanyID, &p.FirstName, &p.LastName, &p.Email, &p.Phone,
		&p.Department, &p.Role, &p.EmployeeID, &p.Status, &p.PhotoURL,
		&p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		slog.Error("create person error", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "person.create_error")
		return
	}

	h.publishEvent("dm3.identity.person.created", p)
	httputil.JSON(w, http.StatusCreated, p)
}

func (h *Handlers) GetPerson(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	p, err := h.scanPerson(r, id)
	if err != nil {
		i18n.ErrorResponse(w, r, http.StatusNotFound, "person.not_found")
		return
	}
	httputil.JSON(w, http.StatusOK, p)
}

type updatePersonRequest struct {
	FirstName  *string `json:"first_name"`
	LastName   *string `json:"last_name"`
	Email      *string `json:"email"`
	Phone      *string `json:"phone"`
	Department *string `json:"department"`
	Role       *string `json:"role"`
	EmployeeID *string `json:"employee_id"`
	Status     *string `json:"status"`
}

func (h *Handlers) UpdatePerson(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updatePersonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var p models.Person
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_identity.persons SET
			first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name),
			email = COALESCE($4, email), phone = COALESCE($5, phone),
			department = COALESCE($6, department), role = COALESCE($7, role),
			employee_id = COALESCE($8, employee_id), status = COALESCE($9, status),
			updated_at = now()
		 WHERE id = $1::uuid
		 RETURNING id, company_id, first_name, last_name, COALESCE(email,''), COALESCE(phone,''),
		 COALESCE(department,''), COALESCE(role,''), COALESCE(employee_id,''), status, COALESCE(photo_url,''),
		 created_at, updated_at`,
		id, req.FirstName, req.LastName, req.Email, req.Phone,
		req.Department, req.Role, req.EmployeeID, req.Status,
	).Scan(&p.ID, &p.CompanyID, &p.FirstName, &p.LastName, &p.Email, &p.Phone,
		&p.Department, &p.Role, &p.EmployeeID, &p.Status, &p.PhotoURL,
		&p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "person not found")
		return
	}

	h.publishEvent("dm3.identity.person.updated", p)
	httputil.JSON(w, http.StatusOK, p)
}

func (h *Handlers) DeletePerson(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tag, err := h.db.Pool.Exec(r.Context(), `DELETE FROM dm3_identity.persons WHERE id = $1::uuid`, id)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "person not found")
		return
	}

	h.publishEvent("dm3.identity.person.deleted", map[string]string{"id": id})
	w.WriteHeader(http.StatusNoContent)
}

// ─── Photo Upload ────────────────────────────────────────────────────────────

func (h *Handlers) UploadPhoto(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Verify person exists
	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM dm3_identity.persons WHERE id = $1::uuid)`, id).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "person not found")
		return
	}

	// Parse multipart (max 10MB)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		httputil.Error(w, http.StatusBadRequest, "file too large or invalid multipart")
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "photo field required")
		return
	}
	defer file.Close()

	// Store to local filesystem (would use MinIO in production)
	photoDir := "data/photos"
	if err := ensureDir(photoDir); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to create photo directory")
		return
	}

	ext := ".jpg"
	if ct := header.Header.Get("Content-Type"); ct == "image/png" {
		ext = ".png"
	}
	filename := fmt.Sprintf("%s%s", id, ext)
	filepath := fmt.Sprintf("%s/%s", photoDir, filename)

	dst, err := createFile(filepath)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to save photo")
		return
	}
	defer dst.Close()

	if _, err := copyFile(dst, file); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to write photo")
		return
	}

	photoURL := fmt.Sprintf("/photos/%s", filename)
	_, err = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_identity.persons SET photo_url = $2, updated_at = now() WHERE id = $1::uuid`,
		id, photoURL)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.publishEvent("dm3.identity.person.updated", map[string]string{"id": id, "photo_url": photoURL})
	httputil.JSON(w, http.StatusOK, map[string]string{"photo_url": photoURL})
}

// ─── Credentials ─────────────────────────────────────────────────────────────

func (h *Handlers) ListCredentials(w http.ResponseWriter, r *http.Request) {
	personID := chi.URLParam(r, "id")

	// Verify person exists
	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM dm3_identity.persons WHERE id = $1::uuid)`, personID).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "person not found")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, company_id, person_id, type, value, status, valid_from, valid_until, created_at, COALESCE(updated_at, created_at)
		 FROM dm3_identity.credentials WHERE person_id = $1::uuid ORDER BY created_at DESC`, personID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	creds := []models.Credential{}
	for rows.Next() {
		var c models.Credential
		if err := rows.Scan(&c.ID, &c.CompanyID, &c.PersonID, &c.Type, &c.Value,
			&c.Status, &c.ValidFrom, &c.ValidUntil, &c.CreatedAt, &c.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		creds = append(creds, c)
	}
	httputil.JSON(w, http.StatusOK, creds)
}

type createCredentialRequest struct {
	Type       string     `json:"type"`  // face, card, pin, qr, fingerprint
	Value      string     `json:"value"` // NOTE: would be encrypted in production
	Status     string     `json:"status"`
	ValidFrom  *time.Time `json:"valid_from"`
	ValidUntil *time.Time `json:"valid_until"`
}

func (h *Handlers) CreateCredential(w http.ResponseWriter, r *http.Request) {
	personID := chi.URLParam(r, "id")

	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM dm3_identity.persons WHERE id = $1::uuid)`, personID).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "person not found")
		return
	}

	var req createCredentialRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Type == "" || req.Value == "" {
		httputil.Error(w, http.StatusBadRequest, "type and value are required")
		return
	}
	validTypes := map[string]bool{"face": true, "card": true, "pin": true, "qr": true, "fingerprint": true}
	if !validTypes[req.Type] {
		httputil.Error(w, http.StatusBadRequest, "type must be one of: face, card, pin, qr, fingerprint")
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}

	var c models.Credential
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_identity.credentials (person_id, type, value, status, valid_from, valid_until, updated_at)
		 VALUES ($1::uuid,$2,$3,$4,$5,$6, now())
		 RETURNING id, company_id, person_id, type, value, status, valid_from, valid_until, created_at, updated_at`,
		personID, req.Type, req.Value, req.Status, req.ValidFrom, req.ValidUntil,
	).Scan(&c.ID, &c.CompanyID, &c.PersonID, &c.Type, &c.Value, &c.Status,
		&c.ValidFrom, &c.ValidUntil, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		slog.Error("create credential error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusCreated, c)
}

func (h *Handlers) GetCredential(w http.ResponseWriter, r *http.Request) {
	personID := chi.URLParam(r, "id")
	credID := chi.URLParam(r, "credID")

	var c models.Credential
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, company_id, person_id, type, value, status, valid_from, valid_until, created_at, COALESCE(updated_at, created_at)
		 FROM dm3_identity.credentials WHERE id = $1::uuid AND person_id = $2::uuid`,
		credID, personID,
	).Scan(&c.ID, &c.CompanyID, &c.PersonID, &c.Type, &c.Value, &c.Status,
		&c.ValidFrom, &c.ValidUntil, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "credential not found")
		return
	}
	httputil.JSON(w, http.StatusOK, c)
}

func (h *Handlers) UpdateCredential(w http.ResponseWriter, r *http.Request) {
	personID := chi.URLParam(r, "id")
	credID := chi.URLParam(r, "credID")

	var req createCredentialRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var c models.Credential
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_identity.credentials SET
			type = COALESCE(NULLIF($3,''), type), value = COALESCE(NULLIF($4,''), value),
			status = COALESCE(NULLIF($5,''), status), valid_from = COALESCE($6, valid_from),
			valid_until = COALESCE($7, valid_until), updated_at = now()
		 WHERE id = $1::uuid AND person_id = $2::uuid
		 RETURNING id, company_id, person_id, type, value, status, valid_from, valid_until, created_at, updated_at`,
		credID, personID, req.Type, req.Value, req.Status, req.ValidFrom, req.ValidUntil,
	).Scan(&c.ID, &c.CompanyID, &c.PersonID, &c.Type, &c.Value, &c.Status,
		&c.ValidFrom, &c.ValidUntil, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "credential not found")
		return
	}
	httputil.JSON(w, http.StatusOK, c)
}

func (h *Handlers) DeleteCredential(w http.ResponseWriter, r *http.Request) {
	personID := chi.URLParam(r, "id")
	credID := chi.URLParam(r, "credID")

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_identity.credentials WHERE id = $1::uuid AND person_id = $2::uuid`, credID, personID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "credential not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Person Groups ───────────────────────────────────────────────────────────

func (h *Handlers) ListGroups(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit
	cid := authsvc.CompanyIDFromContext(r.Context())

	var total int64
	if cid != "" {
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.person_groups WHERE company_id = $1::uuid`, cid).Scan(&total)
	} else {
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.person_groups`).Scan(&total)
	}

	var grpQuery string
	var grpArgs []any
	if cid != "" {
		grpQuery = `SELECT g.id, g.company_id, g.name, COALESCE(g.description,''), g.created_at, g.updated_at,
		 (SELECT COUNT(*) FROM dm3_identity.person_group_members m WHERE m.group_id = g.id)
		 FROM dm3_identity.person_groups g WHERE g.company_id = $1::uuid ORDER BY g.name ASC LIMIT $2 OFFSET $3`
		grpArgs = []any{cid, limit, offset}
	} else {
		grpQuery = `SELECT g.id, g.company_id, g.name, COALESCE(g.description,''), g.created_at, g.updated_at,
		 (SELECT COUNT(*) FROM dm3_identity.person_group_members m WHERE m.group_id = g.id)
		 FROM dm3_identity.person_groups g ORDER BY g.name ASC LIMIT $1 OFFSET $2`
		grpArgs = []any{limit, offset}
	}

	rows, err := h.db.Pool.Query(r.Context(), grpQuery, grpArgs...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	groups := []models.PersonGroup{}
	for rows.Next() {
		var g models.PersonGroup
		if err := rows.Scan(&g.ID, &g.CompanyID, &g.Name, &g.Description, &g.CreatedAt, &g.UpdatedAt, &g.MemberCount); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		groups = append(groups, g)
	}
	httputil.Paginated(w, groups, total, page, limit)
}

type createGroupRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func (h *Handlers) CreateGroup(w http.ResponseWriter, r *http.Request) {
	var req createGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	var g models.PersonGroup
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO dm3_identity.person_groups (name, description) VALUES ($1,$2)
		 RETURNING id, company_id, name, COALESCE(description,''), created_at, updated_at`,
		req.Name, nilIfEmpty(req.Description),
	).Scan(&g.ID, &g.CompanyID, &g.Name, &g.Description, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		slog.Error("create group error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	httputil.JSON(w, http.StatusCreated, g)
}

func (h *Handlers) GetGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var g models.PersonGroup
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT g.id, g.company_id, g.name, COALESCE(g.description,''), g.created_at, g.updated_at,
		 (SELECT COUNT(*) FROM dm3_identity.person_group_members m WHERE m.group_id = g.id)
		 FROM dm3_identity.person_groups g WHERE g.id = $1::uuid`, id,
	).Scan(&g.ID, &g.CompanyID, &g.Name, &g.Description, &g.CreatedAt, &g.UpdatedAt, &g.MemberCount)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "group not found")
		return
	}
	httputil.JSON(w, http.StatusOK, g)
}

func (h *Handlers) UpdateGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req createGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var g models.PersonGroup
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE dm3_identity.person_groups SET
			name = COALESCE(NULLIF($2,''), name), description = COALESCE($3, description), updated_at = now()
		 WHERE id = $1::uuid
		 RETURNING id, company_id, name, COALESCE(description,''), created_at, updated_at`,
		id, req.Name, nilIfEmpty(req.Description),
	).Scan(&g.ID, &g.CompanyID, &g.Name, &g.Description, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "group not found")
		return
	}
	httputil.JSON(w, http.StatusOK, g)
}

func (h *Handlers) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tag, err := h.db.Pool.Exec(r.Context(), `DELETE FROM dm3_identity.person_groups WHERE id = $1::uuid`, id)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "group not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Group Members ───────────────────────────────────────────────────────────

func (h *Handlers) ListGroupMembers(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT p.id, p.company_id, p.first_name, p.last_name, COALESCE(p.email,''), COALESCE(p.phone,''),
		 COALESCE(p.department,''), COALESCE(p.role,''), COALESCE(p.employee_id,''), p.status, COALESCE(p.photo_url,''),
		 p.created_at, p.updated_at
		 FROM dm3_identity.persons p
		 JOIN dm3_identity.person_group_members m ON m.person_id = p.id
		 WHERE m.group_id = $1::uuid ORDER BY p.last_name, p.first_name`, groupID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	persons := []models.Person{}
	for rows.Next() {
		var p models.Person
		if err := rows.Scan(&p.ID, &p.CompanyID, &p.FirstName, &p.LastName, &p.Email, &p.Phone,
			&p.Department, &p.Role, &p.EmployeeID, &p.Status, &p.PhotoURL,
			&p.CreatedAt, &p.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		persons = append(persons, p)
	}
	httputil.JSON(w, http.StatusOK, persons)
}

type addMemberRequest struct {
	PersonID string `json:"person_id"`
}

func (h *Handlers) AddGroupMember(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")
	var req addMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.PersonID == "" {
		httputil.Error(w, http.StatusBadRequest, "person_id is required")
		return
	}

	_, err := h.db.Pool.Exec(r.Context(),
		`INSERT INTO dm3_identity.person_group_members (group_id, person_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
		groupID, req.PersonID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) RemoveGroupMember(w http.ResponseWriter, r *http.Request) {
	groupID := chi.URLParam(r, "id")
	personID := chi.URLParam(r, "personID")

	tag, err := h.db.Pool.Exec(r.Context(),
		`DELETE FROM dm3_identity.person_group_members WHERE group_id = $1::uuid AND person_id = $2::uuid`,
		groupID, personID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "member not found in group")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Sync ────────────────────────────────────────────────────────────────────

func (h *Handlers) SyncPersons(w http.ResponseWriter, r *http.Request) {
	sinceStr := r.URL.Query().Get("since")
	var since time.Time
	if sinceStr != "" {
		var err error
		since, err = time.Parse(time.RFC3339, sinceStr)
		if err != nil {
			httputil.Error(w, http.StatusBadRequest, "invalid since timestamp, use RFC3339 format")
			return
		}
	}

	now := time.Now().UTC()

	// Get persons changed since timestamp
	personRows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, company_id, first_name, last_name, COALESCE(email,''), COALESCE(phone,''),
		 COALESCE(department,''), COALESCE(role,''), COALESCE(employee_id,''), status, COALESCE(photo_url,''),
		 created_at, updated_at
		 FROM dm3_identity.persons WHERE updated_at > $1 ORDER BY updated_at ASC`, since)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer personRows.Close()

	persons := []models.Person{}
	for personRows.Next() {
		var p models.Person
		if err := personRows.Scan(&p.ID, &p.CompanyID, &p.FirstName, &p.LastName, &p.Email, &p.Phone,
			&p.Department, &p.Role, &p.EmployeeID, &p.Status, &p.PhotoURL,
			&p.CreatedAt, &p.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		persons = append(persons, p)
	}

	// Get credentials changed since timestamp
	credRows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, company_id, person_id, type, value, status, valid_from, valid_until, created_at, COALESCE(updated_at, created_at)
		 FROM dm3_identity.credentials WHERE COALESCE(updated_at, created_at) > $1 ORDER BY COALESCE(updated_at, created_at) ASC`, since)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer credRows.Close()

	creds := []models.Credential{}
	for credRows.Next() {
		var c models.Credential
		if err := credRows.Scan(&c.ID, &c.CompanyID, &c.PersonID, &c.Type, &c.Value,
			&c.Status, &c.ValidFrom, &c.ValidUntil, &c.CreatedAt, &c.UpdatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		creds = append(creds, c)
	}

	resp := models.SyncResponse{
		Persons:     persons,
		Credentials: creds,
		Since:       sinceStr,
		Timestamp:   now.Format(time.RFC3339),
	}
	httputil.JSON(w, http.StatusOK, resp)
}

// ─── Stats ───────────────────────────────────────────────────────────────────

func (h *Handlers) GetStats(w http.ResponseWriter, r *http.Request) {
	stats := models.IdentityStats{
		PersonsByStatus:  make(map[string]int64),
		PersonsByDept:    make(map[string]int64),
		CredentialCounts: make(map[string]int64),
	}
	cid := authsvc.CompanyIDFromContext(r.Context())

	if cid != "" {
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.persons WHERE company_id = $1::uuid`, cid).Scan(&stats.TotalPersons)
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.person_groups WHERE company_id = $1::uuid`, cid).Scan(&stats.TotalGroups)
	} else {
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.persons`).Scan(&stats.TotalPersons)
		_ = h.db.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM dm3_identity.person_groups`).Scan(&stats.TotalGroups)
	}

	// By status
	var statusQuery string
	var statusArgs []any
	if cid != "" {
		statusQuery = `SELECT status, COUNT(*) FROM dm3_identity.persons WHERE company_id = $1::uuid GROUP BY status`
		statusArgs = []any{cid}
	} else {
		statusQuery = `SELECT status, COUNT(*) FROM dm3_identity.persons GROUP BY status`
	}
	rows, err := h.db.Pool.Query(r.Context(), statusQuery, statusArgs...)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var s string
			var c int64
			if rows.Scan(&s, &c) == nil {
				stats.PersonsByStatus[s] = c
			}
		}
	}

	// By department
	var deptQuery string
	var deptArgs []any
	if cid != "" {
		deptQuery = `SELECT COALESCE(department,'unassigned'), COUNT(*) FROM dm3_identity.persons WHERE company_id = $1::uuid GROUP BY department`
		deptArgs = []any{cid}
	} else {
		deptQuery = `SELECT COALESCE(department,'unassigned'), COUNT(*) FROM dm3_identity.persons GROUP BY department`
	}
	rows2, err := h.db.Pool.Query(r.Context(), deptQuery, deptArgs...)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var d string
			var c int64
			if rows2.Scan(&d, &c) == nil {
				stats.PersonsByDept[d] = c
			}
		}
	}

	// Credential counts by type
	var credQuery string
	var credArgs []any
	if cid != "" {
		credQuery = `SELECT type, COUNT(*) FROM dm3_identity.credentials WHERE company_id = $1::uuid GROUP BY type`
		credArgs = []any{cid}
	} else {
		credQuery = `SELECT type, COUNT(*) FROM dm3_identity.credentials GROUP BY type`
	}
	rows3, err := h.db.Pool.Query(r.Context(), credQuery, credArgs...)
	if err == nil {
		defer rows3.Close()
		for rows3.Next() {
			var t string
			var c int64
			if rows3.Scan(&t, &c) == nil {
				stats.CredentialCounts[t] = c
			}
		}
	}

	httputil.JSON(w, http.StatusOK, stats)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (h *Handlers) scanPerson(r *http.Request, id string) (models.Person, error) {
	var p models.Person
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, company_id, first_name, last_name, COALESCE(email,''), COALESCE(phone,''),
		 COALESCE(department,''), COALESCE(role,''), COALESCE(employee_id,''), status, COALESCE(photo_url,''),
		 created_at, updated_at
		 FROM dm3_identity.persons WHERE id = $1::uuid`, id,
	).Scan(&p.ID, &p.CompanyID, &p.FirstName, &p.LastName, &p.Email, &p.Phone,
		&p.Department, &p.Role, &p.EmployeeID, &p.Status, &p.PhotoURL,
		&p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return p, fmt.Errorf("not found")
		}
		return p, err
	}
	return p, nil
}

func parsePagination(r *http.Request) (int, int) {
	page := 1
	limit := 20
	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	return page, limit
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
