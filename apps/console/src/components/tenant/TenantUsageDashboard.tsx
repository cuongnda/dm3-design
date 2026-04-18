import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTenantUsage } from '../../stores/tenantStore'

interface UsageBarProps {
  label: string
  current: number
  limit: number
  percentage: number
  color?: 'blue' | 'green' | 'yellow' | 'red'
}

const UsageBar: React.FC<UsageBarProps> = ({
  label,
  current,
  limit,
  percentage,
  color = 'blue',
}) => {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  }

  const bgColorClasses = {
    blue: 'bg-blue-100',
    green: 'bg-green-100',
    yellow: 'bg-yellow-100',
    red: 'bg-red-100',
  }

  const getColor = (pct: number): 'blue' | 'green' | 'yellow' | 'red' => {
    if (pct >= 90) return 'red'
    if (pct >= 75) return 'yellow'
    if (pct >= 50) return 'blue'
    return 'green'
  }

  const barColor = getColor(percentage)

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-600">
          {current} / {limit === -1 ? '∞' : limit}
        </span>
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${colorClasses[barColor]}`}
          style={{
            width: `${Math.min(percentage, 100)}%`,
          }}
        />
      </div>
      
      <div className="text-right">
        <span
          className={`text-xs font-medium ${
            percentage >= 90
              ? 'text-red-600'
              : percentage >= 75
              ? 'text-yellow-600'
              : 'text-gray-600'
          }`}
        >
          {percentage}%
        </span>
      </div>
    </div>
  )
}

interface TenantUsageDashboardProps {
  className?: string
  compact?: boolean
}

export const TenantUsageDashboard: React.FC<TenantUsageDashboardProps> = ({
  className = '',
  compact = false,
}) => {
  const {
    usage,
    isLoading,
    error,
    getDeviceUsagePercentage,
    getUserUsagePercentage,
  } = useTenantUsage()

  if (isLoading) {
    return (
      <div className={`animate-pulse space-y-4 ${className}`}>
        <div className="h-4 bg-gray-300 rounded w-32 mb-4"></div>
        <div className="space-y-3">
          <div className="h-8 bg-gray-200 rounded"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`text-red-600 p-4 border border-red-200 rounded-md ${className}`}>
        <h4 className="font-medium">Failed to load usage data</h4>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  if (!usage) {
    return (
      <div className={`text-gray-500 p-4 border border-gray-200 rounded-md ${className}`}>
        <p className="text-sm">No usage data available</p>
      </div>
    )
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      {!compact && (
        <h4 className="text-lg font-medium text-gray-900 mb-4">Usage Overview</h4>
      )}
      
      <div className="space-y-4">
        <UsageBar
          label="Devices"
          current={usage.devices.current}
          limit={usage.devices.limit}
          percentage={getDeviceUsagePercentage()}
        />
        
        <UsageBar
          label="Users"
          current={usage.users.current}
          limit={usage.users.limit}
          percentage={getUserUsagePercentage()}
        />
        
        {usage.persons.limit !== -1 && (
          <UsageBar
            label="Persons"
            current={usage.persons.current}
            limit={usage.persons.limit}
            percentage={
              usage.persons.limit > 0
                ? Math.round((usage.persons.current / usage.persons.limit) * 100)
                : 0
            }
          />
        )}
      </div>
      
      {/* Warning alerts */}
      <div className="mt-4 space-y-2">
        {getDeviceUsagePercentage() >= 90 && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-800 inline-flex items-center gap-1.5">
              <AlertTriangle size={14} /> Device limit almost reached. Consider upgrading your plan.
            </p>
          </div>
        )}

        {getUserUsagePercentage() >= 90 && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-800 inline-flex items-center gap-1.5">
              <AlertTriangle size={14} /> User limit almost reached. Consider upgrading your plan.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default TenantUsageDashboard