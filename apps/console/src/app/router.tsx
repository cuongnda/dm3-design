import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { MainLayout } from '@dm3/ui';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { SystemLayout } from '@/features/system/SystemLayout';
import { SystemDashboardPage } from '@/features/system/SystemDashboardPage';
import { CompanyListPage } from '@/features/system/CompanyListPage';
import { CreateCompanyPage } from '@/features/system/CreateCompanyPage';
import { CompanyDetailPage } from '@/features/system/CompanyDetailPage';
import { SystemDevicesPage } from '@/features/system/SystemDevicesPage';
import { UserAccountListPage } from '@/features/system/UserAccountListPage';
import { UserAccountDetailPage } from '@/features/system/UserAccountDetailPage';
import { CreateUserAccountPage } from '@/features/system/CreateUserAccountPage';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleBasedRoute } from './RoleBasedRoute';

// Essential Security Features
const AccessControlPage = lazy(() =>
  import('@/features/secure/access-control/AccessControlPage').then((m) => ({ default: m.AccessControlPage }))
);
const DoorDetailPage = lazy(() =>
  import('@/features/secure/access-control/DoorDetailPage').then((m) => ({ default: m.DoorDetailPage }))
);
const AccessRulesPage = lazy(() =>
  import('@/features/secure/access-control/AccessRulesPage').then((m) => ({ default: m.AccessRulesPage }))
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
const DepartmentManagementPage = lazy(() =>
  import('@/features/department-management/DepartmentManagementPage').then((m) => ({ default: m.DepartmentManagementPage }))
);



// DEVICES
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

// SETTINGS
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
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
function LazyWrap({ children }: { children: React.ReactNode }) {
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

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
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
          { path: 'settings', element: <LazyWrap><SystemSettingsPage /></LazyWrap> },
        ],
      },
      {
        path: '/',
        element: <RoleBasedRoute />,
        children: [
          {
            path: '/',
            element: <MainLayout />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'alerts', element: <LazyWrap><AlertsPage /></LazyWrap> },

              // MANAGE
              { path: 'manage/users', element: <LazyWrap><UserManagementPage /></LazyWrap> },
              { path: 'manage/departments', element: <LazyWrap><DepartmentManagementPage /></LazyWrap> },
              { path: 'manage/identities', element: <LazyWrap><IdentitiesPage /></LazyWrap> },
              { path: 'manage/identities/:id', element: <LazyWrap><PersonDetailPage /></LazyWrap> },

              // ACCESS CONTROL
              { path: 'access-control', element: <LazyWrap><AccessControlPage /></LazyWrap> },
              { path: 'access-control/rules', element: <LazyWrap><AccessRulesPage /></LazyWrap> },
              { path: 'access-control/:id', element: <LazyWrap><DoorDetailPage /></LazyWrap> },

              // DEVICES
              { path: 'devices', element: <LazyWrap><DevicesPage /></LazyWrap> },
              { path: 'devices/pending', element: <LazyWrap><PendingDevicesPage /></LazyWrap> },
              { path: 'devices/provision', element: <LazyWrap><ProvisionDevicePage /></LazyWrap> },
              { path: 'devices/:id', element: <LazyWrap><DeviceDetailPage /></LazyWrap> },

              // SETTINGS
              { path: 'settings', element: <LazyWrap><SettingsPage /></LazyWrap> },
            ],
          },
        ],
      },
    ],
  },
]);
