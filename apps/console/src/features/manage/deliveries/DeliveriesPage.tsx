import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Camera, Package } from 'lucide-react';
import {
  PageHeader,
  DataTable,
  type Column,
  StatCard,
  Button,
  AppModal,
  Input,
  Label,
  Select,
  SelectOption,
} from '@dm3/ui';
import { mockDeliveries, type Delivery } from './mock-data';

function isOver24h(d: Delivery) {
  return d.status === 'pending' && d.receivedDate < '2026-02-19';
}

export function DeliveriesPage() {
  const { t } = useTranslation('manage');
  const [showForm, setShowForm] = useState(false);
  const pending = mockDeliveries.filter(d => d.status === 'pending');
  const over24h = mockDeliveries.filter(isOver24h);

  const statusConfig: Record<string, { cls: string; label: string }> = {
    pending: { cls: 'text-warning', label: t('deliveries.tab.waiting') },
    collected: { cls: 'text-success', label: t('deliveries.tab.collected') },
    returned: { cls: 'text-muted-foreground', label: t('deliveries.tab.returned') },
  };

  const columns: Column<Delivery>[] = [
    { key: 'packageId', header: t('deliveries.table.packageId'), width: '120px', render: (r) => <span className="font-mono text-[12px] text-foreground">{r.packageId}</span> },
    { key: 'recipient', header: t('deliveries.table.recipient'), sortable: true, render: (r) => <span className="text-foreground">{r.recipient}</span> },
    { key: 'sender', header: t('deliveries.table.sender'), render: (r) => <span className="text-muted-foreground">{r.sender}</span> },
    { key: 'courier', header: t('deliveries.table.courier'), render: (r) => <span className="text-muted-foreground">{r.courier}</span> },
    { key: 'receivedTime', header: t('deliveries.table.receivedTime'), width: '100px', render: (r) => (
      <div>
        <span className="font-mono text-[12px] text-muted-foreground">{r.receivedTime}</span>
        <span className="block text-[10px] text-muted-foreground/60">{r.receivedDate}</span>
      </div>
    )},
    { key: 'status', header: t('deliveries.table.status'), width: '100px', render: (r) => {
      const c = statusConfig[r.status];
      return <span className={`text-[12px] font-medium ${c.cls}`}>{c.label}</span>;
    }},
    { key: 'photo', header: 'Photo', width: '60px', render: (r) => r.hasPhoto ? <div className="w-6 h-6 bg-muted rounded inline-flex items-center justify-center text-muted-foreground"><Camera size={12} /></div> : null },
    ...(true ? [{
      key: 'actions' as string, header: '', width: '80px',
      render: (r: Delivery) => r.status === 'pending' ? (
        <Button size="xs" className="bg-manage hover:bg-manage/90">{t('deliveries.confirm')}</Button>
      ) : null,
    }] : []),
  ];

  return (
    <div>
      <PageHeader title={t('deliveries.title')} description={t('deliveries.description')}>
        <Button size="sm" onClick={() => setShowForm(true)} className="bg-manage hover:bg-manage/90">{t('deliveries.logDelivery')}</Button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('deliveries.stats.totalToday')} value={String(mockDeliveries.length)} sub="deliveries" domain="manage" />
        <StatCard label={t('deliveries.stats.waiting')} value={String(pending.length)} sub="pending pickup" icon={<Package size={14} />} domain="manage" />
        <StatCard label={t('deliveries.stats.collected')} value={String(mockDeliveries.filter(d => d.status === 'collected').length)} sub="collected" domain="manage" />
        <StatCard label={t('deliveries.stats.over24h')} value={String(over24h.length)} sub="uncollected" icon={<AlertCircle size={14} />} domain="error" />
      </div>

      <DataTable
        columns={columns}
        data={mockDeliveries}
        rowKey={r => r.id}
        rowClassName={r => isOver24h(r) ? 'bg-error/5' : ''}
      />

      <AppModal
        open={showForm}
        onOpenChange={setShowForm}
        title={t('deliveries.form.title')}
        size="md"
        className="w-[480px] max-w-[calc(100%-2rem)]"
        showCancelButton
        cancelLabel={t('common.cancel')}
        primaryAction={{
          label: t('common.save'),
          size: 'sm',
          className: 'bg-manage hover:bg-manage/90',
          onClick: () => setShowForm(false),
        }}
      >
        <div className="space-y-3">
          {[{ l: t('deliveries.form.packageId'), p: 'PKG-...' }, { l: t('deliveries.form.recipient'), p: t('deliveries.form.recipientPlaceholder') }, { l: t('deliveries.form.sender'), p: t('deliveries.form.senderPlaceholder') }].map(f => (
            <div key={f.l}>
              <Label className="text-[12px]">{f.l}</Label>
              <Input placeholder={f.p} className="mt-1 h-8 text-[13px]" />
            </div>
          ))}
          <div>
            <Label className="text-[12px]">{t('deliveries.form.courier')}</Label>
            <Select className="mt-1 h-8 text-[12px]">
              {['GHN', 'J&T Express', 'Viettel Post', 'GHTK', 'Grab Express', 'Khác'].map(c => <SelectOption key={c}>{c}</SelectOption>)}
            </Select>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
