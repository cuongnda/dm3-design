import { useState, useMemo } from 'react';
import { PageHeader } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { Bell, AlertTriangle, ShieldAlert, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mockAlerts, severityConfig, statusConfig, type Alert, type AlertSeverity } from './mock-data';

type FilterTab = 'all' | AlertSeverity | 'resolved';

const tabs: { key: FilterTab; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: 'Tất cả', icon: <Bell size={14} /> },
  { key: 'critical', label: 'Nghiêm trọng', icon: <ShieldAlert size={14} /> },
  { key: 'warning', label: 'Cảnh báo', icon: <AlertTriangle size={14} /> },
  { key: 'info', label: 'Thông tin', icon: <Info size={14} /> },
  { key: 'resolved', label: 'Đã xử lý', icon: <CheckCircle2 size={14} /> },
];

const columns: Column<Alert>[] = [
  { key: 'timestamp', header: 'Thời gian', width: '150px', sortable: true },
  {
    key: 'severity',
    header: 'Mức độ',
    width: '130px',
    sortable: true,
    render: (r) => {
      const cfg = severityConfig[r.severity];
      return (
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', cfg.bg)}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
          {cfg.label}
        </span>
      );
    },
  },
  { key: 'source', header: 'Nguồn', width: '200px' },
  { key: 'message', header: 'Nội dung' },
  {
    key: 'status',
    header: 'Trạng thái',
    width: '130px',
    render: (r) => {
      const cfg = statusConfig[r.status];
      return <span className="text-[12px] font-medium" style={{ color: cfg.color }}>{cfg.label}</span>;
    },
  },
];

export function AlertsPage() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [alerts, setAlerts] = useState(mockAlerts);

  const filtered = useMemo(() => {
    if (filter === 'all') return alerts;
    if (filter === 'resolved') return alerts.filter((a) => a.status === 'resolved');
    return alerts.filter((a) => a.severity === filter && a.status !== 'resolved');
  }, [alerts, filter]);

  const counts = useMemo(() => ({
    total: alerts.length,
    critical: alerts.filter((a) => a.severity === 'critical' && a.status !== 'resolved').length,
    warning: alerts.filter((a) => a.severity === 'warning' && a.status !== 'resolved').length,
    info: alerts.filter((a) => a.severity === 'info' && a.status !== 'resolved').length,
  }), [alerts]);

  const handleMarkRead = () => {
    setAlerts((prev) => prev.map((a) => a.status === 'new' ? { ...a, status: 'acknowledged' as const } : a));
  };

  const handleResolveAll = () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, status: 'resolved' as const })));
  };

  const stats = [
    { label: 'Tổng cảnh báo', value: counts.total, color: '#F8FAFC', icon: <Bell size={16} /> },
    { label: 'Nghiêm trọng', value: counts.critical, color: '#EF4444', icon: <ShieldAlert size={16} /> },
    { label: 'Cảnh báo', value: counts.warning, color: '#F59E0B', icon: <AlertTriangle size={16} /> },
    { label: 'Thông tin', value: counts.info, color: '#3B82F6', icon: <Info size={16} /> },
  ];

  return (
    <div>
      <PageHeader title="Cảnh báo" description="Trung tâm thông báo và cảnh báo hệ thống" />

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

      {/* Filter tabs + actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors',
                filter === t.key
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
          <button
            onClick={handleMarkRead}
            className="px-3 py-1.5 text-[12px] font-medium text-[#94A3B8] hover:text-[#F8FAFC] bg-[#1E293B] border border-[#334155] rounded-md transition-colors"
          >
            Đánh dấu đã đọc
          </button>
          <button
            onClick={handleResolveAll}
            className="px-3 py-1.5 text-[12px] font-medium text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-md hover:bg-[#22C55E]/20 transition-colors"
          >
            Xử lý tất cả
          </button>
        </div>
      </div>

      {/* Alert table */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-hidden">
        <DataTable columns={columns} data={filtered} rowKey={(r) => r.id} />
      </div>
    </div>
  );
}
