package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Report generation functions

func (h *Handlers) generateActivityReport(ctx context.Context, req ActivityReportRequest) (map[string]interface{}, error) {
	// Activity report - shows user activity patterns
	query := `
		SELECT 
			DATE_TRUNC('day', timestamp) as period,
			actor_id,
			actor_name,
			actor_type,
			COUNT(*) as activity_count,
			COUNT(DISTINCT action) as unique_actions,
			COUNT(DISTINCT resource) as unique_resources,
			COUNT(*) FILTER (WHERE result = 'failure') as failure_count
		FROM dm3_audit.audit_events
		WHERE tenant_id = $1
		  AND timestamp >= $2::date
		  AND timestamp < $3::date + interval '1 day'
	`
	
	args := []interface{}{req.TenantID, req.DateFrom, req.DateTo}
	argCount := 4
	
	if req.ActorID != nil {
		query += ` AND actor_id = $` + strconv.Itoa(argCount)
		args = append(args, uuid.MustParse(*req.ActorID))
		argCount++
	}
	
	if req.ActorType != nil {
		query += ` AND actor_type = $` + strconv.Itoa(argCount)
		args = append(args, *req.ActorType)
		argCount++
	}
	
	groupBy := "day"
	if req.GroupBy != nil {
		switch *req.GroupBy {
		case "hour":
			groupBy = "hour"
			query = query[:len(query)-len("DATE_TRUNC('day', timestamp)")] + "DATE_TRUNC('hour', timestamp)" + query[len(query)-len("as period"):]
		case "actor":
			groupBy = "actor"
		case "resource":
			groupBy = "resource"
		}
	}
	
	query += `
		GROUP BY period, actor_id, actor_name, actor_type
		ORDER BY period DESC, activity_count DESC
		LIMIT 1000
	`
	
	rows, err := h.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var activities []map[string]interface{}
	var totalEvents int64
	var totalFailures int64
	actorMap := make(map[uuid.UUID]string)
	
	for rows.Next() {
		var period time.Time
		var actorID *uuid.UUID
		var actorName *string
		var actorType string
		var activityCount, uniqueActions, uniqueResources, failureCount int64
		
		err := rows.Scan(&period, &actorID, &actorName, &actorType, &activityCount, &uniqueActions, &uniqueResources, &failureCount)
		if err != nil {
			continue
		}
		
		totalEvents += activityCount
		totalFailures += failureCount
		
		if actorID != nil && actorName != nil {
			actorMap[*actorID] = *actorName
		}
		
		activity := map[string]interface{}{
			"period":           period.Format("2006-01-02 15:04:05"),
			"actor_id":         actorID,
			"actor_name":       actorName,
			"actor_type":       actorType,
			"activity_count":   activityCount,
			"unique_actions":   uniqueActions,
			"unique_resources": uniqueResources,
			"failure_count":    failureCount,
		}
		
		activities = append(activities, activity)
	}
	
	// Calculate summary statistics
	summary := map[string]interface{}{
		"total_events":    totalEvents,
		"total_failures":  totalFailures,
		"unique_actors":   len(actorMap),
		"success_rate":    float64(totalEvents-totalFailures) / float64(totalEvents) * 100,
		"period_from":     req.DateFrom,
		"period_to":       req.DateTo,
		"group_by":        groupBy,
	}
	
	return map[string]interface{}{
		"summary":    summary,
		"activities": activities,
	}, nil
}

func (h *Handlers) generateAccessReport(ctx context.Context, req AccessReportRequest) (map[string]interface{}, error) {
	// Access report - shows door access patterns
	query := `
		SELECT 
			DATE_TRUNC('day', timestamp) as period,
			resource_id as door_id,
			resource_name as door_name,
			actor_id as person_id,
			actor_name as person_name,
			action as decision,
			COUNT(*) as access_count,
			metadata
		FROM dm3_audit.audit_events
		WHERE tenant_id = $1
		  AND timestamp >= $2::date
		  AND timestamp < $3::date + interval '1 day'
		  AND event_type = 'access'
		  AND resource = 'door'
	`
	
	args := []interface{}{req.TenantID, req.DateFrom, req.DateTo}
	argCount := 4
	
	if req.DoorID != nil {
		query += ` AND resource_id = $` + strconv.Itoa(argCount)
		args = append(args, *req.DoorID)
		argCount++
	}
	
	if req.PersonID != nil {
		query += ` AND actor_id = $` + strconv.Itoa(argCount)
		args = append(args, uuid.MustParse(*req.PersonID))
		argCount++
	}
	
	if req.Decision != nil {
		query += ` AND action = $` + strconv.Itoa(argCount)
		args = append(args, *req.Decision)
		argCount++
	}
	
	if !req.IncludeDenied {
		query += ` AND action = 'granted'`
	}
	
	query += `
		GROUP BY period, resource_id, resource_name, actor_id, actor_name, action, metadata
		ORDER BY period DESC, access_count DESC
		LIMIT 5000
	`
	
	rows, err := h.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var accesses []map[string]interface{}
	var totalAccesses int64
	var grantedCount int64
	var deniedCount int64
	doorMap := make(map[string]int64)
	personMap := make(map[string]int64)
	
	for rows.Next() {
		var period time.Time
		var doorID, doorName, personID, personName, decision *string
		var accessCount int64
		var metadataJSON []byte
		
		err := rows.Scan(&period, &doorID, &doorName, &personID, &personName, &decision, &accessCount, &metadataJSON)
		if err != nil {
			continue
		}
		
		totalAccesses += accessCount
		
		if decision != nil {
			if *decision == "granted" {
				grantedCount += accessCount
			} else if *decision == "denied" {
				deniedCount += accessCount
			}
		}
		
		if doorID != nil {
			doorMap[*doorID] += accessCount
		}
		
		if personID != nil {
			personMap[*personID] += accessCount
		}
		
		var metadata map[string]interface{}
		if len(metadataJSON) > 0 {
			json.Unmarshal(metadataJSON, &metadata)
		}
		
		access := map[string]interface{}{
			"period":      period.Format("2006-01-02"),
			"door_id":     doorID,
			"door_name":   doorName,
			"person_id":   personID,
			"person_name": personName,
			"decision":    decision,
			"count":       accessCount,
			"metadata":    metadata,
		}
		
		accesses = append(accesses, access)
	}
	
	// Top doors and people
	topDoors := make([]map[string]interface{}, 0, 10)
	for doorID, count := range doorMap {
		topDoors = append(topDoors, map[string]interface{}{
			"door_id": doorID,
			"count":   count,
		})
	}
	
	topPeople := make([]map[string]interface{}, 0, 10)
	for personID, count := range personMap {
		topPeople = append(topPeople, map[string]interface{}{
			"person_id": personID,
			"count":     count,
		})
	}
	
	summary := map[string]interface{}{
		"total_accesses":  totalAccesses,
		"granted_count":   grantedCount,
		"denied_count":    deniedCount,
		"unique_doors":    len(doorMap),
		"unique_people":   len(personMap),
		"success_rate":    float64(grantedCount) / float64(totalAccesses) * 100,
		"period_from":     req.DateFrom,
		"period_to":       req.DateTo,
		"include_denied":  req.IncludeDenied,
	}
	
	return map[string]interface{}{
		"summary":    summary,
		"accesses":   accesses,
		"top_doors":  topDoors[:min(len(topDoors), 10)],
		"top_people": topPeople[:min(len(topPeople), 10)],
	}, nil
}

func (h *Handlers) generateAdminActionsReport(ctx context.Context, req AdminActionsReportRequest) (map[string]interface{}, error) {
	// Admin actions report - shows administrative actions
	query := `
		SELECT 
			timestamp,
			actor_id,
			actor_name,
			action,
			resource,
			resource_id,
			resource_name,
			result,
			error_msg,
			metadata
		FROM dm3_audit.audit_events
		WHERE tenant_id = $1
		  AND timestamp >= $2::date
		  AND timestamp < $3::date + interval '1 day'
		  AND actor_type = 'user'
		  AND event_type IN ('user', 'door', 'rule', 'device', 'company', 'config', 'system')
	`
	
	args := []interface{}{req.TenantID, req.DateFrom, req.DateTo}
	argCount := 4
	
	if req.AdminID != nil {
		query += ` AND actor_id = $` + strconv.Itoa(argCount)
		args = append(args, uuid.MustParse(*req.AdminID))
		argCount++
	}
	
	if req.Action != nil {
		query += ` AND action = $` + strconv.Itoa(argCount)
		args = append(args, *req.Action)
		argCount++
	}
	
	if req.Resource != nil {
		query += ` AND resource = $` + strconv.Itoa(argCount)
		args = append(args, *req.Resource)
		argCount++
	}
	
	if req.HighRisk {
		// Filter for high-risk actions only
		riskConditions := []string{}
		for resource, actions := range HighRiskActions {
			for action := range actions {
				riskConditions = append(riskConditions, 
					fmt.Sprintf("(resource = '%s' AND action = '%s')", resource, action))
			}
		}
		if len(riskConditions) > 0 {
			query += ` AND (` + strings.Join(riskConditions, " OR ") + `)`
		}
	}
	
	query += `
		ORDER BY timestamp DESC
		LIMIT 5000
	`
	
	rows, err := h.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var actions []map[string]interface{}
	var totalActions int64
	var failureCount int64
	actionMap := make(map[string]int64)
	resourceMap := make(map[string]int64)
	adminMap := make(map[string]map[string]interface{})
	
	for rows.Next() {
		var timestamp time.Time
		var actorID *uuid.UUID
		var actorName *string
		var action, resource, resourceID, resourceName, result *string
		var errorMsg *string
		var metadataJSON []byte
		
		err := rows.Scan(&timestamp, &actorID, &actorName, &action, &resource, &resourceID, &resourceName, &result, &errorMsg, &metadataJSON)
		if err != nil {
			continue
		}
		
		totalActions++
		
		if result != nil && *result == "failure" {
			failureCount++
		}
		
		if action != nil {
			actionMap[*action]++
		}
		
		if resource != nil {
			resourceMap[*resource]++
		}
		
		if actorID != nil && actorName != nil {
			adminMap[actorID.String()] = map[string]interface{}{
				"id":   *actorID,
				"name": *actorName,
			}
		}
		
		var metadata map[string]interface{}
		if len(metadataJSON) > 0 {
			json.Unmarshal(metadataJSON, &metadata)
		}
		
		actionData := map[string]interface{}{
			"timestamp":     timestamp.Format(time.RFC3339),
			"actor_id":      actorID,
			"actor_name":    actorName,
			"action":        action,
			"resource":      resource,
			"resource_id":   resourceID,
			"resource_name": resourceName,
			"result":        result,
			"error_msg":     errorMsg,
			"metadata":      metadata,
			"high_risk":     req.HighRisk || (action != nil && resource != nil && IsHighRiskAction(*resource, *action)),
		}
		
		actions = append(actions, actionData)
	}
	
	summary := map[string]interface{}{
		"total_actions":   totalActions,
		"failure_count":   failureCount,
		"success_rate":    float64(totalActions-failureCount) / float64(totalActions) * 100,
		"unique_admins":   len(adminMap),
		"unique_actions":  len(actionMap),
		"unique_resources": len(resourceMap),
		"period_from":     req.DateFrom,
		"period_to":       req.DateTo,
		"high_risk_only":  req.HighRisk,
	}
	
	return map[string]interface{}{
		"summary":       summary,
		"actions":       actions,
		"action_stats":  actionMap,
		"resource_stats": resourceMap,
	}, nil
}

func (h *Handlers) getAuditStatistics(ctx context.Context, tenantID uuid.UUID, period string) (*AuditStatsResponse, error) {
	// Parse period
	var startDate time.Time
	switch period {
	case "1d":
		startDate = time.Now().AddDate(0, 0, -1)
	case "7d":
		startDate = time.Now().AddDate(0, 0, -7)
	case "30d":
		startDate = time.Now().AddDate(0, 0, -30)
	case "90d":
		startDate = time.Now().AddDate(0, 0, -90)
	default:
		startDate = time.Now().AddDate(0, 0, -7) // default to 7 days
	}
	
	// Get total events
	var totalEvents int64
	err := h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_audit.audit_events WHERE tenant_id = $1 AND timestamp >= $2`,
		tenantID, startDate).Scan(&totalEvents)
	if err != nil {
		return nil, err
	}
	
	// Get events by type
	eventsByType := make(map[string]int64)
	rows, err := h.db.Pool.Query(ctx,
		`SELECT event_type, COUNT(*) FROM dm3_audit.audit_events WHERE tenant_id = $1 AND timestamp >= $2 GROUP BY event_type`,
		tenantID, startDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var eventType string
		var count int64
		if err := rows.Scan(&eventType, &count); err == nil {
			eventsByType[eventType] = count
		}
	}
	
	// Get events by action
	eventsByAction := make(map[string]int64)
	rows, err = h.db.Pool.Query(ctx,
		`SELECT action, COUNT(*) FROM dm3_audit.audit_events WHERE tenant_id = $1 AND timestamp >= $2 GROUP BY action`,
		tenantID, startDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var action string
		var count int64
		if err := rows.Scan(&action, &count); err == nil {
			eventsByAction[action] = count
		}
	}
	
	// Get events by result
	eventsByResult := make(map[string]int64)
	rows, err = h.db.Pool.Query(ctx,
		`SELECT result, COUNT(*) FROM dm3_audit.audit_events WHERE tenant_id = $1 AND timestamp >= $2 GROUP BY result`,
		tenantID, startDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var result string
		var count int64
		if err := rows.Scan(&result, &count); err == nil {
			eventsByResult[result] = count
		}
	}
	
	// Get top actors
	var topActors []ActorStats
	rows, err = h.db.Pool.Query(ctx,
		`SELECT actor_id, actor_name, actor_type, COUNT(*) FROM dm3_audit.audit_events 
		 WHERE tenant_id = $1 AND timestamp >= $2 AND actor_id IS NOT NULL
		 GROUP BY actor_id, actor_name, actor_type 
		 ORDER BY COUNT(*) DESC LIMIT 10`,
		tenantID, startDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var actorID uuid.UUID
		var actorName, actorType string
		var count int64
		if err := rows.Scan(&actorID, &actorName, &actorType, &count); err == nil {
			topActors = append(topActors, ActorStats{
				ActorID:   actorID,
				ActorName: actorName,
				ActorType: actorType,
				Count:     count,
			})
		}
	}
	
	// Get top resources
	var topResources []ResourceStats
	rows, err = h.db.Pool.Query(ctx,
		`SELECT resource, COUNT(*) FROM dm3_audit.audit_events 
		 WHERE tenant_id = $1 AND timestamp >= $2
		 GROUP BY resource 
		 ORDER BY COUNT(*) DESC LIMIT 10`,
		tenantID, startDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	for rows.Next() {
		var resource string
		var count int64
		if err := rows.Scan(&resource, &count); err == nil {
			topResources = append(topResources, ResourceStats{
				Resource: resource,
				Count:    count,
			})
		}
	}
	
	// Check integrity
	integrityResult, err := h.verifyAuditIntegrity(ctx, tenantID)
	integrityOK := err == nil && integrityResult.IsValid
	
	// Get last checkpoint
	var lastCheckpoint *time.Time
	var checkpointTime time.Time
	err = h.db.Pool.QueryRow(ctx,
		`SELECT verified_at FROM dm3_audit.integrity_checkpoints WHERE tenant_id = $1 ORDER BY verified_at DESC LIMIT 1`,
		tenantID).Scan(&checkpointTime)
	if err == nil {
		lastCheckpoint = &checkpointTime
	}
	
	return &AuditStatsResponse{
		TenantID:       tenantID,
		TotalEvents:    totalEvents,
		EventsByType:   eventsByType,
		EventsByAction: eventsByAction,
		EventsByResult: eventsByResult,
		TopActors:      topActors,
		TopResources:   topResources,
		LastCheckpoint: lastCheckpoint,
		IntegrityOK:    integrityOK,
		Period:         period,
	}, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}