import {
  LayoutDashboard, Bell, DoorOpen, Video, ShieldAlert, Phone,
  Bot, AlertTriangle, Users, UserPlus, Wrench, Clock, Package,
  Building2, Car, Hammer, Shield, Key, Zap,
  UserCheck, MapPin, Users2, Cpu, ClipboardList, Eye, FileText,
  BarChart3, CalendarClock, SlidersHorizontal, CircleDollarSign,
  Ticket, ParkingSquare, Activity, History,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NavStatus } from '../lib/navStatus';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  labelKey: string;
  labelFallback: string;
  status: NavStatus;
  testId?: string;
  badgeKey?: 'alerts';
}

export interface NavSection {
  key: string;
  labelKey: string;
  labelFallback: string;
  color: string;
  pluginGate?: 'visitor' | 'parking' | 'cctv';
  items: NavItem[];
}

export const NAV_CONFIG: NavSection[] = [
  {
    key: 'overview',
    labelKey: 'nav.overview',
    labelFallback: 'OVERVIEW',
    color: '#64748B',
    items: [
      { to: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard', labelFallback: 'Dashboard', status: 'ready' },
      { to: '/monitoring', icon: Activity, labelKey: 'nav.monitoring', labelFallback: 'Monitoring', status: 'setup' },
      { to: '/alerts', icon: Bell, labelKey: 'nav.alerts', labelFallback: 'Alerts', status: 'ready', badgeKey: 'alerts' },
    ],
  },
  {
    key: 'secure',
    labelKey: 'nav.secure',
    labelFallback: 'SECURE',
    color: '#3B82F6',
    items: [
      { to: '/secure/access-control', icon: DoorOpen, labelKey: 'nav.accessControl', labelFallback: 'Access Control', status: 'ready' },
      { to: '/secure/cctv', icon: Video, labelKey: 'nav.cctv', labelFallback: 'CCTV', status: 'ready' },
      { to: '/secure/intrusion', icon: ShieldAlert, labelKey: 'nav.intrusion', labelFallback: 'Intrusion', status: 'coming-soon' },
      { to: '/secure/intercom', icon: Phone, labelKey: 'nav.intercom', labelFallback: 'Intercom', status: 'coming-soon' },
      { to: '/secure/ai-detection', icon: Bot, labelKey: 'nav.aiDetection', labelFallback: 'AI Detection', status: 'coming-soon' },
      { to: '/secure/emergency', icon: AlertTriangle, labelKey: 'nav.emergency', labelFallback: 'Emergency', status: 'coming-soon' },
      { to: '/secure/access-history', icon: History, labelKey: 'nav.accessHistory', labelFallback: 'Access History', status: 'ready', testId: 'sys-link-access-history' },
    ],
  },
  {
    key: 'manage',
    labelKey: 'nav.manage',
    labelFallback: 'MANAGE',
    color: '#8B5CF6',
    items: [
      { to: '/manage/users', icon: UserCheck, labelKey: 'nav.users', labelFallback: 'Users', status: 'setup' },
      { to: '/manage/departments', icon: Building2, labelKey: 'nav.departments', labelFallback: 'Departments', status: 'setup' },
      { to: '/manage/identities', icon: Users, labelKey: 'nav.identities', labelFallback: 'Identities', status: 'ready' },
      { to: '/manage/contractors', icon: Wrench, labelKey: 'nav.contractors', labelFallback: 'Contractors', status: 'coming-soon' },
      { to: '/manage/attendance', icon: Clock, labelKey: 'nav.attendance', labelFallback: 'Attendance', status: 'coming-soon' },
      { to: '/manage/deliveries', icon: Package, labelKey: 'nav.deliveries', labelFallback: 'Deliveries', status: 'coming-soon' },
    ],
  },
  {
    key: 'visitors',
    labelKey: 'nav.visitorsSection',
    labelFallback: 'VISITORS',
    color: '#10B981',
    pluginGate: 'visitor',
    items: [
      { to: '/visitors', icon: LayoutDashboard, labelKey: 'nav.visitorsDashboard', labelFallback: 'Dashboard', status: 'ready' },
      { to: '/visitors/register', icon: UserPlus, labelKey: 'nav.visitorsRegister', labelFallback: 'Register', status: 'ready' },
      { to: '/visitors/groups', icon: Users2, labelKey: 'nav.visitorsGroups', labelFallback: 'Groups', status: 'ready' },
      { to: '/visitors/watchlist', icon: Eye, labelKey: 'nav.visitorsWatchlist', labelFallback: 'Watchlist', status: 'ready' },
      { to: '/visitors/agreements', icon: FileText, labelKey: 'nav.visitorsAgreements', labelFallback: 'Agreements', status: 'ready' },
      { to: '/visitors/access-history', icon: ClipboardList, labelKey: 'nav.visitorsAccessHistory', labelFallback: 'Access History', status: 'ready' },
      { to: '/visitors/analytics', icon: BarChart3, labelKey: 'nav.visitorsAnalytics', labelFallback: 'Analytics', status: 'ready' },
      { to: '/visitors/recurring', icon: CalendarClock, labelKey: 'nav.visitorsRecurring', labelFallback: 'Recurring', status: 'ready' },
      { to: '/visitors/settings', icon: SlidersHorizontal, labelKey: 'nav.visitorsSettings', labelFallback: 'Settings', status: 'ready' },
    ],
  },
  {
    key: 'parking',
    labelKey: 'nav.parkingSection',
    labelFallback: 'PARKING',
    color: '#F59E0B',
    pluginGate: 'parking',
    items: [
      { to: '/parking', icon: LayoutDashboard, labelKey: 'nav.parkingDashboard', labelFallback: 'Dashboard', status: 'ready' },
      { to: '/parking/sessions', icon: ClipboardList, labelKey: 'nav.parkingSessions', labelFallback: 'Sessions', status: 'ready' },
      { to: '/parking/vehicles', icon: Car, labelKey: 'nav.parkingVehicles', labelFallback: 'Vehicles', status: 'ready' },
      { to: '/parking/zones', icon: ParkingSquare, labelKey: 'nav.parkingZones', labelFallback: 'Zones', status: 'ready' },
      { to: '/parking/passes', icon: Ticket, labelKey: 'nav.parkingPasses', labelFallback: 'Passes', status: 'ready' },
      { to: '/parking/fee-rules', icon: CircleDollarSign, labelKey: 'nav.parkingFeeRules', labelFallback: 'Fee Rules', status: 'ready' },
      { to: '/parking/analytics', icon: BarChart3, labelKey: 'nav.parkingAnalytics', labelFallback: 'Analytics', status: 'ready' },
      { to: '/parking/settings', icon: SlidersHorizontal, labelKey: 'nav.parkingSettings', labelFallback: 'Settings', status: 'ready' },
    ],
  },
  {
    key: 'cctv',
    labelKey: 'nav.cctvSection',
    labelFallback: 'CCTV',
    color: '#3B82F6',
    pluginGate: 'cctv',
    items: [
      { to: '/cctv/dashboard', icon: LayoutDashboard, labelKey: 'nav.cctvDashboard', labelFallback: 'Dashboard', status: 'ready' },
      { to: '/cctv/cameras', icon: Video, labelKey: 'nav.cctvCameras', labelFallback: 'Cameras', status: 'ready' },
      { to: '/cctv/live', icon: Eye, labelKey: 'nav.cctvLive', labelFallback: 'Live', status: 'ready' },
      { to: '/cctv/clips', icon: ClipboardList, labelKey: 'nav.cctvClips', labelFallback: 'Clips', status: 'ready' },
      { to: '/cctv/settings', icon: SlidersHorizontal, labelKey: 'nav.cctvSettings', labelFallback: 'Settings', status: 'ready' },
    ],
  },
  {
    key: 'access',
    labelKey: 'nav.access',
    labelFallback: 'ACCESS',
    color: '#F59E0B',
    items: [
      { to: '/access/zones', icon: MapPin, labelKey: 'nav.zones', labelFallback: 'Zones', status: 'ready' },
      { to: '/access/access-points', icon: Shield, labelKey: 'nav.accessPoints', labelFallback: 'Access Points', status: 'ready' },
      { to: '/access/access-groups', icon: Users2, labelKey: 'nav.accessGroups', labelFallback: 'Access Groups', status: 'ready' },
      { to: '/access/access-times', icon: Clock, labelKey: 'nav.accessTimes', labelFallback: 'Access Times', status: 'ready' },
      { to: '/devices', icon: Cpu, labelKey: 'nav.devices', labelFallback: 'Devices', status: 'ready' },
    ],
  },
  {
    key: 'operate',
    labelKey: 'nav.operate',
    labelFallback: 'OPERATE',
    color: '#F59E0B',
    items: [
      { to: '/operate/room-booking', icon: Building2, labelKey: 'nav.roomBooking', labelFallback: 'Room Booking', status: 'coming-soon' },
      { to: '/operate/maintenance', icon: Hammer, labelKey: 'nav.maintenance', labelFallback: 'Maintenance', status: 'coming-soon' },
      { to: '/operate/guard-tour', icon: Shield, labelKey: 'nav.guardTour', labelFallback: 'Guard Tour', status: 'coming-soon' },
      { to: '/operate/keys', icon: Key, labelKey: 'nav.keys', labelFallback: 'Keys', status: 'coming-soon' },
      { to: '/operate/iot-energy', icon: Zap, labelKey: 'nav.iotEnergy', labelFallback: 'IoT & Energy', status: 'coming-soon' },
    ],
  },
];

export function findActiveSectionKey(pathname: string): string | null {
  for (const section of NAV_CONFIG) {
    const match = section.items.find((item) => {
      if (item.to === '/') return pathname === '/';
      return pathname === item.to || pathname.startsWith(`${item.to}/`);
    });
    if (match) return section.key;
  }
  return null;
}
