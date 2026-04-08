import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  fetchTenantAuditLogs,
  exportAuditLogsUrl,
  type AuditEntryDTO,
  type AuditFilters,
} from '@/lib/api';

const STATUSES = ['success', 'failure', 'error'] as const;

function statusBadge(status: string) {
  if (status === 'success') return 'bg-green-500/15 text-green-400 border border-green-500/30';
  if (status === 'failure') return 'bg-red-500/15 text-red-400 border border-red-500/30';
  return 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
}

function serviceBadge(service: string) {
  if (service === 'auth-svc') return 'bg-blue-500/15 text-blue-400';
  if (service === 'identity-svc') return 'bg-purple-500/15 text-purple-400';
  if (service === 'access-svc') return 'bg-green-500/15 text-green-400';
  if (service === 'device-gateway') return 'bg-amber-500/15 text-amber-400';
  return 'bg-muted text-muted-foreground';
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

interface RowDetailProps {
  entry: AuditEntryDTO;
  t: (key: string) => string;
}

function RowDetail({ entry, t }: RowDetailProps) {
  return (
    <tr>
      <td colSpan={6} className="px-4 py-3 bg-card/30">
        <div className="grid grid-cols-1 gap-3 text-[12px]">
          {entry.actor_ip && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-28 shrink-0">{t('audit.detail.ip')}</span>
              <span className="text-foreground font-mono">{entry.actor_ip}</span>
            </div>
          )}
          {entry.user_agent && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-28 shrink-0">{t('audit.detail.userAgent')}</span>
              <span className="text-foreground truncate max-w-xl">{entry.user_agent}</span>
            </div>
          )}
          {entry.old_values && Object.keys(entry.old_values).length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1">{t('audit.detail.oldValues')}</div>
              <pre className="bg-background rounded p-2 text-[11px] text-red-400 overflow-auto max-h-32">
                {JSON.stringify(entry.old_values, null, 2)}
              </pre>
            </div>
          )}
          {entry.new_values && Object.keys(entry.new_values).length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1">{t('audit.detail.newValues')}</div>
              <pre className="bg-background rounded p-2 text-[11px] text-green-400 overflow-auto max-h-32">
                {JSON.stringify(entry.new_values, null, 2)}
              </pre>
            </div>
          )}
          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1">{t('audit.detail.metadata')}</div>
              <pre className="bg-background rounded p-2 text-[11px] text-muted-foreground overflow-auto max-h-32">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export function TenantAuditLogPage() {
  const { t } = useTranslation('system');

  const [entries, setEntries] = useState<AuditEntryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [filters, setFilters] = useState<AuditFilters>({});
  const [draftFilters, setDraftFilters] = useState<AuditFilters>({});

  const load = useCallback((p: number, f: AuditFilters) => {
    setLoading(true);
    fetchTenantAuditLogs(p, limit, f)
      .then((res) => {
        setEntries(res.data);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [limit]);

  useEffect(() => {
    load(page, filters);
  }, [page, filters, load]);

  const applyFilters = () => {
    setFilters({ ...draftFilters });
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">{t('auditLog.title')}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t('auditLog.description')}</p>
        </div>
        <a
          href={exportAuditLogsUrl(filters)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-operate/10 text-operate border border-operate/30 rounded-md text-[13px] hover:bg-operate/20 transition-colors"
        >
          <Download size={14} />
          {t('audit.export')}
        </a>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-3">
        <div className="flex flex-wrap gap-2 items-end">
          {/* Action */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">{t('audit.filters.action')}</label>
            <input
              type="text"
              value={draftFilters.action ?? ''}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, action: e.target.value || undefined }))}
              placeholder={t('audit.filters.action')}
              className="bg-card border border-border rounded-md px-3 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">{t('audit.filters.status')}</label>
            <select
              value={draftFilters.status ?? ''}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, status: e.target.value || undefined }))}
              className="bg-card border border-border rounded-md px-3 py-1.5 text-[13px] text-foreground"
            >
              <option value="">{t('audit.filters.allStatuses')}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* From */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">{t('audit.filters.from')}</label>
            <input
              type="datetime-local"
              value={draftFilters.from ?? ''}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, from: e.target.value || undefined }))}
              className="bg-card border border-border rounded-md px-3 py-1.5 text-[13px] text-foreground"
            />
          </div>

          {/* To */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">{t('audit.filters.to')}</label>
            <input
              type="datetime-local"
              value={draftFilters.to ?? ''}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, to: e.target.value || undefined }))}
              className="bg-card border border-border rounded-md px-3 py-1.5 text-[13px] text-foreground"
            />
          </div>

          {/* Search */}
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-[11px] text-muted-foreground">{t('audit.filters.search')}</label>
            <input
              type="text"
              value={draftFilters.search ?? ''}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, search: e.target.value || undefined }))}
              placeholder={t('audit.filters.search')}
              className="bg-card border border-border rounded-md px-3 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground w-full"
            />
          </div>

          <button
            type="button"
            onClick={applyFilters}
            className="px-4 py-1.5 bg-operate text-white rounded-md text-[13px] font-medium hover:bg-operate/90 transition-colors self-end"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-5 h-5 border-2 border-operate/30 border-t-operate rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left text-muted-foreground text-[11px] uppercase tracking-wider font-medium">{t('audit.table.time')}</th>
                <th className="px-4 py-2.5 text-left text-muted-foreground text-[11px] uppercase tracking-wider font-medium">{t('audit.table.actor')}</th>
                <th className="px-4 py-2.5 text-left text-muted-foreground text-[11px] uppercase tracking-wider font-medium">{t('audit.table.service')}</th>
                <th className="px-4 py-2.5 text-left text-muted-foreground text-[11px] uppercase tracking-wider font-medium">{t('audit.table.action')}</th>
                <th className="px-4 py-2.5 text-left text-muted-foreground text-[11px] uppercase tracking-wider font-medium">{t('audit.table.status')}</th>
                <th className="px-4 py-2.5 text-left text-muted-foreground text-[11px] uppercase tracking-wider font-medium">{t('audit.table.details')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                    {t('audit.empty')}
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <>
                    <tr
                      key={entry.id}
                      className="border-b border-border hover:bg-card/50 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">
                        {formatTime(entry.time)}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-foreground">
                        {entry.actor_email ?? entry.actor_id ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${serviceBadge(entry.service)}`}>
                          {entry.service}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-foreground font-mono">
                        {entry.action}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${statusBadge(entry.status)}`}>
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {expandedId === entry.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                    </tr>
                    {expandedId === entry.id && (
                      <RowDetail key={`${entry.id}-detail`} entry={entry} t={t} />
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-[13px] text-muted-foreground">
        <span>{total} entries</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 rounded border border-border bg-card hover:bg-card/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Prev
          </button>
          <span className="px-2">{page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded border border-border bg-card hover:bg-card/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
