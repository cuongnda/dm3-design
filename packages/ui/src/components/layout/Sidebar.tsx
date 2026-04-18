import { useMemo, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, ChevronDown, LogOut, User, Settings, Brain,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Separator } from '../ui/separator';
import { NAV_CONFIG, findActiveSectionKey, type NavItem, type NavSection } from '../../config/navConfig';
import { isNavClickable, shouldRenderNavStatus } from '../../lib/navStatus';
import { NavStatusPill } from './NavStatusPill';
import { HealthStrip } from './HealthStrip';

interface NavItemRowProps {
  item: NavItem;
  badge?: number;
  collapsed: boolean;
  iconSize: number;
}

function SidebarNavItem({ item, badge, collapsed, iconSize }: NavItemRowProps) {
  const { t } = useTranslation('common');
  const Icon: LucideIcon = item.icon;
  const label = t(item.labelKey, item.labelFallback);
  const clickable = isNavClickable(item.status);
  const dimmed = !clickable;

  if (collapsed) {
    const content = (
      <>
        <Icon size={iconSize} />
        {badge ? (
          <span className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 bg-destructive text-white text-[9px] font-semibold px-1 rounded-full min-w-[14px] text-center">
            {badge}
          </span>
        ) : null}
      </>
    );
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          {clickable ? (
            <NavLink
              to={item.to}
              data-testid={item.testId}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-center h-5 w-5 mx-auto rounded-md transition-colors relative overflow-visible',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                )
              }
            >
              {content}
            </NavLink>
          ) : (
            <span
              aria-disabled="true"
              className="flex items-center justify-center h-5 w-5 mx-auto rounded-md relative overflow-visible text-sidebar-foreground/30 cursor-not-allowed"
            >
              {content}
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-popover text-popover-foreground border-border">
          <span className="inline-flex items-center gap-2">
            {label}
            <NavStatusPill status={item.status} />
          </span>
        </TooltipContent>
      </Tooltip>
    );
  }

  const inner = (
    <>
      <Icon size={iconSize} />
      <span className="truncate">{label}</span>
      <NavStatusPill status={item.status} className="ml-1" />
      {badge ? (
        <span className="ml-auto bg-destructive text-white text-[10px] font-semibold px-1.5 py-0 rounded-full">
          {badge}
        </span>
      ) : null}
    </>
  );

  if (!clickable) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          'flex items-center gap-2.5 px-3 py-1.5 mx-2 rounded-md text-[13px] text-sidebar-foreground/30 cursor-not-allowed',
          dimmed && 'opacity-70',
        )}
      >
        {inner}
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      data-testid={item.testId}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-3 py-1.5 mx-2 rounded-md text-[13px] transition-colors',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary'
            : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
        )
      }
    >
      {inner}
    </NavLink>
  );
}

interface SectionHeaderProps {
  section: NavSection;
  expanded: boolean;
  onToggle: () => void;
}

function SectionHeader({ section, expanded, onToggle }: SectionHeaderProps) {
  const { t } = useTranslation('common');
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={`nav-section-${section.key}`}
      aria-expanded={expanded}
      className="group w-full flex items-center justify-between px-3 mx-2 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.05em] hover:text-sidebar-foreground transition-colors"
      style={{ color: section.color }}
    >
      <span>{t(section.labelKey, section.labelFallback)}</span>
      <ChevronDown
        size={12}
        className={cn(
          'text-sidebar-foreground/40 transition-transform duration-200',
          expanded ? 'rotate-0' : '-rotate-90',
        )}
      />
    </button>
  );
}

export function Sidebar() {
  const { t } = useTranslation('common');
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar, expandedSections, toggleSection, setSectionExpanded } = useThemeStore();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate('/login'); };
  const user = useAuthStore((s) => s.user);
  const enabledPlugins = useAuthStore((s) => s.enabledPlugins);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const c = sidebarCollapsed;
  const iconSize = c ? 20 : 18;

  const activeSectionKey = useMemo(
    () => findActiveSectionKey(location.pathname),
    [location.pathname],
  );

  // Auto-expand the active section on route change if the user hasn't explicitly set a state.
  useEffect(() => {
    if (activeSectionKey && expandedSections[activeSectionKey] === undefined) {
      setSectionExpanded(activeSectionKey, true);
    }
  }, [activeSectionKey, expandedSections, setSectionExpanded]);

  const visibleSections = useMemo(() => {
    return NAV_CONFIG
      .filter((s) => !s.pluginGate || enabledPlugins?.includes(s.pluginGate))
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => shouldRenderNavStatus(i.status)),
      }))
      .filter((s) => s.items.length > 0);
  }, [enabledPlugins]);

  const isExpanded = (key: string) => {
    if (expandedSections[key] !== undefined) return expandedSections[key];
    return key === activeSectionKey;
  };

  return (
    <aside
      className={cn(
        'bg-sidebar border-r border-sidebar-border transition-all duration-300 shrink-0 h-screen flex flex-col',
        c ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <NavLink to="/" className={cn(
        'flex items-center border-b border-sidebar-border h-12 shrink-0 bg-sidebar cursor-pointer',
        c ? 'justify-center' : 'px-4 gap-2',
      )}>
        <img src="/logo.png" alt="Duall Master" className="w-6 h-6 shrink-0" />
        {!c && <span className="text-[14px] font-semibold text-sidebar-foreground">DUALL MASTER</span>}
      </NavLink>

      {/* Nav items — scrollable */}
      <nav className={cn(
        'flex-1 overflow-y-auto py-1',
        c ? 'px-2 space-y-2' : 'space-y-0.5',
        '[&::-webkit-scrollbar]:w-0 [scrollbar-width:none]',
      )}>
        {visibleSections.map((section) => {
          const expanded = c ? true : isExpanded(section.key);
          return (
            <div key={section.key}>
              {c ? (
                <div className="h-2" />
              ) : (
                <SectionHeader
                  section={section}
                  expanded={expanded}
                  onToggle={() => toggleSection(section.key)}
                />
              )}
              {expanded && section.items.map((item) => (
                <SidebarNavItem
                  key={item.to}
                  item={item}
                  badge={item.badgeKey === 'alerts' ? unreadCount : undefined}
                  collapsed={c}
                  iconSize={iconSize}
                />
              ))}
            </div>
          );
        })}
      </nav>

      {/* Bottom — pinned */}
      <div className="shrink-0 bg-sidebar">
        <Separator className="bg-sidebar-border" />
        <HealthStrip variant="sidebar" collapsed={c} />
        <Separator className="bg-sidebar-border" />
        <div className={cn('py-1', c ? 'px-2 space-y-2' : 'space-y-0.5')}>
          <SidebarNavItem
            item={{ to: '/smart/ai-assistant', icon: Brain, labelKey: 'nav.aiAssistant', labelFallback: 'AI Assistant', status: 'ready' }}
            collapsed={c}
            iconSize={iconSize}
          />
          <SidebarNavItem
            item={{ to: '/settings', icon: Settings, labelKey: 'nav.settings', labelFallback: 'Settings', status: 'ready' }}
            collapsed={c}
            iconSize={iconSize}
          />
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
        <div className={cn('border-t border-sidebar-border py-1 flex', c ? 'justify-center px-2' : 'justify-end px-3')}>
          <button
            onClick={toggleSidebar}
            className={cn(
              'flex items-center h-7 rounded-md text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors',
              c ? 'w-8 justify-center' : 'w-auto px-1.5 justify-end',
            )}
          >
            {c ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
