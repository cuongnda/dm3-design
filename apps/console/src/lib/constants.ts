export const DOMAIN_COLORS = {
  secure: '#3B82F6',
  manage: '#8B5CF6',
  operate: '#F59E0B',
  smart: '#06B6D4',
  platform: '#6B7280',
} as const;

export const DOMAIN_LABELS = {
  secure: 'SECURE',
  manage: 'MANAGE',
  operate: 'OPERATE',
  smart: 'SMART',
} as const;

export type DomainKey = keyof typeof DOMAIN_COLORS;

export const STATUS_COLORS = {
  online: '#22C55E',
  offline: '#64748B',
  alarm: '#EF4444',
  warning: '#EAB308',
} as const;

export type StatusKey = keyof typeof STATUS_COLORS;

export const ROUTES = {
  dashboard: '/',
  alerts: '/alerts',
  // MANAGE
  users: '/manage/users',
  departments: '/manage/departments', 
  identities: '/manage/identities',
  // ACCESS CONTROL
  accessControl: '/access-control',
  // DEVICES
  devices: '/devices',
  // SETTINGS
  settings: '/settings',
  // AUTH
  login: '/login',
} as const;
