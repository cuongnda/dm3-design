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
  // SECURE
  accessControl: '/secure/access-control',
  accessTime: '/secure/access-control/access-time',
  cctv: '/secure/cctv',
  intrusion: '/secure/intrusion',
  intercom: '/secure/intercom',
  aiDetection: '/secure/ai-detection',
  emergency: '/secure/emergency',
  // MANAGE
  identities: '/manage/identities',
  visitors: '/manage/visitors',
  contractors: '/manage/contractors',
  attendance: '/manage/attendance',
  deliveries: '/manage/deliveries',
  devices: '/devices',
  provisioning: '/manage/provisioning',
  // OPERATE
  roomBooking: '/operate/room-booking',
  parking: '/operate/parking',
  maintenance: '/operate/maintenance',
  guardTour: '/operate/guard-tour',
  keys: '/operate/keys',
  iotEnergy: '/operate/iot-energy',
  // SMART
  aiAssistant: '/smart/ai-assistant',
  analytics: '/smart/analytics',
  automation: '/smart/automation',
  // SETTINGS
  settings: '/settings',
  // AUTH
  login: '/login',
} as const;
