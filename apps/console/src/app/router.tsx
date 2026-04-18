import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { MainLayout } from '@dm3/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

/**
 * Retry wrapper for React.lazy — retries failed dynamic imports up to 3 times
 * with exponential backoff. Handles intermittent network failures and stale
 * chunk hashes after deployments.
 */
function lazyWithRetry<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  retries = 3,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await factory();
      } catch (err) {
        if (attempt === retries - 1) throw err;
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    // Unreachable, but satisfies TS
    return factory();
  });
}
import { LoginPage } from '@/features/auth/LoginPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { SystemLayout } from '@/features/system/SystemLayout';
import { SystemDashboardPage } from '@/features/system/SystemDashboardPage';
import { CompanyListPage } from '@/features/system/CompanyListPage';
import { CreateCompanyPage } from '@/features/system/CreateCompanyPage';
import { CompanyDetailPage } from '@/features/system/CompanyDetailPage';
import { SystemDevicesPage } from '@/features/system/SystemDevicesPage';
import { EditDevicePage } from '@/features/system/EditDevicePage';
import { FirmwareListPage } from '@/features/system/FirmwareListPage';
import { FirmwareUploadPage } from '@/features/system/FirmwareUploadPage';
import { FirmwareDetailPage } from '@/features/system/FirmwareDetailPage';
import { UserAccountListPage } from '@/features/system/UserAccountListPage';
import { UserAccountDetailPage } from '@/features/system/UserAccountDetailPage';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleBasedRoute } from './RoleBasedRoute';
import { PluginGuard } from '@/components/common/PluginGuard';

// Essential Security Features (legacy)
const AccessControlPage = lazyWithRetry(() =>
  import('@/features/secure/access-control/AccessControlPage').then((m) => ({ default: m.AccessControlPage }))
);
const DoorDetailPage = lazyWithRetry(() =>
  import('@/features/secure/access-control/DoorDetailPage').then((m) => ({ default: m.DoorDetailPage }))
);
const AccessRulesPage = lazyWithRetry(() =>
  import('@/features/secure/access-control/AccessRulesPage').then((m) => ({ default: m.AccessRulesPage }))
);
const AccessTimeListPage = lazyWithRetry(() =>
  import('@/features/secure/access-control/access-time/AccessTimeListPage').then((m) => ({ default: m.AccessTimeListPage }))
);
const AccessTimeFormPage = lazyWithRetry(() =>
  import('@/features/secure/access-control/access-time/AccessTimeFormPage').then((m) => ({ default: m.AccessTimeFormPage }))
);

const CCTVPage = lazyWithRetry(() =>
  import('@/features/secure/cctv/CCTVPage').then((m) => ({ default: m.CCTVPage }))
);
const CameraDetailPage = lazyWithRetry(() =>
  import('@/features/secure/cctv/CameraDetailPage').then((m) => ({ default: m.CameraDetailPage }))
);
const IntrusionPage = lazyWithRetry(() =>
  import('@/features/secure/intrusion/IntrusionPage').then((m) => ({ default: m.IntrusionPage }))
);
const IntercomPage = lazyWithRetry(() =>
  import('@/features/secure/intercom/IntercomPage').then((m) => ({ default: m.IntercomPage }))
);
const AIDetectionPage = lazyWithRetry(() =>
  import('@/features/secure/ai-detection/AIDetectionPage').then((m) => ({ default: m.AIDetectionPage }))
);
const EmergencyPage = lazyWithRetry(() =>
  import('@/features/secure/emergency/EmergencyPage').then((m) => ({ default: m.EmergencyPage }))
);
const EmergencyPlanFormPage = lazyWithRetry(() =>
  import('@/features/secure/emergency/EmergencyPlanFormPage').then((m) => ({ default: m.EmergencyPlanFormPage }))
);
const AccessHistoryPage = lazyWithRetry(() =>
  import('@/features/secure/access-history/AccessHistoryPage').then((m) => ({ default: m.AccessHistoryPage }))
);

// ACCESS
const ZonesPage = lazyWithRetry(() =>
  import('@/features/access/zones/ZonesPage').then((m) => ({ default: m.ZonesPage }))
);
const ZoneDetailPage = lazyWithRetry(() =>
  import('@/features/access/zones/ZoneDetailPage').then((m) => ({ default: m.ZoneDetailPage }))
);
const ZoneFormPage = lazyWithRetry(() =>
  import('@/features/access/zones/ZoneFormPage').then((m) => ({ default: m.ZoneFormPage }))
);
const AccessPointsPage = lazyWithRetry(() =>
  import('@/features/access/access-points/AccessPointsPage').then((m) => ({ default: m.AccessPointsPage }))
);
const AccessPointDetailPage = lazyWithRetry(() =>
  import('@/features/access/access-points/AccessPointDetailPage').then((m) => ({ default: m.AccessPointDetailPage }))
);
const AccessGroupsPage = lazyWithRetry(() =>
  import('@/features/access/access-groups/AccessGroupsPage').then((m) => ({ default: m.AccessGroupsPage }))
);
const AccessGroupDetailPage = lazyWithRetry(() =>
  import('@/features/access/access-groups/AccessGroupDetailPage').then((m) => ({ default: m.AccessGroupDetailPage }))
);
const AccessTimesPage = lazyWithRetry(() =>
  import('@/features/access/access-times/AccessTimesPage').then((m) => ({ default: m.AccessTimesPage }))
);
const AccessTimeFormPage2 = lazyWithRetry(() =>
  import('@/features/access/access-times/AccessTimeFormPage').then((m) => ({ default: m.AccessTimeFormPage }))
);

// MANAGE
const IdentitiesPage = lazyWithRetry(() =>
  import('@/features/manage/identities/IdentitiesPage').then((m) => ({ default: m.IdentitiesPage }))
);
const PersonDetailPage = lazyWithRetry(() =>
  import('@/features/manage/identities/PersonDetailPage').then((m) => ({ default: m.PersonDetailPage }))
);
const UserManagementPage = lazyWithRetry(() =>
  import('@/features/user-management/UserManagementPage').then((m) => ({ default: m.UserManagementPage }))
);
const UserDetailPage = lazyWithRetry(() =>
  import('@/features/user-management/UserDetailPage').then((m) => ({ default: m.UserDetailPage }))
);
const DepartmentManagementPage = lazyWithRetry(() =>
  import('@/features/department-management/DepartmentManagementPage').then((m) => ({ default: m.DepartmentManagementPage }))
);

const VisitorsPage = lazyWithRetry(() =>
  import('@/features/manage/visitors/VisitorsPage').then((m) => ({ default: m.VisitorsPage }))
);
const VisitorPreRegisterPage = lazyWithRetry(() =>
  import('@/features/visitors/VisitorPreRegisterPage').then((m) => ({ default: m.VisitorPreRegisterPage }))
);
const VisitorGroupsPage = lazyWithRetry(() =>
  import('@/features/visitors/VisitorGroupsPage').then((m) => ({ default: m.VisitorGroupsPage }))
);
const VisitorWatchlistPage = lazyWithRetry(() =>
  import('@/features/visitors/VisitorWatchlistPage').then((m) => ({ default: m.VisitorWatchlistPage }))
);
const VisitorAgreementsPage = lazyWithRetry(() =>
  import('@/features/visitors/VisitorAgreementsPage').then((m) => ({ default: m.VisitorAgreementsPage }))
);
const VisitorAccessHistoryPage = lazyWithRetry(() =>
  import('@/features/visitors/VisitorAccessHistoryPage').then((m) => ({ default: m.VisitorAccessHistoryPage }))
);
const VisitorAnalyticsPage = lazyWithRetry(() =>
  import('@/features/visitors/VisitorAnalyticsPage').then((m) => ({ default: m.VisitorAnalyticsPage }))
);
const VisitorRecurringPage = lazyWithRetry(() =>
  import('@/features/visitors/VisitorRecurringPage').then((m) => ({ default: m.VisitorRecurringPage }))
);
const VisitorSettingsPage = lazyWithRetry(() =>
  import('@/features/visitors/VisitorSettingsPage').then((m) => ({ default: m.VisitorSettingsPage }))
);
const ContractorsPage = lazyWithRetry(() =>
  import('@/features/manage/contractors/ContractorsPage').then((m) => ({ default: m.ContractorsPage }))
);
const AttendancePage = lazyWithRetry(() =>
  import('@/features/manage/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage }))
);
const DeliveriesPage = lazyWithRetry(() =>
  import('@/features/manage/deliveries/DeliveriesPage').then((m) => ({ default: m.DeliveriesPage }))
);
const GroupsPage = lazyWithRetry(() =>
  import('@/features/manage/identities/GroupsPage').then((m) => ({ default: m.GroupsPage }))
);
const ProvisioningPage = lazyWithRetry(() =>
  import('@/features/manage/provisioning/ProvisioningPage').then((m) => ({ default: m.ProvisioningPage }))
);

// CCTV
const CCTVDashboardPage = lazyWithRetry(() =>
  import('@/features/cctv/CCTVDashboardPage').then((m) => ({ default: m.CCTVDashboardPage }))
);
const CCTVCamerasPage = lazyWithRetry(() =>
  import('@/features/cctv/CCTVCamerasPage').then((m) => ({ default: m.CCTVCamerasPage }))
);
const CCTVLiveViewPage = lazyWithRetry(() =>
  import('@/features/cctv/CCTVLiveViewPage').then((m) => ({ default: m.CCTVLiveViewPage }))
);
const CCTVClipsPage = lazyWithRetry(() =>
  import('@/features/cctv/CCTVClipsPage').then((m) => ({ default: m.CCTVClipsPage }))
);
const CCTVSettingsPage = lazyWithRetry(() =>
  import('@/features/cctv/CCTVSettingsPage').then((m) => ({ default: m.CCTVSettingsPage }))
);

// OPERATE
const RoomBookingPage = lazyWithRetry(() =>
  import('@/features/operate/room-booking/RoomBookingPage').then((m) => ({ default: m.RoomBookingPage }))
);
const ParkingDashboardPage = lazyWithRetry(() =>
  import('@/features/parking/ParkingDashboardPage').then((m) => ({ default: m.ParkingDashboardPage }))
);
const ParkingSessionsPage = lazyWithRetry(() =>
  import('@/features/parking/ParkingSessionsPage').then((m) => ({ default: m.ParkingSessionsPage }))
);
const ParkingVehiclesPage = lazyWithRetry(() =>
  import('@/features/parking/ParkingVehiclesPage').then((m) => ({ default: m.ParkingVehiclesPage }))
);
const ParkingZonesPage = lazyWithRetry(() =>
  import('@/features/parking/ParkingZonesPage').then((m) => ({ default: m.ParkingZonesPage }))
);
const ParkingPassesPage = lazyWithRetry(() =>
  import('@/features/parking/ParkingPassesPage').then((m) => ({ default: m.ParkingPassesPage }))
);
const ParkingFeeRulesPage = lazyWithRetry(() =>
  import('@/features/parking/ParkingFeeRulesPage').then((m) => ({ default: m.ParkingFeeRulesPage }))
);
const ParkingAnalyticsPage2 = lazyWithRetry(() =>
  import('@/features/parking/ParkingAnalyticsPage').then((m) => ({ default: m.ParkingAnalyticsPage }))
);
const ParkingSettingsPage = lazyWithRetry(() =>
  import('@/features/parking/ParkingSettingsPage').then((m) => ({ default: m.ParkingSettingsPage }))
);
const MaintenancePage = lazyWithRetry(() =>
  import('@/features/operate/maintenance/MaintenancePage').then((m) => ({ default: m.MaintenancePage }))
);
const GuardTourPage = lazyWithRetry(() =>
  import('@/features/operate/guard-tour/GuardTourPage').then((m) => ({ default: m.GuardTourPage }))
);
const KeyManagementPage = lazyWithRetry(() =>
  import('@/features/operate/keys/KeyManagementPage').then((m) => ({ default: m.KeyManagementPage }))
);
const IoTEnergyPage = lazyWithRetry(() =>
  import('@/features/operate/iot-energy/IoTEnergyPage').then((m) => ({ default: m.IoTEnergyPage }))
);

// SMART
const AIAssistantPage = lazyWithRetry(() =>
  import('@/features/smart/ai-assistant/AIAssistantPage').then((m) => ({ default: m.AIAssistantPage }))
);
const AnalyticsPage = lazyWithRetry(() =>
  import('@/features/smart/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage }))
);
const AutomationPage = lazyWithRetry(() =>
  import('@/features/smart/automation/AutomationPage').then((m) => ({ default: m.AutomationPage }))
);

// DEVICES
const LiveEventsPage = lazyWithRetry(() =>
  import('@/features/monitoring/LiveEventsPage').then((m) => ({ default: m.LiveEventsPage }))
);
const DevicesPage = lazyWithRetry(() =>
  import('@/features/devices/DevicesPage').then((m) => ({ default: m.DevicesPage }))
);
const DeviceDetailPage = lazyWithRetry(() =>
  import('@/features/devices/DeviceDetailPage').then((m) => ({ default: m.DeviceDetailPage }))
);
const ProvisionDevicePage = lazyWithRetry(() =>
  import('@/features/devices/ProvisionDevicePage').then((m) => ({ default: m.ProvisionDevicePage }))
);
const PendingDevicesPage = lazyWithRetry(() =>
  import('@/features/devices/PendingDevicesPage').then((m) => ({ default: m.PendingDevicesPage }))
);

// PROFILE
const ProfilePage = lazyWithRetry(() =>
  import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);

// SETTINGS
const SettingsPage = lazyWithRetry(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const TenantAuditLogPage = lazyWithRetry(() =>
  import('@/features/settings/AuditLogPage').then((m) => ({ default: m.TenantAuditLogPage }))
);
const EmailTemplatesPage = lazyWithRetry(() =>
  import('@/features/settings/EmailTemplatesPage').then((m) => ({ default: m.EmailTemplatesPage }))
);

// SYSTEM AUDIT
const AuditLogPage = lazyWithRetry(() =>
  import('@/features/system/AuditLogPage').then((m) => ({ default: m.AuditLogPage }))
);

// ALERTS
const AlertsPage = lazyWithRetry(() =>
  import('@/features/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage }))
);

// SYSTEM SETTINGS
const SystemSettingsPage = lazyWithRetry(() =>
  import('@/features/system/SystemSettingsPage').then((m) => ({ default: m.SystemSettingsPage }))
);

/** Suspense renders no DOM node; this wrapper keeps flex height so pages can min-h-0 + flex-1 into the viewport.
 *  ErrorBoundary resets automatically on navigation (key changes with pathname). */
export function LazyWrap({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <ErrorBoundary key={pathname}>
        <Suspense
          fallback={
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#3B82F6]/30 border-t-[#3B82F6]" />
            </div>
          }
        >
          {children}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

export const Router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/system',
        element: <SystemLayout />,
        children: [
          { index: true, element: <SystemDashboardPage /> },
          { path: 'companies', element: <CompanyListPage /> },
          { path: 'companies/new', element: <CreateCompanyPage /> },
          { path: 'companies/:id', element: <CompanyDetailPage /> },
          { path: 'accounts', element: <UserAccountListPage /> },
          { path: 'accounts/:id', element: <UserAccountDetailPage /> },
          { path: 'devices/pending', element: <LazyWrap><PendingDevicesPage isSystemAdmin={true} /></LazyWrap> },
          { path: 'devices', element: <SystemDevicesPage /> },
          { path: 'devices/:id/edit', element: <EditDevicePage /> },
          { path: 'firmware', element: <FirmwareListPage /> },
          { path: 'firmware/upload', element: <FirmwareUploadPage /> },
          { path: 'firmware/:id', element: <FirmwareDetailPage /> },
          { path: 'settings', element: <LazyWrap><SystemSettingsPage /></LazyWrap> },
          { path: 'audit', element: <LazyWrap><AuditLogPage /></LazyWrap> },
        ],
      },
      {
        path: '/',
        element: <RoleBasedRoute />,
        children: [
          {
            element: <MainLayout />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'alerts', element: <LazyWrap><AlertsPage /></LazyWrap> },
              { path: 'monitoring', element: <LazyWrap><LiveEventsPage /></LazyWrap> },

              // SECURE (legacy routes)
              { path: 'secure/access-control', element: <LazyWrap><AccessControlPage /></LazyWrap> },
              { path: 'secure/access-control/rules', element: <LazyWrap><AccessRulesPage /></LazyWrap> },
              { path: 'secure/access-control/access-time', element: <LazyWrap><AccessTimeListPage /></LazyWrap> },
              { path: 'secure/access-control/access-time/new', element: <LazyWrap><AccessTimeFormPage /></LazyWrap> },
              { path: 'secure/access-control/access-time/:id', element: <LazyWrap><AccessTimeFormPage /></LazyWrap> },
              { path: 'secure/access-control/:id', element: <LazyWrap><DoorDetailPage /></LazyWrap> },
              { path: 'secure/cctv', element: <LazyWrap><CCTVPage /></LazyWrap> },
              { path: 'secure/cctv/:id', element: <LazyWrap><CameraDetailPage /></LazyWrap> },
              { path: 'secure/intrusion', element: <LazyWrap><IntrusionPage /></LazyWrap> },
              { path: 'secure/intercom', element: <LazyWrap><IntercomPage /></LazyWrap> },
              { path: 'secure/ai-detection', element: <LazyWrap><AIDetectionPage /></LazyWrap> },
              { path: 'secure/emergency', element: <LazyWrap><EmergencyPage /></LazyWrap> },
              { path: 'secure/emergency/plans/new', element: <LazyWrap><EmergencyPlanFormPage /></LazyWrap> },
              { path: 'secure/emergency/plans/:id/edit', element: <LazyWrap><EmergencyPlanFormPage /></LazyWrap> },
              { path: 'secure/access-history', element: <LazyWrap><AccessHistoryPage /></LazyWrap> },

              // ACCESS (new)
              { path: 'access/zones', element: <LazyWrap><ZonesPage /></LazyWrap> },
              { path: 'access/zones/:id/edit', element: <LazyWrap><ZoneFormPage mode="edit" /></LazyWrap> },
              { path: 'access/zones/:id', element: <LazyWrap><ZoneDetailPage /></LazyWrap> },
              { path: 'access/access-points', element: <LazyWrap><AccessPointsPage /></LazyWrap> },
              { path: 'access/access-points/:id', element: <LazyWrap><AccessPointDetailPage /></LazyWrap> },
              { path: 'access/access-groups', element: <LazyWrap><AccessGroupsPage /></LazyWrap> },
              { path: 'access/access-groups/:id', element: <LazyWrap><AccessGroupDetailPage /></LazyWrap> },
              { path: 'access/access-times', element: <LazyWrap><AccessTimesPage /></LazyWrap> },
              { path: 'access/access-times/:id', element: <LazyWrap><AccessTimeFormPage2 /></LazyWrap> },

              // MANAGE
              { path: 'manage/users', element: <LazyWrap><UserManagementPage /></LazyWrap> },
              { path: 'manage/users/:id', element: <LazyWrap><UserDetailPage /></LazyWrap> },
              // Vehicle registry moved to parking plugin (see docs/changelog/2026-04-12-parking-access-integration.md)
              { path: 'manage/vehicles', element: <Navigate to="/parking/vehicles" replace /> },
              { path: 'manage/departments', element: <LazyWrap><DepartmentManagementPage /></LazyWrap> },
              { path: 'manage/identities', element: <LazyWrap><IdentitiesPage /></LazyWrap> },
              { path: 'manage/identities/:id', element: <LazyWrap><PersonDetailPage /></LazyWrap> },
              { path: 'manage/identities/groups', element: <LazyWrap><GroupsPage /></LazyWrap> },
              { path: 'manage/contractors', element: <LazyWrap><ContractorsPage /></LazyWrap> },

              // VISITORS
              { path: 'visitors', element: <PluginGuard plugin="visitor"><LazyWrap><VisitorsPage /></LazyWrap></PluginGuard> },
              { path: 'visitors/register', element: <PluginGuard plugin="visitor"><LazyWrap><VisitorPreRegisterPage /></LazyWrap></PluginGuard> },
              { path: 'visitors/groups', element: <PluginGuard plugin="visitor"><LazyWrap><VisitorGroupsPage /></LazyWrap></PluginGuard> },
              { path: 'visitors/watchlist', element: <PluginGuard plugin="visitor"><LazyWrap><VisitorWatchlistPage /></LazyWrap></PluginGuard> },
              { path: 'visitors/agreements', element: <PluginGuard plugin="visitor"><LazyWrap><VisitorAgreementsPage /></LazyWrap></PluginGuard> },
              { path: 'visitors/access-history', element: <PluginGuard plugin="visitor"><LazyWrap><VisitorAccessHistoryPage /></LazyWrap></PluginGuard> },
              { path: 'visitors/analytics', element: <PluginGuard plugin="visitor"><LazyWrap><VisitorAnalyticsPage /></LazyWrap></PluginGuard> },
              { path: 'visitors/recurring', element: <PluginGuard plugin="visitor"><LazyWrap><VisitorRecurringPage /></LazyWrap></PluginGuard> },
              { path: 'visitors/settings', element: <PluginGuard plugin="visitor"><LazyWrap><VisitorSettingsPage /></LazyWrap></PluginGuard> },
              { path: 'manage/attendance', element: <LazyWrap><AttendancePage /></LazyWrap> },
              { path: 'manage/deliveries', element: <LazyWrap><DeliveriesPage /></LazyWrap> },
              { path: 'manage/provisioning', element: <LazyWrap><ProvisioningPage /></LazyWrap> },

              // ACCESS CONTROL (legacy)
              { path: 'access-control', element: <LazyWrap><AccessControlPage /></LazyWrap> },
              { path: 'access-control/rules', element: <LazyWrap><AccessRulesPage /></LazyWrap> },
              { path: 'access-control/:id', element: <LazyWrap><DoorDetailPage /></LazyWrap> },

              // DEVICES
              { path: 'devices', element: <LazyWrap><DevicesPage /></LazyWrap> },
              { path: 'devices/pending', element: <LazyWrap><PendingDevicesPage /></LazyWrap> },
              { path: 'devices/provision', element: <LazyWrap><ProvisionDevicePage /></LazyWrap> },
              { path: 'devices/:id/edit', element: <EditDevicePage isSystemAdmin={false} /> },
              { path: 'devices/:id', element: <LazyWrap><DeviceDetailPage /></LazyWrap> },

              // CCTV
              { path: 'cctv/dashboard', element: <PluginGuard plugin="cctv"><LazyWrap><CCTVDashboardPage /></LazyWrap></PluginGuard> },
              { path: 'cctv/cameras', element: <PluginGuard plugin="cctv"><LazyWrap><CCTVCamerasPage /></LazyWrap></PluginGuard> },
              { path: 'cctv/live', element: <PluginGuard plugin="cctv"><LazyWrap><CCTVLiveViewPage /></LazyWrap></PluginGuard> },
              { path: 'cctv/clips', element: <PluginGuard plugin="cctv"><LazyWrap><CCTVClipsPage /></LazyWrap></PluginGuard> },
              { path: 'cctv/settings', element: <PluginGuard plugin="cctv"><LazyWrap><CCTVSettingsPage /></LazyWrap></PluginGuard> },

              // PARKING
              { path: 'parking', element: <PluginGuard plugin="parking"><LazyWrap><ParkingDashboardPage /></LazyWrap></PluginGuard> },
              { path: 'parking/sessions', element: <PluginGuard plugin="parking"><LazyWrap><ParkingSessionsPage /></LazyWrap></PluginGuard> },
              { path: 'parking/vehicles', element: <PluginGuard plugin="parking"><LazyWrap><ParkingVehiclesPage /></LazyWrap></PluginGuard> },
              { path: 'parking/zones', element: <PluginGuard plugin="parking"><LazyWrap><ParkingZonesPage /></LazyWrap></PluginGuard> },
              { path: 'parking/passes', element: <PluginGuard plugin="parking"><LazyWrap><ParkingPassesPage /></LazyWrap></PluginGuard> },
              { path: 'parking/fee-rules', element: <PluginGuard plugin="parking"><LazyWrap><ParkingFeeRulesPage /></LazyWrap></PluginGuard> },
              { path: 'parking/analytics', element: <PluginGuard plugin="parking"><LazyWrap><ParkingAnalyticsPage2 /></LazyWrap></PluginGuard> },
              { path: 'parking/settings', element: <PluginGuard plugin="parking"><LazyWrap><ParkingSettingsPage /></LazyWrap></PluginGuard> },

              // OPERATE
              { path: 'operate/room-booking', element: <LazyWrap><RoomBookingPage /></LazyWrap> },
              { path: 'operate/maintenance', element: <LazyWrap><MaintenancePage /></LazyWrap> },
              { path: 'operate/guard-tour', element: <LazyWrap><GuardTourPage /></LazyWrap> },
              { path: 'operate/keys', element: <LazyWrap><KeyManagementPage /></LazyWrap> },
              { path: 'operate/iot-energy', element: <LazyWrap><IoTEnergyPage /></LazyWrap> },

              // SMART
              { path: 'smart/ai-assistant', element: <LazyWrap><AIAssistantPage /></LazyWrap> },
              { path: 'smart/analytics', element: <LazyWrap><AnalyticsPage /></LazyWrap> },
              { path: 'smart/automation', element: <LazyWrap><AutomationPage /></LazyWrap> },

              // PROFILE
              { path: 'profile', element: <LazyWrap><ProfilePage /></LazyWrap> },

              // SETTINGS
              { path: 'settings', element: <LazyWrap><SettingsPage /></LazyWrap> },
              { path: 'settings/audit-log', element: <LazyWrap><TenantAuditLogPage /></LazyWrap> },
              { path: 'settings/email-templates', element: <LazyWrap><EmailTemplatesPage /></LazyWrap> },
            ],
          },
        ],
      },
    ],
  },
]);
