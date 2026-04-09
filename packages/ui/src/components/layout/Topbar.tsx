import { useLocation } from 'react-router-dom';
import { Search, Bell, Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useBreadcrumbStore } from '../../stores/breadcrumbStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useThemeStore } from '@/stores/themeStore';
import { useState, useEffect } from 'react';
import { SearchCommand } from '../common/SearchCommand';
import { NotificationPanel } from '../common/NotificationPanel';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
): { domain?: string; domainColorClass?: string; segments: string[] } {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { segments: [overviewLabel, dashboardLabel] };

  const domain = domainMap[parts[0]];
  // UUIDs → breadcrumb store label; known slugs → segmentMap; else capitalize
  const toLabel = (p: string) => {
    if (UUID_RE.test(p)) return labels[p.toLowerCase()] ?? p;
    return segmentMap[p] ?? p.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };
  const segments = parts.map(toLabel);

  if (domain) {
    return { domain: domain.label, domainColorClass: domain.colorClass, segments: segments.slice(1) };
  }
  return { segments };
}

export function Topbar() {
  const { t } = useTranslation('common');
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
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
    identities:     t('nav.identities', 'Identities'),
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
              <span className={bc.domainColorClass}>{bc.domain}</span>
              {bc.segments.length > 0 && <span className="mx-1">/</span>}
            </>
          )}
          {bc.segments.map((s, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1 text-muted-foreground">/</span>}
              <span className={i === bc.segments.length - 1 ? 'text-foreground' : ''}>{s}</span>
            </span>
          ))}
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
            {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
          </div>

          {/* User */}
          <div className="w-7 h-7 bg-sidebar-primary rounded-full flex items-center justify-center text-[11px] font-semibold text-sidebar-primary-foreground cursor-pointer">
            {user?.initials}
          </div>
        </div>
      </header>

      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
