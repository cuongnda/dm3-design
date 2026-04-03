import React from 'react'
import { useTenant } from '../../stores/tenantStore'

interface TenantInfoProps {
  className?: string
  showDetails?: boolean
}

export const TenantInfo: React.FC<TenantInfoProps> = ({
  className = '',
  showDetails = true,
}) => {
  const { tenant, isLoading, error } = useTenant()

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-4 bg-gray-300 rounded w-32 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-24"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`text-red-600 ${className}`}>
        <span className="text-sm">Failed to load tenant info</span>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className={`text-gray-500 ${className}`}>
        <span className="text-sm">No tenant information available</span>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-gray-900">{tenant.company_name}</h3>
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
          {tenant.plan}
        </span>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            tenant.status === 'active'
              ? 'bg-green-100 text-green-800'
              : tenant.status === 'suspended'
              ? 'bg-red-100 text-red-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {tenant.status}
        </span>
      </div>
      
      {showDetails && (
        <div className="mt-2 text-sm text-gray-600">
          <p>Code: {tenant.company_code}</p>
          <p>ID: {tenant.id}</p>
        </div>
      )}
    </div>
  )
}

export default TenantInfo