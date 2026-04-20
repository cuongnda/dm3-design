import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { History, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuditRecent } from '../hooks/useAuditRecent';
import type { AuditLogDTO } from '@dm3/api-client';

const statusClass: Record<string, string> = {
  success: 'text-success',
  failure: 'text-error',
  denied: 'text-error',
  warning: 'text-warning',
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function describe(log: AuditLogDTO): string {
  const action = log.action || 'event';
  const entity = log.entity_type
    ? log.entity_name
      ? `${log.entity_type} "${log.entity_name}"`
      : log.entity_type
    : '';
  return entity ? `${action} · ${entity}` : action;
}

export function AuditStrip(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { data, isLoading, isError } = useAuditRecent(5);
  const logs = data?.data ?? [];

  return (
    <div
      data-testid="dashboard-section-audit-strip"
      className="bg-card border border-border rounded-lg overflow-hidden mb-6"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="text-[13px] font-semibold flex items-center gap-2">
          <History size={14} className="text-platform" />
          {t('audit.title', 'Recent Activity')}
        </div>
        <button
          type="button"
          data-testid="dashboard-section-audit-strip-cta"
          onClick={() => navigate('/settings/audit-log')}
          className="text-[12px] text-secure hover:underline"
        >
          {t('audit.viewAll', 'View audit log →')}
        </button>
      </div>

      {isLoading ? (
        <div className="px-4 py-4 space-y-2">
          <div className="animate-pulse h-3 bg-muted/30 rounded w-3/4" />
          <div className="animate-pulse h-3 bg-muted/30 rounded w-2/3" />
          <div className="animate-pulse h-3 bg-muted/30 rounded w-1/2" />
        </div>
      ) : isError || logs.length === 0 ? (
        <div className="px-4 py-5 text-[12px] text-muted-foreground">
          {isError
            ? t('audit.errorHint', 'Unable to load recent activity.')
            : t('audit.emptyHint', 'No recent activity.')}
        </div>
      ) : (
        <ul className="divide-y divide-border/50">
          {logs.map((log) => (
            <li
              key={log.id}
              className="flex items-center gap-3 px-4 py-2.5 text-[12px]"
            >
              <User size={12} className="text-muted-foreground shrink-0" />
              <span className="text-foreground font-medium truncate max-w-[180px]">
                {log.actor_email || log.actor_id || t('audit.system', 'system')}
              </span>
              <span className="text-muted-foreground truncate flex-1">
                {describe(log)}
              </span>
              <span
                className={cn(
                  'text-[11px] shrink-0',
                  statusClass[log.status] ?? 'text-muted-foreground',
                )}
              >
                {log.status}
              </span>
              <span className="text-[11px] text-muted-foreground shrink-0 w-16 text-right">
                {formatRelative(log.time)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
