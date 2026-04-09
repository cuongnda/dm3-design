import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Building2, Settings, LogOut, Smartphone, HardDrive, LayoutDashboard, Users, Package, FileText } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { fetchPendingDevices } from '@/lib/api';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '@/components/ThemeToggle';

const navItems = [
  { to: '/system', icon: LayoutDashboard, labelKey: 'systemAdminNav.dashboard', end: true },
  { to: '/system/companies', icon: Building2, labelKey: 'systemAdminNav.companies' },
  { to: '/system/accounts', icon: Users, labelKey: 'systemAdminNav.accounts' },
  { to: '/system/devices/pending', icon: Smartphone, labelKey: 'systemAdminNav.pendingDevices', badge: true },
  { to: '/system/devices', icon: HardDrive, labelKey: 'systemAdminNav.allDevices', end: true },
  { to: '/system/firmware', icon: Package, labelKey: 'systemAdminNav.firmware' },
  { to: '/system/audit', icon: FileText, labelKey: 'systemAdminNav.auditLog' },
  { to: '/system/settings', icon: Settings, labelKey: 'systemAdminNav.settings' },
];

export function SystemLayout() {
  const { t } = useTranslation('system');
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetchPendingDevices().then((d) => setPendingCount(d.length)).catch(() => {});
    const iv = setInterval(() => {
      fetchPendingDevices().then((d) => setPendingCount(d.length)).catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-[220px] border-r border-sidebar-border flex flex-col bg-sidebar">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
          <div className="w-6 h-6 bg-operate rotate-45 rounded-[4px] mr-2 shrink-0" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-foreground truncate">DUALL MASTER</div>
            <div className="text-[10px] text-operate font-medium">{t('systemAdmin.role')}</div>
          </div>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map(({ to, icon: Icon, labelKey, badge, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
                  isActive
                  ? 'bg-operate/10 text-operate'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
                }`
              }
            >
              <Icon size={16} />
              {t(labelKey)}
              {badge && pendingCount > 0 && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-operate text-white font-medium">{pendingCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-7 h-7 rounded-full bg-operate/20 flex items-center justify-center text-[11px] font-medium text-operate">
              {user?.initials || 'SA'}
            </div>
            <div className="min-w-0 flex-1">
            <div className="text-[12px] text-foreground truncate">{user?.name || 'System Admin'}</div>
            <div className="text-[10px] text-muted-foreground truncate">{user?.email}</div>
            </div>
            <ThemeToggle />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 w-full rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          >
            <LogOut size={14} />
            {t('systemAdmin.signOut')}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
