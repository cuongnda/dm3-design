import { NavLink } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Bell, DoorOpen, Video, ShieldAlert, Phone,
  Bot, AlertTriangle, Users, UserPlus, Wrench, Clock, Package,
  Building2, Car, Hammer, Shield, Key, Zap, Brain,
  Settings, ChevronLeft, ChevronRight, LogOut, UserCheck, MapPin,
  Users2, Cpu, User, ClipboardList, Eye, FileText, BarChart3,
  CalendarClock, SlidersHorizontal, CircleDollarSign, Ticket, ParkingSquare,
  Activity,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
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
            className={({ isActive }) =>
              cn(
                ' flex items-center justify-center h-5 w-5 mx-auto rounded-md transition-colors relative overflow-visible',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )
            }
          >
            {icon}
            {badge ? (
              <span className=" absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 bg-destructive text-white text-[9px] font-semibold px-1 rounded-full min-w-[14px] text-center">
                {badge}
              </span>
            ) : null}
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-popover text-popover-foreground border-border">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-3 py-1.5 mx-2 rounded-md text-[13px] transition-colors',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary'
            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
        )
      }
    >
      {icon}
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="ml-auto bg-destructive text-white text-[10px] font-semibold px-1.5 py-0 rounded-full">
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}

function SectionLabel({ label, color, collapsed }: { label: string; color: string; collapsed: boolean }) {
  if (collapsed) return <div className="h-2" />;
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
  const enabledPlugins = useAuthStore((s) => s.enabledPlugins);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const hasVisitor = enabledPlugins?.includes('visitor') ?? false;
  const hasParking = enabledPlugins?.includes('parking') ?? false;
  const hasCctv = enabledPlugins?.includes('cctv') ?? false;
  const c = sidebarCollapsed;
  const iconSize = c ? 20 : 18;

  return (
    <aside
      className={cn(
        'bg-sidebar border-r border-sidebar-border transition-all duration-300 shrink-0 h-screen flex flex-col',
        c ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <NavLink to={ROUTES.dashboard} className={cn(
        'flex items-center border-b border-sidebar-border h-12 shrink-0 bg-sidebar cursor-pointer',
        c ? 'justify-center' : 'px-4 gap-2'
      )}>
        <img src="/logo.png" alt="Duall Master" className="w-6 h-6 shrink-0" />
        {!c && <span className="text-[14px] font-semibold text-sidebar-foreground">DUALL MASTER</span>}
      </NavLink>

      {/* Nav items — scrollable */}
      <nav className={cn(
        'flex-1 overflow-y-auto py-1',
        c ? 'px-2 space-y-2' : 'space-y-0.5',
        // hide scrollbar
        '[&::-webkit-scrollbar]:w-0 [scrollbar-width:none]'
      )}>
        <SectionLabel label={t('nav.overview')} color="#64748B" collapsed={c} />
        <SidebarNavItem to={ROUTES.dashboard} icon={<LayoutDashboard size={iconSize} />} label={t('nav.dashboard')} collapsed={c} />
        <SidebarNavItem to={ROUTES.monitoring} icon={<Activity size={iconSize} />} label={t('nav.monitoring', 'Monitoring')} collapsed={c} />
        <SidebarNavItem to={ROUTES.alerts} icon={<Bell size={iconSize} />} label={t('nav.alerts')} badge={unreadCount} collapsed={c} />

        <SectionLabel label={t('nav.secure')} color="#3B82F6" collapsed={c} />
        <SidebarNavItem to={ROUTES.accessControl} icon={<DoorOpen size={iconSize} />} label={t('nav.accessControl')} collapsed={c} />
        <SidebarNavItem to={ROUTES.cctv} icon={<Video size={iconSize} />} label={t('nav.cctv')} collapsed={c} />
        <SidebarNavItem to={ROUTES.intrusion} icon={<ShieldAlert size={iconSize} />} label={t('nav.intrusion')} collapsed={c} />
        <SidebarNavItem to={ROUTES.intercom} icon={<Phone size={iconSize} />} label={t('nav.intercom')} collapsed={c} />
        <SidebarNavItem to={ROUTES.aiDetection} icon={<Bot size={iconSize} />} label={t('nav.aiDetection')} collapsed={c} />
        <SidebarNavItem to={ROUTES.emergency} icon={<AlertTriangle size={iconSize} />} label={t('nav.emergency')} collapsed={c} />

        <SectionLabel label={t('nav.manage')} color="#8B5CF6" collapsed={c} />
        <SidebarNavItem to={ROUTES.users} icon={<UserCheck size={iconSize} />} label={t('nav.users') + ' *'} collapsed={c} />
        <SidebarNavItem to={ROUTES.departments} icon={<Building2 size={iconSize} />} label={t('nav.departments') + ' *'} collapsed={c} />
        <SidebarNavItem to={ROUTES.identities} icon={<Users size={iconSize} />} label={t('nav.identities')} collapsed={c} />
        <SidebarNavItem to={ROUTES.contractors} icon={<Wrench size={iconSize} />} label={t('nav.contractors')} collapsed={c} />
        <SidebarNavItem to={ROUTES.attendance} icon={<Clock size={iconSize} />} label={t('nav.attendance')} collapsed={c} />
        <SidebarNavItem to={ROUTES.deliveries} icon={<Package size={iconSize} />} label={t('nav.deliveries')} collapsed={c} />

        {hasVisitor && (
          <>
            <SectionLabel label={t('nav.visitorsSection')} color="#10B981" collapsed={c} />
            <SidebarNavItem to={ROUTES.visitors} icon={<LayoutDashboard size={iconSize} />} label={t('nav.visitorsDashboard')} collapsed={c} />
            <SidebarNavItem to={ROUTES.visitorsRegister} icon={<UserPlus size={iconSize} />} label={t('nav.visitorsRegister')} collapsed={c} />
            <SidebarNavItem to={ROUTES.visitorsGroups} icon={<Users2 size={iconSize} />} label={t('nav.visitorsGroups')} collapsed={c} />
            <SidebarNavItem to={ROUTES.visitorsWatchlist} icon={<Eye size={iconSize} />} label={t('nav.visitorsWatchlist')} collapsed={c} />
            <SidebarNavItem to={ROUTES.visitorsAgreements} icon={<FileText size={iconSize} />} label={t('nav.visitorsAgreements')} collapsed={c} />
            <SidebarNavItem to={ROUTES.visitorsAccessHistory} icon={<ClipboardList size={iconSize} />} label={t('nav.visitorsAccessHistory')} collapsed={c} />
            <SidebarNavItem to={ROUTES.visitorsAnalytics} icon={<BarChart3 size={iconSize} />} label={t('nav.visitorsAnalytics')} collapsed={c} />
            <SidebarNavItem to={ROUTES.visitorsRecurring} icon={<CalendarClock size={iconSize} />} label={t('nav.visitorsRecurring')} collapsed={c} />
            <SidebarNavItem to={ROUTES.visitorsSettings} icon={<SlidersHorizontal size={iconSize} />} label={t('nav.visitorsSettings')} collapsed={c} />
          </>
        )}

        {hasParking && (
          <>
            <SectionLabel label={t('nav.parkingSection')} color="#F59E0B" collapsed={c} />
            <SidebarNavItem to={ROUTES.parking} icon={<LayoutDashboard size={iconSize} />} label={t('nav.parkingDashboard')} collapsed={c} />
            <SidebarNavItem to={ROUTES.parkingSessions} icon={<ClipboardList size={iconSize} />} label={t('nav.parkingSessions')} collapsed={c} />
            <SidebarNavItem to={ROUTES.parkingVehicles} icon={<Car size={iconSize} />} label={t('nav.parkingVehicles')} collapsed={c} />
            <SidebarNavItem to={ROUTES.parkingZones} icon={<ParkingSquare size={iconSize} />} label={t('nav.parkingZones')} collapsed={c} />
            <SidebarNavItem to={ROUTES.parkingPasses} icon={<Ticket size={iconSize} />} label={t('nav.parkingPasses')} collapsed={c} />
            <SidebarNavItem to={ROUTES.parkingFeeRules} icon={<CircleDollarSign size={iconSize} />} label={t('nav.parkingFeeRules')} collapsed={c} />
            <SidebarNavItem to={ROUTES.parkingAnalytics} icon={<BarChart3 size={iconSize} />} label={t('nav.parkingAnalytics')} collapsed={c} />
            <SidebarNavItem to={ROUTES.parkingSettings} icon={<SlidersHorizontal size={iconSize} />} label={t('nav.parkingSettings')} collapsed={c} />
          </>
        )}

        {hasCctv && (
          <>
            <SectionLabel label={t('nav.cctvSection')} color="#3B82F6" collapsed={c} />
            <SidebarNavItem to={ROUTES.cctvDashboard} icon={<LayoutDashboard size={iconSize} />} label={t('nav.cctvDashboard')} collapsed={c} />
            <SidebarNavItem to={ROUTES.cctvCameras} icon={<Video size={iconSize} />} label={t('nav.cctvCameras')} collapsed={c} />
            <SidebarNavItem to={ROUTES.cctvLive} icon={<Eye size={iconSize} />} label={t('nav.cctvLive')} collapsed={c} />
            <SidebarNavItem to={ROUTES.cctvClips} icon={<ClipboardList size={iconSize} />} label={t('nav.cctvClips')} collapsed={c} />
            <SidebarNavItem to={ROUTES.cctvSettings} icon={<SlidersHorizontal size={iconSize} />} label={t('nav.cctvSettings')} collapsed={c} />
          </>
        )}

        <SectionLabel label={t('nav.access')} color="#F59E0B" collapsed={c} />
        <SidebarNavItem to={ROUTES.zones} icon={<MapPin size={iconSize} />} label={t('nav.zones') + ' *'} collapsed={c} />
        <SidebarNavItem to={ROUTES.accessPoints} icon={<Shield size={iconSize} />} label={t('nav.accessPoints') + ' *'} collapsed={c} />
        <SidebarNavItem to={ROUTES.accessGroups} icon={<Users2 size={iconSize} />} label={t('nav.accessGroups') + ' *'} collapsed={c} />
        <SidebarNavItem to={ROUTES.accessTimes} icon={<Clock size={iconSize} />} label={t('nav.accessTimes') + ' *'} collapsed={c} />
        <SidebarNavItem to={ROUTES.devices} icon={<Cpu size={iconSize} />} label={t('nav.devices') + ' *'} collapsed={c} />

        <SectionLabel label={t('nav.operate')} color="#F59E0B" collapsed={c} />
        <SidebarNavItem to={ROUTES.roomBooking} icon={<Building2 size={iconSize} />} label={t('nav.roomBooking')} collapsed={c} />
        <SidebarNavItem to={ROUTES.maintenance} icon={<Hammer size={iconSize} />} label={t('nav.maintenance')} collapsed={c} />
        <SidebarNavItem to={ROUTES.guardTour} icon={<Shield size={iconSize} />} label={t('nav.guardTour')} collapsed={c} />
        <SidebarNavItem to={ROUTES.keys} icon={<Key size={iconSize} />} label={t('nav.keys')} collapsed={c} />
        <SidebarNavItem to={ROUTES.iotEnergy} icon={<Zap size={iconSize} />} label={t('nav.iotEnergy')} collapsed={c} />
      </nav>

      {/* Bottom — pinned */}
      <div className="shrink-0 bg-sidebar">
        <Separator className="bg-sidebar-border" />
        <div className={cn('py-1', c ? 'px-2 space-y-2' : 'space-y-0.5')}>
          <SidebarNavItem to={ROUTES.aiAssistant} icon={<Brain size={iconSize} className="text-smart" />} label={t('nav.aiAssistant')} collapsed={c} />
          <SidebarNavItem to={ROUTES.settings} icon={<Settings size={iconSize} />} label={t('nav.settings')} collapsed={c} />
        </div>

        {/* User */}
        <div className={cn('border-t border-sidebar-border py-2', c ? 'flex justify-center' : 'px-3')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {c ? (
                <button className="flex items-center justify-center cursor-pointer group">
                  <div className="w-8 h-8 bg-sidebar-primary rounded-full flex items-center justify-center text-[11px] font-semibold text-sidebar-primary-foreground ring-2 ring-transparent group-hover:ring-sidebar-primary/40 transition-all">
                    {user?.initials}
                  </div>
                </button>
              ) : (
                <button className="flex items-center gap-2 py-1 w-full cursor-pointer hover:bg-sidebar-accent/50 rounded-md px-1 transition-colors group">
                  <div className="w-7 h-7 bg-sidebar-primary rounded-full flex items-center justify-center text-[11px] font-semibold text-sidebar-primary-foreground shrink-0 ring-2 ring-transparent group-hover:ring-sidebar-primary/40 transition-all">
                    {user?.initials}
                  </div>
                  <span className="text-[12px] font-medium text-sidebar-foreground truncate">{user?.name}</span>
                </button>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              <div className="px-2 py-2">
                <p className="text-sm font-semibold truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer gap-2 rounded-md py-2 px-2.5 hover:bg-accent focus:bg-accent">
                <User className="h-4 w-4 text-muted-foreground" />
                {t('nav.profile', 'Profile')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer gap-2 rounded-md py-2 px-2.5 text-destructive focus:text-destructive hover:bg-destructive/10 focus:bg-destructive/10">
                <LogOut className="h-4 w-4" />
                {t('actions.signOut', 'Sign Out')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Collapse toggle */}
        <div className={cn('border-t border-sidebar-border py-1', c ? 'flex justify-center' : 'px-3')}>
          <button
            onClick={toggleSidebar}
            className={cn(
              'flex items-center justify-center h-7 rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors',
              c ? 'w-8' : 'w-full'
            )}
          >
            {c ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
