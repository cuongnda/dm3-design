import { NavLink } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Bell, DoorOpen, Video, ShieldAlert, Phone,
  Bot, AlertTriangle, Users, UserPlus, Wrench, Clock, Package,
  KeyRound, Building2, Car, Hammer, Shield, Key, Zap, Brain,
  Settings, ChevronLeft, ChevronRight, LogOut,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { ROUTES } from '@/lib/constants';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Separator } from '../ui/separator';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  collapsed: boolean;
}

function SidebarNavItem({ to, icon, label, badge, collapsed }: NavItemProps) {
  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <NavLink
            to={to}
            end
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center w-10 h-8 mx-auto rounded-md transition-colors relative',
                isActive
                  ? 'bg-[#1E3A5F] text-[#3B82F6]'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B]'
              )
            }
          >
            {icon}
            {badge ? (
              <span className="absolute -top-1 -right-1 bg-[#EF4444] text-white text-[9px] font-semibold px-1 rounded-full min-w-[14px] text-center">
                {badge}
              </span>
            ) : null}
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-[#1E293B] text-[#F8FAFC] border-[#334155]">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-3 py-1.5 mx-2 rounded-md text-[13px] transition-colors',
          isActive
            ? 'bg-[#1E3A5F] text-[#3B82F6] border-l-2 border-[#3B82F6]'
            : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B]'
        )
      }
    >
      {icon}
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="ml-auto bg-[#EF4444] text-white text-[10px] font-semibold px-1.5 py-0 rounded-full">
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}

function SectionLabel({ label, color, collapsed }: { label: string; color: string; collapsed: boolean }) {
  if (collapsed) return <div className="h-4" />;
  return (
    <div
      className="px-3 mx-2 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.05em]"
      style={{ color }}
    >
      {label}
    </div>
  );
}

export function Sidebar() {
  const { t } = useTranslation('common');
  const { sidebarCollapsed, toggleSidebar } = useThemeStore();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate('/login'); };
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const iconSize = 18;
  const c = sidebarCollapsed;

  return (
    <nav
      className={cn(
        'flex flex-col h-full bg-[#111827] border-r border-[#1E293B] transition-all duration-300 flex-shrink-0 overflow-hidden',
        c ? 'w-14' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center border-b border-[#1E293B] h-12 flex-shrink-0', c ? 'justify-center px-2' : 'px-4 gap-2')}>
        <div className="w-5 h-5 bg-[#3B82F6] rotate-45 rounded-[4px] flex-shrink-0" />
        {!c && <span className="text-[14px] font-semibold text-[#F8FAFC]">DUALL MASTER</span>}
      </div>

      {/* Nav items */}
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
        <SectionLabel label={t('nav.overview')} color="#64748B" collapsed={c} />
        <SidebarNavItem to={ROUTES.dashboard} icon={<LayoutDashboard size={iconSize} />} label={t('nav.dashboard')} collapsed={c} />
        <SidebarNavItem to={ROUTES.alerts} icon={<Bell size={iconSize} />} label={t('nav.alerts')} badge={unreadCount} collapsed={c} />

        <SectionLabel label={t('nav.secure')} color="#3B82F6" collapsed={c} />
        <SidebarNavItem to={ROUTES.accessControl} icon={<DoorOpen size={iconSize} />} label={t('nav.accessControl')} collapsed={c} />
        <SidebarNavItem to={ROUTES.accessTime} icon={<Clock size={iconSize} />} label={t('nav.accessTime', 'Access Time')} collapsed={c} />
        <SidebarNavItem to={ROUTES.cctv} icon={<Video size={iconSize} />} label={t('nav.cctv')} collapsed={c} />
        <SidebarNavItem to={ROUTES.intrusion} icon={<ShieldAlert size={iconSize} />} label={t('nav.intrusion')} collapsed={c} />
        <SidebarNavItem to={ROUTES.intercom} icon={<Phone size={iconSize} />} label={t('nav.intercom')} collapsed={c} />
        <SidebarNavItem to={ROUTES.aiDetection} icon={<Bot size={iconSize} />} label={t('nav.aiDetection')} collapsed={c} />
        <SidebarNavItem to={ROUTES.emergency} icon={<AlertTriangle size={iconSize} />} label={t('nav.emergency')} collapsed={c} />

        <SectionLabel label={t('nav.manage')} color="#8B5CF6" collapsed={c} />
        <SidebarNavItem to={ROUTES.identities} icon={<Users size={iconSize} />} label={t('nav.identities')} collapsed={c} />
        <SidebarNavItem to={ROUTES.visitors} icon={<UserPlus size={iconSize} />} label={t('nav.visitors')} collapsed={c} />
        <SidebarNavItem to={ROUTES.contractors} icon={<Wrench size={iconSize} />} label={t('nav.contractors')} collapsed={c} />
        <SidebarNavItem to={ROUTES.attendance} icon={<Clock size={iconSize} />} label={t('nav.attendance')} collapsed={c} />
        <SidebarNavItem to={ROUTES.deliveries} icon={<Package size={iconSize} />} label={t('nav.deliveries')} collapsed={c} />
        <SidebarNavItem to={ROUTES.devices} icon={<KeyRound size={iconSize} />} label={t('nav.devices')} collapsed={c} />

        <SectionLabel label={t('nav.operate')} color="#F59E0B" collapsed={c} />
        <SidebarNavItem to={ROUTES.roomBooking} icon={<Building2 size={iconSize} />} label={t('nav.roomBooking')} collapsed={c} />
        <SidebarNavItem to={ROUTES.parking} icon={<Car size={iconSize} />} label={t('nav.parking')} collapsed={c} />
        <SidebarNavItem to={ROUTES.maintenance} icon={<Hammer size={iconSize} />} label={t('nav.maintenance')} collapsed={c} />
        <SidebarNavItem to={ROUTES.guardTour} icon={<Shield size={iconSize} />} label={t('nav.guardTour')} collapsed={c} />
        <SidebarNavItem to={ROUTES.keys} icon={<Key size={iconSize} />} label={t('nav.keys')} collapsed={c} />
        <SidebarNavItem to={ROUTES.iotEnergy} icon={<Zap size={iconSize} />} label={t('nav.iotEnergy')} collapsed={c} />
      </div>

      {/* Bottom */}
      <div className="flex-shrink-0">
        <Separator className="bg-[#1E293B]" />
        <div className="py-2 space-y-0.5">
          <SidebarNavItem to={ROUTES.aiAssistant} icon={<Brain size={iconSize} className="text-[#06B6D4]" />} label={t('nav.aiAssistant')} collapsed={c} />
          <SidebarNavItem to={ROUTES.settings} icon={<Settings size={iconSize} />} label={t('nav.settings')} collapsed={c} />
        </div>

        {/* User */}
        <div className={cn('border-t border-[#1E293B] py-2', c ? 'px-2' : 'px-3')}>
          {c ? (
            <div className="flex flex-col items-center gap-1">
              <div className="w-7 h-7 bg-[#3B82F6] rounded-full flex items-center justify-center text-[11px] font-semibold text-white">
                {user?.initials}
              </div>
              <button onClick={handleLogout} className="text-[#64748B] hover:text-[#F87171] transition-colors" title={t('actions.signOut')}>
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-1">
              <div className="w-7 h-7 bg-[#3B82F6] rounded-full flex items-center justify-center text-[11px] font-semibold text-white flex-shrink-0">
                {user?.initials}
              </div>
              <span className="text-[12px] font-medium text-[#F8FAFC] truncate">{user?.name}</span>
              <button onClick={handleLogout} className="ml-auto text-[#64748B] hover:text-[#F87171] transition-colors" title={t('actions.signOut')}>
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <div className={cn('border-t border-[#1E293B] py-1', c ? 'px-2' : 'px-3')}>
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center w-full h-7 rounded-md text-[#64748B] hover:text-[#F8FAFC] hover:bg-[#1E293B] transition-colors"
          >
            {c ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>
    </nav>
  );
}
