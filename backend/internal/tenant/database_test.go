package tenant

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestQueryBuilder(t *testing.T) {
	t.Run("NewQueryBuilder with tenant context", func(t *testing.T) {
		ctx := WithTenantID(context.Background(), "tenant-123")
		
		qb, err := NewQueryBuilder(ctx, "SELECT * FROM table")
		require.NoError(t, err)
		assert.Equal(t, "SELECT * FROM table", qb.baseQuery)
		assert.Equal(t, "tenant-123", qb.tenantID)
		assert.Equal(t, 1, qb.argIndex)
	})

	t.Run("NewQueryBuilder without tenant context", func(t *testing.T) {
		_, err := NewQueryBuilder(context.Background(), "SELECT * FROM table")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "tenant_id not found")
	})

	t.Run("NewQueryBuilderOptional without tenant context", func(t *testing.T) {
		qb := NewQueryBuilderOptional(context.Background(), "SELECT * FROM table")
		assert.Equal(t, "SELECT * FROM table", qb.baseQuery)
		assert.Equal(t, "", qb.tenantID)
	})

	t.Run("AddTenantFilter to query without WHERE", func(t *testing.T) {
		ctx := WithTenantID(context.Background(), "tenant-123")
		qb, _ := NewQueryBuilder(ctx, "SELECT * FROM table")
		
		qb.AddTenantFilter("tenant_id")
		
		query, args := qb.Build()
		assert.Equal(t, "SELECT * FROM table WHERE tenant_id = $1::uuid", query)
		assert.Equal(t, []interface{}{"tenant-123"}, args)
	})

	t.Run("AddTenantFilter to query with WHERE", func(t *testing.T) {
		ctx := WithTenantID(context.Background(), "tenant-123")
		qb, _ := NewQueryBuilder(ctx, "SELECT * FROM table WHERE active = true")
		
		qb.AddTenantFilter("tenant_id")
		
		query, args := qb.Build()
		assert.Equal(t, "SELECT * FROM table WHERE active = true AND tenant_id = $1::uuid", query)
		assert.Equal(t, []interface{}{"tenant-123"}, args)
	})

	t.Run("AddTenantFilter with no tenant ID", func(t *testing.T) {
		qb := NewQueryBuilderOptional(context.Background(), "SELECT * FROM table")
		
		qb.AddTenantFilter("tenant_id")
		
		query, args := qb.Build()
		assert.Equal(t, "SELECT * FROM table", query) // No tenant filter added
		assert.Empty(t, args)
	})

	t.Run("AddCondition with placeholder", func(t *testing.T) {
		ctx := WithTenantID(context.Background(), "tenant-123")
		qb, _ := NewQueryBuilder(ctx, "SELECT * FROM table")
		
		qb.AddCondition("status = ?", "active")
		
		query, args := qb.Build()
		assert.Equal(t, "SELECT * FROM table WHERE status = $1", query)
		assert.Equal(t, []interface{}{"active"}, args)
	})

	t.Run("AddConditions with multiple conditions", func(t *testing.T) {
		ctx := WithTenantID(context.Background(), "tenant-123")
		qb, _ := NewQueryBuilder(ctx, "SELECT * FROM table")
		
		conditions := map[string]interface{}{
			"status = ?":     "active",
			"type = ?":       "device",
			"created_at > ?": "2024-01-01",
		}
		qb.AddConditions(conditions)
		
		query, args := qb.Build()
		
		// The order of conditions is not guaranteed in map iteration
		// So we check that all conditions are present
		assert.Contains(t, query, "WHERE")
		assert.Contains(t, query, "status = $")
		assert.Contains(t, query, "type = $")
		assert.Contains(t, query, "created_at > $")
		assert.Len(t, args, 3)
		assert.Contains(t, args, "active")
		assert.Contains(t, args, "device")
		assert.Contains(t, args, "2024-01-01")
	})

	t.Run("Complex query building", func(t *testing.T) {
		ctx := WithTenantID(context.Background(), "tenant-123")
		qb, _ := NewQueryBuilder(ctx, "SELECT * FROM devices")
		
		qb.AddTenantFilter("tenant_id").
		   AddCondition("status = ?", "online").
		   AddCondition("type = ?", "access_point")
		
		query, args := qb.Build()
		expectedQuery := "SELECT * FROM devices WHERE tenant_id = $1::uuid AND status = $2 AND type = $3"
		expectedArgs := []interface{}{"tenant-123", "online", "access_point"}
		
		assert.Equal(t, expectedQuery, query)
		assert.Equal(t, expectedArgs, args)
	})
}

func TestQueryBuilderParameterIndexing(t *testing.T) {
	ctx := WithTenantID(context.Background(), "tenant-123")
	qb, _ := NewQueryBuilder(ctx, "SELECT * FROM table")
	
	// Add multiple conditions to test parameter indexing
	qb.AddCondition("field1 = ?", "value1")
	qb.AddCondition("field2 = ?", "value2")
	qb.AddTenantFilter("tenant_id")
	qb.AddCondition("field3 = ?", "value3")
	
	query, args := qb.Build()
	
	// Check that parameters are correctly indexed
	assert.Contains(t, query, "$1")
	assert.Contains(t, query, "$2")
	assert.Contains(t, query, "$3")
	assert.Contains(t, query, "$4")
	
	expectedArgs := []interface{}{"value1", "value2", "tenant-123", "value3"}
	assert.Equal(t, expectedArgs, args)
}

func TestTenantAwareDBCreation(t *testing.T) {
	t.Run("NewTenantAwareDB with tenant context", func(t *testing.T) {
		ctx := WithTenantID(context.Background(), "tenant-123")
		
		// Mock database - in real tests you'd use a test database
		mockDB := createMockDB(t)
		
		tdb, err := NewTenantAwareDB(mockDB, ctx)
		require.NoError(t, err)
		assert.Equal(t, "tenant-123", tdb.tenantID)
		assert.Equal(t, mockDB, tdb.db)
	})

	t.Run("NewTenantAwareDB without tenant context", func(t *testing.T) {
		mockDB := createMockDB(t)
		
		_, err := NewTenantAwareDB(mockDB, context.Background())
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "tenant_id not found")
	})
}

// Integration test would test actual database operations
// func TestTenantAwareDBQueries(t *testing.T) {
//     // This would require a real test database
//     // Skip for unit tests, implement in integration test suite
// }

func TestValidateAndFilterByTenant(t *testing.T) {
	t.Run("same tenant validation passes", func(t *testing.T) {
		ctx := WithTenantID(context.Background(), "tenant-123")
		
		err := ValidateAndFilterByTenant(ctx, "tenant-123")
		assert.NoError(t, err)
	})

	t.Run("different tenant validation fails", func(t *testing.T) {
		ctx := WithTenantID(context.Background(), "tenant-123")
		
		err := ValidateAndFilterByTenant(ctx, "tenant-456")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "access denied")
	})

	t.Run("no tenant context validation fails", func(t *testing.T) {
		err := ValidateAndFilterByTenant(context.Background(), "tenant-123")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "no tenant context")
	})
}