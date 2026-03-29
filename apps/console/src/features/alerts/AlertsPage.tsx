import { useState, useMemo } from 'react';
import { PageHeader } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
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

const severityConfig = {
  critical: { label: 'Nghiêm trọng', color: '#EF4444', bg: 'bg-[#7F1D1D]/30 text-[#EF4444]' },
  warning: { label: 'Từ chối', color: '#F59E0B', bg: 'bg-[#78350F]/30 text-[#F59E0B]' },
  info: { label: 'Cho phép', color: '#3B82F6', bg: 'bg-[#1E3A5F]/30 text-[#3B82F6]' },
};

const tabs: { key: DecisionFilter | 'critical'; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: 'Tất cả', icon: <Bell size={14} /> },
  { key: 'critical', label: 'Nghiêm trọng', icon: <ShieldAlert size={14} /> },
  { key: 'denied', label: 'Từ chối', icon: <AlertTriangle size={14} /> },
  { key: 'granted', label: 'Cho phép', icon: <Info size={14} /> },
];

export function AlertsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'critical' | DecisionFilter>('all');
  const [doorFilter, setDoorFilter] = useState('');
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

  const counts = useMemo(() => ({
    total: Math.max(total, events.length),
    critical: events.filter(e => getSeverity(e) === 'critical').length + activeAlarms.filter(a => a.severity === 'critical').length,
    denied: events.filter(e => e.decision === 'denied').length,
    granted: events.filter(e => e.decision === 'granted').length,
    activeAlarms: activeAlarms.length,
  }), [events, total, activeAlarms]);

  const stats = [
    { label: 'Tổng sự kiện', value: counts.total, color: '#F8FAFC', icon: <Bell size={16} /> },
    { label: 'Nghiêm trọng', value: counts.critical, color: '#EF4444', icon: <ShieldAlert size={16} /> },
    { label: 'Từ chối', value: counts.denied, color: '#F59E0B', icon: <AlertTriangle size={16} /> },
    { label: 'Cho phép', value: counts.granted, color: '#3B82F6', icon: <Info size={16} /> },
  ];

  const columns: Column<EventDTO>[] = [
    {
      key: 'time', header: 'Thời gian', width: '170px', sortable: true,
      render: (r) => (
        <span className="font-mono text-[12px] text-[#94A3B8]">
          {new Date(r.time).toLocaleString('vi-VN')}
        </span>
      ),
    },
    {
      key: 'decision', header: 'Mức độ', width: '130px',
      render: (r) => {
        const sev = getSeverity(r);
        const cfg = severityConfig[sev];
        return (
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', cfg.bg)}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'door_name', header: 'Cửa / Nguồn', width: '180px',
      render: (r) => <span className="text-[13px] text-[#94A3B8]">{r.door_name || r.door_id || '—'}</span>,
    },
    {
      key: 'person_name', header: 'Người',
      render: (r) => (
        <span className="text-[13px] text-[#F8FAFC]">
          {r.person_name || <span className="text-[#64748B]">—</span>}
        </span>
      ),
    },
    {
      key: 'credential_type', header: 'Credential', width: '110px',
      render: (r) => (
        <span className="text-[12px] text-[#94A3B8] capitalize">{r.credential_type || '—'}</span>
      ),
    },
    {
      key: 'reason', header: 'Lý do', width: '160px',
      render: (r) => (
        <span className="text-[12px] text-[#64748B]">{r.reason || '—'}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Sự kiện & Cảnh báo" description={`Nhật ký truy cập và cảnh báo hệ thống • ${isConnected ? 'Live' : 'Offline'}`} />

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <div className="text-[22px] font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[11px] text-[#64748B]">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs + date/door filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 flex-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setActiveTab(t.key as any); setPage(1); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors',
                activeTab === t.key
                  ? 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B]'
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="h-8 px-2 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px] [color-scheme:dark]"
          />
          <span className="self-center text-[#64748B] text-[12px]">→</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="h-8 px-2 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px] [color-scheme:dark]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-hidden">
        {isLoading && <div className="text-center py-8 text-[#94A3B8]">Đang tải...</div>}
        {error && <div className="text-center py-8 text-[#EF4444]">Có lỗi xảy ra khi tải dữ liệu</div>}
        {!isLoading && !error && (
          <DataTable
            columns={columns}
            data={filtered}
            rowKey={(r) => r.id}
            rowClassName={(r) => getSeverity(r) === 'critical' ? 'bg-[#7F1D1D]/10' : ''}
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px] text-[#64748B]">
            Trang {page} / {totalPages} · {total} sự kiện
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#94A3B8] text-[12px] disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Trước
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#94A3B8] text-[12px] disabled:opacity-40"
            >
              Sau <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
