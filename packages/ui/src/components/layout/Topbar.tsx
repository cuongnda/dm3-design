import { useLocation } from 'react-router-dom';
import { Search, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useState, useEffect } from 'react';
import { SearchCommand } from '../common/SearchCommand';
import { NotificationPanel } from '../common/NotificationPanel';
import { LanguageSwitcher } from '../common/LanguageSwitcher';

function getBreadcrumb(
  pathname: string,
  domainMap: Record<string, { label: string; color: string }>,
  overviewLabel: string,
  dashboardLabel: string,
): { domain?: string; domainColor?: string; segments: string[] } {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { segments: [overviewLabel, dashboardLabel] };

  const domain = domainMap[parts[0]];
  const segments = parts.map((p) =>
    p.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  );

  if (domain) {
    return { domain: domain.label, domainColor: domain.color, segments: segments.slice(1) };
  }
  return { segments };
}

export function Topbar() {
  const { t } = useTranslation('common');
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const domainMap: Record<string, { label: string; color: string }> = {
    secure: { label: t('nav.secure'), color: '#3B82F6' },
    manage: { label: t('nav.manage'), color: '#8B5CF6' },
    operate: { label: t('nav.operate'), color: '#F59E0B' },
    smart: { label: '🧠 SMART', color: '#06B6D4' },
  };

  const bc = getBreadcrumb(location.pathname, domainMap, t('breadcrumb.overview'), t('nav.dashboard'));

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
      <header className="h-12 bg-sidebar border-b border-sidebar-border flex items-center px-6 gap-3 flex-shrink-0">
        {/* Breadcrumb */}
        <div className="text-[13px] text-muted-foreground flex items-center gap-1">
          {bc.domain && (
            <>
              <span style={{ color: bc.domainColor }}>{bc.domain}</span>
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

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground transition-colors relative"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-[#EF4444] rounded-full border-2 border-background" />
              )}
            </button>
            {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
          </div>

          {/* User */}
          <div className="w-7 h-7 bg-[#3B82F6] rounded-full flex items-center justify-center text-[11px] font-semibold text-white cursor-pointer">
            {user?.initials}
          </div>
        </div>
      </header>

      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
