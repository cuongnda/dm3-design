import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, DataTable, type Column, Button, Input } from '@dm3/ui';
import { Bell, AlertTriangle, ShieldAlert, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEvents } from '@/lib/hooks';
import { useRealtimeStore, useActiveAlarms, useRecentEvents } from '@dm3/api-client';
import type { EventDTO } from '@/lib/api';

type DecisionFilter = 'all' | 'granted' | 'denied';

function getSeverity(event: EventDTO): 'critical' | 'warning' | 'info' {
  if (event.reason === 'forced' || event.reason === 'tamper') return 'critical';
  if (event.decision === 'denied') return 'warning';
  return 'info';
}

function getSeverityConfig(t: any) {
  return {
    critical: { label: t('alerts.severity.critical'), bg: 'bg-error/20 text-error' },
    warning: { label: t('alerts.severity.warning'), bg: 'bg-warning/20 text-warning' },
    info: { label: t('alerts.severity.info'), bg: 'bg-secure/20 text-secure' },
  };
}

function getTabs(t: any): { key: DecisionFilter | 'critical'; label: string; icon: React.ReactNode }[] {
  return [
    { key: 'all', label: t('alerts.tabs.all'), icon: <Bell size={14} /> },
    { key: 'critical', label: t('alerts.tabs.critical'), icon: <ShieldAlert size={14} /> },
    { key: 'denied', label: t('alerts.tabs.denied'), icon: <AlertTriangle size={14} /> },
    { key: 'granted', label: t('alerts.tabs.granted'), icon: <Info size={14} /> },
  ];
}

export function AlertsPage() {
  const { t } = useTranslation('secure');
  const [activeTab, setActiveTab] = useState<'all' | 'critical' | DecisionFilter>('all');
  const [doorFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  // Real-time state — connection managed by <RealtimeProvider> in App.tsx
  const isConnected = useRealtimeStore((s) => s.connected);
  const activeAlarms = useActiveAlarms();
  const recentEvents = useRecentEvents(20);

  const params: Record<string, string> = {};
  if (doorFilter) params.door_id = doorFilter;
  if (activeTab === 'granted' || activeTab === 'denied') params.decision = activeTab;
  if (fromDate) params.from = new Date(fromDate).toISOString();
  if (toDate) params.to = new Date(toDate + 'T23:59:59').toISOString();

  const { data, isLoading, error } = useEvents(page, params);
  const apiEvents = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  // Convert real-time events to EventDTO format
  const realtimeEventDTOs: EventDTO[] = recentEvents.map(event => ({
    id: event.id,
    tenant_id: event.tenantId,
    time: event.time.toISOString(),
    door_id: event.doorId,
    device_id: event.deviceId,
    person_id: undefined,
    person_name: event.personName,
    credential_type: event.credentialType,
    direction: event.direction,
    decision: event.decision,
    reason: event.reason,
    confidence: event.confidence,
  }));

  // Merge real-time events with API events
  const events = [
    ...realtimeEventDTOs,
    ...apiEvents.filter(apiEvent => 
      !realtimeEventDTOs.some(rtEvent => rtEvent.id === apiEvent.id)
    )
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  // Client-side filter for 'critical' tab (forced/tamper events)
  const filtered = useMemo(() => {
    if (activeTab === 'critical') {
      return events.filter(e => getSeverity(e) === 'critical');
    }
    return events;
  }, [events, activeTab]);

  const severityConfig = getSeverityConfig(t);
  const tabs = getTabs(t);

  const counts = useMemo(() => ({
    total: Math.max(total, events.length),
    critical: events.filter(e => getSeverity(e) === 'critical').length + activeAlarms.filter(a => a.severity === 'critical').length,
    denied: events.filter(e => e.decision === 'denied').length,
    granted: events.filter(e => e.decision === 'granted').length,
    activeAlarms: activeAlarms.length,
  }), [events, total, activeAlarms]);

  const stats = [
    { label: t('alerts.stats.totalEvents'), value: counts.total, cls: 'text-foreground', bgCls: 'bg-foreground/10', icon: <Bell size={16} /> },
    { label: t('alerts.stats.critical'), value: counts.critical, cls: 'text-error', bgCls: 'bg-error/10', icon: <ShieldAlert size={16} /> },
    { label: t('alerts.stats.denied'), value: counts.denied, cls: 'text-warning', bgCls: 'bg-warning/10', icon: <AlertTriangle size={16} /> },
    { label: t('alerts.stats.granted'), value: counts.granted, cls: 'text-secure', bgCls: 'bg-secure/10', icon: <Info size={16} /> },
  ];

  const columns: Column<EventDTO>[] = [
    {
      key: 'time', header: t('alerts.table.time'), width: '170px', sortable: true,
      render: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">
          {new Date(r.time).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'decision', header: t('alerts.table.severity'), width: '130px',
      render: (r) => {
        const sev = getSeverity(r);
        const cfg = severityConfig[sev];
        return (
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', cfg.bg)}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'door_name', header: t('alerts.table.doorSource'), width: '180px',
      render: (r) => <span className="text-[13px] text-muted-foreground">{r.door_id || '—'}</span>,
    },
    {
      key: 'person_name', header: t('alerts.table.person'),
      render: (r) => (
        <span className="text-[13px] text-foreground">
          {r.person_name || <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      key: 'credential_type', header: t('alerts.table.credential'), width: '110px',
      render: (r) => (
        <span className="text-[12px] text-muted-foreground capitalize">{r.credential_type || '—'}</span>
      ),
    },
    {
      key: 'reason', header: t('alerts.table.reason'), width: '160px',
      render: (r) => (
        <span className="text-[12px] text-muted-foreground">{r.reason || '—'}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader 
        title={t('alerts.title')} 
        description={t('alerts.description', { 
          status: isConnected ? t('alerts.status.live') : t('alerts.status.offline') 
        })} 
      />

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.bgCls}`}>
              <span className={s.cls}>{s.icon}</span>
            </div>
            <div>
              <div className={`text-[22px] font-bold ${s.cls}`}>{s.value}</div>
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs + date/door filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 flex-1">
          {tabs.map((t) => (
            <button
              type="button"
              key={t.key}
              onClick={() => { setActiveTab(t.key as any); setPage(1); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors',
                activeTab === t.key
                  ? 'bg-secure/10 text-secure border border-secure/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="h-8 text-[12px] scheme-dark"
          />
          <span className="text-muted-foreground text-[12px]">→</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="h-8 text-[12px] scheme-dark"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading && <div className="text-center py-8 text-muted-foreground">{t('alerts.loading')}</div>}
        {error && <div className="text-center py-8 text-error">{t('alerts.error')}</div>}
        {!isLoading && !error && (
          <DataTable
            columns={columns}
            data={filtered}
            rowKey={(r) => r.id}
            rowClassName={(r) => getSeverity(r) === 'critical' ? 'bg-error/5' : ''}
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px] text-muted-foreground">
            {t('alerts.pagination.page', { current: page, total: totalPages, count: total })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="gap-1"
            >
              <ChevronLeft size={14} /> {t('alerts.pagination.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="gap-1"
            >
              {t('alerts.pagination.next')} <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
