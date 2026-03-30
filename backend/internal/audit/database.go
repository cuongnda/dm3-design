package audit

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
)

// storeAuditEvent stores an audit event with integrity chain hash
func (h *Handlers) storeAuditEvent(event *AuditEvent) error {
	ctx := context.Background()
	
	// Generate chain hash for integrity
	chainHash, err := h.generateChainHash(ctx, event)
	if err != nil {
		slog.Error("failed to generate chain hash", "error", err)
		// Continue storing without chain hash rather than failing
	} else {
		event.ChainHash = &chainHash
	}
	
	oldValueJSON, _ := json.Marshal(event.OldValue)
	newValueJSON, _ := json.Marshal(event.NewValue)
	metadataJSON, _ := json.Marshal(event.Metadata)
	
	query := `
		INSERT INTO dm3_audit.audit_events 
		(id, tenant_id, event_type, actor_id, actor_type, actor_name, action, resource,
		 resource_id, resource_name, old_value, new_value, ip_address, user_agent, 
		 session_id, result, error_msg, metadata, timestamp, chain_hash)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
	`
	
	_, err = h.db.Pool.Exec(ctx, query,
		event.ID, event.TenantID, event.EventType, event.ActorID, event.ActorType,
		event.ActorName, event.Action, event.Resource, event.ResourceID, event.ResourceName,
		oldValueJSON, newValueJSON, event.IPAddress, event.UserAgent, event.SessionID,
		event.Result, event.ErrorMsg, metadataJSON, event.Timestamp, event.ChainHash,
	)
	
	if err != nil {
		slog.Error("failed to store audit event", "error", err, "event_id", event.ID)
		return err
	}
	
	return nil
}

// generateChainHash creates an integrity chain hash based on previous event
func (h *Handlers) generateChainHash(ctx context.Context, event *AuditEvent) (string, error) {
	// Get the hash of the last event for this tenant
	var lastHash string
	query := `
		SELECT COALESCE(chain_hash, '') 
		FROM dm3_audit.audit_events 
		WHERE tenant_id = $1 
		ORDER BY timestamp DESC, id DESC 
		LIMIT 1
	`
	
	err := h.db.Pool.QueryRow(ctx, query, event.TenantID).Scan(&lastHash)
	if err != nil && err.Error() != "no rows in result set" {
		return "", err
	}
	
	// Create hash input: lastHash + event data
	eventData := fmt.Sprintf("%s|%s|%s|%s|%s|%s|%s|%s|%d",
		event.TenantID.String(),
		event.EventType,
		event.ActorType,
		event.Action,
		event.Resource,
		event.Result,
		event.Timestamp.Format(time.RFC3339Nano),
		lastHash,
		event.Timestamp.Unix(),
	)
	
	hash := sha256.Sum256([]byte(eventData))
	return hex.EncodeToString(hash[:]), nil
}

// getAuditEvents retrieves audit events with filtering and pagination
func (h *Handlers) getAuditEvents(ctx context.Context, query AuditEventQuery) ([]AuditEvent, int64, error) {
	var conditions []string
	var args []interface{}
	argCount := 1
	
	// Base query
	selectQuery := `
		SELECT id, tenant_id, event_type, actor_id, actor_type, actor_name, action, 
		       resource, resource_id, resource_name, old_value, new_value, ip_address, 
		       user_agent, session_id, result, error_msg, metadata, timestamp, chain_hash
		FROM dm3_audit.audit_events
		WHERE tenant_id = $1
	`
	args = append(args, query.TenantID)
	argCount++
	
	// Add filters
	if query.EventType != nil {
		conditions = append(conditions, fmt.Sprintf("event_type = $%d", argCount))
		args = append(args, *query.EventType)
		argCount++
	}
	
	if query.ActorID != nil {
		conditions = append(conditions, fmt.Sprintf("actor_id = $%d", argCount))
		args = append(args, uuid.MustParse(*query.ActorID))
		argCount++
	}
	
	if query.ActorType != nil {
		conditions = append(conditions, fmt.Sprintf("actor_type = $%d", argCount))
		args = append(args, *query.ActorType)
		argCount++
	}
	
	if query.Action != nil {
		conditions = append(conditions, fmt.Sprintf("action = $%d", argCount))
		args = append(args, *query.Action)
		argCount++
	}
	
	if query.Resource != nil {
		conditions = append(conditions, fmt.Sprintf("resource = $%d", argCount))
		args = append(args, *query.Resource)
		argCount++
	}
	
	if query.ResourceID != nil {
		conditions = append(conditions, fmt.Sprintf("resource_id = $%d", argCount))
		args = append(args, *query.ResourceID)
		argCount++
	}
	
	if query.Result != nil {
		conditions = append(conditions, fmt.Sprintf("result = $%d", argCount))
		args = append(args, *query.Result)
		argCount++
	}
	
	if query.IPAddress != nil {
		conditions = append(conditions, fmt.Sprintf("ip_address = $%d", argCount))
		args = append(args, *query.IPAddress)
		argCount++
	}
	
	if query.DateFrom != nil {
		conditions = append(conditions, fmt.Sprintf("timestamp >= $%d", argCount))
		args = append(args, *query.DateFrom)
		argCount++
	}
	
	if query.DateTo != nil {
		conditions = append(conditions, fmt.Sprintf("timestamp < $%d::date + interval '1 day'", argCount))
		args = append(args, *query.DateTo)
		argCount++
	}
	
	// Full text search
	if query.SearchTerm != nil {
		searchConditions := []string{
			fmt.Sprintf("actor_name ILIKE $%d", argCount),
			fmt.Sprintf("resource_name ILIKE $%d", argCount),
			fmt.Sprintf("action ILIKE $%d", argCount),
			fmt.Sprintf("error_msg ILIKE $%d", argCount),
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
	countQuery := "SELECT COUNT(*) FROM dm3_audit.audit_events WHERE tenant_id = $1"
	if len(conditions) > 0 {
		countQuery += " AND " + strings.Join(conditions, " AND ")
	}
	
	var total int64
	err := h.db.Pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	
	// Order and pagination
	orderBy := "timestamp"
	orderDir := "DESC"
	
	if query.OrderBy != nil {
		switch *query.OrderBy {
		case "timestamp", "action", "resource", "result":
			orderBy = *query.OrderBy
		}
	}
	
	if query.OrderDir != nil && strings.ToUpper(*query.OrderDir) == "ASC" {
		orderDir = "ASC"
	}
	
	selectQuery += fmt.Sprintf(" ORDER BY %s %s, id DESC", orderBy, orderDir)
	selectQuery += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argCount, argCount+1)
	args = append(args, query.Limit, query.Offset)
	
	// Execute query
	rows, err := h.db.Pool.Query(ctx, selectQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	
	var events []AuditEvent
	for rows.Next() {
		var event AuditEvent
		var oldValueJSON, newValueJSON, metadataJSON []byte
		
		err := rows.Scan(
			&event.ID, &event.TenantID, &event.EventType, &event.ActorID, &event.ActorType,
			&event.ActorName, &event.Action, &event.Resource, &event.ResourceID, &event.ResourceName,
			&oldValueJSON, &newValueJSON, &event.IPAddress, &event.UserAgent, &event.SessionID,
			&event.Result, &event.ErrorMsg, &metadataJSON, &event.Timestamp, &event.ChainHash,
		)
		if err != nil {
			slog.Error("failed to scan audit event", "error", err)
			continue
		}
		
		// Unmarshal JSON fields
		if len(oldValueJSON) > 0 {
			json.Unmarshal(oldValueJSON, &event.OldValue)
		}
		if len(newValueJSON) > 0 {
			json.Unmarshal(newValueJSON, &event.NewValue)
		}
		if len(metadataJSON) > 0 {
			json.Unmarshal(metadataJSON, &event.Metadata)
		}
		
		events = append(events, event)
	}
	
	return events, total, nil
}

// searchAuditEvents performs full-text search across audit events
func (h *Handlers) searchAuditEvents(ctx context.Context, tenantID uuid.UUID, searchTerm string, limit int) ([]AuditEvent, error) {
	query := `
		SELECT id, tenant_id, event_type, actor_id, actor_type, actor_name, action, 
		       resource, resource_id, resource_name, old_value, new_value, ip_address, 
		       user_agent, session_id, result, error_msg, metadata, timestamp, chain_hash
		FROM dm3_audit.audit_events
		WHERE tenant_id = $1 
		  AND (
		    actor_name ILIKE $2 OR
		    resource_name ILIKE $2 OR
		    action ILIKE $2 OR
		    resource ILIKE $2 OR
		    error_msg ILIKE $2 OR
		    metadata::text ILIKE $2
		  )
		ORDER BY timestamp DESC
		LIMIT $3
	`
	
	searchPattern := "%" + searchTerm + "%"
	rows, err := h.db.Pool.Query(ctx, query, tenantID, searchPattern, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var events []AuditEvent
	for rows.Next() {
		var event AuditEvent
		var oldValueJSON, newValueJSON, metadataJSON []byte
		
		err := rows.Scan(
			&event.ID, &event.TenantID, &event.EventType, &event.ActorID, &event.ActorType,
			&event.ActorName, &event.Action, &event.Resource, &event.ResourceID, &event.ResourceName,
			&oldValueJSON, &newValueJSON, &event.IPAddress, &event.UserAgent, &event.SessionID,
			&event.Result, &event.ErrorMsg, &metadataJSON, &event.Timestamp, &event.ChainHash,
		)
		if err != nil {
			slog.Error("failed to scan audit event", "error", err)
			continue
		}
		
		// Unmarshal JSON fields
		json.Unmarshal(oldValueJSON, &event.OldValue)
		json.Unmarshal(newValueJSON, &event.NewValue)
		json.Unmarshal(metadataJSON, &event.Metadata)
		
		events = append(events, event)
	}
	
	return events, nil
}

// getAllTenants gets all tenant IDs for integrity checks
func (h *Handlers) getAllTenants(ctx context.Context) ([]uuid.UUID, error) {
	query := `SELECT DISTINCT tenant_id FROM dm3_audit.audit_events`
	
	rows, err := h.db.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var tenants []uuid.UUID
	for rows.Next() {
		var tenantID uuid.UUID
		if err := rows.Scan(&tenantID); err != nil {
			slog.Error("failed to scan tenant ID", "error", err)
			continue
		}
		tenants = append(tenants, tenantID)
	}
	
	return tenants, nil
}

// storeIntegrityCheckpoint stores an integrity verification checkpoint
func (h *Handlers) storeIntegrityCheckpoint(ctx context.Context, checkpoint *IntegrityCheckpoint) error {
	query := `
		INSERT INTO dm3_audit.integrity_checkpoints 
		(id, tenant_id, last_event_id, event_count, chain_hash, verified_at, verified_by, status, error_details)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	
	_, err := h.db.Pool.Exec(ctx, query,
		checkpoint.ID, checkpoint.TenantID, checkpoint.LastEventID, checkpoint.EventCount,
		checkpoint.ChainHash, checkpoint.VerifiedAt, checkpoint.VerifiedBy, checkpoint.Status,
		checkpoint.ErrorDetails,
	)
	
	return err
}

// verifyAuditIntegrity verifies the integrity of the audit chain
func (h *Handlers) verifyAuditIntegrity(ctx context.Context, tenantID uuid.UUID) (*IntegrityResult, error) {
	// Get all events for tenant ordered by timestamp
	query := `
		SELECT id, tenant_id, event_type, actor_type, action, resource, result, timestamp, chain_hash
		FROM dm3_audit.audit_events
		WHERE tenant_id = $1
		ORDER BY timestamp ASC, id ASC
	`
	
	rows, err := h.db.Pool.Query(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var events []struct {
		ID        uuid.UUID
		TenantID  uuid.UUID
		EventType string
		ActorType string
		Action    string
		Resource  string
		Result    string
		Timestamp time.Time
		ChainHash *string
	}
	
	for rows.Next() {
		var event struct {
			ID        uuid.UUID
			TenantID  uuid.UUID
			EventType string
			ActorType string
			Action    string
			Resource  string
			Result    string
			Timestamp time.Time
			ChainHash *string
		}
		
		err := rows.Scan(
			&event.ID, &event.TenantID, &event.EventType, &event.ActorType,
			&event.Action, &event.Resource, &event.Result, &event.Timestamp, &event.ChainHash,
		)
		if err != nil {
			return nil, err
		}
		
		events = append(events, event)
	}
	
	if len(events) == 0 {
		return &IntegrityResult{
			IsValid:       true,
			EventsChecked: 0,
			ActualHash:    "",
		}, nil
	}
	
	// Verify chain integrity
	var lastHash string
	for i, event := range events {
		// Calculate expected hash
		eventData := fmt.Sprintf("%s|%s|%s|%s|%s|%s|%s|%d",
			event.TenantID.String(),
			event.EventType,
			event.ActorType,
			event.Action,
			event.Resource,
			event.Result,
			event.Timestamp.Format(time.RFC3339Nano),
			lastHash,
			event.Timestamp.Unix(),
		)
		
		hash := sha256.Sum256([]byte(eventData))
		expectedHash := hex.EncodeToString(hash[:])
		
		// Compare with stored hash
		if event.ChainHash != nil && *event.ChainHash != expectedHash {
			return &IntegrityResult{
				IsValid:       false,
				EventsChecked: int64(i + 1),
				LastEventID:   event.ID,
				ExpectedHash:  expectedHash,
				ActualHash:    *event.ChainHash,
				ErrorDetails:  fmt.Sprintf("Hash mismatch at event %s", event.ID.String()),
			}, nil
		}
		
		if event.ChainHash != nil {
			lastHash = *event.ChainHash
		}
	}
	
	lastEvent := events[len(events)-1]
	return &IntegrityResult{
		IsValid:       true,
		EventsChecked: int64(len(events)),
		LastEventID:   lastEvent.ID,
		ActualHash:    lastHash,
	}, nil
}

type IntegrityResult struct {
	IsValid       bool      `json:"is_valid"`
	EventsChecked int64     `json:"events_checked"`
	LastEventID   uuid.UUID `json:"last_event_id"`
	ExpectedHash  string    `json:"expected_hash,omitempty"`
	ActualHash    string    `json:"actual_hash"`
	ErrorDetails  string    `json:"error_details,omitempty"`
}