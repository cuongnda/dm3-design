import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { cn } from '@/lib/utils';
import { mockVisitors, type Visitor } from './mock-data';

const statusColors: Record<string, string> = {
  waiting: 'text-warning',
  'checked-in': 'text-success',
  'checked-out': 'text-muted-foreground',
};

export function VisitorsPage() {
  const { t } = useTranslation('manage');
  const [activeTab, setActiveTab] = useState<Visitor['status']>('waiting');
  const [showForm, setShowForm] = useState(false);

  const tabs = [
    { label: t('visitors.tab.waiting'), status: 'waiting' as const, count: mockVisitors.filter(v => v.status === 'waiting').length },
    { label: t('visitors.tab.checkedIn'), status: 'checked-in' as const, count: mockVisitors.filter(v => v.status === 'checked-in').length },
    { label: t('visitors.tab.checkedOut'), status: 'checked-out' as const, count: mockVisitors.filter(v => v.status === 'checked-out').length },
  ];

  const statusLabels: Record<string, string> = {
    waiting: t('visitors.status.waiting'),
    'checked-in': t('visitors.status.checkedInShort'),
    'checked-out': t('visitors.status.checkedOut'),
  };

  const filtered = mockVisitors.filter(v => v.status === activeTab);
  const preRegToday = mockVisitors.filter(v => v.preRegistered).length;

  const columns: Column<Visitor>[] = [
    { key: 'id', header: 'ID', width: '70px', render: (r) => <span className="font-mono text-[11px] text-muted-foreground">{r.id}</span> },
    { key: 'name', header: t('visitors.table.name'), sortable: true, render: (r) => (
      <div>
        <span className="font-medium text-foreground">{r.name}</span>
        <span className="block text-[11px] text-muted-foreground">{r.company}</span>
      </div>
    )},
    { key: 'host', header: t('visitors.table.host'), sortable: true, render: (r) => <span className="text-muted-foreground">{r.host}</span> },
    { key: 'purpose', header: t('visitors.table.purpose'), render: (r) => <span className="text-muted-foreground">{r.purpose}</span> },
    { key: 'expectedTime', header: t('visitors.table.expectedTime'), width: '80px', render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{r.expectedTime}</span> },
    { key: 'status', header: t('visitors.table.status'), width: '100px', render: (r) => (
      <span className={cn('text-[12px] font-medium', statusColors[r.status])}>
        {statusLabels[r.status]}
      </span>
    )},
    { key: 'preRegistered', header: '', width: '40px', render: (r) => r.preRegistered ? <span title={t('visitors.preRegisteredTooltip')} className="text-[14px]">📋</span> : null },
    ...(activeTab === 'waiting' ? [{
      key: 'actions' as string, header: t('common:table.actions'), width: '80px',
      render: () => <Button size="xs" className="bg-manage hover:bg-manage/90">{t('visitors.checkin')}</Button>,
    }] : []),
  ];

  return (
    <div>
      <PageHeader title={t('visitors.title')} description={t('visitors.description')}>
        <Button size="sm" onClick={() => setShowForm(true)} className="bg-manage hover:bg-manage/90">{t('visitors.preRegister')}</Button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('visitors.stats.today')} value={String(mockVisitors.length)} sub="total visitors" domain="manage" />
        <StatCard label={t('visitors.stats.inside')} value={String(tabs[1].count)} sub="checked in" domain="manage" />
        <StatCard label={t('visitors.stats.preRegistered')} value={String(preRegToday)} sub="pre-registered" domain="manage" />
        <StatCard label={t('visitors.stats.waiting')} value={String(tabs[0].count)} sub="in queue" icon="⏳" domain="manage" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-4">
        {tabs.map(tab => (
          <button key={tab.status} type="button" onClick={() => setActiveTab(tab.status)} className={cn(
            'px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer',
            activeTab === tab.status
              ? 'text-foreground border-manage'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          )}>
            {tab.label}
            <span className={cn('ml-1.5 text-[11px] px-1.5 rounded-full', activeTab === tab.status ? 'text-manage bg-manage/20' : 'bg-muted text-muted-foreground')}>{tab.count}</span>
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} rowKey={(r) => r.id} />

      {/* QR Code placeholder */}
      {activeTab === 'waiting' && (
        <div className="mt-4 flex items-center gap-4 p-4 bg-card border border-border rounded-lg">
          <div className="w-24 h-24 bg-muted border border-border rounded-lg flex items-center justify-center text-[32px] text-muted-foreground">📱</div>
          <div>
            <p className="text-[13px] font-medium text-foreground">{t('visitors.qr.title')}</p>
            <p className="text-[12px] text-muted-foreground">{t('visitors.qr.description')}</p>
          </div>
        </div>
      )}

      {/* Pre-registration form */}
      <AppModal
        open={showForm}
        onOpenChange={setShowForm}
        title={t('visitors.form.title')}
        size="md"
        className="w-[480px] max-w-[calc(100%-2rem)]"
        showCancelButton
        cancelLabel={t('common.cancel')}
        primaryAction={{
          label: t('visitors.form.register'),
          size: 'sm',
          className: 'bg-manage hover:bg-manage/90',
          onClick: () => setShowForm(false),
        }}
      >
        <div className="space-y-3">
          {[{ l: t('visitors.form.visitorName'), p: t('visitors.form.fullNamePlaceholder') }, { l: t('visitors.form.company'), p: t('visitors.form.companyPlaceholder') }].map(f => (
            <div key={f.l}>
              <Label className="text-[12px]">{f.l}</Label>
              <Input placeholder={f.p} className="mt-1 h-8 text-[13px]" />
            </div>
          ))}
          <div>
            <Label className="text-[12px]">{t('visitors.form.host')}</Label>
            <Select className="mt-1 h-8 text-[12px]">
              {['Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Minh Đức'].map(h => <SelectOption key={h}>{h}</SelectOption>)}
            </Select>
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.form.purpose')}</Label>
            <Input placeholder={t('visitors.form.purposePlaceholder')} className="mt-1 h-8 text-[13px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">{t('visitors.form.date')}</Label>
              <Input type="date" className="mt-1 h-8 text-[12px]" />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.form.time')}</Label>
              <Input type="time" className="mt-1 h-8 text-[12px]" />
            </div>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
