package attend

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"duall-master/pkg/db"
	"duall-master/pkg/httputil"
	"duall-master/pkg/natsutil"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/nats-io/nats.go"
)

type Handlers struct {
	db   *db.DB
	nats *nats.Conn
}

func NewHandlers(database *db.DB, nc *nats.Conn) *Handlers {
	return &Handlers{
		db:   database,
		nats: nc,
	}
}

// ListAttendance retrieves attendance records with filtering
func (h *Handlers) ListAttendance(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	query := AttendanceListQuery{
		Limit:  50,
		Offset: 0,
	}
	
	// Parse query parameters
	if limit := r.URL.Query().Get("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 1000 {
			query.Limit = l
		}
	}
	
	if offset := r.URL.Query().Get("offset"); offset != "" {
		if o, err := strconv.Atoi(offset); err == nil && o >= 0 {
			query.Offset = o
		}
	}
	
	if personID := r.URL.Query().Get("person_id"); personID != "" {
		query.PersonID = &personID
	}
	
	if shiftID := r.URL.Query().Get("shift_id"); shiftID != "" {
		query.ShiftID = &shiftID
	}
	
	if status := r.URL.Query().Get("status"); status != "" {
		query.Status = &status
	}
	
	if dateFrom := r.URL.Query().Get("date_from"); dateFrom != "" {
		query.DateFrom = &dateFrom
	}
	
	if dateTo := r.URL.Query().Get("date_to"); dateTo != "" {
		query.DateTo = &dateTo
	}
	
	if department := r.URL.Query().Get("department"); department != "" {
		query.Department = &department
	}
	
	if orderBy := r.URL.Query().Get("order_by"); orderBy != "" {
		query.OrderBy = &orderBy
	}
	
	if orderDir := r.URL.Query().Get("order_dir"); orderDir != "" {
		query.OrderDir = &orderDir
	}
	
	attendance, total, err := h.getAttendanceRecords(r.Context(), tenantID, query)
	if err != nil {
		slog.Error("failed to get attendance records", "error", err)
		httputil.Error(w, "failed to get attendance records", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, map[string]interface{}{
		"attendance": attendance,
		"total":      total,
		"limit":      query.Limit,
		"offset":     query.Offset,
	})
}

// CreateAttendance creates a manual attendance record
func (h *Handlers) CreateAttendance(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	createdBy := h.getUserID(r)
	
	var req struct {
		PersonID        uuid.UUID              `json:"person_id" validate:"required"`
		Date            time.Time              `json:"date" validate:"required"`
		ShiftID         *uuid.UUID             `json:"shift_id,omitempty"`
		ClockInTime     *time.Time             `json:"clock_in_time,omitempty"`
		ClockOutTime    *time.Time             `json:"clock_out_time,omitempty"`
		BreakMinutes    int                    `json:"break_minutes"`
		Status          string                 `json:"status"`
		Notes           *string                `json:"notes,omitempty"`
		Metadata        map[string]interface{} `json:"metadata,omitempty"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	attendance := &AttendanceRecord{
		ID:             uuid.New(),
		TenantID:       tenantID,
		PersonID:       req.PersonID,
		Date:           req.Date,
		ShiftID:        req.ShiftID,
		ClockInTime:    req.ClockInTime,
		ClockOutTime:   req.ClockOutTime,
		ClockInMethod:  stringPtr(ClockMethodManual),
		ClockOutMethod: stringPtr(ClockMethodManual),
		BreakMinutes:   req.BreakMinutes,
		Status:         req.Status,
		ApprovalStatus: ApprovalStatusPending,
		Notes:          req.Notes,
		Metadata:       req.Metadata,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}
	
	// Calculate worked minutes
	h.calculateAttendanceMetrics(attendance)
	
	// Get person name
	if personName, err := h.getPersonName(r.Context(), tenantID, req.PersonID); err == nil {
		attendance.PersonName = personName
	}
	
	// Get shift name if assigned
	if req.ShiftID != nil {
		if shift, err := h.getShift(r.Context(), tenantID, *req.ShiftID); err == nil {
			attendance.ShiftName = &shift.Name
		}
	}
	
	if err := h.createAttendanceRecord(r.Context(), attendance); err != nil {
		slog.Error("failed to create attendance record", "error", err)
		httputil.Error(w, "failed to create attendance record", http.StatusInternalServerError)
		return
	}
	
	// Publish attendance event
	go h.publishAttendanceEvent(attendance, "created")
	
	httputil.JSON(w, attendance)
}

// GetAttendance retrieves a single attendance record
func (h *Handlers) GetAttendance(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	attendanceID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	attendance, err := h.getAttendanceRecord(r.Context(), tenantID, attendanceID)
	if err != nil {
		if err.Error() == "no rows in result set" {
			httputil.Error(w, "attendance record not found", http.StatusNotFound)
			return
		}
		slog.Error("failed to get attendance record", "error", err)
		httputil.Error(w, "failed to get attendance record", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, attendance)
}

// ClockIn handles employee clock in
func (h *Handlers) ClockIn(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req ClockInRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	clockTime := time.Now()
	if req.Timestamp != nil {
		clockTime = *req.Timestamp
	}
	
	// Check if person is already clocked in today
	if existing, _ := h.getTodayAttendanceRecord(r.Context(), tenantID, req.PersonID); existing != nil && existing.ClockInTime != nil {
		httputil.Error(w, "already clocked in today", http.StatusBadRequest)
		return
	}
	
	attendance, err := h.processClockIn(r.Context(), tenantID, req, clockTime)
	if err != nil {
		slog.Error("failed to process clock in", "error", err)
		httputil.Error(w, "failed to clock in", http.StatusInternalServerError)
		return
	}
	
	// Publish event
	go h.publishAttendanceEvent(attendance, "clock_in")
	
	httputil.JSON(w, map[string]interface{}{
		"attendance_id": attendance.ID,
		"status":        "clocked_in",
		"clock_in_time": attendance.ClockInTime,
		"message":       "Successfully clocked in",
	})
}

// ClockOut handles employee clock out
func (h *Handlers) ClockOut(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req ClockOutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	clockTime := time.Now()
	if req.Timestamp != nil {
		clockTime = *req.Timestamp
	}
	
	// Get today's attendance record
	attendance, err := h.getTodayAttendanceRecord(r.Context(), tenantID, req.PersonID)
	if err != nil || attendance == nil {
		httputil.Error(w, "no clock in record found for today", http.StatusBadRequest)
		return
	}
	
	if attendance.ClockOutTime != nil {
		httputil.Error(w, "already clocked out today", http.StatusBadRequest)
		return
	}
	
	attendance, err = h.processClockOut(r.Context(), attendance, req, clockTime)
	if err != nil {
		slog.Error("failed to process clock out", "error", err)
		httputil.Error(w, "failed to clock out", http.StatusInternalServerError)
		return
	}
	
	// Publish event
	go h.publishAttendanceEvent(attendance, "clock_out")
	
	httputil.JSON(w, map[string]interface{}{
		"attendance_id":  attendance.ID,
		"status":         "clocked_out",
		"clock_out_time": attendance.ClockOutTime,
		"worked_minutes": attendance.WorkedMinutes,
		"message":        "Successfully clocked out",
	})
}

// StartBreak handles break start
func (h *Handlers) StartBreak(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req BreakRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	// Get today's attendance record
	attendance, err := h.getTodayAttendanceRecord(r.Context(), tenantID, req.PersonID)
	if err != nil || attendance == nil || attendance.ClockInTime == nil {
		httputil.Error(w, "must be clocked in to start break", http.StatusBadRequest)
		return
	}
	
	// Check if already on break
	if activeBreak, _ := h.getActiveBreak(r.Context(), tenantID, req.PersonID); activeBreak != nil {
		httputil.Error(w, "already on break", http.StatusBadRequest)
		return
	}
	
	breakRecord := &BreakRecord{
		ID:           uuid.New(),
		TenantID:     tenantID,
		AttendanceID: attendance.ID,
		PersonID:     req.PersonID,
		BreakType:    req.BreakType,
		StartTime:    time.Now(),
		IsPaid:       req.BreakType == BreakTypeLunch, // configurable
		CreatedAt:    time.Now(),
	}
	
	if err := h.createBreakRecord(r.Context(), breakRecord); err != nil {
		slog.Error("failed to start break", "error", err)
		httputil.Error(w, "failed to start break", http.StatusInternalServerError)
		return
	}
	
	// Publish event
	go h.publishBreakEvent(breakRecord, "break_start")
	
	httputil.JSON(w, map[string]interface{}{
		"break_id":    breakRecord.ID,
		"status":      "break_started",
		"start_time":  breakRecord.StartTime,
		"break_type":  breakRecord.BreakType,
	})
}

// EndBreak handles break end
func (h *Handlers) EndBreak(w http.ResponseWriter, r *http.Request) {
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	
	var req BreakRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	// Get active break
	breakRecord, err := h.getActiveBreak(r.Context(), tenantID, req.PersonID)
	if err != nil || breakRecord == nil {
		httputil.Error(w, "no active break found", http.StatusBadRequest)
		return
	}
	
	endTime := time.Now()
	duration := int(endTime.Sub(breakRecord.StartTime).Minutes())
	
	breakRecord.EndTime = &endTime
	breakRecord.Minutes = duration
	
	if err := h.endBreakRecord(r.Context(), breakRecord); err != nil {
		slog.Error("failed to end break", "error", err)
		httputil.Error(w, "failed to end break", http.StatusInternalServerError)
		return
	}
	
	// Update attendance record with break minutes
	attendance, err := h.getAttendanceRecord(r.Context(), tenantID, breakRecord.AttendanceID)
	if err == nil {
		attendance.BreakMinutes += duration
		h.calculateAttendanceMetrics(attendance)
		h.updateAttendanceRecord(r.Context(), attendance)
	}
	
	// Publish event
	go h.publishBreakEvent(breakRecord, "break_end")
	
	httputil.JSON(w, map[string]interface{}{
		"break_id":      breakRecord.ID,
		"status":        "break_ended",
		"end_time":      breakRecord.EndTime,
		"duration_minutes": breakRecord.Minutes,
	})
}

// ApproveAttendance approves an attendance record
func (h *Handlers) ApproveAttendance(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	attendanceID := uuid.MustParse(vars["id"])
	tenantID := uuid.MustParse(r.Header.Get("X-Tenant-ID"))
	approvedBy := h.getUserID(r)
	
	if approvedBy == nil {
		httputil.Error(w, "user ID required for approval", http.StatusBadRequest)
		return
	}
	
	attendance, err := h.getAttendanceRecord(r.Context(), tenantID, attendanceID)
	if err != nil {
		httputil.Error(w, "attendance record not found", http.StatusNotFound)
		return
	}
	
	if attendance.ApprovalStatus == ApprovalStatusApproved {
		httputil.Error(w, "already approved", http.StatusBadRequest)
		return
	}
	
	now := time.Now()
	attendance.ApprovalStatus = ApprovalStatusApproved
	attendance.ApprovedBy = approvedBy
	attendance.ApprovedAt = &now
	attendance.UpdatedAt = now
	
	if err := h.updateAttendanceRecord(r.Context(), attendance); err != nil {
		slog.Error("failed to approve attendance", "error", err)
		httputil.Error(w, "failed to approve attendance", http.StatusInternalServerError)
		return
	}
	
	httputil.JSON(w, attendance)
}

// PublicClockIn allows clocking in without auth (for kiosks/mobile)
func (h *Handlers) PublicClockIn(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantCode string                 `json:"tenant_code" validate:"required"`
		PersonCode string                 `json:"person_code" validate:"required"` // employee ID or badge
		Method     string                 `json:"method"`
		Location   *string                `json:"location,omitempty"`
		DeviceID   *string                `json:"device_id,omitempty"`
		Metadata   map[string]interface{} `json:"metadata,omitempty"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	// Get tenant by code
	tenantID, err := h.getTenantByCode(r.Context(), req.TenantCode)
	if err != nil {
		httputil.Error(w, "invalid tenant code", http.StatusBadRequest)
		return
	}
	
	// Get person by employee code
	personID, err := h.getPersonByCode(r.Context(), tenantID, req.PersonCode)
	if err != nil {
		httputil.Error(w, "invalid employee code", http.StatusBadRequest)
		return
	}
	
	clockRequest := ClockInRequest{
		PersonID: personID,
		Method:   req.Method,
		Location: req.Location,
		DeviceID: req.DeviceID,
		Metadata: req.Metadata,
	}
	
	clockTime := time.Now()
	
	// Check if already clocked in
	if existing, _ := h.getTodayAttendanceRecord(r.Context(), tenantID, personID); existing != nil && existing.ClockInTime != nil {
		httputil.Error(w, "already clocked in today", http.StatusBadRequest)
		return
	}
	
	attendance, err := h.processClockIn(r.Context(), tenantID, clockRequest, clockTime)
	if err != nil {
		slog.Error("failed to process public clock in", "error", err)
		httputil.Error(w, "failed to clock in", http.StatusInternalServerError)
		return
	}
	
	// Publish event
	go h.publishAttendanceEvent(attendance, "clock_in")
	
	httputil.JSON(w, map[string]interface{}{
		"status":        "success",
		"clock_in_time": attendance.ClockInTime,
		"person_name":   attendance.PersonName,
		"message":       "Successfully clocked in",
	})
}

// PublicClockOut allows clocking out without auth
func (h *Handlers) PublicClockOut(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantCode string                 `json:"tenant_code" validate:"required"`
		PersonCode string                 `json:"person_code" validate:"required"`
		Method     string                 `json:"method"`
		Location   *string                `json:"location,omitempty"`
		DeviceID   *string                `json:"device_id,omitempty"`
		Metadata   map[string]interface{} `json:"metadata,omitempty"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	
	// Get tenant and person
	tenantID, err := h.getTenantByCode(r.Context(), req.TenantCode)
	if err != nil {
		httputil.Error(w, "invalid tenant code", http.StatusBadRequest)
		return
	}
	
	personID, err := h.getPersonByCode(r.Context(), tenantID, req.PersonCode)
	if err != nil {
		httputil.Error(w, "invalid employee code", http.StatusBadRequest)
		return
	}
	
	// Get today's attendance record
	attendance, err := h.getTodayAttendanceRecord(r.Context(), tenantID, personID)
	if err != nil || attendance == nil || attendance.ClockInTime == nil {
		httputil.Error(w, "no clock in record found for today", http.StatusBadRequest)
		return
	}
	
	if attendance.ClockOutTime != nil {
		httputil.Error(w, "already clocked out today", http.StatusBadRequest)
		return
	}
	
	clockRequest := ClockOutRequest{
		PersonID: personID,
		Method:   req.Method,
		Location: req.Location,
		DeviceID: req.DeviceID,
		Metadata: req.Metadata,
	}
	
	clockTime := time.Now()
	
	attendance, err = h.processClockOut(r.Context(), attendance, clockRequest, clockTime)
	if err != nil {
		slog.Error("failed to process public clock out", "error", err)
		httputil.Error(w, "failed to clock out", http.StatusInternalServerError)
		return
	}
	
	// Publish event
	go h.publishAttendanceEvent(attendance, "clock_out")
	
	httputil.JSON(w, map[string]interface{}{
		"status":         "success",
		"clock_out_time": attendance.ClockOutTime,
		"person_name":    attendance.PersonName,
		"worked_hours":   float64(attendance.WorkedMinutes) / 60.0,
		"message":        "Successfully clocked out",
	})
}

// GetAttendanceStatus returns current attendance status for a person
func (h *Handlers) GetAttendanceStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	personID := uuid.MustParse(vars["person_id"])
	
	// Get tenant from query param for public endpoint
	tenantCode := r.URL.Query().Get("tenant_code")
	if tenantCode == "" {
		httputil.Error(w, "tenant_code required", http.StatusBadRequest)
		return
	}
	
	tenantID, err := h.getTenantByCode(r.Context(), tenantCode)
	if err != nil {
		httputil.Error(w, "invalid tenant code", http.StatusBadRequest)
		return
	}
	
	attendance, err := h.getTodayAttendanceRecord(r.Context(), tenantID, personID)
	if err != nil {
		httputil.Error(w, "no attendance record found", http.StatusNotFound)
		return
	}
	
	status := "not_clocked_in"
	var workingMinutes *int
	var activeBreak *BreakRecord
	
	if attendance != nil {
		if attendance.ClockOutTime != nil {
			status = "clocked_out"
			workingMinutes = &attendance.WorkedMinutes
		} else if attendance.ClockInTime != nil {
			// Check if on break
			if activeBreak, _ = h.getActiveBreak(r.Context(), tenantID, personID); activeBreak != nil {
				status = "on_break"
			} else {
				status = "clocked_in"
			}
			
			// Calculate current working minutes
			current := int(time.Since(*attendance.ClockInTime).Minutes()) - attendance.BreakMinutes
			workingMinutes = &current
		}
	}
	
	response := map[string]interface{}{
		"person_id":       personID,
		"status":          status,
		"working_minutes": workingMinutes,
		"date":            time.Now().Format("2006-01-02"),
	}
	
	if attendance != nil {
		response["clock_in_time"] = attendance.ClockInTime
		response["clock_out_time"] = attendance.ClockOutTime
		response["break_minutes"] = attendance.BreakMinutes
	}
	
	if activeBreak != nil {
		response["break_start_time"] = activeBreak.StartTime
		response["break_type"] = activeBreak.BreakType
		response["break_duration_minutes"] = int(time.Since(activeBreak.StartTime).Minutes())
	}
	
	httputil.JSON(w, response)
}

// Helper methods

func (h *Handlers) getUserID(r *http.Request) *uuid.UUID {
	userIDStr := r.Header.Get("X-User-ID")
	if userIDStr == "" {
		return nil
	}
	
	if userID, err := uuid.Parse(userIDStr); err == nil {
		return &userID
	}
	
	return nil
}

func stringPtr(s string) *string {
	return &s
}