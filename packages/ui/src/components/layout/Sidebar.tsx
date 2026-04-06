import { NavLink } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Bell, DoorOpen, UserCheck, Building2, Cpu, Settings, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { ROUTES } from '@/lib/constants';
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
                        className="relative mx-auto flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                        style={({ isActive }) =>
                            isActive
                                ? { backgroundColor: 'var(--sidebar-nav-active)', color: 'var(--sidebar-nav-active-text)' }
                                : { color: 'color-mix(in srgb, var(--sidebar-foreground) 55%, transparent)' }
                        }
                    >
                        {icon}
                        {badge ? (
                            <span className="absolute -top-1 -right-1 bg-destructive text-white text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center leading-[14px]">
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
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
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
                <span className="ml-auto bg-destructive text-white text-[10px] font-bold px-1.5 rounded-full leading-[18px]">{badge}</span>
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
                'flex h-full min-h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar shadow-[1px_0_0_0_var(--color-sidebar-border)] transition-all duration-300',
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
                <SidebarNavItem to={ROUTES.accessControl} icon={<DoorOpen size={iconSize} />} label={t('nav.accessControl')} collapsed={c} />

                <SectionLabel label={t('nav.devicesGroup')} colorClass="text-cyan-500 dark:text-cyan-400" collapsed={c} />
                <SidebarNavItem to={ROUTES.devices} icon={<Cpu size={iconSize} />} label={t('nav.devices')} collapsed={c} />
            </div>

            {/* Bottom */}
            <div className="shrink-0 border-t border-sidebar-border">
                <div className="space-y-0.5 px-3 py-1">
                    <SidebarNavItem to={ROUTES.settings} icon={<Settings size={iconSize} />} label={t('nav.settings')} collapsed={c} />
                </div>

                {/* User row */}
                <div className={cn('border-t border-sidebar-border py-2.5', c ? 'px-2' : 'px-3')}>
                    {c ? (
                        <div className="flex flex-col items-center gap-1.5">
                            <div className="w-7 h-7 bg-sidebar-primary rounded-full flex items-center justify-center text-[11px] font-bold text-sidebar-primary-foreground">
                                {user?.initials}
                            </div>
                            <button
                                onClick={handleLogout}
                                className="cursor-pointer text-sidebar-foreground/40 hover:text-destructive transition-colors"
                                title={t('actions.signOut')}
                            >
                                <LogOut size={13} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 bg-sidebar-primary rounded-full flex items-center justify-center text-[11px] font-bold text-sidebar-primary-foreground shrink-0">
                                {user?.initials}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-semibold text-sidebar-foreground truncate">{user?.name}</p>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="cursor-pointer text-sidebar-foreground/40 hover:text-destructive transition-colors shrink-0"
                                title={t('actions.signOut')}
                            >
                                <LogOut size={13} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Collapse toggle */}
                <div className="border-t border-sidebar-border">
                    <button
                        onClick={toggleSidebar}
                        className="flex cursor-pointer items-center justify-center w-full h-8 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                    >
                        {c ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>
                </div>
            </div>
        </nav>
    );
}
