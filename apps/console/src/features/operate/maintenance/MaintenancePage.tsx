import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { workOrders, summary, type WorkOrder } from './mock-data';

export function MaintenancePage() {
  const { t } = useTranslation('operate');
  const [statusFilter, setStatusFilter] = useState('');

  const priorityCfg: Record<string, { color: string; bg: string; label: string }> = {
    critical: { color: '#EF4444', bg: 'bg-[#EF4444]/20', label: t('maintenance.priority.emergency') },
    high: { color: '#F59E0B', bg: 'bg-[#F59E0B]/20', label: t('maintenance.priority.high') },
    medium: { color: '#3B82F6', bg: 'bg-[#3B82F6]/20', label: t('maintenance.priority.medium') },
    low: { color: '#22C55E', bg: 'bg-[#22C55E]/20', label: t('maintenance.priority.low') },
  };

  const statusCfg: Record<string, { color: string; label: string }> = {
    open: { color: '#3B82F6', label: t('maintenance.status.open') },
    'in-progress': { color: '#F59E0B', label: t('maintenance.status.inProgress') },
    completed: { color: '#22C55E', label: t('maintenance.status.completed') },
    cancelled: { color: '#64748B', label: t('maintenance.status.cancelled') },
  };

  const filtered = statusFilter ? workOrders.filter(w => w.status === statusFilter) : workOrders;

  const columns: Column<WorkOrder>[] = [
    { key: 'id', header: t('maintenance.table.id'), width: '80px', render: r => <span className="font-mono text-[12px] text-[#F59E0B]">{r.id}</span> },
    { key: 'title', header: t('maintenance.table.title'), sortable: true, render: r => <span className="font-medium text-[#F8FAFC]">{r.title}</span> },
    { key: 'location', header: t('maintenance.table.location'), sortable: true, render: r => <span className="text-[#94A3B8]">{r.location}</span> },
    { key: 'category', header: t('maintenance.table.category'), width: '90px' },
    { key: 'priority', header: t('maintenance.table.priority'), width: '100px', sortable: true, render: r => {
      const p = priorityCfg[r.priority];
      return <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium', p.bg)} style={{ color: p.color }}>{p.label}</span>;
    }},
    { key: 'status', header: t('maintenance.table.status'), width: '110px', render: r => {
      const s = statusCfg[r.status];
      return <span className="text-[12px] font-medium" style={{ color: s.color }}>{s.label}</span>;
    }},
    { key: 'assignee', header: t('maintenance.table.assignee'), sortable: true },
    { key: 'createdAt', header: t('maintenance.table.created'), width: '100px', sortable: true },
  ];

  return (
    <div>
      <PageHeader title={t('maintenance.title')} description={t('maintenance.description')}>
        <button className="px-3 py-1.5 bg-[#F59E0B] text-[#0F172A] rounded-md text-[12px] font-medium">+ {t('maintenance.createRequest')}</button>
      </PageHeader>

      <div className="grid grid-cols-5 gap-3 mb-6">
        <StatCard label={t('maintenance.stats.total')} value={String(summary.total)} sub={t('common.sub.all')} icon="🔧" domain="operate" />
        <StatCard label={t('maintenance.stats.open')} value={String(summary.open)} sub={t('common.sub.waiting')} icon="📋" domain="operate" />
        <StatCard label={t('maintenance.stats.inProgress')} value={String(summary.inProgress)} sub={t('common.sub.executing')} icon="⚙️" domain="operate" />
        <StatCard label={t('maintenance.stats.completed')} value={String(summary.completed)} sub={t('common.sub.done')} icon="✅" domain="operate" />
        <StatCard label={t('maintenance.priority.emergency')} value={String(summary.critical)} sub={t('common.sub.priority')} icon="🚨" domain="error" />
      </div>

      <div className="flex gap-2 mb-4">
        {['', 'open', 'in-progress', 'completed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={cn(
            'px-3 py-1.5 rounded-md text-[12px] font-medium border',
            statusFilter === s ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#F59E0B]' : 'bg-[#1E293B] border-[#334155] text-[#94A3B8]'
          )}>
            {s === '' ? t('maintenance.filter.all') : statusCfg[s].label}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} rowKey={r => r.id} />
    </div>
  );
}
