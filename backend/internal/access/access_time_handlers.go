package access

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
)

// ─── Access Times ────────────────────────────────────────────────────────────

func (h *AccessHandlers) ListAccessTimeTemplates(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	where := "WHERE 1=1"
	args := []any{}
	idx := 1

	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}
	where += fmt.Sprintf(" AND t.tenant_id = $%d::uuid", idx)
	args = append(args, cid)
	idx++

	if v := r.URL.Query().Get("active"); v != "" {
		where += fmt.Sprintf(" AND t.is_active = $%d", idx)
		args = append(args, v == "true")
		idx++
	}

	var total int64
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	_ = h.db.Pool.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM dm3_access.access_times t "+where, countArgs...).Scan(&total)

	sortCol, sortDir := parseSorting(r, map[string]string{
		"name":       "t.name",
		"created_at": "t.created_at",
		"is_active":  "t.is_active",
		"timezone":   "t.timezone",
		"slot_count": "(SELECT COUNT(*) FROM dm3_access.access_time_slots s WHERE s.access_time_id = t.id)",
	}, "t.name")
	query := fmt.Sprintf(`
		SELECT
			t.id, t.tenant_id, t.name, t.description, t.timezone,
			t.is_active, t.created_by, t.created_at, t.updated_at,
			(SELECT COUNT(*) FROM dm3_access.access_time_slots s WHERE s.access_time_id = t.id) AS slot_count
		FROM dm3_access.access_times t
		%s
		ORDER BY %s %s
		LIMIT $%d OFFSET $%d
	`, where, sortCol, sortDir, idx, idx+1)

	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("failed to query access times", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}
	defer rows.Close()

	templates := []models.AccessTimeTemplate{}
	for rows.Next() {
		var t models.AccessTimeTemplate
		err := rows.Scan(
			&t.ID, &t.TenantID, &t.Name, &t.Description, &t.Timezone,
			&t.IsActive, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt, &t.SlotCount,
		)
		if err != nil {
			slog.Error("failed to scan access time", "error", err)
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.scan_error")
			return
		}
		templates = append(templates, t)
	}

	httputil.Paginated(w, templates, total, page, limit)
}

func (h *AccessHandlers) GetAccessTimeTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := chi.URLParam(r, "id")
	companyID := authsvc.CompanyIDFromContext(r.Context())

	// Get access time
	var template models.AccessTimeTemplate
	query := `
		SELECT id, tenant_id, name, description, timezone, is_active,
			   created_by, created_at, updated_at
		FROM dm3_access.access_times
		WHERE id = $1::uuid AND tenant_id = $2::uuid
	`
	err := h.db.Pool.QueryRow(r.Context(), query, templateID, companyID).Scan(
		&template.ID, &template.TenantID, &template.Name, &template.Description,
		&template.Timezone, &template.IsActive, &template.CreatedBy,
		&template.CreatedAt, &template.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			i18n.ErrorResponse(w, r, http.StatusNotFound, "access_time.template_not_found")
			return
		}
		slog.Error("failed to get access time", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	// Get time slots
	slotsQuery := `
		SELECT id, access_time_id, day_of_week, start_time, end_time,
			   slot_name, is_active, created_at
		FROM dm3_access.access_time_slots
		WHERE access_time_id = $1::uuid
		ORDER BY day_of_week, start_time
	`
	rows, err := h.db.Pool.Query(r.Context(), slotsQuery, templateID)
	if err != nil {
		slog.Error("failed to query time slots", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}
	defer rows.Close()

	var timeSlots []models.AccessTimeSlot
	for rows.Next() {
		var slot models.AccessTimeSlot
		err := rows.Scan(
			&slot.ID, &slot.AccessTimeID, &slot.DayOfWeek,
			&slot.StartTime, &slot.EndTime, &slot.SlotName,
			&slot.IsActive, &slot.CreatedAt,
		)
		if err != nil {
			slog.Error("failed to scan time slot", "error", err)
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.scan_error")
			return
		}
		timeSlots = append(timeSlots, slot)
	}

	template.Slots = timeSlots
	httputil.JSON(w, http.StatusOK, template)
}

func (h *AccessHandlers) CreateAccessTimeTemplate(w http.ResponseWriter, r *http.Request) {
	var req models.CreateAccessTimeTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_json")
		return
	}

	companyID := authsvc.CompanyIDFromContext(r.Context())
	claims := authsvc.ClaimsFromContext(r.Context())
	if claims == nil {
		i18n.ErrorResponse(w, r, http.StatusUnauthorized, "system.unauthorized")
		return
	}
	userID := claims.Sub

	// Validate required fields
	if req.Name == "" {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.name_required")
		return
	}

	// Validate timezone
	if _, err := time.LoadLocation(req.Timezone); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "access_time.invalid_timezone")
		return
	}

	// Start transaction
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.transaction_error")
		return
	}
	defer tx.Rollback(r.Context())

	// Insert access time
	var templateID string
	insertQuery := `
		INSERT INTO dm3_access.access_times
		(tenant_id, name, description, timezone, created_by)
		VALUES ($1::uuid, $2, $3, $4, $5::uuid)
		RETURNING id
	`
	err = tx.QueryRow(r.Context(), insertQuery,
		companyID, req.Name, req.Description, req.Timezone, userID).Scan(&templateID)
	if err != nil {
		slog.Error("failed to insert access time", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	// Insert time slots
	for _, slotInput := range req.TimeSlots {
		_, err = tx.Exec(r.Context(), `
			INSERT INTO dm3_access.access_time_slots
			(tenant_id, access_time_id, day_of_week, start_time, end_time, slot_name, is_active)
			VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
		`, companyID, templateID, slotInput.DayOfWeek, slotInput.StartTime,
			slotInput.EndTime, slotInput.SlotName, slotInput.IsActive)
		if err != nil {
			slog.Error("failed to insert time slot", "error", err)
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
			return
		}
	}

	// Commit transaction
	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit transaction", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.transaction_error")
		return
	}

	h.audit.LogFromRequest(r, "access.time.create", "access_time", templateID, req.Name, "success", nil, map[string]any{"name": req.Name, "timezone": req.Timezone})
	httputil.JSON(w, http.StatusCreated, map[string]string{
		"id":      templateID,
		"message": "Access time template created successfully",
	})
}

func (h *AccessHandlers) UpdateAccessTimeTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := chi.URLParam(r, "id")
	companyID := authsvc.CompanyIDFromContext(r.Context())

	var req models.UpdateAccessTimeTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_json")
		return
	}

	// Validate timezone if provided
	if req.Timezone != nil {
		if _, err := time.LoadLocation(*req.Timezone); err != nil {
			i18n.ErrorResponse(w, r, http.StatusBadRequest, "access_time.invalid_timezone")
			return
		}
	}

	// Start transaction
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.transaction_error")
		return
	}
	defer tx.Rollback(r.Context())

	// Build dynamic update query
	setParts := []string{}
	args := []any{templateID, companyID}
	idx := 3

	if req.Name != nil {
		setParts = append(setParts, fmt.Sprintf("name = $%d", idx))
		args = append(args, *req.Name)
		idx++
	}
	if req.Description != nil {
		setParts = append(setParts, fmt.Sprintf("description = $%d", idx))
		args = append(args, *req.Description)
		idx++
	}
	if req.Timezone != nil {
		setParts = append(setParts, fmt.Sprintf("timezone = $%d", idx))
		args = append(args, *req.Timezone)
		idx++
	}
	if req.IsActive != nil {
		setParts = append(setParts, fmt.Sprintf("is_active = $%d", idx))
		args = append(args, *req.IsActive)
		idx++
	}

	if len(setParts) > 0 {
		updateQuery := fmt.Sprintf(`
			UPDATE dm3_access.access_times
			SET %s, updated_at = now()
			WHERE id = $1::uuid AND tenant_id = $2::uuid
		`, strings.Join(setParts, ", "))

		result, err := tx.Exec(r.Context(), updateQuery, args...)
		if err != nil {
			slog.Error("failed to update access time", "error", err)
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
			return
		}
		if result.RowsAffected() == 0 {
			i18n.ErrorResponse(w, r, http.StatusNotFound, "access_time.template_not_found")
			return
		}
	}

	// Update time slots if provided
	if req.TimeSlots != nil {
		// Delete existing slots
		_, err = tx.Exec(r.Context(), `
			DELETE FROM dm3_access.access_time_slots
			WHERE access_time_id = $1::uuid
		`, templateID)
		if err != nil {
			slog.Error("failed to delete old time slots", "error", err)
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
			return
		}

		// Insert new slots
		for _, slotInput := range req.TimeSlots {
			_, err = tx.Exec(r.Context(), `
				INSERT INTO dm3_access.access_time_slots
				(tenant_id, access_time_id, day_of_week, start_time, end_time, slot_name, is_active)
				VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
			`, companyID, templateID, slotInput.DayOfWeek, slotInput.StartTime,
				slotInput.EndTime, slotInput.SlotName, slotInput.IsActive)
			if err != nil {
				slog.Error("failed to insert new time slot", "error", err)
				i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
				return
			}
		}
	}

	// Commit transaction
	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit transaction", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.transaction_error")
		return
	}

	h.audit.LogFromRequest(r, "access.time.update", "access_time", templateID, "", "success", nil, nil)
	httputil.JSON(w, http.StatusOK, map[string]string{
		"message": "Access time template updated successfully",
	})
}

func (h *AccessHandlers) DeleteAccessTimeTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := chi.URLParam(r, "id")
	companyID := authsvc.CompanyIDFromContext(r.Context())

	result, err := h.db.Pool.Exec(r.Context(), `
		DELETE FROM dm3_access.access_times
		WHERE id = $1::uuid AND tenant_id = $2::uuid
	`, templateID, companyID)
	if err != nil {
		slog.Error("failed to delete access time", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	if result.RowsAffected() == 0 {
		i18n.ErrorResponse(w, r, http.StatusNotFound, "access_time.template_not_found")
		return
	}

	h.audit.LogFromRequest(r, "access.time.delete", "access_time", templateID, "", "success", nil, nil)
	httputil.JSON(w, http.StatusOK, map[string]string{
		"message": "Access time template deleted successfully",
	})
}

func (h *AccessHandlers) BulkDeleteAccessTimes(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.IDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "ids required")
		return
	}
	placeholders := make([]string, len(req.IDs))
	args := []any{cid}
	for i, id := range req.IDs {
		placeholders[i] = fmt.Sprintf("$%d::uuid", i+2)
		args = append(args, id)
	}
	query := fmt.Sprintf(`DELETE FROM dm3_access.access_times WHERE tenant_id = $1::uuid AND id IN (%s)`, strings.Join(placeholders, ","))
	tag, err := h.db.Pool.Exec(r.Context(), query, args...)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.audit.LogFromRequest(r, "access.time.bulk_delete", "access_time", "", "", "success", nil, map[string]any{"ids": req.IDs})
	httputil.JSON(w, http.StatusOK, map[string]any{"deleted": tag.RowsAffected()})
}

// ─── User Assignment (DROPPED) ───────────────────────────────────────────────

func (h *AccessHandlers) AssignAccessTime(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "user_access_times has been removed")
}

func (h *AccessHandlers) GetUserAccessTime(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "user_access_times has been removed")
}

// ─── Access Validation (DROPPED) ────────────────────────────────────────────

func (h *AccessHandlers) ValidateAccess(w http.ResponseWriter, r *http.Request) {
	httputil.Error(w, http.StatusNotImplemented, "access_time_validations has been removed")
}

// ─── Stats & Analytics ──────────────────────────────────────────────────────

func (h *AccessHandlers) GetAccessTimeStats(w http.ResponseWriter, r *http.Request) {
	companyID := authsvc.CompanyIDFromContext(r.Context())

	var stats models.AccessTimeStats

	// Get access time stats
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT
			COUNT(*) FILTER (WHERE is_active = true) as active,
			COUNT(*) as total
		FROM dm3_access.access_times
		WHERE tenant_id = $1::uuid
	`, companyID).Scan(&stats.TemplatesActive, &stats.TemplatesTotal)
	if err != nil {
		slog.Error("failed to get access time stats", "error", err)
	}

	httputil.JSON(w, http.StatusOK, stats)
}
