import { NavLink } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Bell, DoorOpen, UserCheck, Building2, Cpu, Settings, ChevronLeft, ChevronRight, LogOut, MapPin, Shield, Users2, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { ROUTES } from '@/lib/constants';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface NavItemProps {
    to: string;
    icon: React.ReactNode;
    label: string;
    badge?: number;
    collapsed: boolean;
    /** Use for `/` so every nested path is not treated as active. */
    end?: boolean;
}

function SidebarNavItem({ to, icon, label, badge, collapsed, end }: NavItemProps) {
    if (collapsed) {
        return (
            <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                    <NavLink
                        to={to}
                        end={end}
                        className="relative mx-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors duration-200 ease-out"
                        style={({ isActive }) =>
                            isActive
                                ? { backgroundColor: 'var(--sidebar-nav-active)', color: 'var(--sidebar-nav-active-text)' }
                                : { color: 'color-mix(in srgb, var(--sidebar-foreground) 55%, transparent)' }
                        }
                    >
                        {icon}
                        {badge ? (
                            <span className="absolute -top-1 -right-1 inline-flex min-w-[14px] items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 px-1 text-center text-[9px] font-bold leading-[14px] text-destructive">
                                {badge}
                            </span>
                        ) : null}
                    </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-card text-card-foreground border-border text-[12px]">
                    {label}
                </TooltipContent>
            </Tooltip>
        );
    }

    return (
        <NavLink
            to={to}
            end={end}
            className={({ isActive }) =>
                cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors duration-200 ease-out',
                    !isActive && 'hover:bg-sidebar-accent/50',
                )
            }
            style={({ isActive }) =>
                isActive
                    ? { backgroundColor: 'var(--sidebar-nav-active)', color: 'var(--sidebar-nav-active-text)', fontWeight: 600 }
                    : { color: 'color-mix(in srgb, var(--sidebar-foreground) 60%, transparent)' }
            }
        >
            {icon}
            <span className="truncate">{label}</span>
            {badge ? (
                <span className="ml-auto inline-flex items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 px-1.5 text-[10px] font-bold leading-[18px] text-destructive">
                    {badge}
                </span>
            ) : null}
        </NavLink>
    );
}

function SectionLabel({ label, colorClass, collapsed }: { label: string; colorClass: string; collapsed: boolean }) {
    if (collapsed) return <div className="h-3" />;
    return <div className={cn('pt-5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.08em]', colorClass)}>{label}</div>;
}

export function Sidebar() {
    const { t } = useTranslation('common');
    const { sidebarCollapsed, toggleSidebar } = useThemeStore();
    const logout = useAuthStore((s) => s.logout);
    const navigate = useNavigate();
    const handleLogout = () => {
        logout();
        navigate('/login');
    };
    const user = useAuthStore((s) => s.user);
    const unreadCount = useNotificationStore((s) => s.unreadCount);
    const iconSize = 16;
    const c = sidebarCollapsed;

    return (
        <nav
            className={cn(
                'flex h-full min-h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar shadow-[1px_0_0_0_var(--color-sidebar-border)] transition-[width] duration-300 ease-in-out will-change-[width]',
                c ? 'w-[56px]' : 'w-[220px]',
            )}
        >
            {/* Logo */}
            <div className={cn('flex items-center border-b border-sidebar-border h-12 shrink-0', c ? 'justify-center px-2' : 'px-4 gap-2.5')}>
                <div className="w-6 h-6 bg-sidebar-primary rotate-45 rounded-[5px] shrink-0" />
                {!c && <span className="text-[13px] font-bold text-sidebar-foreground tracking-wide">DUALL MASTER</span>}
            </div>

            {/* Nav items */}
            <div className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
                <SectionLabel label={t('nav.overview')} colorClass="text-sidebar-foreground/35" collapsed={c} />
                <SidebarNavItem to={ROUTES.dashboard} end icon={<LayoutDashboard size={iconSize} />} label={t('nav.dashboard')} collapsed={c} />
                <SidebarNavItem to={ROUTES.alerts} icon={<Bell size={iconSize} />} label={t('nav.alerts')} badge={unreadCount} collapsed={c} />

                <SectionLabel label={t('nav.manage')} colorClass="text-violet-500 dark:text-violet-400" collapsed={c} />
                <SidebarNavItem to={ROUTES.users} icon={<UserCheck size={iconSize} />} label={t('nav.users')} collapsed={c} />
                <SidebarNavItem to={ROUTES.departments} icon={<Building2 size={iconSize} />} label={t('nav.departments')} collapsed={c} />

                <SectionLabel label={t('nav.access')} colorClass="text-amber-500 dark:text-amber-400" collapsed={c} />
                <SidebarNavItem to={ROUTES.zones} icon={<MapPin size={iconSize} />} label={t('nav.zones')} collapsed={c} />
                <SidebarNavItem to={ROUTES.accessPoints} icon={<Shield size={iconSize} />} label={t('nav.accessPoints')} collapsed={c} />
                <SidebarNavItem to={ROUTES.doors} icon={<DoorOpen size={iconSize} />} label={t('nav.doors')} collapsed={c} />
                <SidebarNavItem to={ROUTES.accessGroups} icon={<Users2 size={iconSize} />} label={t('nav.accessGroups')} collapsed={c} />
                <SidebarNavItem to={ROUTES.accessTimes} icon={<Clock size={iconSize} />} label={t('nav.accessTimes')} collapsed={c} />

                <SectionLabel label={t('nav.devicesGroup')} colorClass="text-cyan-500 dark:text-cyan-400" collapsed={c} />
                <SidebarNavItem to={ROUTES.devices} icon={<Cpu size={iconSize} />} label={t('nav.devices')} collapsed={c} />
            </div>

            {/* Bottom — align with system admin sidebar: settings, profile + theme, sign out */}
            <div className="shrink-0 border-t border-sidebar-border">
                <div className="px-3 py-1.5">
                    <SidebarNavItem to={ROUTES.settings} icon={<Settings size={iconSize} />} label={t('nav.settings')} collapsed={c} />
                </div>

                <div className="border-t border-sidebar-border">
                    {c ? (
                        <div className="flex flex-col items-center gap-2 p-2">
                            <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                    <div className="flex h-9 w-9 cursor-default items-center justify-center rounded-full bg-sidebar-primary/20 text-[11px] font-semibold text-sidebar-primary">
                                        {user?.initials}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-[220px] border-border bg-card text-card-foreground text-[12px]">
                                    <div className="font-medium text-foreground">{user?.name}</div>
                                    <div className="text-muted-foreground">{user?.email}</div>
                                </TooltipContent>
                            </Tooltip>
                            <ThemeToggle />
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="cursor-pointer text-sidebar-foreground/50 transition-colors duration-200 ease-out hover:text-destructive"
                                title={t('actions.signOut')}
                            >
                                <LogOut size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2 p-3">
                            <div className="flex items-center gap-2 px-1">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-[11px] font-semibold text-sidebar-primary">
                                    {user?.initials}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[12px] font-medium text-sidebar-foreground">{user?.name}</div>
                                    <div className="truncate text-[10px] text-muted-foreground">{user?.email}</div>
                                </div>
                                <ThemeToggle />
                            </div>
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-[12px] text-muted-foreground transition-colors duration-200 ease-out hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                            >
                                <LogOut size={14} className="shrink-0" />
                                {t('actions.signOut')}
                            </button>
                        </div>
                    )}
                </div>

                {/* Collapse toggle */}
                <div className="border-t border-sidebar-border">
                    <button
                        type="button"
                        onClick={toggleSidebar}
                        className="flex h-8 w-full cursor-pointer items-center justify-center text-sidebar-foreground/40 transition-colors duration-200 ease-out hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    >
                        {c ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>
                </div>
            </div>
        </nav>
    );
}
