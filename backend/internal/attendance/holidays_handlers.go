package attendance

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

type holidayPayload struct {
	Date        string  `json:"date"` // YYYY-MM-DD
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	IsPaid      *bool   `json:"is_paid,omitempty"`
}

// ListHolidays returns holidays for the caller's tenant, optionally filtered
// by year (defaults to current year) to keep payloads small.
//
// @Summary      List holidays
// @Description  Plugin-gated (attendance). Reads open to any attendance-enabled user.
// @Tags         Attendance
// @Produce      json
// @Param        year  query  int  false  "Filter by year (defaults to current year)"
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  httputil.ErrorResponse
// @Router       /attendance/holidays [get]
// @Security     BearerAuth
func (h *AttendanceHandlers) ListHolidays(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	year := r.URL.Query().Get("year")
	args := []any{tenantID}
	where := "tenant_id = $1::uuid"
	if year != "" {
		args = append(args, year)
		where += " AND EXTRACT(YEAR FROM date)::int = $2::int"
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id::text, tenant_id::text, date, name, description, is_paid,
		       created_at, updated_at
		  FROM dm3_attendance.holidays
		 WHERE `+where+`
		 ORDER BY date ASC`, args...)
	if err != nil {
		slog.Error("list holidays", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to list holidays")
		return
	}
	defer rows.Close()

	out := make([]Holiday, 0, 16)
	for rows.Next() {
		var h Holiday
		if err := rows.Scan(&h.ID, &h.TenantID, &h.Date, &h.Name, &h.Description,
			&h.IsPaid, &h.CreatedAt, &h.UpdatedAt); err != nil {
			slog.Error("scan holiday", "error", err)
			httputil.Error(w, http.StatusInternalServerError, "failed to decode holidays")
			return
		}
		out = append(out, h)
	}

	httputil.JSON(w, http.StatusOK, map[string]any{"items": out})
}

// CreateHoliday adds a new holiday. Uniqueness is enforced at the DB level;
// we translate the duplicate-date violation into a clean 409.
func (h *AttendanceHandlers) CreateHoliday(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}

	var p holidayPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(p.Name) == "" {
		httputil.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if _, err := time.Parse("2006-01-02", p.Date); err != nil {
		httputil.Error(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	isPaid := true
	if p.IsPaid != nil {
		isPaid = *p.IsPaid
	}

	var id string
	err := h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO dm3_attendance.holidays (
			tenant_id, date, name, description, is_paid
		) VALUES ($1::uuid, $2::date, $3, $4, $5)
		RETURNING id::text`,
		tenantID, p.Date, p.Name, p.Description, isPaid,
	).Scan(&id)
	if err != nil {
		// 23505 = unique_violation on (tenant_id, date)
		if strings.Contains(err.Error(), "holidays_date_uniq") {
			httputil.Error(w, http.StatusConflict, "a holiday already exists on that date")
			return
		}
		slog.Error("create holiday", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to create holiday")
		return
	}
	h.audit.LogFromRequest(r, "attendance.holiday_created", "holiday", id,
		p.Name, "success", nil, map[string]any{
			"date":    p.Date,
			"name":    p.Name,
			"is_paid": isPaid,
		})
	httputil.JSON(w, http.StatusCreated, map[string]string{"id": id})
}

// UpdateHoliday patches name/description/is_paid. Date is immutable — to move
// a holiday, delete and recreate (prevents silently breaking records already
// associated with the old date).
func (h *AttendanceHandlers) UpdateHoliday(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "id required")
		return
	}

	var p holidayPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	ct, err := h.db.Pool.Exec(r.Context(), `
		UPDATE dm3_attendance.holidays
		   SET name        = COALESCE(NULLIF($3, ''), name),
		       description = COALESCE($4, description),
		       is_paid     = COALESCE($5, is_paid)
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`,
		id, tenantID, p.Name, p.Description, p.IsPaid)
	if err != nil {
		slog.Error("update holiday", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to update holiday")
		return
	}
	if ct.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "holiday not found")
		return
	}
	h.audit.LogFromRequest(r, "attendance.holiday_updated", "holiday", id,
		p.Name, "success", nil, p)
	httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// DeleteHoliday removes a holiday entry.
func (h *AttendanceHandlers) DeleteHoliday(w http.ResponseWriter, r *http.Request) {
	tenantID := authsvc.CompanyIDFromContext(r.Context())
	if tenantID == "" {
		httputil.Error(w, http.StatusUnauthorized, "missing tenant context")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.Error(w, http.StatusBadRequest, "id required")
		return
	}
	ct, err := h.db.Pool.Exec(r.Context(), `
		DELETE FROM dm3_attendance.holidays
		 WHERE id = $1::uuid AND tenant_id = $2::uuid`, id, tenantID)
	if err != nil {
		slog.Error("delete holiday", "error", err)
		httputil.Error(w, http.StatusInternalServerError, "failed to delete holiday")
		return
	}
	if ct.RowsAffected() == 0 {
		httputil.Error(w, http.StatusNotFound, "holiday not found")
		return
	}
	h.audit.LogFromRequest(r, "attendance.holiday_deleted", "holiday", id,
		"", "success", nil, nil)
	w.WriteHeader(http.StatusNoContent)
}

// isHolidayDate checks whether the given date is a tenant-configured holiday.
// Returns (false, nil) when there is no row for that date.
func (h *AttendanceHandlers) isHolidayDate(ctx context.Context, tenantID string, date time.Time) (bool, error) {
	var exists bool
	err := h.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM dm3_attendance.holidays
			 WHERE tenant_id = $1::uuid AND date = $2::date
		)`, tenantID, date.Format("2006-01-02")).Scan(&exists)
	return exists, err
}
