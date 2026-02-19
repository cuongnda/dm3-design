import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';

// Lazy-loaded feature modules
const AccessControlPage = lazy(() =>
  import('@/features/secure/access-control/AccessControlPage').then((m) => ({ default: m.AccessControlPage }))
);
const DoorDetailPage = lazy(() =>
  import('@/features/secure/access-control/DoorDetailPage').then((m) => ({ default: m.DoorDetailPage }))
);
const AccessRulesPage = lazy(() =>
  import('@/features/secure/access-control/AccessRulesPage').then((m) => ({ default: m.AccessRulesPage }))
);
const CCTVPage = lazy(() =>
  import('@/features/secure/cctv/CCTVPage').then((m) => ({ default: m.CCTVPage }))
);
const CameraDetailPage = lazy(() =>
  import('@/features/secure/cctv/CameraDetailPage').then((m) => ({ default: m.CameraDetailPage }))
);
const IntrusionPage = lazy(() =>
  import('@/features/secure/intrusion/IntrusionPage').then((m) => ({ default: m.IntrusionPage }))
);
const IntercomPage = lazy(() =>
  import('@/features/secure/intercom/IntercomPage').then((m) => ({ default: m.IntercomPage }))
);
const AIDetectionPage = lazy(() =>
  import('@/features/secure/ai-detection/AIDetectionPage').then((m) => ({ default: m.AIDetectionPage }))
);
const EmergencyPage = lazy(() =>
  import('@/features/secure/emergency/EmergencyPage').then((m) => ({ default: m.EmergencyPage }))
);

// MANAGE
const IdentitiesPage = lazy(() =>
  import('@/features/manage/identities/IdentitiesPage').then((m) => ({ default: m.IdentitiesPage }))
);
const VisitorsPage = lazy(() =>
  import('@/features/manage/visitors/VisitorsPage').then((m) => ({ default: m.VisitorsPage }))
);
const ContractorsPage = lazy(() =>
  import('@/features/manage/contractors/ContractorsPage').then((m) => ({ default: m.ContractorsPage }))
);
const AttendancePage = lazy(() =>
  import('@/features/manage/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage }))
);
const DeliveriesPage = lazy(() =>
  import('@/features/manage/deliveries/DeliveriesPage').then((m) => ({ default: m.DeliveriesPage }))
);
const ProvisioningPage = lazy(() =>
  import('@/features/manage/provisioning/ProvisioningPage').then((m) => ({ default: m.ProvisioningPage }))
);

// OPERATE
const RoomBookingPage = lazy(() =>
  import('@/features/operate/room-booking/RoomBookingPage').then((m) => ({ default: m.RoomBookingPage }))
);
const ParkingPage = lazy(() =>
  import('@/features/operate/parking/ParkingPage').then((m) => ({ default: m.ParkingPage }))
);
const MaintenancePage = lazy(() =>
  import('@/features/operate/maintenance/MaintenancePage').then((m) => ({ default: m.MaintenancePage }))
);
const GuardTourPage = lazy(() =>
  import('@/features/operate/guard-tour/GuardTourPage').then((m) => ({ default: m.GuardTourPage }))
);
const KeyManagementPage = lazy(() =>
  import('@/features/operate/keys/KeyManagementPage').then((m) => ({ default: m.KeyManagementPage }))
);
const IoTEnergyPage = lazy(() =>
  import('@/features/operate/iot-energy/IoTEnergyPage').then((m) => ({ default: m.IoTEnergyPage }))
);

// SMART
const AIAssistantPage = lazy(() =>
  import('@/features/smart/ai-assistant/AIAssistantPage').then((m) => ({ default: m.AIAssistantPage }))
);
const AnalyticsPage = lazy(() =>
  import('@/features/smart/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
);
const AutomationPage = lazy(() =>
  import('@/features/smart/automation/AutomationPage').then((m) => ({ default: m.AutomationPage }))
);

// SETTINGS
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

function LazyWrap({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-[#3B82F6]/30 border-t-[#3B82F6] rounded-full animate-spin" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

// Placeholder factory
const ph = (title: string, domain?: string, color?: string) => (
  <PlaceholderPage title={title} domain={domain} domainColor={color} />
);

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'alerts', element: ph('Alerts') },

      // SECURE
      { path: 'secure/access-control', element: <LazyWrap><AccessControlPage /></LazyWrap> },
      { path: 'secure/access-control/rules', element: <LazyWrap><AccessRulesPage /></LazyWrap> },
      { path: 'secure/access-control/:id', element: <LazyWrap><DoorDetailPage /></LazyWrap> },
      { path: 'secure/cctv', element: <LazyWrap><CCTVPage /></LazyWrap> },
      { path: 'secure/cctv/:id', element: <LazyWrap><CameraDetailPage /></LazyWrap> },
      { path: 'secure/intrusion', element: <LazyWrap><IntrusionPage /></LazyWrap> },
      { path: 'secure/intercom', element: <LazyWrap><IntercomPage /></LazyWrap> },
      { path: 'secure/ai-detection', element: <LazyWrap><AIDetectionPage /></LazyWrap> },
      { path: 'secure/emergency', element: <LazyWrap><EmergencyPage /></LazyWrap> },

      // MANAGE
      { path: 'manage/identities', element: <LazyWrap><IdentitiesPage /></LazyWrap> },
      { path: 'manage/visitors', element: <LazyWrap><VisitorsPage /></LazyWrap> },
      { path: 'manage/contractors', element: <LazyWrap><ContractorsPage /></LazyWrap> },
      { path: 'manage/attendance', element: <LazyWrap><AttendancePage /></LazyWrap> },
      { path: 'manage/deliveries', element: <LazyWrap><DeliveriesPage /></LazyWrap> },
      { path: 'manage/provisioning', element: <LazyWrap><ProvisioningPage /></LazyWrap> },

      // OPERATE
      { path: 'operate/room-booking', element: <LazyWrap><RoomBookingPage /></LazyWrap> },
      { path: 'operate/parking', element: <LazyWrap><ParkingPage /></LazyWrap> },
      { path: 'operate/maintenance', element: <LazyWrap><MaintenancePage /></LazyWrap> },
      { path: 'operate/guard-tour', element: <LazyWrap><GuardTourPage /></LazyWrap> },
      { path: 'operate/keys', element: <LazyWrap><KeyManagementPage /></LazyWrap> },
      { path: 'operate/iot-energy', element: <LazyWrap><IoTEnergyPage /></LazyWrap> },

      // SMART
      { path: 'smart/ai-assistant', element: <LazyWrap><AIAssistantPage /></LazyWrap> },
      { path: 'smart/analytics', element: <LazyWrap><AnalyticsPage /></LazyWrap> },
      { path: 'smart/automation', element: <LazyWrap><AutomationPage /></LazyWrap> },

      // SETTINGS
      { path: 'settings', element: <LazyWrap><SettingsPage /></LazyWrap> },
    ],
  },
]);
