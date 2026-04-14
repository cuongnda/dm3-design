import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { MainLayout } from '@dm3/ui';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { SystemLayout } from '@/features/system/SystemLayout';
import { SystemDashboardPage } from '@/features/system/SystemDashboardPage';
import { CompanyListPage } from '@/features/system/CompanyListPage';
import { CreateCompanyPage } from '@/features/system/CreateCompanyPage';
import { CompanyDetailPage } from '@/features/system/CompanyDetailPage';
import { SystemDevicesPage } from '@/features/system/SystemDevicesPage';
import { CreateDevicePage } from '@/features/system/CreateDevicePage';
import { EditDevicePage } from '@/features/system/EditDevicePage';
import { FirmwareListPage } from '@/features/system/FirmwareListPage';
import { FirmwareUploadPage } from '@/features/system/FirmwareUploadPage';
import { FirmwareDetailPage } from '@/features/system/FirmwareDetailPage';
import { UserAccountListPage } from '@/features/system/UserAccountListPage';
import { UserAccountDetailPage } from '@/features/system/UserAccountDetailPage';
import { CreateUserAccountPage } from '@/features/system/CreateUserAccountPage';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleBasedRoute } from './RoleBasedRoute';
import { PluginGuard } from '@/components/common/PluginGuard';

// Essential Security Features (legacy)
const AccessControlPage = lazy(() =>
  import('@/features/secure/access-control/AccessControlPage').then((m) => ({ default: m.AccessControlPage }))
);
const DoorDetailPage = lazy(() =>
  import('@/features/secure/access-control/DoorDetailPage').then((m) => ({ default: m.DoorDetailPage }))
);
const AccessRulesPage = lazy(() =>
  import('@/features/secure/access-control/AccessRulesPage').then((m) => ({ default: m.AccessRulesPage }))
);
const AccessTimeListPage = lazy(() =>
  import('@/features/secure/access-control/access-time/AccessTimeListPage').then((m) => ({ default: m.AccessTimeListPage }))
);
const AccessTimeFormPage = lazy(() =>
  import('@/features/secure/access-control/access-time/AccessTimeFormPage').then((m) => ({ default: m.AccessTimeFormPage }))
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

// ACCESS
const ZonesPage = lazy(() =>
  import('@/features/access/zones/ZonesPage').then((m) => ({ default: m.ZonesPage }))
);
const ZoneDetailPage = lazy(() =>
  import('@/features/access/zones/ZoneDetailPage').then((m) => ({ default: m.ZoneDetailPage }))
);
const AccessPointsPage = lazy(() =>
  import('@/features/access/access-points/AccessPointsPage').then((m) => ({ default: m.AccessPointsPage }))
);
const AccessPointDetailPage = lazy(() =>
  import('@/features/access/access-points/AccessPointDetailPage').then((m) => ({ default: m.AccessPointDetailPage }))
);
const AccessGroupsPage = lazy(() =>
  import('@/features/access/access-groups/AccessGroupsPage').then((m) => ({ default: m.AccessGroupsPage }))
);
const AccessGroupDetailPage = lazy(() =>
  import('@/features/access/access-groups/AccessGroupDetailPage').then((m) => ({ default: m.AccessGroupDetailPage }))
);
const AccessTimesPage = lazy(() =>
  import('@/features/access/access-times/AccessTimesPage').then((m) => ({ default: m.AccessTimesPage }))
);
const AccessTimeFormPage2 = lazy(() =>
  import('@/features/access/access-times/AccessTimeFormPage').then((m) => ({ default: m.AccessTimeFormPage }))
);

// MANAGE
const IdentitiesPage = lazy(() =>
  import('@/features/manage/identities/IdentitiesPage').then((m) => ({ default: m.IdentitiesPage }))
);
const PersonDetailPage = lazy(() =>
  import('@/features/manage/identities/PersonDetailPage').then((m) => ({ default: m.PersonDetailPage }))
);
const UserManagementPage = lazy(() =>
  import('@/features/user-management/UserManagementPage').then((m) => ({ default: m.UserManagementPage }))
);
const UserDetailPage = lazy(() =>
  import('@/features/user-management/UserDetailPage').then((m) => ({ default: m.UserDetailPage }))
);
const DepartmentManagementPage = lazy(() =>
  import('@/features/department-management/DepartmentManagementPage').then((m) => ({ default: m.DepartmentManagementPage }))
);

const VisitorsPage = lazy(() =>
  import('@/features/manage/visitors/VisitorsPage').then((m) => ({ default: m.VisitorsPage }))
);
const VisitorPreRegisterPage = lazy(() =>
  import('@/features/visitors/VisitorPreRegisterPage').then((m) => ({ default: m.VisitorPreRegisterPage }))
);
const VisitorGroupsPage = lazy(() =>
  import('@/features/visitors/VisitorGroupsPage').then((m) => ({ default: m.VisitorGroupsPage }))
);
const VisitorWatchlistPage = lazy(() =>
  import('@/features/visitors/VisitorWatchlistPage').then((m) => ({ default: m.VisitorWatchlistPage }))
);
const VisitorAgreementsPage = lazy(() =>
  import('@/features/visitors/VisitorAgreementsPage').then((m) => ({ default: m.VisitorAgreementsPage }))
);
const VisitorAccessHistoryPage = lazy(() =>
  import('@/features/visitors/VisitorAccessHistoryPage').then((m) => ({ default: m.VisitorAccessHistoryPage }))
);
const VisitorAnalyticsPage = lazy(() =>
  import('@/features/visitors/VisitorAnalyticsPage').then((m) => ({ default: m.VisitorAnalyticsPage }))
);
const VisitorRecurringPage = lazy(() =>
  import('@/features/visitors/VisitorRecurringPage').then((m) => ({ default: m.VisitorRecurringPage }))
);
const VisitorSettingsPage = lazy(() =>
  import('@/features/visitors/VisitorSettingsPage').then((m) => ({ default: m.VisitorSettingsPage }))
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
const GroupsPage = lazy(() =>
  import('@/features/manage/identities/GroupsPage').then((m) => ({ default: m.GroupsPage }))
);
const ProvisioningPage = lazy(() =>
  import('@/features/manage/provisioning/ProvisioningPage').then((m) => ({ default: m.ProvisioningPage }))
);

// CCTV
const CCTVDashboardPage = lazy(() =>
  import('@/features/cctv/CCTVDashboardPage').then((m) => ({ default: m.CCTVDashboardPage }))
);
const CCTVCamerasPage = lazy(() =>
  import('@/features/cctv/CCTVCamerasPage').then((m) => ({ default: m.CCTVCamerasPage }))
);
const CCTVLiveViewPage = lazy(() =>
  import('@/features/cctv/CCTVLiveViewPage').then((m) => ({ default: m.CCTVLiveViewPage }))
);
const CCTVClipsPage = lazy(() =>
  import('@/features/cctv/CCTVClipsPage').then((m) => ({ default: m.CCTVClipsPage }))
);
const CCTVSettingsPage = lazy(() =>
  import('@/features/cctv/CCTVSettingsPage').then((m) => ({ default: m.CCTVSettingsPage }))
);

// OPERATE
const RoomBookingPage = lazy(() =>
  import('@/features/operate/room-booking/RoomBookingPage').then((m) => ({ default: m.RoomBookingPage }))
);
const ParkingDashboardPage = lazy(() =>
  import('@/features/parking/ParkingDashboardPage').then((m) => ({ default: m.ParkingDashboardPage }))
);
const ParkingSessionsPage = lazy(() =>
  import('@/features/parking/ParkingSessionsPage').then((m) => ({ default: m.ParkingSessionsPage }))
);
const ParkingVehiclesPage = lazy(() =>
  import('@/features/parking/ParkingVehiclesPage').then((m) => ({ default: m.ParkingVehiclesPage }))
);
const ParkingZonesPage = lazy(() =>
  import('@/features/parking/ParkingZonesPage').then((m) => ({ default: m.ParkingZonesPage }))
);
const ParkingPassesPage = lazy(() =>
  import('@/features/parking/ParkingPassesPage').then((m) => ({ default: m.ParkingPassesPage }))
);
const ParkingFeeRulesPage = lazy(() =>
  import('@/features/parking/ParkingFeeRulesPage').then((m) => ({ default: m.ParkingFeeRulesPage }))
);
const ParkingAnalyticsPage2 = lazy(() =>
  import('@/features/parking/ParkingAnalyticsPage').then((m) => ({ default: m.ParkingAnalyticsPage }))
);
const ParkingSettingsPage = lazy(() =>
  import('@/features/parking/ParkingSettingsPage').then((m) => ({ default: m.ParkingSettingsPage }))
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

// DEVICES
const LiveEventsPage = lazy(() =>
  import('@/features/monitoring/LiveEventsPage').then((m) => ({ default: m.LiveEventsPage }))
);
const DevicesPage = lazy(() =>
  import('@/features/devices/DevicesPage').then((m) => ({ default: m.DevicesPage }))
);
const DeviceDetailPage = lazy(() =>
  import('@/features/devices/DeviceDetailPage').then((m) => ({ default: m.DeviceDetailPage }))
);
const ProvisionDevicePage = lazy(() =>
  import('@/features/devices/ProvisionDevicePage').then((m) => ({ default: m.ProvisionDevicePage }))
);
const PendingDevicesPage = lazy(() =>
  import('@/features/devices/PendingDevicesPage').then((m) => ({ default: m.PendingDevicesPage }))
);

// PROFILE
const ProfilePage = lazy(() =>
  import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);

// SETTINGS
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const TenantAuditLogPage = lazy(() =>
  import('@/features/settings/AuditLogPage').then((m) => ({ default: m.TenantAuditLogPage }))
);
const EmailTemplatesPage = lazy(() =>
  import('@/features/settings/EmailTemplatesPage').then((m) => ({ default: m.EmailTemplatesPage }))
);

// SYSTEM AUDIT
const AuditLogPage = lazy(() =>
  import('@/features/system/AuditLogPage').then((m) => ({ default: m.AuditLogPage }))
);

// ALERTS
const AlertsPage = lazy(() =>
  import('@/features/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage }))
);

// SYSTEM SETTINGS
const SystemSettingsPage = lazy(() =>
  import('@/features/system/SystemSettingsPage').then((m) => ({ default: m.SystemSettingsPage }))
);

/** Suspense renders no DOM node; this wrapper keeps flex height so pages can min-h-0 + flex-1 into the viewport. */
export function LazyWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#3B82F6]/30 border-t-[#3B82F6]" />
          </div>
        }
      >
        {children}
      </Suspense>
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
          { path: 'accounts/new', element: <CreateUserAccountPage /> },
          { path: 'accounts/:id', element: <UserAccountDetailPage /> },
          { path: 'devices/pending', element: <LazyWrap><PendingDevicesPage isSystemAdmin={true} /></LazyWrap> },
          { path: 'devices', element: <SystemDevicesPage /> },
          { path: 'devices/new', element: <CreateDevicePage /> },
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

              // ACCESS (new)
              { path: 'access/zones', element: <LazyWrap><ZonesPage /></LazyWrap> },
              { path: 'access/zones/:id', element: <LazyWrap><ZoneDetailPage /></LazyWrap> },
              { path: 'access/access-points', element: <LazyWrap><AccessPointsPage /></LazyWrap> },
              { path: 'access/access-points/:id', element: <LazyWrap><AccessPointDetailPage /></LazyWrap> },
              { path: 'access/access-groups', element: <LazyWrap><AccessGroupsPage /></LazyWrap> },
              { path: 'access/access-groups/:id', element: <LazyWrap><AccessGroupDetailPage /></LazyWrap> },
              { path: 'access/access-times', element: <LazyWrap><AccessTimesPage /></LazyWrap> },
              { path: 'access/access-times/new', element: <LazyWrap><AccessTimeFormPage2 /></LazyWrap> },
              { path: 'access/access-times/:id', element: <LazyWrap><AccessTimeFormPage2 /></LazyWrap> },

              // MANAGE
              { path: 'manage/users', element: <LazyWrap><UserManagementPage /></LazyWrap> },
              { path: 'manage/users/new', element: <LazyWrap><UserDetailPage /></LazyWrap> },
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
