import { useLocation } from 'react-router-dom';
import { Search, Bell } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useState, useEffect } from 'react';
import { SearchCommand } from '@/components/common/SearchCommand';
import { NotificationPanel } from '@/components/common/NotificationPanel';

function getBreadcrumb(pathname: string): { domain?: string; domainColor?: string; segments: string[] } {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { segments: ['Overview', 'Dashboard'] };

  const domainMap: Record<string, { label: string; color: string }> = {
    secure: { label: '🔒 SECURE', color: '#3B82F6' },
    manage: { label: '👤 MANAGE', color: '#8B5CF6' },
    operate: { label: '🏢 OPERATE', color: '#F59E0B' },
    smart: { label: '🧠 SMART', color: '#06B6D4' },
  };

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
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const bc = getBreadcrumb(location.pathname);

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
      <header className="h-12 bg-[#111827] border-b border-[#1E293B] flex items-center px-6 gap-3 flex-shrink-0">
        {/* Breadcrumb */}
        <div className="text-[13px] text-[#94A3B8] flex items-center gap-1">
          {bc.domain && (
            <>
              <span style={{ color: bc.domainColor }}>{bc.domain}</span>
              {bc.segments.length > 0 && <span className="mx-1">/</span>}
            </>
          )}
          {bc.segments.map((s, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1 text-[#64748B]">/</span>}
              <span className={i === bc.segments.length - 1 ? 'text-[#F8FAFC]' : ''}>{s}</span>
            </span>
          ))}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-4">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#64748B] text-[12px] hover:border-[#475569] transition-colors"
          >
            <Search size={14} />
            <span>Search...</span>
            <kbd className="bg-[#334155] px-1.5 py-0 rounded text-[10px] ml-1">⌘K</kbd>
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="w-8 h-8 flex items-center justify-center rounded-md text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC] transition-colors relative"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-[#EF4444] rounded-full border-2 border-[#111827]" />
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
