package tenant

import (
	"context"
	"fmt"
)

// contextKey for tenant context values
type contextKey string

const (
	TenantIDKey   contextKey = "tenant_id"
	CompanyIDKey  contextKey = "company_id"
	TenantInfoKey contextKey = "tenant_info"
)

// TenantInfo holds complete tenant context information
type TenantInfo struct {
	ID          string `json:"id"`
	CompanyID   string `json:"company_id"`
	CompanyName string `json:"company_name"`
	CompanyCode string `json:"company_code"`
	Plan        string `json:"plan"`
	Status      string `json:"status"`
	MaxDevices  int    `json:"max_devices"`
	MaxUsers    int    `json:"max_users"`
}

// WithTenantID adds tenant_id to context
func WithTenantID(ctx context.Context, tenantID string) context.Context {
	return context.WithValue(ctx, TenantIDKey, tenantID)
}

// WithCompanyID adds company_id to context
func WithCompanyID(ctx context.Context, companyID string) context.Context {
	return context.WithValue(ctx, CompanyIDKey, companyID)
}

// WithTenantInfo adds complete tenant information to context
func WithTenantInfo(ctx context.Context, info *TenantInfo) context.Context {
	return context.WithValue(ctx, TenantInfoKey, info)
}

// TenantIDFromContext extracts tenant_id from context
func TenantIDFromContext(ctx context.Context) (string, error) {
	tenantID, ok := ctx.Value(TenantIDKey).(string)
	if !ok || tenantID == "" {
		return "", fmt.Errorf("tenant_id not found in context")
	}
	return tenantID, nil
}

// CompanyIDFromContext extracts company_id from context
func CompanyIDFromContext(ctx context.Context) (string, error) {
	companyID, ok := ctx.Value(CompanyIDKey).(string)
	if !ok || companyID == "" {
		return "", fmt.Errorf("company_id not found in context")
	}
	return companyID, nil
}

// TenantInfoFromContext extracts complete tenant info from context
func TenantInfoFromContext(ctx context.Context) (*TenantInfo, error) {
	info, ok := ctx.Value(TenantInfoKey).(*TenantInfo)
	if !ok {
		return nil, fmt.Errorf("tenant_info not found in context")
	}
	return info, nil
}

// MustTenantID gets tenant_id or panics (for internal use where tenant is guaranteed)
func MustTenantID(ctx context.Context) string {
	tenantID, err := TenantIDFromContext(ctx)
	if err != nil {
		panic("tenant context required but not found")
	}
	return tenantID
}

// MustCompanyID gets company_id or panics (for internal use where company is guaranteed)
func MustCompanyID(ctx context.Context) string {
	companyID, err := CompanyIDFromContext(ctx)
	if err != nil {
		panic("company context required but not found")
	}
	return companyID
}

// MustTenantInfo gets tenant_info or panics (for internal use where tenant is guaranteed)
func MustTenantInfo(ctx context.Context) *TenantInfo {
	info, err := TenantInfoFromContext(ctx)
	if err != nil {
		panic("tenant info context required but not found")
	}
	return info
}