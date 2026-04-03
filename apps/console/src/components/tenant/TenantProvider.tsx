import React, { createContext, useContext, useEffect } from 'react'
import { useTenantStore, TenantInfo, TenantUsage } from '../../stores/tenantStore'

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

  // Initial data load
  useEffect(() => {
    refreshTenantData()
  }, [refreshTenantData])

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      refreshTenantData()
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, refreshTenantData])

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