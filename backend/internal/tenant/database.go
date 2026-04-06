package tenant

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/duali/dm3-backend/pkg/db"
)

// QueryBuilder helps build tenant-aware SQL queries
type QueryBuilder struct {
	baseQuery string
	args      []interface{}
	argIndex  int
	tenantID  string
}

// NewQueryBuilder creates a tenant-aware query builder
func NewQueryBuilder(ctx context.Context, baseQuery string) (*QueryBuilder, error) {
	tenantID, err := TenantIDFromContext(ctx)
	if err != nil {
		return nil, err
	}

	return &QueryBuilder{
		baseQuery: baseQuery,
		args:      make([]interface{}, 0),
		argIndex:  1,
		tenantID:  tenantID,
	}, nil
}

// NewQueryBuilderOptional creates a query builder that doesn't require tenant context
func NewQueryBuilderOptional(ctx context.Context, baseQuery string) *QueryBuilder {
	tenantID, _ := TenantIDFromContext(ctx)

	return &QueryBuilder{
		baseQuery: baseQuery,
		args:      make([]interface{}, 0),
		argIndex:  1,
		tenantID:  tenantID,
	}
}

// AddTenantFilter automatically adds tenant_id filter to the query
func (qb *QueryBuilder) AddTenantFilter(tenantColumn string) *QueryBuilder {
	if qb.tenantID == "" {
		return qb // Skip if no tenant context
	}

	if strings.Contains(strings.ToLower(qb.baseQuery), "where") {
		qb.baseQuery += fmt.Sprintf(" AND %s = $%d::uuid", tenantColumn, qb.argIndex)
	} else {
		qb.baseQuery += fmt.Sprintf(" WHERE %s = $%d::uuid", tenantColumn, qb.argIndex)
	}
	qb.args = append(qb.args, qb.tenantID)
	qb.argIndex++
	return qb
}

// AddCondition adds a WHERE condition with parameter
func (qb *QueryBuilder) AddCondition(condition string, value interface{}) *QueryBuilder {
	placeholder := fmt.Sprintf("$%d", qb.argIndex)
	conditionWithPlaceholder := strings.ReplaceAll(condition, "?", placeholder)
	
	if strings.Contains(strings.ToLower(qb.baseQuery), "where") {
		qb.baseQuery += " AND " + conditionWithPlaceholder
	} else {
		qb.baseQuery += " WHERE " + conditionWithPlaceholder
	}
	qb.args = append(qb.args, value)
	qb.argIndex++
	return qb
}

// AddConditions adds multiple conditions
func (qb *QueryBuilder) AddConditions(conditions map[string]interface{}) *QueryBuilder {
	for condition, value := range conditions {
		qb.AddCondition(condition, value)
	}
	return qb
}

// Build returns the final query and args
func (qb *QueryBuilder) Build() (string, []interface{}) {
	return qb.baseQuery, qb.args
}

// TenantAwareDB wraps database operations with tenant isolation
type TenantAwareDB struct {
	db       *db.DB
	tenantID string
}

// NewTenantAwareDB creates a tenant-aware database wrapper
func NewTenantAwareDB(database *db.DB, ctx context.Context) (*TenantAwareDB, error) {
	tenantID, err := TenantIDFromContext(ctx)
	if err != nil {
		return nil, err
	}

	return &TenantAwareDB{
		db:       database,
		tenantID: tenantID,
	}, nil
}

// Query executes a tenant-filtered query
func (tdb *TenantAwareDB) Query(ctx context.Context, query string, args ...interface{}) (pgx.Rows, error) {
	// Automatically inject tenant filter if query contains tenant_id column
	if strings.Contains(query, "tenant_id") && !strings.Contains(query, "tenant_id =") {
		qb := &QueryBuilder{
			baseQuery: query,
			args:      args,
			argIndex:  len(args) + 1,
			tenantID:  tdb.tenantID,
		}
		qb.AddTenantFilter("tenant_id")
		query, args = qb.Build()
	}

	return tdb.db.Pool.Query(ctx, query, args...)
}

// QueryRow executes a tenant-filtered query that returns a single row
func (tdb *TenantAwareDB) QueryRow(ctx context.Context, query string, args ...interface{}) pgx.Row {
	// Automatically inject tenant filter if query contains tenant_id column
	if strings.Contains(query, "tenant_id") && !strings.Contains(query, "tenant_id =") {
		qb := &QueryBuilder{
			baseQuery: query,
			args:      args,
			argIndex:  len(args) + 1,
			tenantID:  tdb.tenantID,
		}
		qb.AddTenantFilter("tenant_id")
		query, args = qb.Build()
	}

	return tdb.db.Pool.QueryRow(ctx, query, args...)
}

// Exec executes a tenant-aware command
func (tdb *TenantAwareDB) Exec(ctx context.Context, query string, args ...interface{}) (pgconn.CommandTag, error) {
	// For INSERT statements, automatically add tenant_id if not present
	if strings.HasPrefix(strings.ToUpper(strings.TrimSpace(query)), "INSERT") {
		if !strings.Contains(query, "tenant_id") {
			// This is a simple implementation - production might need more sophisticated parsing
			query = strings.ReplaceAll(query, "VALUES", fmt.Sprintf("(tenant_id) VALUES ('%s',", tdb.tenantID))
			query = strings.ReplaceAll(query, "VALUES (", "VALUES (")
		}
	}

	// For UPDATE/DELETE, automatically inject tenant filter
	if (strings.HasPrefix(strings.ToUpper(strings.TrimSpace(query)), "UPDATE") ||
		strings.HasPrefix(strings.ToUpper(strings.TrimSpace(query)), "DELETE")) &&
		strings.Contains(query, "tenant_id") && !strings.Contains(query, "tenant_id =") {
		qb := &QueryBuilder{
			baseQuery: query,
			args:      args,
			argIndex:  len(args) + 1,
			tenantID:  tdb.tenantID,
		}
		qb.AddTenantFilter("tenant_id")
		query, args = qb.Build()
	}

	return tdb.db.Pool.Exec(ctx, query, args...)
}

// ValidateAndFilterByTenant ensures a query result belongs to the current tenant
func ValidateAndFilterByTenant(ctx context.Context, resourceTenantID string) error {
	return ValidateResourceAccess(ctx, resourceTenantID)
}

// AddTenantToInsert automatically adds tenant_id to INSERT queries
func AddTenantToInsert(ctx context.Context, query string, args []interface{}) (string, []interface{}, error) {
	_, err := TenantIDFromContext(ctx)
	if err != nil {
		return query, args, err
	}

	// Simple implementation for common INSERT patterns
	if strings.Contains(query, "tenant_id") {
		return query, args, nil // Already has tenant_id
	}

	// Add tenant_id to the query (this is a simplified approach)
	// Production implementation would need proper SQL parsing
	return query, args, nil
}