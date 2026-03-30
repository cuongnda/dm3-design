package visitor

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Database operations for visitors

func (h *Handlers) getVisitors(ctx context.Context, tenantID uuid.UUID, query VisitorListQuery) ([]Visitor, int64, error) {
	var conditions []string
	var args []interface{}
	argCount := 1
	
	// Base query
	selectQuery := `
		SELECT id, tenant_id, visitor_type, first_name, last_name, email, phone, company,
		       id_number, vehicle_plate, purpose, host_id, host_name, host_email, host_phone,
		       status, photo_url, badge_printed, badge_number, scheduled_at, valid_from,
		       valid_until, checked_in_at, checked_out_at, checked_in_by, checked_out_by,
		       access_zones, metadata, notes, created_at, updated_at, created_by
		FROM dm3_visitor.visitors
		WHERE tenant_id = $1 AND deleted_at IS NULL
	`
	args = append(args, tenantID)
	argCount++
	
	// Add filters
	if query.Status != nil {
		conditions = append(conditions, fmt.Sprintf("status = $%d", argCount))
		args = append(args, *query.Status)
		argCount++
	}
	
	if query.HostID != nil {
		conditions = append(conditions, fmt.Sprintf("host_id = $%d", argCount))
		args = append(args, uuid.MustParse(*query.HostID))
		argCount++
	}
	
	if query.VisitorType != nil {
		conditions = append(conditions, fmt.Sprintf("visitor_type = $%d", argCount))
		args = append(args, *query.VisitorType)
		argCount++
	}
	
	if query.DateFrom != nil {
		conditions = append(conditions, fmt.Sprintf("created_at >= $%d", argCount))
		args = append(args, *query.DateFrom)
		argCount++
	}
	
	if query.DateTo != nil {
		conditions = append(conditions, fmt.Sprintf("created_at < $%d::date + interval '1 day'", argCount))
		args = append(args, *query.DateTo)
		argCount++
	}
	
	// Full text search
	if query.SearchTerm != nil {
		searchConditions := []string{
			fmt.Sprintf("first_name ILIKE $%d", argCount),
			fmt.Sprintf("last_name ILIKE $%d", argCount),
			fmt.Sprintf("email ILIKE $%d", argCount),
			fmt.Sprintf("company ILIKE $%d", argCount),
			fmt.Sprintf("purpose ILIKE $%d", argCount),
			fmt.Sprintf("host_name ILIKE $%d", argCount),
		}
		conditions = append(conditions, fmt.Sprintf("(%s)", strings.Join(searchConditions, " OR ")))
		args = append(args, "%"+*query.SearchTerm+"%")
		argCount++
	}
	
	// Build WHERE clause
	if len(conditions) > 0 {
		selectQuery += " AND " + strings.Join(conditions, " AND ")
	}
	
	// Count total (for pagination)
	countQuery := "SELECT COUNT(*) FROM dm3_visitor.visitors WHERE tenant_id = $1 AND deleted_at IS NULL"
	if len(conditions) > 0 {
		countQuery += " AND " + strings.Join(conditions, " AND ")
	}
	
	var total int64
	err := h.db.Pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	
	// Order and pagination
	orderBy := "created_at"
	orderDir := "DESC"
	
	if query.OrderBy != nil {
		switch *query.OrderBy {
		case "created_at", "first_name", "last_name", "status", "scheduled_at":
			orderBy = *query.OrderBy
		}
	}
	
	if query.OrderDir != nil && strings.ToUpper(*query.OrderDir) == "ASC" {
		orderDir = "ASC"
	}
	
	selectQuery += fmt.Sprintf(" ORDER BY %s %s", orderBy, orderDir)
	selectQuery += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argCount, argCount+1)
	args = append(args, query.Limit, query.Offset)
	
	// Execute query
	rows, err := h.db.Pool.Query(ctx, selectQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	
	var visitors []Visitor
	for rows.Next() {
		var visitor Visitor
		var accessZonesJSON, metadataJSON []byte
		
		err := rows.Scan(
			&visitor.ID, &visitor.TenantID, &visitor.VisitorType, &visitor.FirstName, &visitor.LastName,
			&visitor.Email, &visitor.Phone, &visitor.Company, &visitor.IDNumber, &visitor.VehiclePlate,
			&visitor.Purpose, &visitor.HostID, &visitor.HostName, &visitor.HostEmail, &visitor.HostPhone,
			&visitor.Status, &visitor.PhotoURL, &visitor.BadgePrinted, &visitor.BadgeNumber,
			&visitor.ScheduledAt, &visitor.ValidFrom, &visitor.ValidUntil, &visitor.CheckedInAt,
			&visitor.CheckedOutAt, &visitor.CheckedInBy, &visitor.CheckedOutBy, &accessZonesJSON,
			&metadataJSON, &visitor.Notes, &visitor.CreatedAt, &visitor.UpdatedAt, &visitor.CreatedBy,
		)
		if err != nil {
			continue
		}
		
		// Unmarshal JSON fields
		if len(accessZonesJSON) > 0 {
			json.Unmarshal(accessZonesJSON, &visitor.AccessZones)
		}
		if len(metadataJSON) > 0 {
			json.Unmarshal(metadataJSON, &visitor.Metadata)
		}
		
		visitors = append(visitors, visitor)
	}
	
	return visitors, total, nil
}

func (h *Handlers) getVisitor(ctx context.Context, tenantID, visitorID uuid.UUID) (*Visitor, error) {
	query := `
		SELECT id, tenant_id, visitor_type, first_name, last_name, email, phone, company,
		       id_number, vehicle_plate, purpose, host_id, host_name, host_email, host_phone,
		       status, photo_url, badge_printed, badge_number, scheduled_at, valid_from,
		       valid_until, checked_in_at, checked_out_at, checked_in_by, checked_out_by,
		       access_zones, metadata, notes, created_at, updated_at, created_by
		FROM dm3_visitor.visitors
		WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
	`
	
	var visitor Visitor
	var accessZonesJSON, metadataJSON []byte
	
	err := h.db.Pool.QueryRow(ctx, query, tenantID, visitorID).Scan(
		&visitor.ID, &visitor.TenantID, &visitor.VisitorType, &visitor.FirstName, &visitor.LastName,
		&visitor.Email, &visitor.Phone, &visitor.Company, &visitor.IDNumber, &visitor.VehiclePlate,
		&visitor.Purpose, &visitor.HostID, &visitor.HostName, &visitor.HostEmail, &visitor.HostPhone,
		&visitor.Status, &visitor.PhotoURL, &visitor.BadgePrinted, &visitor.BadgeNumber,
		&visitor.ScheduledAt, &visitor.ValidFrom, &visitor.ValidUntil, &visitor.CheckedInAt,
		&visitor.CheckedOutAt, &visitor.CheckedInBy, &visitor.CheckedOutBy, &accessZonesJSON,
		&metadataJSON, &visitor.Notes, &visitor.CreatedAt, &visitor.UpdatedAt, &visitor.CreatedBy,
	)
	
	if err != nil {
		return nil, err
	}
	
	// Unmarshal JSON fields
	if len(accessZonesJSON) > 0 {
		json.Unmarshal(accessZonesJSON, &visitor.AccessZones)
	}
	if len(metadataJSON) > 0 {
		json.Unmarshal(metadataJSON, &visitor.Metadata)
	}
	
	return &visitor, nil
}

func (h *Handlers) getVisitorByID(ctx context.Context, visitorID uuid.UUID) (*Visitor, error) {
	query := `
		SELECT id, tenant_id, visitor_type, first_name, last_name, email, phone, company,
		       id_number, vehicle_plate, purpose, host_id, host_name, host_email, host_phone,
		       status, photo_url, badge_printed, badge_number, scheduled_at, valid_from,
		       valid_until, checked_in_at, checked_out_at, checked_in_by, checked_out_by,
		       access_zones, metadata, notes, created_at, updated_at, created_by
		FROM dm3_visitor.visitors
		WHERE id = $1 AND deleted_at IS NULL
	`
	
	var visitor Visitor
	var accessZonesJSON, metadataJSON []byte
	
	err := h.db.Pool.QueryRow(ctx, query, visitorID).Scan(
		&visitor.ID, &visitor.TenantID, &visitor.VisitorType, &visitor.FirstName, &visitor.LastName,
		&visitor.Email, &visitor.Phone, &visitor.Company, &visitor.IDNumber, &visitor.VehiclePlate,
		&visitor.Purpose, &visitor.HostID, &visitor.HostName, &visitor.HostEmail, &visitor.HostPhone,
		&visitor.Status, &visitor.PhotoURL, &visitor.BadgePrinted, &visitor.BadgeNumber,
		&visitor.ScheduledAt, &visitor.ValidFrom, &visitor.ValidUntil, &visitor.CheckedInAt,
		&visitor.CheckedOutAt, &visitor.CheckedInBy, &visitor.CheckedOutBy, &accessZonesJSON,
		&metadataJSON, &visitor.Notes, &visitor.CreatedAt, &visitor.UpdatedAt, &visitor.CreatedBy,
	)
	
	if err != nil {
		return nil, err
	}
	
	// Unmarshal JSON fields
	if len(accessZonesJSON) > 0 {
		json.Unmarshal(accessZonesJSON, &visitor.AccessZones)
	}
	if len(metadataJSON) > 0 {
		json.Unmarshal(metadataJSON, &visitor.Metadata)
	}
	
	return &visitor, nil
}

func (h *Handlers) createVisitor(ctx context.Context, visitor *Visitor) error {
	accessZonesJSON, _ := json.Marshal(visitor.AccessZones)
	metadataJSON, _ := json.Marshal(visitor.Metadata)
	
	query := `
		INSERT INTO dm3_visitor.visitors 
		(id, tenant_id, visitor_type, first_name, last_name, email, phone, company,
		 id_number, vehicle_plate, purpose, host_id, host_name, host_email, host_phone,
		 status, photo_url, badge_printed, badge_number, scheduled_at, valid_from,
		 valid_until, checked_in_at, checked_out_at, checked_in_by, checked_out_by,
		 access_zones, metadata, notes, created_at, updated_at, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
		        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)
	`
	
	_, err := h.db.Pool.Exec(ctx, query,
		visitor.ID, visitor.TenantID, visitor.VisitorType, visitor.FirstName, visitor.LastName,
		visitor.Email, visitor.Phone, visitor.Company, visitor.IDNumber, visitor.VehiclePlate,
		visitor.Purpose, visitor.HostID, visitor.HostName, visitor.HostEmail, visitor.HostPhone,
		visitor.Status, visitor.PhotoURL, visitor.BadgePrinted, visitor.BadgeNumber,
		visitor.ScheduledAt, visitor.ValidFrom, visitor.ValidUntil, visitor.CheckedInAt,
		visitor.CheckedOutAt, visitor.CheckedInBy, visitor.CheckedOutBy, accessZonesJSON,
		metadataJSON, visitor.Notes, visitor.CreatedAt, visitor.UpdatedAt, visitor.CreatedBy,
	)
	
	return err
}

func (h *Handlers) updateVisitor(ctx context.Context, tenantID, visitorID uuid.UUID, req UpdateVisitorRequest) error {
	setParts := []string{}
	args := []interface{}{tenantID, visitorID}
	argCount := 3
	
	if req.VisitorType != nil {
		setParts = append(setParts, "visitor_type = $"+strconv.Itoa(argCount))
		args = append(args, *req.VisitorType)
		argCount++
	}
	
	if req.FirstName != nil {
		setParts = append(setParts, "first_name = $"+strconv.Itoa(argCount))
		args = append(args, *req.FirstName)
		argCount++
	}
	
	if req.LastName != nil {
		setParts = append(setParts, "last_name = $"+strconv.Itoa(argCount))
		args = append(args, *req.LastName)
		argCount++
	}
	
	if req.Email != nil {
		setParts = append(setParts, "email = $"+strconv.Itoa(argCount))
		args = append(args, *req.Email)
		argCount++
	}
	
	if req.Phone != nil {
		setParts = append(setParts, "phone = $"+strconv.Itoa(argCount))
		args = append(args, *req.Phone)
		argCount++
	}
	
	if req.Company != nil {
		setParts = append(setParts, "company = $"+strconv.Itoa(argCount))
		args = append(args, *req.Company)
		argCount++
	}
	
	if req.Purpose != nil {
		setParts = append(setParts, "purpose = $"+strconv.Itoa(argCount))
		args = append(args, *req.Purpose)
		argCount++
	}
	
	if req.ScheduledAt != nil {
		setParts = append(setParts, "scheduled_at = $"+strconv.Itoa(argCount))
		args = append(args, *req.ScheduledAt)
		argCount++
	}
	
	if req.ValidFrom != nil {
		setParts = append(setParts, "valid_from = $"+strconv.Itoa(argCount))
		args = append(args, *req.ValidFrom)
		argCount++
	}
	
	if req.ValidUntil != nil {
		setParts = append(setParts, "valid_until = $"+strconv.Itoa(argCount))
		args = append(args, *req.ValidUntil)
		argCount++
	}
	
	if req.AccessZones != nil {
		accessZonesJSON, _ := json.Marshal(*req.AccessZones)
		setParts = append(setParts, "access_zones = $"+strconv.Itoa(argCount))
		args = append(args, accessZonesJSON)
		argCount++
	}
	
	if req.Metadata != nil {
		metadataJSON, _ := json.Marshal(*req.Metadata)
		setParts = append(setParts, "metadata = $"+strconv.Itoa(argCount))
		args = append(args, metadataJSON)
		argCount++
	}
	
	if req.Notes != nil {
		setParts = append(setParts, "notes = $"+strconv.Itoa(argCount))
		args = append(args, *req.Notes)
		argCount++
	}
	
	if len(setParts) == 0 {
		return nil // Nothing to update
	}
	
	setParts = append(setParts, "updated_at = now()")
	
	query := `
		UPDATE dm3_visitor.visitors
		SET ` + strings.Join(setParts, ", ") + `
		WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
	`
	
	result, err := h.db.Pool.Exec(ctx, query, args...)
	if err != nil {
		return err
	}
	
	if result.RowsAffected() == 0 {
		return fmt.Errorf("no rows in result set")
	}
	
	return nil
}

func (h *Handlers) updateVisitorStatus(ctx context.Context, visitor *Visitor) error {
	query := `
		UPDATE dm3_visitor.visitors
		SET status = $3, checked_in_at = $4, checked_out_at = $5, 
		    checked_in_by = $6, checked_out_by = $7, badge_number = $8, 
		    badge_printed = $9, photo_url = $10, updated_at = $11
		WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
	`
	
	_, err := h.db.Pool.Exec(ctx, query,
		visitor.TenantID, visitor.ID, visitor.Status, visitor.CheckedInAt, visitor.CheckedOutAt,
		visitor.CheckedInBy, visitor.CheckedOutBy, visitor.BadgeNumber, visitor.BadgePrinted,
		visitor.PhotoURL, visitor.UpdatedAt,
	)
	
	return err
}

func (h *Handlers) updateVisitorBadgeStatus(ctx context.Context, visitor *Visitor) error {
	query := `
		UPDATE dm3_visitor.visitors
		SET badge_number = $3, badge_printed = $4, updated_at = $5
		WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
	`
	
	_, err := h.db.Pool.Exec(ctx, query,
		visitor.TenantID, visitor.ID, visitor.BadgeNumber, visitor.BadgePrinted, visitor.UpdatedAt,
	)
	
	return err
}

func (h *Handlers) deleteVisitor(ctx context.Context, tenantID, visitorID uuid.UUID) error {
	query := `
		UPDATE dm3_visitor.visitors
		SET deleted_at = now(), updated_at = now()
		WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
	`
	
	result, err := h.db.Pool.Exec(ctx, query, tenantID, visitorID)
	if err != nil {
		return err
	}
	
	if result.RowsAffected() == 0 {
		return fmt.Errorf("no rows in result set")
	}
	
	return nil
}

// Visitor host operations

func (h *Handlers) getVisitorHost(ctx context.Context, tenantID, hostID uuid.UUID) (*VisitorHost, error) {
	query := `
		SELECT id, tenant_id, person_id, name, email, phone, department, title,
		       max_visitors, can_approve, auto_approve, access_zones, active,
		       created_at, updated_at
		FROM dm3_visitor.visitor_hosts
		WHERE tenant_id = $1 AND id = $2 AND active = true
	`
	
	var host VisitorHost
	var accessZonesJSON []byte
	
	err := h.db.Pool.QueryRow(ctx, query, tenantID, hostID).Scan(
		&host.ID, &host.TenantID, &host.PersonID, &host.Name, &host.Email,
		&host.Phone, &host.Department, &host.Title, &host.MaxVisitors,
		&host.CanApprove, &host.AutoApprove, &accessZonesJSON, &host.Active,
		&host.CreatedAt, &host.UpdatedAt,
	)
	
	if err != nil {
		return nil, err
	}
	
	// Unmarshal access zones
	if len(accessZonesJSON) > 0 {
		json.Unmarshal(accessZonesJSON, &host.AccessZones)
	}
	
	return &host, nil
}

func (h *Handlers) getVisitorHostByEmail(ctx context.Context, tenantID uuid.UUID, email string) (*VisitorHost, error) {
	query := `
		SELECT id, tenant_id, person_id, name, email, phone, department, title,
		       max_visitors, can_approve, auto_approve, access_zones, active,
		       created_at, updated_at
		FROM dm3_visitor.visitor_hosts
		WHERE tenant_id = $1 AND email = $2 AND active = true
	`
	
	var host VisitorHost
	var accessZonesJSON []byte
	
	err := h.db.Pool.QueryRow(ctx, query, tenantID, email).Scan(
		&host.ID, &host.TenantID, &host.PersonID, &host.Name, &host.Email,
		&host.Phone, &host.Department, &host.Title, &host.MaxVisitors,
		&host.CanApprove, &host.AutoApprove, &accessZonesJSON, &host.Active,
		&host.CreatedAt, &host.UpdatedAt,
	)
	
	if err != nil {
		return nil, err
	}
	
	// Unmarshal access zones
	if len(accessZonesJSON) > 0 {
		json.Unmarshal(accessZonesJSON, &host.AccessZones)
	}
	
	return &host, nil
}

// Visitor settings operations

func (h *Handlers) getVisitorSettings(ctx context.Context, tenantID uuid.UUID) (*VisitorSettings, error) {
	query := `
		SELECT id, tenant_id, require_pre_registration, require_host_approval,
		       require_photo, require_id_verification, max_visit_duration,
		       default_valid_duration, auto_expire_visitors, badge_template,
		       welcome_message, checkout_required, notify_host_on_arrival,
		       notify_host_on_overstay, allow_walk_ins, created_at, updated_at
		FROM dm3_visitor.visitor_settings
		WHERE tenant_id = $1
	`
	
	var settings VisitorSettings
	err := h.db.Pool.QueryRow(ctx, query, tenantID).Scan(
		&settings.ID, &settings.TenantID, &settings.RequirePreRegistration,
		&settings.RequireHostApproval, &settings.RequirePhoto, &settings.RequireIDVerification,
		&settings.MaxVisitDuration, &settings.DefaultValidDuration, &settings.AutoExpireVisitors,
		&settings.BadgeTemplate, &settings.WelcomeMessage, &settings.CheckOutRequired,
		&settings.NotifyHostOnArrival, &settings.NotifyHostOnOverstay, &settings.AllowWalkIns,
		&settings.CreatedAt, &settings.UpdatedAt,
	)
	
	if err != nil {
		// Create default settings if not found
		if err.Error() == "no rows in result set" {
			return h.createDefaultVisitorSettings(ctx, tenantID)
		}
		return nil, err
	}
	
	return &settings, nil
}

func (h *Handlers) createDefaultVisitorSettings(ctx context.Context, tenantID uuid.UUID) (*VisitorSettings, error) {
	settings := DefaultVisitorSettings
	settings.ID = uuid.New()
	settings.TenantID = tenantID
	settings.CreatedAt = time.Now()
	settings.UpdatedAt = time.Now()
	
	query := `
		INSERT INTO dm3_visitor.visitor_settings 
		(id, tenant_id, require_pre_registration, require_host_approval,
		 require_photo, require_id_verification, max_visit_duration,
		 default_valid_duration, auto_expire_visitors, badge_template,
		 welcome_message, checkout_required, notify_host_on_arrival,
		 notify_host_on_overstay, allow_walk_ins, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
	`
	
	_, err := h.db.Pool.Exec(ctx, query,
		settings.ID, settings.TenantID, settings.RequirePreRegistration,
		settings.RequireHostApproval, settings.RequirePhoto, settings.RequireIDVerification,
		settings.MaxVisitDuration, settings.DefaultValidDuration, settings.AutoExpireVisitors,
		settings.BadgeTemplate, settings.WelcomeMessage, settings.CheckOutRequired,
		settings.NotifyHostOnArrival, settings.NotifyHostOnOverstay, settings.AllowWalkIns,
		settings.CreatedAt, settings.UpdatedAt,
	)
	
	if err != nil {
		return nil, err
	}
	
	return &settings, nil
}

func (h *Handlers) updateVisitorSettings(ctx context.Context, settings *VisitorSettings) error {
	query := `
		UPDATE dm3_visitor.visitor_settings
		SET require_pre_registration = $3, require_host_approval = $4,
		    require_photo = $5, require_id_verification = $6, max_visit_duration = $7,
		    default_valid_duration = $8, auto_expire_visitors = $9, badge_template = $10,
		    welcome_message = $11, checkout_required = $12, notify_host_on_arrival = $13,
		    notify_host_on_overstay = $14, allow_walk_ins = $15, updated_at = $16
		WHERE tenant_id = $1 AND id = $2
	`
	
	_, err := h.db.Pool.Exec(ctx, query,
		settings.TenantID, settings.ID, settings.RequirePreRegistration,
		settings.RequireHostApproval, settings.RequirePhoto, settings.RequireIDVerification,
		settings.MaxVisitDuration, settings.DefaultValidDuration, settings.AutoExpireVisitors,
		settings.BadgeTemplate, settings.WelcomeMessage, settings.CheckOutRequired,
		settings.NotifyHostOnArrival, settings.NotifyHostOnOverstay, settings.AllowWalkIns,
		settings.UpdatedAt,
	)
	
	return err
}

// Helper functions

func (h *Handlers) getTenantByCode(ctx context.Context, tenantCode string) (uuid.UUID, error) {
	query := `SELECT id FROM dm3_auth.companies WHERE code = $1 AND status = 'active'`
	
	var tenantID uuid.UUID
	err := h.db.Pool.QueryRow(ctx, query, tenantCode).Scan(&tenantID)
	if err != nil {
		return uuid.Nil, err
	}
	
	return tenantID, nil
}

func (h *Handlers) generateBadgeNumber(ctx context.Context, tenantID uuid.UUID) (string, error) {
	// Simple badge number generation - could be more sophisticated
	query := `
		SELECT COUNT(*) + 1 
		FROM dm3_visitor.visitors 
		WHERE tenant_id = $1 AND badge_printed = true AND deleted_at IS NULL
	`
	
	var nextNumber int
	err := h.db.Pool.QueryRow(ctx, query, tenantID).Scan(&nextNumber)
	if err != nil {
		return "", err
	}
	
	// Format: V-001, V-002, etc.
	return fmt.Sprintf("V-%03d", nextNumber), nil
}