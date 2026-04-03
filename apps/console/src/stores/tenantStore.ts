import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// Tenant information interface
export interface TenantInfo {
  id: string
  company_id: string
  company_name: string
  company_code: string
  plan: string
  status: string
  max_devices: number
  max_users: number
}

// Tenant usage statistics interface
export interface TenantUsage {
  devices: {
    current: number
    limit: number
  }
  users: {
    current: number
    limit: number
  }
  persons: {
    current: number
    limit: number
  }
}

// Tenant store state interface
interface TenantState {
  // Current tenant info
  tenant: TenantInfo | null
  usage: TenantUsage | null
  
  // Loading states
  isLoadingTenant: boolean
  isLoadingUsage: boolean
  
  // Error states
  tenantError: string | null
  usageError: string | null
  
  // Actions
  setTenant: (tenant: TenantInfo | null) => void
  setUsage: (usage: TenantUsage | null) => void
  setLoadingTenant: (loading: boolean) => void
  setLoadingUsage: (loading: boolean) => void
  setTenantError: (error: string | null) => void
  setUsageError: (error: string | null) => void
  
  // API actions
  fetchTenant: () => Promise<void>
  fetchUsage: () => Promise<void>
  refreshTenantData: () => Promise<void>
  
  // Validation helpers
  canCreateDevice: () => boolean
  canCreateUser: () => boolean
  getDeviceUsagePercentage: () => number
  getUserUsagePercentage: () => number
}

// Create the tenant store
export const useTenantStore = create<TenantState>()(
  devtools(
    (set, get) => ({
      // Initial state
      tenant: null,
      usage: null,
      isLoadingTenant: false,
      isLoadingUsage: false,
      tenantError: null,
      usageError: null,

      // Basic setters
      setTenant: (tenant) => set({ tenant }, false, 'setTenant'),
      setUsage: (usage) => set({ usage }, false, 'setUsage'),
      setLoadingTenant: (loading) => set({ isLoadingTenant: loading }, false, 'setLoadingTenant'),
      setLoadingUsage: (loading) => set({ isLoadingUsage: loading }, false, 'setLoadingUsage'),
      setTenantError: (error) => set({ tenantError: error }, false, 'setTenantError'),
      setUsageError: (error) => set({ usageError: error }, false, 'setUsageError'),

      // API actions
      fetchTenant: async () => {
        const { setLoadingTenant, setTenant, setTenantError } = get()
        
        try {
          setLoadingTenant(true)
          setTenantError(null)
          
          const response = await fetch('/api/v1/tenant/current', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
          })
          
          if (!response.ok) {
            throw new Error(`Failed to fetch tenant: ${response.status}`)
          }
          
          const data = await response.json()
          setTenant(data.tenant)
        } catch (error) {
          console.error('Failed to fetch tenant:', error)
          setTenantError(error instanceof Error ? error.message : 'Failed to fetch tenant')
        } finally {
          setLoadingTenant(false)
        }
      },

      fetchUsage: async () => {
        const { setLoadingUsage, setUsage, setUsageError } = get()
        
        try {
          setLoadingUsage(true)
          setUsageError(null)
          
          const response = await fetch('/api/v1/tenant/stats', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
          })
          
          if (!response.ok) {
            throw new Error(`Failed to fetch usage: ${response.status}`)
          }
          
          const data = await response.json()
          setUsage(data.usage)
        } catch (error) {
          console.error('Failed to fetch usage:', error)
          setUsageError(error instanceof Error ? error.message : 'Failed to fetch usage')
        } finally {
          setLoadingUsage(false)
        }
      },

      refreshTenantData: async () => {
        const { fetchTenant, fetchUsage } = get()
        await Promise.all([fetchTenant(), fetchUsage()])
      },

      // Validation helpers
      canCreateDevice: () => {
        const { usage } = get()
        if (!usage) return false
        return usage.devices.current < usage.devices.limit
      },

      canCreateUser: () => {
        const { usage } = get()
        if (!usage) return false
        return usage.users.current < usage.users.limit
      },

      getDeviceUsagePercentage: () => {
        const { usage } = get()
        if (!usage || usage.devices.limit === 0) return 0
        return Math.round((usage.devices.current / usage.devices.limit) * 100)
      },

      getUserUsagePercentage: () => {
        const { usage } = get()
        if (!usage || usage.users.limit === 0) return 0
        return Math.round((usage.users.current / usage.users.limit) * 100)
      },
    }),
    {
      name: 'tenant-store',
    }
  )
)

// Tenant context hooks for easier usage
export const useTenant = () => {
  const tenant = useTenantStore((state) => state.tenant)
  const isLoading = useTenantStore((state) => state.isLoadingTenant)
  const error = useTenantStore((state) => state.tenantError)
  const fetchTenant = useTenantStore((state) => state.fetchTenant)
  
  return { tenant, isLoading, error, fetchTenant }
}

export const useTenantUsage = () => {
  const usage = useTenantStore((state) => state.usage)
  const isLoading = useTenantStore((state) => state.isLoadingUsage)
  const error = useTenantStore((state) => state.usageError)
  const fetchUsage = useTenantStore((state) => state.fetchUsage)
  const canCreateDevice = useTenantStore((state) => state.canCreateDevice)
  const canCreateUser = useTenantStore((state) => state.canCreateUser)
  const getDeviceUsagePercentage = useTenantStore((state) => state.getDeviceUsagePercentage)
  const getUserUsagePercentage = useTenantStore((state) => state.getUserUsagePercentage)
  
  return {
    usage,
    isLoading,
    error,
    fetchUsage,
    canCreateDevice,
    canCreateUser,
    getDeviceUsagePercentage,
    getUserUsagePercentage,
  }
}

// Auto-refresh helper hook
export const useTenantAutoRefresh = (intervalMs: number = 60000) => {
  const refreshTenantData = useTenantStore((state) => state.refreshTenantData)
  
  React.useEffect(() => {
    // Initial fetch
    refreshTenantData()
    
    // Set up interval for auto-refresh
    const interval = setInterval(refreshTenantData, intervalMs)
    
    return () => clearInterval(interval)
  }, [refreshTenantData, intervalMs])
}

// React import for useEffect
import React from 'react'