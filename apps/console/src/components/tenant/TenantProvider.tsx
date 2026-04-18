import React, { createContext, useContext, useEffect } from 'react'
import { useTenantStore, type TenantInfo, type TenantUsage } from '../../stores/tenantStore'
import { useAuthStore } from '../../stores/authStore'

interface TenantContextType {
  tenant: TenantInfo | null
  usage: TenantUsage | null
  isLoading: boolean
  error: string | null
  refreshData: () => Promise<void>
  canCreateDevice: () => boolean
  canCreateUser: () => boolean
}

const TenantContext = createContext<TenantContextType | null>(null)

interface TenantProviderProps {
  children: React.ReactNode
  autoRefresh?: boolean
  refreshInterval?: number
}

export const TenantProvider: React.FC<TenantProviderProps> = ({
  children,
  autoRefresh = true,
  refreshInterval = 60000, // 1 minute
}) => {
  const {
    tenant,
    usage,
    isLoadingTenant,
    isLoadingUsage,
    tenantError,
    usageError,
    fetchTenant,
    fetchUsage,
    refreshTenantData,
    canCreateDevice,
    canCreateUser,
  } = useTenantStore()

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const userRole = useAuthStore((s) => s.user?.role)
  const isSystemAdmin = userRole === 'system_admin'

  // Fetch tenant data when authenticated — skip on unauthenticated pages like /login
  // and skip for system_admin who has no tenant
  useEffect(() => {
    if (!isAuthenticated || isSystemAdmin) return
    refreshTenantData()
  }, [isAuthenticated, isSystemAdmin, refreshTenantData])

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh || !isAuthenticated || isSystemAdmin) return

    const interval = setInterval(() => {
      refreshTenantData()
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, isSystemAdmin, refreshTenantData])

  const contextValue: TenantContextType = {
    tenant,
    usage,
    isLoading: isLoadingTenant || isLoadingUsage,
    error: tenantError || usageError,
    refreshData: refreshTenantData,
    canCreateDevice,
    canCreateUser,
  }

  return (
    <TenantContext.Provider value={contextValue}>
      {children}
    </TenantContext.Provider>
  )
}

export const useTenantContext = (): TenantContextType => {
  const context = useContext(TenantContext)
  if (!context) {
    throw new Error('useTenantContext must be used within a TenantProvider')
  }
  return context
}

export default TenantProvider