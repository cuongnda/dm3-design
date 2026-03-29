import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { mockDeliveries, type Delivery } from './mock-data';

const PURPLE = '#8B5CF6';

function isOver24h(d: Delivery) {
  return d.status === 'pending' && d.receivedDate < '2026-02-19';
}

export function DeliveriesPage() {
  const { t } = useTranslation('manage');
  const [showForm, setShowForm] = useState(false);
  const pending = mockDeliveries.filter(d => d.status === 'pending');
  const over24h = mockDeliveries.filter(isOver24h);

  const statusConfig: Record<string, { color: string; label: string }> = {
    pending: { color: '#EAB308', label: t('deliveries.tab.waiting') },
    collected: { color: '#22C55E', label: t('deliveries.tab.collected') },
    returned: { color: '#64748B', label: t('deliveries.tab.returned') },
  };

  const columns: Column<Delivery>[] = [
    { key: 'packageId', header: t('deliveries.table.packageId'), width: '120px', render: (r) => <span className="font-mono text-[12px] text-[#F8FAFC]">{r.packageId}</span> },
    { key: 'recipient', header: t('deliveries.table.recipient'), sortable: true, render: (r) => <span className="text-[#F8FAFC]">{r.recipient}</span> },
    { key: 'sender', header: t('deliveries.table.sender'), render: (r) => <span className="text-[#94A3B8]">{r.sender}</span> },
    { key: 'courier', header: t('deliveries.table.courier'), render: (r) => <span className="text-[#94A3B8]">{r.courier}</span> },
    { key: 'receivedTime', header: t('deliveries.table.receivedTime'), width: '100px', render: (r) => (
      <div>
        <span className="font-mono text-[12px] text-[#94A3B8]">{r.receivedTime}</span>
        <span className="block text-[10px] text-[#64748B]">{r.receivedDate}</span>
      </div>
    )},
    { key: 'status', header: t('deliveries.table.status'), width: '100px', render: (r) => {
      const c = statusConfig[r.status];
      return <span className="text-[12px] font-medium" style={{ color: c.color }}>{c.label}</span>;
    }},
    { key: 'photo', header: '📷', width: '40px', render: (r) => r.hasPhoto ? <div className="w-6 h-6 bg-[#334155] rounded text-[10px] flex items-center justify-center">📷</div> : null },
    ...(true ? [{
      key: 'actions' as string, header: '', width: '80px',
      render: (r: Delivery) => r.status === 'pending' ? (
        <button className="px-2 py-1 rounded text-[11px] font-medium text-white" style={{ backgroundColor: PURPLE }}>{t('deliveries.confirm')}</button>
      ) : null,
    }] : []),
  ];

  return (
    <div>
      <PageHeader title={t('deliveries.title')} description={t('deliveries.description')}>
        <button onClick={() => setShowForm(true)} className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium" style={{ backgroundColor: PURPLE }}>{t('deliveries.logDelivery')}</button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('deliveries.stats.totalToday')} value={String(mockDeliveries.length)} sub="deliveries" domain="manage" />
        <StatCard label={t('deliveries.stats.waiting')} value={String(pending.length)} sub="pending pickup" icon="📦" domain="manage" />
        <StatCard label={t('deliveries.stats.collected')} value={String(mockDeliveries.filter(d => d.status === 'collected').length)} sub="collected" domain="manage" />
        <StatCard label={t('deliveries.stats.over24h')} value={String(over24h.length)} sub="uncollected" icon="🔴" domain="error" />
      </div>

      <DataTable
        columns={columns}
        data={mockDeliveries}
        rowKey={r => r.id}
        rowClassName={r => isOver24h(r) ? 'bg-[#7F1D1D]/15' : ''}
      />

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-6 w-[480px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">{t('deliveries.form.title')}</h3>
            <div className="space-y-3">
              {[{ l: t('deliveries.form.packageId'), p: 'PKG-...' }, { l: t('deliveries.form.recipient'), p: t('deliveries.form.recipientPlaceholder') }, { l: t('deliveries.form.sender'), p: t('deliveries.form.senderPlaceholder') }].map(f => (
                <div key={f.l}><label className="text-[12px] text-[#94A3B8] mb-1 block">{f.l}</label><input placeholder={f.p} className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:outline-none focus:border-[#8B5CF6]" /></div>
              ))}
              <div>
                <label className="text-[12px] text-[#94A3B8] mb-1 block">{t('deliveries.form.courier')}</label>
                <select className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]">
                  {['GHN', 'J&T Express', 'Viettel Post', 'GHTK', 'Grab Express', 'Khác'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]">{t('common.cancel')}</button>
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium" style={{ backgroundColor: PURPLE }}>{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
