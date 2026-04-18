import { cn } from '../../lib/utils';
import { useEffect, useRef } from 'react';
import { Check, Trash2, BellOff } from 'lucide-react';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  status: 'unread' | 'read' | 'acknowledged';
  source: string;
  created_at: string;
}

interface NotificationPanelProps {
  notifications: NotificationItem[];
  unreadCount: number;
  loading?: boolean;
  onClose: () => void;
  onMarkAllRead: () => void;
  onMarkRead?: (id: string) => void;
  onAcknowledge?: (id: string) => void;
  onDelete?: (id: string) => void;
  labels?: {
    title?: string;
    markAllRead?: string;
    empty?: string;
    acknowledge?: string;
    delete?: string;
  };
}

const severityDot: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function NotificationPanel({
  notifications,
  unreadCount,
  loading,
  onClose,
  onMarkAllRead,
  onMarkRead,
  onAcknowledge,
  onDelete,
  labels,
}: NotificationPanelProps) {
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
      className="absolute top-full right-0 mt-2 w-[360px] bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-popover">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {labels?.title ?? 'Notifications'}
          </span>
          {unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            className="text-[12px] text-primary hover:text-primary/80 transition-colors"
          >
            {labels?.markAllRead ?? 'Mark all read'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="overflow-y-auto max-h-[400px] overscroll-contain">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <BellOff className="size-10 text-muted-foreground/20" />
            <span className="text-sm text-muted-foreground">
              {labels?.empty ?? 'No notifications'}
            </span>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={cn(
                'group flex gap-3 px-4 py-3 border-b border-border/40 hover:bg-muted/40 transition-colors cursor-pointer',
                n.status === 'unread' && 'bg-primary/5',
              )}
              onClick={() => {
                if (n.status === 'unread') onMarkRead?.(n.id);
              }}
            >
              {/* Severity dot */}
              <div className="pt-1 shrink-0">
                <span
                  className={cn(
                    'block w-2 h-2 rounded-full',
                    severityDot[n.severity] ?? 'bg-muted-foreground',
                    n.status !== 'unread' && 'opacity-30',
                  )}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className={cn(
                    'text-[13px] text-foreground leading-snug',
                    n.status === 'unread' ? 'font-semibold' : 'font-normal',
                  )}>
                    {n.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 shrink-0 pt-0.5">
                    {timeAgo(n.created_at)}
                  </span>
                </div>
                {n.message && (
                  <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {n.message}
                  </p>
                )}
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                    {n.source}
                  </span>
                  {/* Actions — visible on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {n.status !== 'acknowledged' && onAcknowledge && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAcknowledge(n.id); }}
                        title={labels?.acknowledge ?? 'Acknowledge'}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-green-400 transition-colors"
                      >
                        <Check className="size-3.5" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
                        title={labels?.delete ?? 'Delete'}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
