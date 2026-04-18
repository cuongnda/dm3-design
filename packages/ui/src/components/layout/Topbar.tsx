import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Search, Bell, Sun, Moon, User, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useBreadcrumbStore } from '../../stores/breadcrumbStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useThemeStore } from '@/stores/themeStore';
import { useState, useEffect, useCallback } from 'react';
import { SearchCommand } from '../common/SearchCommand';
import { NotificationPanel } from '../common/NotificationPanel';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { HealthStrip } from './HealthStrip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getBreadcrumb(
  pathname: string,
  domainMap: Record<string, { label: string; colorClass: string }>,
  segmentMap: Record<string, string>,
  overviewLabel: string,
  dashboardLabel: string,
  labels: Record<string, string>,
): { domain?: string; domainColorClass?: string; domainPath?: string; segments: { label: string; path: string }[] } {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { segments: [{ label: overviewLabel, path: '/' }, { label: dashboardLabel, path: '/' }] };

  const domain = domainMap[parts[0]];
  // UUIDs → breadcrumb store label; known slugs → segmentMap; else capitalize
  const toLabel = (p: string) => {
    if (UUID_RE.test(p)) return labels[p.toLowerCase()] ?? p;
    return segmentMap[p] ?? p.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };
  const segments = parts.map((p, i) => ({
    label: toLabel(p),
    path: '/' + parts.slice(0, i + 1).join('/'),
  }));

  if (domain) {
    return { domain: domain.label, domainColorClass: domain.colorClass, domainPath: '/' + parts[0], segments: segments.slice(1) };
  }
  return { segments };
}

export function Topbar() {
  const { t } = useTranslation('common');
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { notifications, unreadCount, loading: notifLoading, refresh, markRead, markAllRead, acknowledge, remove } = useNotificationStore();
  const { theme, setTheme } = useThemeStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const domainMap: Record<string, { label: string; colorClass: string }> = {
    secure: { label: t('nav.secure'), colorClass: 'text-secure' },
    access: { label: t('nav.access'), colorClass: 'text-operate' },
    manage: { label: t('nav.manage'), colorClass: 'text-manage' },
    operate: { label: t('nav.operate'), colorClass: 'text-operate' },
    smart: { label: t('nav.smart', '🧠 SMART'), colorClass: 'text-smart' },
  };

  const segmentMap: Record<string, string> = {
    // access
    zones:          t('nav.zones', 'Zones'),
    'access-points': t('nav.accessPoints', 'Access Points'),
    'access-groups': t('nav.accessGroups', 'Access Groups'),
    'access-times':  t('nav.accessTimes', 'Access Times'),
    devices:        t('nav.devices', 'Devices'),
    // manage
    users:          t('nav.users', 'Users'),
    departments:    t('nav.departments', 'Departments'),
    visitors:       t('nav.visitors', 'Visitors'),
    contractors:    t('nav.contractors', 'Contractors'),
    attendance:     t('nav.attendance', 'Attendance'),
    deliveries:     t('nav.deliveries', 'Deliveries'),
    // secure
    'access-control': t('nav.accessControl', 'Access Control'),
    cctv:           t('nav.cctv', 'CCTV'),
    intrusion:      t('nav.intrusion', 'Intrusion'),
    intercom:       t('nav.intercom', 'Intercom'),
    emergency:      t('nav.emergency', 'Emergency'),
    // operate
    'room-booking': t('nav.roomBooking', 'Room Booking'),
    parking:        t('nav.parking', 'Parking'),
    maintenance:    t('nav.maintenance', 'Maintenance'),
    'guard-tour':   t('nav.guardTour', 'Guard Tour'),
    keys:           t('nav.keys', 'Keys'),
    // smart
    'ai-assistant': t('nav.aiAssistant', 'AI Assistant'),
    analytics:      t('nav.analytics', 'Analytics'),
    automation:     t('nav.automation', 'Automation'),
    // special
    new:            t('breadcrumb.new', 'New'),
  };

  const breadcrumbLabels = useBreadcrumbStore((s) => s.labels);
  const bc = getBreadcrumb(location.pathname, domainMap, segmentMap, t('breadcrumb.overview'), t('nav.dashboard'), breadcrumbLabels);

  // Refresh notifications on mount + poll every 30s
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleNotifClose = useCallback(() => setNotifOpen(false), []);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <header className="h-12 bg-background border-b border-border flex items-center px-6 gap-3 shrink-0">
        {/* Breadcrumb */}
        <div className="text-[13px] text-muted-foreground flex items-center gap-1">
          {bc.domain && (
            <>
              {bc.domainPath ? (
                <Link to={bc.domainPath} className={`${bc.domainColorClass} hover:underline`}>{bc.domain}</Link>
              ) : (
                <span className={bc.domainColorClass}>{bc.domain}</span>
              )}
              {bc.segments.length > 0 && <span className="mx-1">/</span>}
            </>
          )}
          {bc.segments.map((seg, i) => {
            const isLast = i === bc.segments.length - 1;
            return (
              <span key={i}>
                {i > 0 && <span className="mx-1 text-muted-foreground">/</span>}
                {isLast ? (
                  <span className="text-foreground">{seg.label}</span>
                ) : (
                  <Link to={seg.path} className="hover:underline hover:text-foreground transition-colors">{seg.label}</Link>
                )}
              </span>
            );
          })}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-4">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md text-muted-foreground text-[12px] hover:border-ring/60 transition-colors"
          >
            <Search size={14} />
            <span>{t('actions.search')}</span>
            <kbd className="bg-muted px-1.5 py-0 rounded text-[10px] ml-1">⌘K</kbd>
          </button>

          {/* Language switcher */}
          <LanguageSwitcher />

          {/* Theme toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-card hover:text-foreground"
                aria-label="Toggle theme"
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setTheme('light')}
                className="cursor-pointer"
              >
                <Sun className="mr-2 h-4 w-4" />
                <span>Light</span>
                {theme === 'light' && <span className="ml-auto">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTheme('dark')}
                className="cursor-pointer"
              >
                <Moon className="mr-2 h-4 w-4" />
                <span>Dark</span>
                {theme === 'dark' && <span className="ml-auto">✓</span>}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground transition-colors relative"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full border-2 border-background" />
              )}
            </button>
            {notifOpen && (
              <NotificationPanel
                notifications={notifications}
                unreadCount={unreadCount}
                loading={notifLoading}
                onClose={handleNotifClose}
                onMarkAllRead={markAllRead}
                onMarkRead={markRead}
                onAcknowledge={acknowledge}
                onDelete={remove}
                labels={{
                  title: t('notifications.title', 'Notifications'),
                  markAllRead: t('notifications.markAllRead', 'Mark all read'),
                  empty: t('notifications.empty', 'No notifications'),
                  acknowledge: t('notifications.acknowledge', 'Acknowledge'),
                  delete: t('notifications.delete', 'Delete'),
                }}
              />
            )}
          </div>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group w-8 h-8 bg-[#3B82F6] rounded-full flex items-center justify-center text-[11px] font-semibold text-white cursor-pointer ring-2 ring-transparent hover:ring-[#3B82F6]/50 transition-all duration-200">
                {user?.initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-1.5">
              <div className="px-2 py-2 mb-1">
                <p className="text-sm font-semibold truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer rounded-md py-2 px-2.5 gap-2.5 focus:bg-[#3B82F6]/10">
                <User className="h-4 w-4 text-muted-foreground" />
                {t('nav.profile', 'Profile')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { logout(); navigate('/login'); }} className="cursor-pointer rounded-md py-2 px-2.5 gap-2.5 text-[#F87171] focus:text-[#F87171] focus:bg-[#F87171]/10">
                <LogOut className="h-4 w-4" />
                {t('actions.signOut', 'Sign Out')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <HealthStrip />

      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
