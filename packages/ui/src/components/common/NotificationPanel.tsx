import { useNotificationStore } from '@/stores/notificationStore';
import { cn } from '../../lib/utils';
import { useEffect, useRef } from 'react';

interface NotificationPanelProps {
  onClose: () => void;
}

const severityDot: Record<string, string> = {
  critical: 'bg-[#EF4444]',
  warning: 'bg-[#EAB308]',
  info: 'bg-[#3B82F6]',
};

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const { notifications, markAllRead } = useNotificationStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-10 right-0 w-[380px] max-h-[480px] bg-[#1E293B] border border-[#334155] rounded-lg shadow-xl z-50 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#334155]">
        <span className="text-[14px] font-semibold text-[#F8FAFC]">Notifications</span>
        <button onClick={markAllRead} className="text-[12px] text-[#3B82F6] hover:underline">
          ✓ Mark all read
        </button>
      </div>
      <div className="overflow-y-auto max-h-[400px]">
        {notifications.map((n) => (
          <div key={n.id} className="flex gap-2.5 px-4 py-3 border-b border-[#334155]/50 hover:bg-[#334155]/30">
            <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', severityDot[n.severity])} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-[#F8FAFC]">{n.title}</div>
              <div className="text-[11px] text-[#64748B] mt-0.5">{n.description} · {n.timeAgo}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
