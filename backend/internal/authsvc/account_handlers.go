package authsvc

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Account Models ──────────────────────────────────────────────────────────

type accountResponse struct {
	ID                string     `json:"id"`
	CompanyID         string     `json:"company_id"`
	CompanyName       string     `json:"company_name"`
	CompanyCode       string     `json:"company_code"`
	OwnerUserID       *string    `json:"owner_user_id,omitempty"`
	OwnerEmail        *string    `json:"owner_email,omitempty"`
	OwnerName         *string    `json:"owner_name,omitempty"`
	Plan              string     `json:"plan"`
	Status            string     `json:"status"`
	MaxDevices        int        `json:"max_devices"`
	MaxUsers          int        `json:"max_users"`
	MaxDoors          int        `json:"max_doors"`
	SubscriptionStart *time.Time `json:"subscription_start,omitempty"`
	SubscriptionEnd   *time.Time `json:"subscription_end,omitempty"`
	BillingEmail      *string    `json:"billing_email,omitempty"`
	BillingInfo       json.RawMessage `json:"billing_info"`
	Settings          json.RawMessage `json:"settings"`
	Notes             *string    `json:"notes,omitempty"`
	UserCount         int64      `json:"user_count"`
	DeviceCount       int64      `json:"device_count"`
	DoorCount         int64      `json:"door_count"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

type auditEntry struct {
	ID        string          `json:"id"`
	ActorID   *string         `json:"actor_id,omitempty"`
	ActorEmail *string        `json:"actor_email,omitempty"`
	Action    string          `json:"action"`
	Changes   json.RawMessage `json:"changes"`
	IPAddress *string         `json:"ip_address,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

type createAccountRequest struct {
	CompanyName string  `json:"company_name"`
	CompanyCode string  `json:"company_code"`
	AdminEmail  string  `json:"admin_email"`
	Plan        string  `json:"plan,omitempty"`
	MaxDevices  *int    `json:"max_devices,omitempty"`
	MaxUsers    *int    `json:"max_users,omitempty"`
	MaxDoors    *int    `json:"max_doors,omitempty"`
	BillingEmail *string `json:"billing_email,omitempty"`
}

type updateAccountRequest struct {
	Plan         *string          `json:"plan,omitempty"`
	Status       *string          `json:"status,omitempty"`
	MaxDevices   *int             `json:"max_devices,omitempty"`
	MaxUsers     *int             `json:"max_users,omitempty"`
	MaxDoors     *int             `json:"max_doors,omitempty"`
	BillingEmail *string          `json:"billing_email,omitempty"`
	BillingInfo  *json.RawMessage `json:"billing_info,omitempty"`
	Settings     *json.RawMessage `json:"settings,omitempty"`
	Notes        *string          `json:"notes,omitempty"`
}

type createAccountResponse struct {
	Account accountResponse `json:"account"`
	Admin   adminInfo       `json:"admin"`
}

// ─── List Accounts ───────────────────────────────────────────────────────────

func (h *Handlers) ListAccounts(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit
	search := r.URL.Query().Get("search")
	statusFilter := r.URL.Query().Get("status")
	planFilter := r.URL.Query().Get("plan")

	// Build WHERE clause
	where := "WHERE 1=1"
	args := []any{}
	argIdx := 1

	if search != "" {
		where += fmt.Sprintf(" AND (c.name ILIKE $%d OR c.code ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+search+"%")
		argIdx++
	}
	if statusFilter != "" {
		where += fmt.Sprintf(" AND a.status = $%d", argIdx)
		args = append(args, statusFilter)
		argIdx++
	}
	if planFilter != "" {
		where += fmt.Sprintf(" AND a.plan = $%d", argIdx)
		args = append(args, planFilter)
		argIdx++
	}

	// Count total
	var total int64
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM dm3_auth.accounts a JOIN dm3_auth.companies c ON c.id = a.company_id %s`, where)
	_ = h.db.Pool.QueryRow(r.Context(), countQuery, args...).Scan(&total)

	// Fetch paginated
	query := fmt.Sprintf(`
		SELECT a.id, a.company_id, c.name, c.code, a.owner_user_id, u.email, u.name,
		       a.plan, a.status, a.max_devices, a.max_users, a.max_doors,
		       a.subscription_start, a.subscription_end, a.billing_email,
		       a.billing_info, a.settings, a.notes, a.created_at, a.updated_at,
		       (SELECT COUNT(*) FROM dm3_auth.users us WHERE us.company_id = a.company_id),
		       (SELECT COUNT(*) FROM dm3_devices.devices d WHERE d.tenant_id = a.company_id),
		       (SELECT COUNT(*) FROM dm3_access.doors dr WHERE dr.tenant_id = a.company_id)
		FROM dm3_auth.accounts a
		JOIN dm3_auth.companies c ON c.id = a.company_id
		LEFT JOIN dm3_auth.users u ON u.id = a.owner_user_id
		%s
		ORDER BY a.created_at DESC
		LIMIT $%d OFFSET $%d`, where, argIdx, argIdx+1)

	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("list accounts query error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	accounts := []accountResponse{}
	for rows.Next() {
		var a accountResponse
		if err := rows.Scan(
			&a.ID, &a.CompanyID, &a.CompanyName, &a.CompanyCode,
			&a.OwnerUserID, &a.OwnerEmail, &a.OwnerName,
			&a.Plan, &a.Status, &a.MaxDevices, &a.MaxUsers, &a.MaxDoors,
			&a.SubscriptionStart, &a.SubscriptionEnd, &a.BillingEmail,
			&a.BillingInfo, &a.Settings, &a.Notes,
			&a.CreatedAt, &a.UpdatedAt,
			&a.UserCount, &a.DeviceCount, &a.DoorCount,
		); err != nil {
			slog.Error("list accounts scan error", "error", err)
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		accounts = append(accounts, a)
	}
	httputil.Paginated(w, accounts, total, page, limit)
}

// ─── Get Account ─────────────────────────────────────────────────────────────

func (h *Handlers) GetAccount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var a accountResponse
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT a.id, a.company_id, c.name, c.code, a.owner_user_id, u.email, u.name,
		       a.plan, a.status, a.max_devices, a.max_users, a.max_doors,
		       a.subscription_start, a.subscription_end, a.billing_email,
		       a.billing_info, a.settings, a.notes, a.created_at, a.updated_at,
		       (SELECT COUNT(*) FROM dm3_auth.users us WHERE us.company_id = a.company_id),
		       (SELECT COUNT(*) FROM dm3_devices.devices d WHERE d.tenant_id = a.company_id),
		       (SELECT COUNT(*) FROM dm3_access.doors dr WHERE dr.tenant_id = a.company_id)
		FROM dm3_auth.accounts a
		JOIN dm3_auth.companies c ON c.id = a.company_id
		LEFT JOIN dm3_auth.users u ON u.id = a.owner_user_id
		WHERE a.id = $1::uuid`, id,
	).Scan(
		&a.ID, &a.CompanyID, &a.CompanyName, &a.CompanyCode,
		&a.OwnerUserID, &a.OwnerEmail, &a.OwnerName,
		&a.Plan, &a.Status, &a.MaxDevices, &a.MaxUsers, &a.MaxDoors,
		&a.SubscriptionStart, &a.SubscriptionEnd, &a.BillingEmail,
		&a.BillingInfo, &a.Settings, &a.Notes,
		&a.CreatedAt, &a.UpdatedAt,
		&a.UserCount, &a.DeviceCount, &a.DoorCount,
	)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "account not found")
		return
	}

	httputil.JSON(w, http.StatusOK, a)
}

// ─── Create Account ──────────────────────────────────────────────────────────

func (h *Handlers) CreateAccount(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())

	var req createAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.CompanyName == "" || req.CompanyCode == "" || req.AdminEmail == "" {
		httputil.Error(w, http.StatusBadRequest, "company_name, company_code, and admin_email are required")
		return
	}

	plan := "starter"
	if req.Plan != "" {
		plan = req.Plan
	}
	maxDevices := 50
	if req.MaxDevices != nil {
		maxDevices = *req.MaxDevices
	}
	maxUsers := 20
	if req.MaxUsers != nil {
		maxUsers = *req.MaxUsers
	}
	maxDoors := 10
	if req.MaxDoors != nil {
		maxDoors = *req.MaxDoors
	}

	// Generate random password for admin
	pwBytes := make([]byte, 8)
	if _, err := rand.Read(pwBytes); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to generate password")
		return
	}
	password := hex.EncodeToString(pwBytes)

	pwHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "password hashing failed")
		return
	}

	// Begin transaction
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "transaction failed")
		return
	}
	defer tx.Rollback(r.Context())

	// 1. Create company
	var companyID string
	err = tx.QueryRow(r.Context(),
		`INSERT INTO dm3_auth.companies (name, code, plan, email, max_devices, max_users)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		req.CompanyName, req.CompanyCode, plan, req.AdminEmail, maxDevices, maxUsers,
	).Scan(&companyID)
	if err != nil {
		slog.Error("create account: company insert error", "error", err)
		httputil.Error(w, http.StatusConflict, "company code already exists or invalid data")
		return
	}

	// 2. Create primary manager user
	var userID string
	err = tx.QueryRow(r.Context(),
		`INSERT INTO dm3_auth.users (email, password_hash, name, roles, company_id, role, tenant_id, status)
		 VALUES ($1, $2, $3, $4, $5::uuid, $6, $5::uuid, 'active') RETURNING id`,
		req.AdminEmail, string(pwHash), req.CompanyName+" Admin", []string{"admin"}, companyID, "primary_manager",
	).Scan(&userID)
	if err != nil {
		slog.Error("create account: user insert error", "error", err)
		httputil.Error(w, http.StatusConflict, "user with this email already exists")
		return
	}

	// 3. Create account
	var accountID string
	billingEmail := req.AdminEmail
	if req.BillingEmail != nil {
		billingEmail = *req.BillingEmail
	}
	err = tx.QueryRow(r.Context(),
		`INSERT INTO dm3_auth.accounts (company_id, owner_user_id, plan, max_devices, max_users, max_doors, billing_email, subscription_start)
		 VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, now()) RETURNING id`,
		companyID, userID, plan, maxDevices, maxUsers, maxDoors, billingEmail,
	).Scan(&accountID)
	if err != nil {
		slog.Error("create account: account insert error", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to create account")
		return
	}

	// 4. Log audit
	actorID := ""
	if claims != nil {
		actorID = claims.Sub
	}
	_, _ = tx.Exec(r.Context(),
		`INSERT INTO dm3_auth.account_audit_log (account_id, actor_id, action, changes, ip_address)
		 VALUES ($1::uuid, $2::uuid, 'created', $3, $4)`,
		accountID, actorID,
		fmt.Sprintf(`{"company_name":"%s","company_code":"%s","plan":"%s","admin_email":"%s"}`, req.CompanyName, req.CompanyCode, plan, req.AdminEmail),
		r.RemoteAddr,
	)

	if err := tx.Commit(r.Context()); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "commit failed")
		return
	}

	// Fetch the created account for response
	var a accountResponse
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT a.id, a.company_id, c.name, c.code, a.owner_user_id, u.email, u.name,
		       a.plan, a.status, a.max_devices, a.max_users, a.max_doors,
		       a.subscription_start, a.subscription_end, a.billing_email,
		       a.billing_info, a.settings, a.notes, a.created_at, a.updated_at,
		       0::bigint, 0::bigint, 0::bigint
		FROM dm3_auth.accounts a
		JOIN dm3_auth.companies c ON c.id = a.company_id
		LEFT JOIN dm3_auth.users u ON u.id = a.owner_user_id
		WHERE a.id = $1::uuid`, accountID,
	).Scan(
		&a.ID, &a.CompanyID, &a.CompanyName, &a.CompanyCode,
		&a.OwnerUserID, &a.OwnerEmail, &a.OwnerName,
		&a.Plan, &a.Status, &a.MaxDevices, &a.MaxUsers, &a.MaxDoors,
		&a.SubscriptionStart, &a.SubscriptionEnd, &a.BillingEmail,
		&a.BillingInfo, &a.Settings, &a.Notes,
		&a.CreatedAt, &a.UpdatedAt,
		&a.UserCount, &a.DeviceCount, &a.DoorCount,
	)

	httputil.JSON(w, http.StatusCreated, createAccountResponse{
		Account: a,
		Admin: adminInfo{
			Email:    req.AdminEmail,
			Password: password,
			Role:     "primary_manager",
		},
	})
}

// ─── Update Account ──────────────────────────────────────────────────────────

func (h *Handlers) UpdateAccount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	claims := ClaimsFromContext(r.Context())

	var req updateAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Build changes map for audit
	changes := map[string]any{}

	// Update account
	var a accountResponse
	err := h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm3_auth.accounts SET
			plan = COALESCE($2, plan),
			status = COALESCE($3, status),
			max_devices = COALESCE($4, max_devices),
			max_users = COALESCE($5, max_users),
			max_doors = COALESCE($6, max_doors),
			billing_email = COALESCE($7, billing_email),
			billing_info = COALESCE($8, billing_info),
			settings = COALESCE($9, settings),
			notes = COALESCE($10, notes),
			updated_at = now()
		WHERE id = $1::uuid
		RETURNING id, company_id, plan, status, max_devices, max_users, max_doors,
		          subscription_start, subscription_end, billing_email, billing_info,
		          settings, notes, created_at, updated_at`,
		id, req.Plan, req.Status, req.MaxDevices, req.MaxUsers, req.MaxDoors,
		req.BillingEmail, req.BillingInfo, req.Settings, req.Notes,
	).Scan(
		&a.ID, &a.CompanyID, &a.Plan, &a.Status, &a.MaxDevices, &a.MaxUsers, &a.MaxDoors,
		&a.SubscriptionStart, &a.SubscriptionEnd, &a.BillingEmail, &a.BillingInfo,
		&a.Settings, &a.Notes, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "account not found")
		return
	}

	// Sync limits back to companies table
	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.companies SET
			plan = $2, status = $3, max_devices = $4, max_users = $5, updated_at = now()
		 WHERE id = $1::uuid`,
		a.CompanyID, a.Plan, a.Status, a.MaxDevices, a.MaxUsers,
	)

	// Build changes for audit
	if req.Plan != nil {
		changes["plan"] = *req.Plan
	}
	if req.Status != nil {
		changes["status"] = *req.Status
	}
	if req.MaxDevices != nil {
		changes["max_devices"] = *req.MaxDevices
	}
	if req.MaxUsers != nil {
		changes["max_users"] = *req.MaxUsers
	}
	if req.MaxDoors != nil {
		changes["max_doors"] = *req.MaxDoors
	}
	if req.BillingEmail != nil {
		changes["billing_email"] = *req.BillingEmail
	}
	if req.Notes != nil {
		changes["notes"] = *req.Notes
	}

	changesJSON, _ := json.Marshal(changes)
	actorID := ""
	if claims != nil {
		actorID = claims.Sub
	}
	_, _ = h.db.Pool.Exec(r.Context(),
		`INSERT INTO dm3_auth.account_audit_log (account_id, actor_id, action, changes, ip_address)
		 VALUES ($1::uuid, $2::uuid, 'updated', $3, $4)`,
		id, actorID, string(changesJSON), r.RemoteAddr,
	)

	// Fetch full response with joins
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT c.name, c.code, a.owner_user_id, u.email, u.name,
		       (SELECT COUNT(*) FROM dm3_auth.users us WHERE us.company_id = a.company_id),
		       (SELECT COUNT(*) FROM dm3_devices.devices d WHERE d.tenant_id = a.company_id),
		       (SELECT COUNT(*) FROM dm3_access.doors dr WHERE dr.tenant_id = a.company_id)
		FROM dm3_auth.accounts a
		JOIN dm3_auth.companies c ON c.id = a.company_id
		LEFT JOIN dm3_auth.users u ON u.id = a.owner_user_id
		WHERE a.id = $1::uuid`, id,
	).Scan(&a.CompanyName, &a.CompanyCode, &a.OwnerUserID, &a.OwnerEmail, &a.OwnerName,
		&a.UserCount, &a.DeviceCount, &a.DoorCount)

	httputil.JSON(w, http.StatusOK, a)
}

// ─── Suspend Account ─────────────────────────────────────────────────────────

func (h *Handlers) SuspendAccount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	claims := ClaimsFromContext(r.Context())

	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts SET status = 'suspended', updated_at = now() WHERE id = $1::uuid AND status = 'active'`, id)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "account not found or not active")
		return
	}

	// Sync to companies table
	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.companies SET status = 'suspended', updated_at = now()
		 WHERE id = (SELECT company_id FROM dm3_auth.accounts WHERE id = $1::uuid)`, id)

	// Audit log
	actorID := ""
	if claims != nil {
		actorID = claims.Sub
	}
	_, _ = h.db.Pool.Exec(r.Context(),
		`INSERT INTO dm3_auth.account_audit_log (account_id, actor_id, action, changes, ip_address)
		 VALUES ($1::uuid, $2::uuid, 'suspended', '{"status":"suspended"}', $3)`,
		id, actorID, r.RemoteAddr,
	)

	httputil.JSON(w, http.StatusOK, map[string]string{"status": "suspended"})
}

// ─── Reactivate Account ─────────────────────────────────────────────────────

func (h *Handlers) ReactivateAccount(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	claims := ClaimsFromContext(r.Context())

	tag, err := h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.accounts SET status = 'active', updated_at = now() WHERE id = $1::uuid AND status = 'suspended'`, id)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if tag.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "account not found or not suspended")
		return
	}

	// Sync to companies table
	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE dm3_auth.companies SET status = 'active', updated_at = now()
		 WHERE id = (SELECT company_id FROM dm3_auth.accounts WHERE id = $1::uuid)`, id)

	// Audit log
	actorID := ""
	if claims != nil {
		actorID = claims.Sub
	}
	_, _ = h.db.Pool.Exec(r.Context(),
		`INSERT INTO dm3_auth.account_audit_log (account_id, actor_id, action, changes, ip_address)
		 VALUES ($1::uuid, $2::uuid, 'reactivated', '{"status":"active"}', $3)`,
		id, actorID, r.RemoteAddr,
	)

	httputil.JSON(w, http.StatusOK, map[string]string{"status": "active"})
}

// ─── Get Account Audit Log ───────────────────────────────────────────────────

func (h *Handlers) GetAccountAuditLog(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	var total int64
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM dm3_auth.account_audit_log WHERE account_id = $1::uuid`, id,
	).Scan(&total)

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT al.id, al.actor_id, u.email, al.action, al.changes, al.ip_address, al.created_at
		FROM dm3_auth.account_audit_log al
		LEFT JOIN dm3_auth.users u ON u.id = al.actor_id
		WHERE al.account_id = $1::uuid
		ORDER BY al.created_at DESC
		LIMIT $2 OFFSET $3`, id, limit, offset)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	entries := []auditEntry{}
	for rows.Next() {
		var e auditEntry
		if err := rows.Scan(&e.ID, &e.ActorID, &e.ActorEmail, &e.Action, &e.Changes, &e.IPAddress, &e.CreatedAt); err != nil {
			httputil.Error(w, http.StatusInternalServerError, err.Error())
			return
		}
		entries = append(entries, e)
	}
	httputil.Paginated(w, entries, total, page, limit)
}
