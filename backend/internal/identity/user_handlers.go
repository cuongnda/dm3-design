package identity

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── Avatar Upload ────────────────────────────────────────────────────────────

func (h *IdentityHandlers) UploadUserAvatar(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	companyID := authsvc.CompanyIDFromContext(r.Context())

	// Verify user belongs to this company
	var exists bool
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT EXISTS(
			SELECT 1 FROM dm3_identity.users
			WHERE id = $1::uuid AND tenant_id = $2::uuid
			  AND (is_deleted = false OR is_deleted IS NULL)
		)
	`, userID, companyID).Scan(&exists)
	if !exists {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		httputil.Error(w, http.StatusBadRequest, "file too large or invalid multipart")
		return
	}

	file, header, err := r.FormFile("avatar")
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "avatar field required")
		return
	}
	defer file.Close()

	photoDir := "data/photos"
	if err := os.MkdirAll(photoDir, 0755); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to create photo directory")
		return
	}

	ext := ".jpg"
	if ct := header.Header.Get("Content-Type"); ct == "image/png" {
		ext = ".png"
	}
	filename := fmt.Sprintf("user-%s%s", userID, ext)
	fpath := fmt.Sprintf("%s/%s", photoDir, filename)

	dst, err := os.Create(fpath)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to save avatar")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to write avatar")
		return
	}

	avatarURL := fmt.Sprintf("/photos/%s", filename)
	_, err = h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_identity.users SET avatar = $2, updated_at = NOW()
		WHERE id = $1::uuid AND tenant_id = $3::uuid
	`, userID, avatarURL, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update avatar")
		return
	}

	h.audit.LogFromRequest(r, "identity.user.photo_upload", "user", userID, userID, "success", nil, map[string]any{"avatar": avatarURL})
	httputil.JSON(w, http.StatusOK, map[string]string{"avatar": avatarURL})
}

// ─── User CRUD ────────────────────────────────────────────────────────────────

func (h *IdentityHandlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	companyID := authsvc.CompanyIDFromContext(r.Context())
	if companyID == "" {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	search := strings.TrimSpace(r.URL.Query().Get("search"))
	statuses := r.URL.Query()["status"]       // multi: ?status=active&status=inactive
	departmentIDs := r.URL.Query()["department_id"] // multi: ?department_id=x&department_id=y
	sortBy := r.URL.Query().Get("sort_by")
	sortOrder := r.URL.Query().Get("sort_order")

	if sortBy == "" {
		sortBy = "full_name"
	}
	validSort := map[string]bool{
		"full_name": true, "email": true, "user_code": true,
		"position": true, "user_status": true, "department_name": true,
	}
	if !validSort[sortBy] {
		sortBy = "full_name"
	}
	if sortOrder != "ASC" && sortOrder != "DESC" {
		sortOrder = "ASC"
	}

	baseWhere := `WHERE u.tenant_id = $1::uuid AND (u.is_deleted = false OR u.is_deleted IS NULL)`
	args := []interface{}{companyID}
	idx := 2

	if search != "" {
		baseWhere += fmt.Sprintf(
			` AND (CONCAT(u.first_name,' ',u.last_name) ILIKE $%d OR u.email ILIKE $%d OR u.user_code ILIKE $%d OR u.phone ILIKE $%d)`,
			idx, idx, idx, idx,
		)
		args = append(args, "%"+search+"%")
		idx++
	}
	// Filter out "all" sentinel and empty values
	filteredStatuses := statuses[:0]
	for _, s := range statuses {
		if s != "" && s != "all" {
			filteredStatuses = append(filteredStatuses, s)
		}
	}
	if len(filteredStatuses) == 1 {
		baseWhere += fmt.Sprintf(` AND COALESCE(u.status, 'active') = $%d`, idx)
		args = append(args, filteredStatuses[0])
		idx++
	} else if len(filteredStatuses) > 1 {
		placeholders := make([]string, len(filteredStatuses))
		for i, s := range filteredStatuses {
			placeholders[i] = fmt.Sprintf("$%d", idx)
			args = append(args, s)
			idx++
		}
		baseWhere += ` AND COALESCE(u.status, 'active') IN (` + strings.Join(placeholders, ",") + `)`
	}

	filteredDepts := departmentIDs[:0]
	for _, d := range departmentIDs {
		if d != "" {
			filteredDepts = append(filteredDepts, d)
		}
	}
	if len(filteredDepts) == 1 {
		baseWhere += fmt.Sprintf(` AND u.department_id = $%d::uuid`, idx)
		args = append(args, filteredDepts[0])
		idx++
	} else if len(filteredDepts) > 1 {
		placeholders := make([]string, len(filteredDepts))
		for i, d := range filteredDepts {
			placeholders[i] = fmt.Sprintf("$%d::uuid", idx)
			args = append(args, d)
			idx++
		}
		baseWhere += ` AND u.department_id IN (` + strings.Join(placeholders, ",") + `)`
	}

	// Count
	var total int
	countQ := `SELECT COUNT(*) FROM dm3_identity.users u ` + baseWhere
	if err := h.db.Pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to count users")
		return
	}

	// Data
	dataQ := `
		SELECT
			u.id,
			COALESCE(u.user_code, '') AS user_code,
			COALESCE(u.emp_number, '') AS emp_number,
			COALESCE(u.first_name, '') AS first_name,
			COALESCE(u.last_name, '') AS last_name,
			CONCAT(u.first_name, ' ', u.last_name) AS full_name,
			COALESCE(u.email, '') AS email,
			COALESCE(u.position, '') AS position,
			COALESCE(u.status, 'active') AS user_status,
			COALESCE(u.avatar, '') AS avatar,
			COALESCE(u.phone, '') AS phone,
			COALESCE(d.name, '') AS department_name,
			u.department_id::text,
			u.account_id::text,
			u.birth_day::text,
			u.effective_date::text,
			u.expired_date::text
		FROM dm3_identity.users u
		LEFT JOIN dm3_identity.departments d ON u.department_id = d.id
		` + baseWhere +
		fmt.Sprintf(` ORDER BY %s %s LIMIT $%d OFFSET $%d`, sortBy, sortOrder, idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), dataQ, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch users")
		return
	}
	defer rows.Close()

	users := []map[string]interface{}{}
	for rows.Next() {
		var id, userCode, empNum, firstName, lastName, fullName string
		var email, position, status, avatar, phone, deptName string
		var deptID, accountID, birthDay, effectiveDate, expiredDate *string

		if err := rows.Scan(
			&id, &userCode, &empNum, &firstName, &lastName, &fullName,
			&email, &position, &status, &avatar, &phone, &deptName,
			&deptID, &accountID, &birthDay, &effectiveDate, &expiredDate,
		); err != nil {
			continue
		}
		users = append(users, map[string]interface{}{
			"id":             id,
			"user_code":      userCode,
			"emp_number":     empNum,
			"first_name":     firstName,
			"last_name":      lastName,
			"full_name":      fullName,
			"email":          email,
			"position":       position,
			"status":         status,
			"avatar":         avatar,
			"phone":          phone,
			"department_name": deptName,
			"department_id":  deptID,
			"account_id":     accountID,
			"birth_day":      birthDay,
			"effective_date": effectiveDate,
			"expired_date":   expiredDate,
		})
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"users": users,
		"pagination": map[string]interface{}{
			"page":        page,
			"limit":       limit,
			"total":       total,
			"total_pages": (total + limit - 1) / limit,
		},
	})
}

func (h *IdentityHandlers) GetUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	companyID := authsvc.CompanyIDFromContext(r.Context())

	var id, userCode, empNum, firstName, lastName, fullName string
	var email, position, status, avatar, phone, address, deptName string
	var deptID, accountID, birthDay, effectiveDate, expiredDate, accessGroupID, accessGroupName *string
	var sex *bool
	var isMasterCard bool
	var createdAt, updatedAt time.Time

	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT
			u.id,
			COALESCE(u.user_code, '') AS user_code,
			COALESCE(u.emp_number, '') AS emp_number,
			COALESCE(u.first_name, '') AS first_name,
			COALESCE(u.last_name, '') AS last_name,
			CONCAT(u.first_name, ' ', u.last_name) AS full_name,
			COALESCE(u.email, '') AS email,
			COALESCE(u.position, '') AS position,
			COALESCE(u.status, 'active') AS user_status,
			COALESCE(u.avatar, '') AS avatar,
			COALESCE(u.phone, '') AS phone,
			COALESCE(u.address, '') AS address,
			COALESCE(d.name, '') AS department_name,
			u.department_id::text,
			u.account_id::text,
			u.birth_day::text,
			u.effective_date::text,
			u.expired_date::text,
			u.sex,
			COALESCE(u.is_master_card, false) AS is_master_card,
			agu.access_group_id::text,
			ag.name,
			u.created_at,
			u.updated_at
		FROM dm3_identity.users u
		LEFT JOIN dm3_identity.departments d ON u.department_id = d.id
		LEFT JOIN dm3_access.access_group_users agu ON agu.user_id = u.id
			AND (agu.effective_to IS NULL OR agu.effective_to > now())
		LEFT JOIN dm3_access.access_groups ag ON ag.id = agu.access_group_id
		WHERE u.id = $1::uuid AND u.tenant_id = $2::uuid
		  AND (u.is_deleted = false OR u.is_deleted IS NULL)
	`, userID, companyID).Scan(
		&id, &userCode, &empNum, &firstName, &lastName, &fullName,
		&email, &position, &status, &avatar, &phone, &address, &deptName,
		&deptID, &accountID, &birthDay, &effectiveDate, &expiredDate,
		&sex, &isMasterCard, &accessGroupID, &accessGroupName,
		&createdAt, &updatedAt,
	)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{
		"user": map[string]interface{}{
			"id":               id,
			"user_code":        userCode,
			"emp_number":       empNum,
			"first_name":       firstName,
			"last_name":        lastName,
			"full_name":        fullName,
			"email":            email,
			"position":         position,
			"status":           status,
			"avatar":           avatar,
			"phone":            phone,
			"address":          address,
			"department_name":  deptName,
			"department_id":    deptID,
			"account_id":       accountID,
			"birth_day":        birthDay,
			"effective_date":   effectiveDate,
			"expired_date":     expiredDate,
			"sex":              sex,
			"is_master_card":   isMasterCard,
			"access_group_id":  accessGroupID,
			"access_group_name": accessGroupName,
			"created_on":       createdAt,
			"updated_on":       updatedAt,
		},
	})
}

func (h *IdentityHandlers) CreateUser(w http.ResponseWriter, r *http.Request) {
	companyID := authsvc.CompanyIDFromContext(r.Context())
	if companyID == "" {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	var req struct {
		FirstName     string  `json:"first_name"`
		LastName      string  `json:"last_name"`
		Email         string  `json:"email"`
		Position      *string `json:"position"`
		Phone         *string `json:"phone"`
		Address       *string `json:"address"`
		Sex           *bool   `json:"sex"`
		BirthDay      *string `json:"birth_day"`
		EffectiveDate *string `json:"effective_date"`
		ExpiredDate   *string `json:"expired_date"`
		DepartmentID  *string `json:"department_id"`
		EmpNumber     *string `json:"emp_number"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.FirstName == "" || req.LastName == "" || req.Email == "" {
		httputil.Error(w, http.StatusBadRequest, "first_name, last_name, and email are required")
		return
	}

	// Auto-generate sequential user_code per company
	var maxCode int
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(user_code, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)
		FROM dm3_identity.users
		WHERE tenant_id = $1::uuid AND (is_deleted = false OR is_deleted IS NULL)
	`, companyID).Scan(&maxCode)
	userCode := fmt.Sprintf("%06d", maxCode+1)

	// Find existing account for this email in this company, or create one.
	// A user can belong to multiple companies: each company gets its own account record.
	var accountID string
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT id FROM dm3_auth.accounts
		WHERE email = $1 AND tenant_id = $2::uuid AND status != 'deleted'
	`, req.Email, companyID).Scan(&accountID)

	if err == pgx.ErrNoRows {
		// Create a new account (random password — manager must set via change-password)
		randomBytes := make([]byte, 16)
		_, _ = rand.Read(randomBytes)
		randomPwd := hex.EncodeToString(randomBytes)
		hashed, hashErr := bcrypt.GenerateFromPassword([]byte(randomPwd), bcrypt.DefaultCost)
		if hashErr != nil {
			httputil.Error(w, http.StatusInternalServerError, "failed to initialize account")
			return
		}
		if scanErr := h.db.Pool.QueryRow(r.Context(), `
			INSERT INTO dm3_auth.accounts (tenant_id, email, password_hash, role, status, created_at, updated_at)
			VALUES ($1::uuid, $2, $3, 'viewer', 'active', NOW(), NOW())
			RETURNING id
		`, companyID, req.Email, string(hashed)).Scan(&accountID); scanErr != nil {
			httputil.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to create account: %v", scanErr))
			return
		}
	} else if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to check account")
		return
	}

	// Normalize optional UUIDs: empty string → nil
	var deptID *string
	if req.DepartmentID != nil && *req.DepartmentID != "" {
		deptID = req.DepartmentID
	}
	var birthDay *string
	if req.BirthDay != nil && *req.BirthDay != "" {
		birthDay = req.BirthDay
	}

	effectiveDate := req.EffectiveDate
	if effectiveDate == nil || *effectiveDate == "" {
		today := time.Now().Format("2006-01-02")
		effectiveDate = &today
	}
	expiredDate := req.ExpiredDate
	if expiredDate == nil || *expiredDate == "" {
		far := "3000-01-01"
		expiredDate = &far
	}

	var userID string
	if err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_identity.users (
			tenant_id, first_name, last_name, email,
			user_code, emp_number, position, phone, address,
			sex, birth_day, effective_date, expired_date, department_id, account_id,
			status, created_at, updated_at
		) VALUES (
			$1::uuid, $2, $3, $4,
			$5, $6, $7, $8, $9,
			$10, $11::date, $12::date, $13::date, $14::uuid, $15::uuid,
			'active', NOW(), NOW()
		) RETURNING id
	`, companyID, req.FirstName, req.LastName, req.Email,
		userCode, req.EmpNumber, req.Position, req.Phone, req.Address,
		req.Sex, birthDay, effectiveDate, expiredDate, deptID, accountID,
	).Scan(&userID); err != nil {
		httputil.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to create user: %v", err))
		return
	}

	h.audit.LogFromRequest(r, "identity.user.create", "user", userID, req.FirstName+" "+req.LastName, "success", nil, map[string]any{
		"first_name": req.FirstName,
		"last_name":  req.LastName,
		"email":      req.Email,
	})
	httputil.JSON(w, http.StatusCreated, map[string]interface{}{
		"id":         userID,
		"account_id": accountID,
		"user_code":  userCode,
		"message":    "user created successfully",
	})
}

func (h *IdentityHandlers) UpdateUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	companyID := authsvc.CompanyIDFromContext(r.Context())
	if companyID == "" {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	var req struct {
		FirstName     *string `json:"first_name"`
		LastName      *string `json:"last_name"`
		Email         *string `json:"email"`
		Position      *string `json:"position"`
		Phone         *string `json:"phone"`
		Address       *string `json:"address"`
		EmpNumber     *string `json:"emp_number"`
		Sex           *bool   `json:"sex"`
		BirthDay      *string `json:"birth_day"`
		EffectiveDate *string `json:"effective_date"`
		ExpiredDate   *string `json:"expired_date"`
		Status        *string `json:"status"`
		DepartmentID  *string `json:"department_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	setParts := []string{}
	args := []interface{}{userID, companyID}
	idx := 3

	if req.FirstName != nil {
		setParts = append(setParts, fmt.Sprintf("first_name = $%d", idx))
		args = append(args, *req.FirstName)
		idx++
	}
	if req.LastName != nil {
		setParts = append(setParts, fmt.Sprintf("last_name = $%d", idx))
		args = append(args, *req.LastName)
		idx++
	}
	if req.Email != nil {
		setParts = append(setParts, fmt.Sprintf("email = $%d", idx))
		args = append(args, *req.Email)
		idx++
	}
	if req.Position != nil {
		setParts = append(setParts, fmt.Sprintf("position = $%d", idx))
		args = append(args, *req.Position)
		idx++
	}
	if req.Phone != nil {
		setParts = append(setParts, fmt.Sprintf("phone = $%d", idx))
		args = append(args, *req.Phone)
		idx++
	}
	if req.Address != nil {
		setParts = append(setParts, fmt.Sprintf("address = $%d", idx))
		args = append(args, *req.Address)
		idx++
	}
	if req.EmpNumber != nil {
		setParts = append(setParts, fmt.Sprintf("emp_number = $%d", idx))
		args = append(args, *req.EmpNumber)
		idx++
	}
	if req.Sex != nil {
		setParts = append(setParts, fmt.Sprintf("sex = $%d", idx))
		args = append(args, *req.Sex)
		idx++
	}
	if req.BirthDay != nil {
		if *req.BirthDay == "" {
			setParts = append(setParts, "birth_day = NULL")
		} else {
			setParts = append(setParts, fmt.Sprintf("birth_day = $%d::date", idx))
			args = append(args, *req.BirthDay)
			idx++
		}
	}
	if req.EffectiveDate != nil {
		if *req.EffectiveDate == "" {
			setParts = append(setParts, "effective_date = NULL")
		} else {
			setParts = append(setParts, fmt.Sprintf("effective_date = $%d::date", idx))
			args = append(args, *req.EffectiveDate)
			idx++
		}
	}
	if req.ExpiredDate != nil {
		if *req.ExpiredDate == "" {
			setParts = append(setParts, "expired_date = NULL")
		} else {
			setParts = append(setParts, fmt.Sprintf("expired_date = $%d::date", idx))
			args = append(args, *req.ExpiredDate)
			idx++
		}
	}
	if req.Status != nil {
		setParts = append(setParts, fmt.Sprintf("status = $%d", idx))
		args = append(args, *req.Status)
		idx++
	}
	if req.DepartmentID != nil {
		if *req.DepartmentID == "" {
			setParts = append(setParts, "department_id = NULL")
		} else {
			setParts = append(setParts, fmt.Sprintf("department_id = $%d::uuid", idx))
			args = append(args, *req.DepartmentID)
			idx++
		}
	}

	if len(setParts) == 0 {
		httputil.Error(w, http.StatusBadRequest, "no fields to update")
		return
	}
	setParts = append(setParts, "updated_at = NOW()")

	q := fmt.Sprintf(`
		UPDATE dm3_identity.users SET %s
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		  AND (is_deleted = false OR is_deleted IS NULL)
	`, strings.Join(setParts, ", "))

	result, err := h.db.Pool.Exec(r.Context(), q, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update user")
		return
	}
	if result.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	h.audit.LogFromRequest(r, "identity.user.update", "user", userID, userID, "success", nil, req)
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "user updated successfully"})
}

func (h *IdentityHandlers) DeleteUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	companyID := authsvc.CompanyIDFromContext(r.Context())
	if companyID == "" {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	result, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_identity.users
		SET is_deleted = true, status = 'deleted', updated_at = NOW()
		WHERE id = $1::uuid AND tenant_id = $2::uuid
		  AND (is_deleted = false OR is_deleted IS NULL)
	`, userID, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to delete user")
		return
	}
	if result.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "user not found")
		return
	}

	h.audit.LogFromRequest(r, "identity.user.delete", "user", userID, userID, "success", nil, nil)
	httputil.JSON(w, http.StatusOK, map[string]string{"message": "user deleted successfully"})
}

func (h *IdentityHandlers) BulkDeleteUsers(w http.ResponseWriter, r *http.Request) {
	companyID := authsvc.CompanyIDFromContext(r.Context())
	if companyID == "" {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	var req struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.IDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "ids required")
		return
	}

	placeholders := make([]string, len(req.IDs))
	args := []interface{}{companyID}
	for i, id := range req.IDs {
		placeholders[i] = fmt.Sprintf("$%d::uuid", i+2)
		args = append(args, id)
	}

	_, err := h.db.Pool.Exec(r.Context(), fmt.Sprintf(`
		UPDATE dm3_identity.users
		SET is_deleted = true, status = 'deleted', updated_at = NOW()
		WHERE tenant_id = $1::uuid
		  AND id IN (%s)
		  AND (is_deleted = false OR is_deleted IS NULL)
	`, strings.Join(placeholders, ",")), args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to delete users")
		return
	}

	h.audit.LogFromRequest(r, "identity.user.bulk_delete", "user", "", fmt.Sprintf("%d users", len(req.IDs)), "success", nil, map[string]any{"ids": req.IDs})
	httputil.JSON(w, http.StatusOK, map[string]interface{}{"deleted": len(req.IDs)})
}

// ─── Reference data ───────────────────────────────────────────────────────────

func (h *IdentityHandlers) ListUserDepartments(w http.ResponseWriter, r *http.Request) {
	companyID := authsvc.CompanyIDFromContext(r.Context())
	if companyID == "" {
		httputil.Error(w, http.StatusBadRequest, "company context required")
		return
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, name, COALESCE(number, '') FROM dm3_identity.departments
		WHERE tenant_id = $1::uuid AND (is_deleted = false OR is_deleted IS NULL)
		ORDER BY name
	`, companyID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch departments")
		return
	}
	defer rows.Close()

	departments := []map[string]interface{}{}
	for rows.Next() {
		var id, name, number string
		if err := rows.Scan(&id, &name, &number); err != nil {
			continue
		}
		departments = append(departments, map[string]interface{}{
			"id": id, "name": name, "number": number,
		})
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{"departments": departments})
}
