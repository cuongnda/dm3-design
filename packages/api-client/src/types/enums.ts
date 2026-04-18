export const Domain = {
  SECURE: 'secure',
  MANAGE: 'manage',
  OPERATE: 'operate',
  SMART: 'smart',
} as const;

export const AccessResult = {
  GRANTED: 'granted',
  DENIED: 'denied',
  FORCED: 'forced',
} as const;

export const DeviceStatus = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  ALARM: 'alarm',
  WARNING: 'warning',
} as const;

export const AlertSeverity = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
} as const;
