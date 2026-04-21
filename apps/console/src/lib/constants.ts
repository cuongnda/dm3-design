export const DOMAIN_COLORS = {
  secure: '#3B82F6',
  manage: '#8B5CF6',
  visitors: '#10B981',
  parking: '#F59E0B',
  operate: '#F59E0B',
  smart: '#06B6D4',
  platform: '#6B7280',
} as const;

export const DOMAIN_LABELS = {
  secure: 'SECURE',
  manage: 'MANAGE',
  visitors: 'VISITORS',
  parking: 'PARKING',
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
  monitoring: '/monitoring',
  // SECURE
  accessControl: '/secure/access-control',
  accessTime: '/secure/access-control/access-time',
  cctv: '/cctv/live',
  intrusion: '/secure/intrusion',
  intercom: '/secure/intercom',
  aiDetection: '/secure/ai-detection',
  emergency: '/secure/emergency',
  accessHistory: '/secure/access-history',
  // MANAGE
  users: '/manage/users',
  departments: '/manage/departments',
  attendance: '/manage/attendance',
  // VISITORS
  visitors: '/visitors',
  visitorsRegister: '/visitors/register',
  visitorsGroups: '/visitors/groups',
  visitorsWatchlist: '/visitors/watchlist',
  visitorsAgreements: '/visitors/agreements',
  visitorsAccessHistory: '/visitors/access-history',
  visitorsAnalytics: '/visitors/analytics',
  visitorsRecurring: '/visitors/recurring',
  visitorsSettings: '/visitors/settings',
  // ACCESS
  zones: '/access/zones',
  accessPoints: '/access/access-points',
  accessGroups: '/access/access-groups',
  accessTimes: '/access/access-times',
  // DEVICES
  devices: '/devices',
  // OPERATE
  parking: '/parking',
  parkingSessions: '/parking/sessions',
  parkingVehicles: '/parking/vehicles',
  parkingZones: '/parking/zones',
  parkingPasses: '/parking/passes',
  parkingFeeRules: '/parking/fee-rules',
  parkingAnalytics: '/parking/analytics',
  parkingSettings: '/parking/settings',
  // SMART
  aiAssistant: '/smart/ai-assistant',
  analytics: '/smart/analytics',
  automation: '/smart/automation',
  // CCTV
  cctvDashboard: '/cctv/dashboard',
  cctvCameras: '/cctv/cameras',
  cctvLive: '/cctv/live',
  cctvClips: '/cctv/clips',
  cctvSettings: '/cctv/settings',
  // SETTINGS
  settings: '/settings',
  // AUTH
  login: '/login',
} as const;
