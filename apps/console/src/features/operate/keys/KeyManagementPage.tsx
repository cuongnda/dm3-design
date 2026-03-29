import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { keys, keyLogs, summary, type Key, type KeyLog } from './mock-data';

export function KeyManagementPage() {
  const { t } = useTranslation('operate');
  const [tab, setTab] = useState<'keys' | 'logs'>('keys');

  const statusCfg: Record<string, { color: string; label: string }> = {
    available: { color: '#22C55E', label: t('keys.status.available') },
    'checked-out': { color: '#F59E0B', label: t('keys.status.borrowed') },
    overdue: { color: '#EF4444', label: t('keys.status.overdue') },
    lost: { color: '#64748B', label: t('keys.status.lost') },
  };

  const typeCfg: Record<string, { color: string; label: string }> = {
    master: { color: '#EF4444', label: t('keys.type.master') },
    room: { color: '#3B82F6', label: t('keys.type.room') },
    cabinet: { color: '#8B5CF6', label: t('keys.type.cabinet') },
    gate: { color: '#F59E0B', label: t('keys.type.gate') },
  };

  const keyCols: Column<Key>[] = [
    { key: 'id', header: t('keys.table.id'), width: '70px', render: r => <span className="font-mono text-[12px] text-[#F59E0B]">{r.id}</span> },
    { key: 'name', header: t('keys.table.name'), sortable: true, render: r => <span className="font-medium text-[#F8FAFC]">{r.name}</span> },
    { key: 'type', header: t('keys.table.type'), width: '80px', render: r => {
      const tp = typeCfg[r.type];
      return <span className="text-[11px] font-medium" style={{ color: tp.color }}>{tp.label}</span>;
    }},
    { key: 'location', header: t('keys.table.location'), width: '100px' },
    { key: 'status', header: t('keys.table.status'), width: '100px', render: r => {
      const s = statusCfg[r.status];
      return <span className={cn('inline-flex items-center gap-1 text-[12px] font-medium')}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
        <span style={{ color: s.color }}>{s.label}</span>
      </span>;
    }},
    { key: 'checkedOutBy', header: t('keys.table.checkedOutBy'), render: r => <span className="text-[#94A3B8]">{r.checkedOutBy || '—'}</span> },
    { key: 'dueBack', header: t('keys.table.dueBack'), width: '80px', render: r => <span className="font-mono text-[12px] text-[#94A3B8]">{r.dueBack || '—'}</span> },
  ];

  const logCols: Column<KeyLog>[] = [
    { key: 'date', header: t('keys.log.date'), width: '100px', sortable: true },
    { key: 'time', header: t('keys.log.time'), width: '70px', render: r => <span className="font-mono text-[12px]">{r.time}</span> },
    { key: 'keyName', header: t('keys.log.keyName'), sortable: true, render: r => <span className="font-medium text-[#F8FAFC]">{r.keyName}</span> },
    { key: 'person', header: t('keys.log.person'), sortable: true },
    { key: 'action', header: t('keys.log.action'), width: '90px', render: r => (
      <span className={cn('text-[12px] font-medium', r.action === 'checkout' ? 'text-[#F59E0B]' : 'text-[#22C55E]')}>
        {r.action === 'checkout' ? `🔑 ${t('keys.log.checkout')}` : `↩ ${t('keys.log.return')}`}
      </span>
    )},
    { key: 'notes', header: t('keys.log.notes'), render: r => <span className="text-[#64748B]">{r.notes || '—'}</span> },
  ];

  return (
    <div>
      <PageHeader title={t('keys.title')} description={t('keys.description')}>
        <button className="px-3 py-1.5 bg-[#F59E0B] text-[#0F172A] rounded-md text-[12px] font-medium">+ {t('keys.addKey')}</button>
      </PageHeader>

      <div className="grid grid-cols-5 gap-3 mb-6">
        <StatCard label={t('keys.stats.total')} value={String(summary.total)} sub={t('common.sub.inSystem')} icon="🔑" domain="operate" />
        <StatCard label={t('keys.stats.available')} value={String(summary.available)} sub={t('common.sub.canBorrow')} icon="✅" domain="operate" />
        <StatCard label={t('keys.stats.borrowed')} value={String(summary.checkedOut)} sub={t('common.sub.inUse')} icon="📤" domain="operate" />
        <StatCard label={t('keys.stats.overdue')} value={String(summary.overdue)} sub={t('common.sub.needsReturn')} icon="⏰" domain="error" />
        <StatCard label={t('keys.stats.lost')} value={String(summary.lost)} sub={t('common.sub.needsReplace')} icon="❌" domain="error" />
      </div>

      <div className="flex gap-2 mb-4">
        {(['keys', 'logs'] as const).map(tabKey => (
          <button key={tabKey} onClick={() => setTab(tabKey)} className={cn(
            'px-3 py-1.5 rounded-md text-[12px] font-medium border',
            tab === tabKey ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#F59E0B]' : 'bg-[#1E293B] border-[#334155] text-[#94A3B8]'
          )}>
            {tabKey === 'keys' ? `🔑 ${t('keys.tab.list')}` : `📋 ${t('keys.tab.log')}`}
          </button>
        ))}
      </div>

      {tab === 'keys' ? (
        <DataTable columns={keyCols} data={keys} rowKey={r => r.id} />
      ) : (
        <DataTable columns={logCols} data={keyLogs} rowKey={r => r.id} />
      )}
    </div>
  );
}
