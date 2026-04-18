import { useEffect, useState, useCallback, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Button, Badge } from '@dm3/ui';
import { fetchTenantAuditLogs, type AuditEntryDTO } from '@/lib/api';

interface UserAuditTabProps {
  userId: string;
}

const PAGE_SIZE = 20;

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'success') return 'default';
  if (status === 'failure' || status === 'denied' || status === 'error') return 'destructive';
  return 'secondary';
}

function formatActor(entry: AuditEntryDTO): string {
  if (entry.actor_email) return entry.actor_email;
  if (entry.actor_id) return entry.actor_id.slice(0, 8) + '…';
  return 'system';
}

export function UserAuditTab({ userId }: UserAuditTabProps) {
  const { t } = useTranslation('users');
  const [entries, setEntries] = useState<AuditEntryDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTenantAuditLogs(page, PAGE_SIZE, { entity_id: userId });
      setEntries(res.data || []);
      setTotal(res.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [userId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading && entries.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText size={36} className="mb-3 text-destructive/60" />
        <p className="text-[13px] font-medium text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
          {t('audit.retry', 'Retry')}
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText size={36} className="mb-3 text-muted-foreground/40" />
        <p className="text-[13px] font-medium text-foreground">
          {t('audit.empty', 'No audit entries yet')}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {t('audit.emptyHint', 'Changes to this user will appear here')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="user-audit-tab">
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/60 border-b border-border">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2 text-left font-medium text-foreground">
                {t('audit.col.time', 'Time')}
              </th>
              <th className="px-3 py-2 text-left font-medium text-foreground">
                {t('audit.col.actor', 'Actor')}
              </th>
              <th className="px-3 py-2 text-left font-medium text-foreground">
                {t('audit.col.action', 'Action')}
              </th>
              <th className="px-3 py-2 text-left font-medium text-foreground">
                {t('audit.col.service', 'Service')}
              </th>
              <th className="px-3 py-2 text-left font-medium text-foreground">
                {t('audit.col.status', 'Status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isOpen = expanded === entry.id;
              const hasDetails = !!(entry.old_values || entry.new_values || entry.metadata);
              return (
                <Fragment key={entry.id}>
                  <tr
                    className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => hasDetails && setExpanded(isOpen ? null : entry.id)}
                    data-testid={`user-audit-row-${entry.id}`}
                  >
                    <td className="w-8 px-3 py-2 text-muted-foreground">
                      {hasDetails ? (
                        isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
                      {new Date(entry.time).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-[12px]">
                      <div className="flex flex-col">
                        <span className="text-foreground">{formatActor(entry)}</span>
                        {entry.actor_ip && (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {entry.actor_ip}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-[12px] text-foreground">{entry.action}</span>
                      {entry.entity_type && (
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          · {entry.entity_type}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {entry.service}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusVariant(entry.status)} className="text-[11px]">
                        {entry.status}
                      </Badge>
                    </td>
                  </tr>
                  {isOpen && hasDetails && (
                    <tr className="bg-muted/30 border-b border-border">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[12px]">
                          {entry.old_values && Object.keys(entry.old_values).length > 0 && (
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                                {t('audit.oldValues', 'Before')}
                              </div>
                              <pre className="rounded bg-background/60 p-2 text-[11px] font-mono text-foreground overflow-auto max-h-40">
                                {JSON.stringify(entry.old_values, null, 2)}
                              </pre>
                            </div>
                          )}
                          {entry.new_values && Object.keys(entry.new_values).length > 0 && (
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                                {t('audit.newValues', 'After')}
                              </div>
                              <pre className="rounded bg-background/60 p-2 text-[11px] font-mono text-foreground overflow-auto max-h-40">
                                {JSON.stringify(entry.new_values, null, 2)}
                              </pre>
                            </div>
                          )}
                          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                                {t('audit.metadata', 'Metadata')}
                              </div>
                              <pre className="rounded bg-background/60 p-2 text-[11px] font-mono text-foreground overflow-auto max-h-40">
                                {JSON.stringify(entry.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-[12px] text-muted-foreground">
        <span data-testid="user-audit-total">
          {t('audit.entries', '{{count}} entries', { count: total })}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[12px]"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            data-testid="user-audit-prev"
          >
            <ChevronLeft size={13} className="mr-1" />
            {t('audit.prev', 'Prev')}
          </Button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[12px]"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            data-testid="user-audit-next"
          >
            {t('audit.next', 'Next')}
            <ChevronRight size={13} className="ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
