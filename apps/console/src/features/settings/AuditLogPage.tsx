import { useState, useEffect, useCallback } from 'react';
import { startOfDay } from 'date-fns';
import { ChevronDown, ChevronRight, Download, X, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  Label,
  Select,
  SelectOption,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  DatetimePicker,
  EmptyState,
} from '@dm3/ui';
import {
  fetchTenantAuditLogs,
  exportAuditLogsUrl,
  type AuditEntryDTO,
  type AuditFilters,
} from '@/lib/api';

const STATUSES = ['success', 'failure', 'error'] as const;

function statusBadgeClass(status: string) {
  if (status === 'success') return 'bg-green-500/15 text-green-400 border-green-500/30';
  if (status === 'failure') return 'bg-red-500/15 text-red-400 border-red-500/30';
  return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
}

function serviceBadgeClass(service: string) {
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
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={6} className="px-4 py-3 bg-card/30">
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
      </TableCell>
    </TableRow>
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

  const clearFilters = () => {
    setDraftFilters({});
    setFilters({});
    setPage(1);
  };

  const hasFilters = Object.values(draftFilters).some((v) => v !== undefined && v !== '');

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const datePresets = [
    { label: t('audit.presets.today'), value: startOfDay(new Date()) },
  ];

  return (
    <div className="p-6 space-y-4 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">{t('auditLog.title')}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{t('auditLog.description')}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={exportAuditLogsUrl(filters)}>
            <Download size={14} />
            {t('audit.export')}
          </a>
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-3">
        <div className="flex flex-wrap gap-2 items-end">
          {/* Action */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t('audit.filters.action')}</Label>
            <Input
              value={draftFilters.action ?? ''}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, action: e.target.value || undefined }))}
              placeholder={t('audit.filters.action')}
              className="w-[140px] h-9"
              data-testid="settings-input-auditAction"
            />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t('audit.filters.status')}</Label>
            <Select
              value={draftFilters.status ?? ''}
              onValueChange={(v) => setDraftFilters((prev) => ({ ...prev, status: v || undefined }))}
              className="w-[140px]"
              data-testid="settings-select-auditStatus"
            >
              <SelectOption value="">{t('audit.filters.allStatuses')}</SelectOption>
              {STATUSES.map((s) => <SelectOption key={s} value={s}>{s}</SelectOption>)}
            </Select>
          </div>

          {/* From */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t('audit.filters.from')}</Label>
            <DatetimePicker
              value={draftFilters.from ?? null}
              onChange={(v) => setDraftFilters((prev) => ({ ...prev, from: v || undefined }))}
              placeholder={t('audit.filters.from')}
              className="w-[200px]"
              presets={datePresets}
            />
          </div>

          {/* To */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t('audit.filters.to')}</Label>
            <DatetimePicker
              value={draftFilters.to ?? null}
              onChange={(v) => setDraftFilters((prev) => ({ ...prev, to: v || undefined }))}
              placeholder={t('audit.filters.to')}
              className="w-[200px]"
              presets={datePresets}
            />
          </div>

          {/* Search */}
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <Label className="text-[11px]">{t('audit.filters.search')}</Label>
            <Input
              value={draftFilters.search ?? ''}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, search: e.target.value || undefined }))}
              placeholder={t('audit.filters.search')}
              className="h-9"
              data-testid="settings-input-auditSearch"
            />
          </div>

          <div className="flex gap-1 self-end">
            {hasFilters && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clearFilters}
                data-testid="settings-button-auditClear"
              >
                <X size={14} />
                {t('audit.filters.clear')}
              </Button>
            )}
            <Button
              size="sm"
              onClick={applyFilters}
              className=""
              data-testid="settings-button-auditApply"
            >
              {t('audit.filters.apply')}
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-5 h-5 border-2 border-operate/30 border-t-operate rounded-full animate-spin" />
          </div>
        ) : (
          <Table noWrapper>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('audit.table.time')}</TableHead>
                <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('audit.table.actor')}</TableHead>
                <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('audit.table.service')}</TableHead>
                <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('audit.table.action')}</TableHead>
                <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('audit.table.status')}</TableHead>
                <TableHead className="px-4 text-[11px] uppercase tracking-wider">{t('audit.table.details')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-10">
                    <EmptyState
                      icon={<Activity size={32} strokeWidth={1.2} />}
                      title={Object.values(filters).some((v) => v !== undefined && v !== '') ? 'No audit entries match these filters' : t('audit.empty')}
                      description={Object.values(filters).some((v) => v !== undefined && v !== '')
                        ? 'Try a broader time window, a different action, or clear filters to see the full audit trail.'
                        : 'Every create, update, delete, and auth event is recorded here. As users and devices interact with the system, the audit trail fills up automatically — no action required.'}
                      primaryAction={Object.values(filters).some((v) => v !== undefined && v !== '')
                        ? { label: 'Clear filters', variant: 'outline', onClick: clearFilters, 'data-testid': 'settings-button-auditClear-empty' }
                        : undefined}
                      compact
                    />
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <>
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer"
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <TableCell className="px-4 text-[12px] text-muted-foreground">
                        {formatTime(entry.time)}
                      </TableCell>
                      <TableCell className="px-4 text-[13px]">
                        {entry.actor_email ?? entry.actor_id ?? '—'}
                      </TableCell>
                      <TableCell className="px-4">
                        <Badge variant="outline" className={`rounded text-[11px] ${serviceBadgeClass(entry.service)}`}>
                          {entry.service}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 text-[13px] font-mono">
                        {entry.action}
                      </TableCell>
                      <TableCell className="px-4">
                        <Badge variant="outline" className={`rounded text-[11px] ${statusBadgeClass(entry.status)}`}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(expandedId === entry.id ? null : entry.id);
                          }}
                        >
                          {expandedId === entry.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedId === entry.id && (
                      <RowDetail key={`${entry.id}-detail`} entry={entry} t={t} />
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-[13px] text-muted-foreground">
        <span>{t('audit.pagination.entries', { count: total })}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            data-testid="settings-button-auditPrev"
          >
            {t('audit.pagination.prev')}
          </Button>
          <span className="px-2">{t('audit.pagination.pageOf', { page, total: totalPages })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            data-testid="settings-button-auditNext"
          >
            {t('audit.pagination.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
