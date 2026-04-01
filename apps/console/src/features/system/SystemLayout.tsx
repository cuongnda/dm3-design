import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Building2, Settings, LogOut, Smartphone, HardDrive, LayoutDashboard, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { fetchPendingDevices } from '@/lib/api';

const navItems = [
  { to: '/system', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/system/companies', icon: Building2, label: 'Companies' },
  { to: '/system/users', icon: Users, label: 'User Accounts' },
  { to: '/system/devices/pending', icon: Smartphone, label: 'Pending Devices', badge: true },
  { to: '/system/devices', icon: HardDrive, label: 'All Devices' },
  { to: '/system/settings', icon: Settings, label: 'Settings' },
];

export function SystemLayout() {
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
    <div className="min-h-screen bg-[#0B1120] flex">
      {/* Sidebar */}
      <aside className="w-[220px] border-r border-[#1E293B] flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-[#1E293B]">
          <div className="w-6 h-6 bg-[#F97316] rotate-45 rounded-[4px] mr-2 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#F8FAFC] truncate">DUALL MASTER</div>
            <div className="text-[10px] text-[#F97316] font-medium">System Admin</div>
          </div>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label, badge, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
                  isActive
                    ? 'bg-[#F97316]/10 text-[#F97316]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B]'
                }`
              }
            >
              <Icon size={16} />
              {label}
              {badge && pendingCount > 0 && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-[#F97316] text-white font-medium">{pendingCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[#1E293B] p-3">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-7 h-7 rounded-full bg-[#F97316]/20 flex items-center justify-center text-[11px] font-medium text-[#F97316]">
              {user?.initials || 'SA'}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] text-[#F8FAFC] truncate">{user?.name || 'System Admin'}</div>
              <div className="text-[10px] text-[#64748B] truncate">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 w-full rounded-md text-[12px] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B] transition-colors"
          >
            <LogOut size={14} />
            Sign Out
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
