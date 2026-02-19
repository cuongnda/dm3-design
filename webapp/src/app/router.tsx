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
      { path: 'operate/room-booking', element: ph('Room Booking', 'OPERATE', '#F59E0B') },
      { path: 'operate/parking', element: ph('Parking', 'OPERATE', '#F59E0B') },
      { path: 'operate/maintenance', element: ph('Maintenance', 'OPERATE', '#F59E0B') },
      { path: 'operate/guard-tour', element: ph('Guard Tour', 'OPERATE', '#F59E0B') },
      { path: 'operate/keys', element: ph('Keys', 'OPERATE', '#F59E0B') },
      { path: 'operate/iot-energy', element: ph('IoT & Energy', 'OPERATE', '#F59E0B') },

      // SMART
      { path: 'smart/ai-assistant', element: ph('AI Assistant', 'SMART', '#06B6D4') },
      { path: 'smart/analytics', element: ph('Analytics', 'SMART', '#06B6D4') },
      { path: 'smart/automation', element: ph('Automation', 'SMART', '#06B6D4') },

      // SETTINGS
      { path: 'settings', element: ph('Settings') },
    ],
  },
]);
