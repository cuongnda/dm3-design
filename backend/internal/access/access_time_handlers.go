package access

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/internal/models"
	"github.com/duali/dm3-backend/pkg/httputil"
	"github.com/duali/dm3-backend/pkg/i18n"
)

// ─── Access Time Templates ──────────────────────────────────────────────────

func (h *Handlers) ListAccessTimeTemplates(w http.ResponseWriter, r *http.Request) {
	page, limit := parsePagination(r)
	offset := (page - 1) * limit

	where := "WHERE 1=1"
	args := []any{}
	idx := 1

	if cid := authsvc.CompanyIDFromContext(r.Context()); cid != "" {
		where += fmt.Sprintf(" AND t.company_id = $%d::uuid", idx)
		args = append(args, cid)
		idx++
	}

	if v := r.URL.Query().Get("active"); v != "" {
		where += fmt.Sprintf(" AND t.is_active = $%d", idx)
		args = append(args, v == "true")
		idx++
	}

	query := fmt.Sprintf(`
		SELECT
			t.id, t.company_id, t.name, t.description, t.timezone,
			t.is_active, t.created_by, t.created_at, t.updated_at,
			COUNT(ua.user_id) as user_count
		FROM dm3_access.access_time_templates t
		LEFT JOIN dm3_access.user_access_times ua ON t.id = ua.template_id
			AND (ua.effective_to IS NULL OR ua.effective_to >= CURRENT_DATE)
		%s
		GROUP BY t.id, t.company_id, t.name, t.description, t.timezone,
				 t.is_active, t.created_by, t.created_at, t.updated_at
		ORDER BY t.created_at DESC
		LIMIT $%d OFFSET $%d
	`, where, idx, idx+1)
	
	args = append(args, limit, offset)

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("failed to query access time templates", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}
	defer rows.Close()

	var templates []models.AccessTimeTemplate
	for rows.Next() {
		var t models.AccessTimeTemplate
		err := rows.Scan(
			&t.ID, &t.CompanyID, &t.Name, &t.Description, &t.Timezone,
			&t.IsActive, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt, &t.UserCount,
		)
		if err != nil {
			slog.Error("failed to scan access time template", "error", err)
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.scan_error")
			return
		}
		templates = append(templates, t)
	}

	httputil.JSON(w, http.StatusOK, map[string]any{
		"templates": templates,
		"pagination": map[string]int{
			"page":  page,
			"limit": limit,
			"total": len(templates), // TODO: Count total for proper pagination
		},
	})
}

func (h *Handlers) GetAccessTimeTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := chi.URLParam(r, "id")
	companyID := authsvc.CompanyIDFromContext(r.Context())

	// Get template
	var template models.AccessTimeTemplate
	query := `
		SELECT id, company_id, name, description, timezone, is_active,
			   created_by, created_at, updated_at
		FROM dm3_access.access_time_templates
		WHERE id = $1::uuid AND company_id = $2::uuid
	`
	err := h.db.Pool.QueryRow(r.Context(), query, templateID, companyID).Scan(
		&template.ID, &template.CompanyID, &template.Name, &template.Description,
		&template.Timezone, &template.IsActive, &template.CreatedBy,
		&template.CreatedAt, &template.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			i18n.ErrorResponse(w, r, http.StatusNotFound, "access_time.template_not_found")
			return
		}
		slog.Error("failed to get access time template", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	// Get time slots
	slotsQuery := `
		SELECT id, template_id, day_of_week, start_time, end_time, 
			   slot_name, is_active, created_at
		FROM dm3_access.access_time_slots 
		WHERE template_id = $1::uuid
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
			&slot.ID, &slot.TemplateID, &slot.DayOfWeek,
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

	template.TimeSlots = timeSlots
	httputil.JSON(w, http.StatusOK, template)
}

func (h *Handlers) CreateAccessTimeTemplate(w http.ResponseWriter, r *http.Request) {
	var req models.CreateAccessTimeTemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_json")
		return
	}

	companyID := authsvc.CompanyIDFromContext(r.Context())
	userID := authsvc.ClaimsFromContext(r.Context()).Sub

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

	// Insert template
	var templateID string
	insertQuery := `
		INSERT INTO dm3_access.access_time_templates
		(company_id, name, description, timezone, created_by)
		VALUES ($1::uuid, $2, $3, $4, $5::uuid)
		RETURNING id
	`
	err = tx.QueryRow(r.Context(), insertQuery, 
		companyID, req.Name, req.Description, req.Timezone, userID).Scan(&templateID)
	if err != nil {
		slog.Error("failed to insert access time template", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	// Insert time slots
	for _, slotInput := range req.TimeSlots {
		_, err = tx.Exec(r.Context(), `
			INSERT INTO dm3_access.access_time_slots 
			(template_id, day_of_week, start_time, end_time, slot_name, is_active) 
			VALUES ($1::uuid, $2, $3, $4, $5, $6)
		`, templateID, slotInput.DayOfWeek, slotInput.StartTime, 
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

	httputil.JSON(w, http.StatusCreated, map[string]string{
		"id": templateID,
		"message": "Access time template created successfully",
	})
}

func (h *Handlers) UpdateAccessTimeTemplate(w http.ResponseWriter, r *http.Request) {
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
			UPDATE dm3_access.access_time_templates
			SET %s, updated_at = now()
			WHERE id = $1::uuid AND company_id = $2::uuid
		`, string(setParts[0])) // Join setParts

		for i := 1; i < len(setParts); i++ {
			updateQuery = updateQuery[:len(updateQuery)-len(" WHERE")] + ", " + setParts[i] + " WHERE id = $1::uuid AND company_id = $2::uuid"
		}

		result, err := tx.Exec(r.Context(), updateQuery, args...)
		if err != nil {
			slog.Error("failed to update template", "error", err)
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
			WHERE template_id = $1::uuid
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
				(template_id, day_of_week, start_time, end_time, slot_name, is_active) 
				VALUES ($1::uuid, $2, $3, $4, $5, $6)
			`, templateID, slotInput.DayOfWeek, slotInput.StartTime, 
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

	httputil.JSON(w, http.StatusOK, map[string]string{
		"message": "Access time template updated successfully",
	})
}

func (h *Handlers) DeleteAccessTimeTemplate(w http.ResponseWriter, r *http.Request) {
	templateID := chi.URLParam(r, "id")
	companyID := authsvc.CompanyIDFromContext(r.Context())

	result, err := h.db.Pool.Exec(r.Context(), `
		DELETE FROM dm3_access.access_time_templates
		WHERE id = $1::uuid AND company_id = $2::uuid
	`, templateID, companyID)
	if err != nil {
		slog.Error("failed to delete access time template", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	if result.RowsAffected() == 0 {
		i18n.ErrorResponse(w, r, http.StatusNotFound, "access_time.template_not_found")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{
		"message": "Access time template deleted successfully",
	})
}

// ─── User Assignment ────────────────────────────────────────────────────────

func (h *Handlers) AssignAccessTime(w http.ResponseWriter, r *http.Request) {
	var req models.AssignAccessTimeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_json")
		return
	}

	companyID := authsvc.CompanyIDFromContext(r.Context())
	assignedBy := authsvc.ClaimsFromContext(r.Context()).Sub

	// Start transaction
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.transaction_error")
		return
	}
	defer tx.Rollback(r.Context())

	// Verify template exists and belongs to company
	var templateExists bool
	err = tx.QueryRow(r.Context(), `
		SELECT EXISTS(SELECT 1 FROM dm3_access.access_time_templates
		WHERE id = $1::uuid AND company_id = $2::uuid)
	`, req.TemplateID, companyID).Scan(&templateExists)
	if err != nil || !templateExists {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "access_time.template_not_found")
		return
	}

	// Insert assignments for each user
	for _, userID := range req.UserIDs {
		_, err = tx.Exec(r.Context(), `
			INSERT INTO dm3_access.user_access_times
			(company_id, user_id, template_id, effective_from, effective_to, assigned_by)
			VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid)
			ON CONFLICT (user_id, template_id, effective_from) 
			DO UPDATE SET 
				effective_to = EXCLUDED.effective_to,
				assigned_by = EXCLUDED.assigned_by,
				updated_at = now()
		`, companyID, userID, req.TemplateID, req.EffectiveFrom, req.EffectiveTo, assignedBy)
		if err != nil {
			slog.Error("failed to assign access time", "error", err, "user_id", userID)
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

	httputil.JSON(w, http.StatusOK, map[string]any{
		"message": "Access time assigned successfully",
		"assigned_users": len(req.UserIDs),
	})
}

func (h *Handlers) GetUserAccessTime(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userId")
	companyID := authsvc.CompanyIDFromContext(r.Context())

	query := `
		SELECT
			ua.id, ua.company_id, ua.user_id, ua.template_id,
			ua.effective_from, ua.effective_to, ua.assigned_by,
			ua.created_at, ua.updated_at,
			t.name, t.description, t.timezone, t.is_active
		FROM dm3_access.user_access_times ua
		JOIN dm3_access.access_time_templates t ON ua.template_id = t.id
		WHERE ua.user_id = $1::uuid AND ua.company_id = $2::uuid
			AND (ua.effective_to IS NULL OR ua.effective_to >= CURRENT_DATE)
		ORDER BY ua.effective_from DESC
	`

	rows, err := h.db.Pool.Query(r.Context(), query, userID, companyID)
	if err != nil {
		slog.Error("failed to query user access times", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}
	defer rows.Close()

	var assignments []models.UserAccessTime
	for rows.Next() {
		var ua models.UserAccessTime
		var template models.AccessTimeTemplate
		
		err := rows.Scan(
			&ua.ID, &ua.CompanyID, &ua.UserID, &ua.TemplateID,
			&ua.EffectiveFrom, &ua.EffectiveTo, &ua.AssignedBy,
			&ua.CreatedAt, &ua.UpdatedAt,
			&template.Name, &template.Description, &template.Timezone, &template.IsActive,
		)
		if err != nil {
			slog.Error("failed to scan user access time", "error", err)
			i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.scan_error")
			return
		}
		
		template.ID = ua.TemplateID
		ua.Template = &template
		assignments = append(assignments, ua)
	}

	httputil.JSON(w, http.StatusOK, map[string]any{
		"user_id": userID,
		"assignments": assignments,
	})
}

// ─── Access Validation ──────────────────────────────────────────────────────

func (h *Handlers) ValidateAccess(w http.ResponseWriter, r *http.Request) {
	var req models.ValidateAccessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		i18n.ErrorResponse(w, r, http.StatusBadRequest, "validation.invalid_json")
		return
	}

	companyID := authsvc.CompanyIDFromContext(r.Context())
	
	// Get user's current access time template
	query := `
		SELECT
			ua.template_id, t.name, t.timezone, t.is_active
		FROM dm3_access.user_access_times ua
		JOIN dm3_access.access_time_templates t ON ua.template_id = t.id
		WHERE ua.user_id = $1::uuid AND ua.company_id = $2::uuid
			AND ua.effective_from <= $3
			AND (ua.effective_to IS NULL OR ua.effective_to >= $3)
			AND t.is_active = true
		ORDER BY ua.effective_from DESC
		LIMIT 1
	`

	var templateID, templateName, templateTimezone string
	var templateActive bool
	requestDate := req.RequestedTime.Format("2006-01-02")
	
	err := h.db.Pool.QueryRow(r.Context(), query, req.UserID, companyID, requestDate).Scan(
		&templateID, &templateName, &templateTimezone, &templateActive,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			// No access time assigned
			response := models.ValidateAccessResponse{
				IsAllowed: false,
				Reason:    "No access time template assigned",
			}
			h.logValidation(r.Context(), companyID, req.UserID, "", req.DoorID, req.RequestedTime, false, response.Reason, "")
			httputil.JSON(w, http.StatusOK, response)
			return
		}
		slog.Error("failed to get user access time", "error", err)
		i18n.ErrorResponse(w, r, http.StatusInternalServerError, "system.database_error")
		return
	}

	// Load timezone
	loc, err := time.LoadLocation(templateTimezone)
	if err != nil {
		loc = time.UTC // Fallback
	}

	// Convert requested time to template timezone
	localTime := req.RequestedTime.In(loc)
	dayOfWeek := int(localTime.Weekday()) // 0=Sunday, 6=Saturday
	timeOfDay := localTime.Format("15:04:05")

	// Check time slots for this day
	slotsQuery := `
		SELECT id, start_time, end_time, slot_name
		FROM dm3_access.access_time_slots 
		WHERE template_id = $1::uuid AND day_of_week = $2 AND is_active = true
			AND $3::time BETWEEN start_time AND end_time
		ORDER BY start_time
		LIMIT 1
	`

	var matchedSlotID, slotStartTime, slotEndTime string
	var slotName *string
	err = h.db.Pool.QueryRow(r.Context(), slotsQuery, templateID, dayOfWeek, timeOfDay).Scan(
		&matchedSlotID, &slotStartTime, &slotEndTime, &slotName,
	)

	response := models.ValidateAccessResponse{}
	
	if err == nil {
		// Access allowed
		response.IsAllowed = true
		response.Reason = fmt.Sprintf("Access allowed in %s slot (%s-%s)", 
			getSlotDisplayName(slotName), slotStartTime, slotEndTime)
		response.MatchedSlot = &models.AccessTimeSlot{
			ID:         matchedSlotID,
			TemplateID: templateID,
			DayOfWeek:  dayOfWeek,
			StartTime:  slotStartTime,
			EndTime:    slotEndTime,
			SlotName:   slotName,
		}
		response.Template = &models.AccessTimeTemplate{
			ID:       templateID,
			Name:     templateName,
			Timezone: templateTimezone,
		}
	} else {
		// Access denied
		response.IsAllowed = false
		response.Reason = fmt.Sprintf("Access denied: Time %s is outside allowed hours", timeOfDay)
		
		// Find next available slot
		nextSlotQuery := `
			SELECT start_time, day_of_week
			FROM dm3_access.access_time_slots 
			WHERE template_id = $1::uuid AND is_active = true
				AND (
					(day_of_week = $2 AND start_time > $3::time) OR
					(day_of_week > $2) OR
					(day_of_week < $2)
				)
			ORDER BY 
				CASE WHEN day_of_week = $2 AND start_time > $3::time THEN 0 ELSE 1 END,
				day_of_week,
				start_time
			LIMIT 1
		`
		var nextStart string
		var nextDay int
		if err := h.db.Pool.QueryRow(r.Context(), nextSlotQuery, templateID, dayOfWeek, timeOfDay).Scan(&nextStart, &nextDay); err == nil {
			// Calculate next allowed time
			nextDate := localTime
			if nextDay != dayOfWeek {
				daysToAdd := (nextDay - dayOfWeek + 7) % 7
				if daysToAdd == 0 {
					daysToAdd = 7 // Next week same day
				}
				nextDate = nextDate.AddDate(0, 0, daysToAdd)
			}
			
			nextTime, _ := time.ParseInLocation("15:04:05", nextStart, loc)
			nextAllowed := time.Date(nextDate.Year(), nextDate.Month(), nextDate.Day(),
				nextTime.Hour(), nextTime.Minute(), nextTime.Second(), 0, loc)
			response.NextAllowed = &nextAllowed
		}
	}

	// Log validation
	h.logValidation(r.Context(), companyID, req.UserID, templateID, req.DoorID, 
		req.RequestedTime, response.IsAllowed, response.Reason, matchedSlotID)

	httputil.JSON(w, http.StatusOK, response)
}

// ─── Stats & Analytics ──────────────────────────────────────────────────────

func (h *Handlers) GetAccessTimeStats(w http.ResponseWriter, r *http.Request) {
	companyID := authsvc.CompanyIDFromContext(r.Context())
	
	var stats models.AccessTimeStats
	
	// Get template stats
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT
			COUNT(*) FILTER (WHERE is_active = true) as active,
			COUNT(*) as total
		FROM dm3_access.access_time_templates
		WHERE company_id = $1::uuid
	`, companyID).Scan(&stats.TemplatesActive, &stats.TemplatesTotal)
	if err != nil {
		slog.Error("failed to get template stats", "error", err)
	}

	// Get user assignment stats
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT COUNT(DISTINCT user_id)
		FROM dm3_access.user_access_times
		WHERE company_id = $1::uuid
			AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
	`, companyID).Scan(&stats.UsersAssigned)
	if err != nil {
		slog.Error("failed to get user assignment stats", "error", err)
	}

	// Get validation stats for today
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT 
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE is_allowed = true) as allowed,
			COUNT(*) FILTER (WHERE is_allowed = false) as denied
		FROM dm3_access.access_time_validations
		WHERE company_id = $1::uuid 
			AND validation_time >= CURRENT_DATE
			AND validation_time < CURRENT_DATE + INTERVAL '1 day'
	`, companyID).Scan(&stats.ValidationsToday, &stats.ValidationsAllowed, &stats.ValidationsDenied)
	if err != nil {
		slog.Error("failed to get validation stats", "error", err)
	}

	httputil.JSON(w, http.StatusOK, stats)
}

// ─── Helper Functions ───────────────────────────────────────────────────────

func (h *Handlers) logValidation(ctx context.Context, companyID, userID, templateID string, doorID *string, requestedTime time.Time, isAllowed bool, reason, matchedSlotID string) {
	var templatePtr, doorPtr, slotPtr interface{}
	if templateID != "" {
		templatePtr = templateID
	}
	if doorID != nil && *doorID != "" {
		doorPtr = *doorID
	}
	if matchedSlotID != "" {
		slotPtr = matchedSlotID
	}

	_, err := h.db.Pool.Exec(ctx, `
		INSERT INTO dm3_access.access_time_validations
		(company_id, user_id, template_id, door_id, requested_time, is_allowed, reason, matched_slot_id)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid)
	`, companyID, userID, templatePtr, doorPtr, requestedTime, isAllowed, reason, slotPtr)
	if err != nil {
		slog.Error("failed to log access time validation", "error", err)
	}
}

func getSlotDisplayName(slotName *string) string {
	if slotName != nil && *slotName != "" {
		return *slotName
	}
	return "time"
}