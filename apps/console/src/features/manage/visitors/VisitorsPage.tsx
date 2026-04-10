import { useState, useCallback } from 'react';
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
import type { VisitDTO } from '@dm3/api-client';
import {
  useVisitsList,
  useTodaySummary,
  useCreateVisit,
  useApproveVisit,
  useCheckinVisit,
  useCheckoutVisit,
  useWalkinVisit,
} from './hooks/useVisitors';

const STATUS_COLORS: Record<string, string> = {
  pre_registered: 'text-blue-400',
  approved: 'text-cyan-400',
  waiting: 'text-warning',
  checked_in: 'text-success',
  checked_out: 'text-muted-foreground',
  cancelled: 'text-destructive',
  no_show: 'text-orange-400',
  rejected: 'text-destructive',
};

const PURPOSES = ['meeting', 'interview', 'delivery', 'maintenance', 'tour', 'contract_signing', 'other'] as const;

type TabStatus = '' | 'pre_registered' | 'approved' | 'waiting' | 'checked_in' | 'checked_out';

export function VisitorsPage() {
  const { t } = useTranslation('manage');
  const [activeTab, setActiveTab] = useState<TabStatus>('');
  const [showPreRegForm, setShowPreRegForm] = useState(false);
  const [showWalkinForm, setShowWalkinForm] = useState(false);
  const [page, setPage] = useState(1);

  const params = {
    page,
    limit: 20,
    ...(activeTab ? { status: activeTab } : {}),
    date: new Date().toISOString().slice(0, 10),
  };

  const { data: visitsData, isLoading, error } = useVisitsList(params);
  const { data: summary } = useTodaySummary();
  const createVisitMutation = useCreateVisit();
  const approveMutation = useApproveVisit();
  const checkinMutation = useCheckinVisit();
  const checkoutMutation = useCheckoutVisit();
  const walkinMutation = useWalkinVisit();

  const visits = visitsData?.data ?? [];
  const total = visitsData?.total ?? 0;

  const tabs: { label: string; status: TabStatus; count?: number }[] = [
    { label: t('visitors.tab.all'), status: '', count: summary?.total_expected },
    { label: t('visitors.tab.waiting'), status: 'waiting', count: summary?.waiting },
    { label: t('visitors.tab.checkedIn'), status: 'checked_in', count: summary?.checked_in },
    { label: t('visitors.tab.checkedOut'), status: 'checked_out', count: summary?.checked_out },
  ];

  const handleApprove = useCallback((id: string) => approveMutation.mutate(id), [approveMutation]);
  const handleCheckin = useCallback((id: string) => checkinMutation.mutate({ id, data: { checkin_method: 'reception' } }), [checkinMutation]);
  const handleCheckout = useCallback((id: string) => checkoutMutation.mutate(id), [checkoutMutation]);

  const columns: Column<VisitDTO>[] = [
    {
      key: 'visitor',
      header: t('visitors.table.name'),
      sortable: true,
      render: (r) => (
        <div>
          <span className="font-medium text-foreground">
            {r.visitor ? `${r.visitor.first_name} ${r.visitor.last_name}` : r.visitor_id}
          </span>
          {r.visitor?.company && (
            <span className="block text-[11px] text-muted-foreground">{r.visitor.company}</span>
          )}
        </div>
      ),
    },
    {
      key: 'host',
      header: t('visitors.table.host'),
      render: (r) => (
        <span className="text-muted-foreground">{r.host?.name ?? r.host_user_id}</span>
      ),
    },
    {
      key: 'purpose',
      header: t('visitors.table.purpose'),
      render: (r) => (
        <span className="text-muted-foreground">{t(`visitors.purpose.${r.purpose}`)}</span>
      ),
    },
    {
      key: 'expected_arrival',
      header: t('visitors.table.expectedTime'),
      width: '120px',
      render: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">
          {new Date(r.expected_arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('visitors.table.status'),
      width: '120px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium', STATUS_COLORS[r.status] ?? 'text-muted-foreground')}>
          {t(`visitors.status.${r.status}`)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '120px',
      render: (r) => (
        <div className="flex gap-1">
          {(r.status === 'pre_registered') && (
            <Button size="xs" className="bg-cyan-600 hover:bg-cyan-700" onClick={() => handleApprove(r.id)}>
              {t('visitors.actions.approve')}
            </Button>
          )}
          {(r.status === 'approved' || r.status === 'waiting') && (
            <Button size="xs" className="bg-manage hover:bg-manage/90" onClick={() => handleCheckin(r.id)}>
              {t('visitors.actions.checkin')}
            </Button>
          )}
          {r.status === 'checked_in' && (
            <Button size="xs" variant="outline" onClick={() => handleCheckout(r.id)}>
              {t('visitors.actions.checkout')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  // ─── Pre-registration form state ──────────────────────────────────────────
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '', company: '',
    hostUserId: '', purpose: 'meeting' as string,
    expectedArrival: '', vehiclePlate: '',
  });

  const handlePreRegSubmit = () => {
    if (!formData.firstName || !formData.lastName || !formData.hostUserId || !formData.purpose) return;
    createVisitMutation.mutate({
      visitor: {
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        company: formData.company || undefined,
      },
      host_user_id: formData.hostUserId,
      purpose: formData.purpose,
      expected_arrival: formData.expectedArrival || new Date().toISOString(),
      vehicle_plate: formData.vehiclePlate || undefined,
    }, {
      onSuccess: () => {
        setShowPreRegForm(false);
        setFormData({ firstName: '', lastName: '', email: '', phone: '', company: '', hostUserId: '', purpose: 'meeting', expectedArrival: '', vehiclePlate: '' });
      },
    });
  };

  // ─── Walk-in form state ───────────────────────────────────────────────────
  const [walkinData, setWalkinData] = useState({
    firstName: '', lastName: '', phone: '', company: '',
    purpose: 'meeting' as string,
  });

  const handleWalkinSubmit = () => {
    if (!walkinData.firstName || !walkinData.lastName || !walkinData.purpose) return;
    walkinMutation.mutate({
      visitor: {
        first_name: walkinData.firstName,
        last_name: walkinData.lastName,
        phone: walkinData.phone || undefined,
        company: walkinData.company || undefined,
      },
      purpose: walkinData.purpose,
    }, {
      onSuccess: () => {
        setShowWalkinForm(false);
        setWalkinData({ firstName: '', lastName: '', phone: '', company: '', purpose: 'meeting' });
      },
    });
  };

  const updateForm = (field: string, value: string) => setFormData(prev => ({ ...prev, [field]: value }));
  const updateWalkin = (field: string, value: string) => setWalkinData(prev => ({ ...prev, [field]: value }));

  return (
    <div>
      <PageHeader title={t('visitors.title')} description={t('visitors.description')}>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowWalkinForm(true)}>
            {t('visitors.actions.walkin')}
          </Button>
          <Button size="sm" onClick={() => setShowPreRegForm(true)} className="bg-manage hover:bg-manage/90">
            {t('visitors.preRegister')}
          </Button>
        </div>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('visitors.stats.totalExpected')} value={String(summary?.total_expected ?? 0)} sub="total" domain="manage" />
        <StatCard label={t('visitors.stats.inside')} value={String(summary?.checked_in ?? 0)} sub="checked in" domain="manage" />
        <StatCard label={t('visitors.stats.waiting')} value={String(summary?.waiting ?? 0)} sub="in queue" domain="manage" />
        <StatCard label={t('visitors.stats.noShow')} value={String(summary?.no_show ?? 0)} sub="no show" domain="manage" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-4">
        {tabs.map(tab => (
          <button
            key={tab.status}
            type="button"
            onClick={() => { setActiveTab(tab.status); setPage(1); }}
            className={cn(
              'px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer',
              activeTab === tab.status
                ? 'text-foreground border-manage'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span className={cn('ml-1.5 text-[11px] px-1.5 rounded-full',
                activeTab === tab.status ? 'text-manage bg-manage/20' : 'bg-muted text-muted-foreground'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Data */}
      {error ? (
        <div className="text-center py-12 text-destructive">{t('visitors.error')}</div>
      ) : isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.loading')}</div>
      ) : visits.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.noVisits')}</div>
      ) : (
        <>
          <DataTable columns={columns} data={visits} rowKey={(r) => r.id} />
          {total > 20 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <span className="text-[12px] text-muted-foreground py-1">Page {page} of {Math.ceil(total / 20)}</span>
              <Button size="xs" variant="outline" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}

      {/* Pre-registration form */}
      <AppModal
        open={showPreRegForm}
        onOpenChange={setShowPreRegForm}
        title={t('visitors.form.title')}
        size="md"
        className="w-[520px] max-w-[calc(100%-2rem)]"
        showCancelButton
        cancelLabel={t('common.cancel')}
        primaryAction={{
          label: createVisitMutation.isPending ? t('visitors.form.registering') : t('visitors.form.register'),
          size: 'sm',
          className: 'bg-manage hover:bg-manage/90',
          onClick: handlePreRegSubmit,
          disabled: createVisitMutation.isPending,
        }}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">{t('visitors.form.firstName')}</Label>
              <Input placeholder={t('visitors.form.firstNamePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={formData.firstName} onChange={e => updateForm('firstName', e.target.value)} />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.form.lastName')}</Label>
              <Input placeholder={t('visitors.form.lastNamePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={formData.lastName} onChange={e => updateForm('lastName', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">{t('visitors.form.email')}</Label>
              <Input type="email" placeholder={t('visitors.form.emailPlaceholder')} className="mt-1 h-8 text-[13px]"
                value={formData.email} onChange={e => updateForm('email', e.target.value)} />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.form.phone')}</Label>
              <Input placeholder={t('visitors.form.phonePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={formData.phone} onChange={e => updateForm('phone', e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.form.company')}</Label>
            <Input placeholder={t('visitors.form.companyPlaceholder')} className="mt-1 h-8 text-[13px]"
              value={formData.company} onChange={e => updateForm('company', e.target.value)} />
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.form.host')}</Label>
            <Input placeholder={t('visitors.form.hostPlaceholder')} className="mt-1 h-8 text-[13px]"
              value={formData.hostUserId} onChange={e => updateForm('hostUserId', e.target.value)} />
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.form.purposeSelect')}</Label>
            <Select className="mt-1 h-8 text-[12px]" value={formData.purpose}
              onChange={e => updateForm('purpose', e.target.value)}>
              {PURPOSES.map(p => <SelectOption key={p} value={p}>{t(`visitors.purpose.${p}`)}</SelectOption>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">{t('visitors.form.expectedArrival')}</Label>
              <Input type="datetime-local" className="mt-1 h-8 text-[12px]"
                value={formData.expectedArrival} onChange={e => updateForm('expectedArrival', e.target.value)} />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.form.vehiclePlate')}</Label>
              <Input placeholder={t('visitors.form.vehiclePlatePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={formData.vehiclePlate} onChange={e => updateForm('vehiclePlate', e.target.value)} />
            </div>
          </div>
        </div>
      </AppModal>

      {/* Walk-in form */}
      <AppModal
        open={showWalkinForm}
        onOpenChange={setShowWalkinForm}
        title={t('visitors.form.walkinTitle')}
        size="md"
        className="w-[480px] max-w-[calc(100%-2rem)]"
        showCancelButton
        cancelLabel={t('common.cancel')}
        primaryAction={{
          label: walkinMutation.isPending ? t('visitors.form.registering') : t('visitors.form.register'),
          size: 'sm',
          className: 'bg-manage hover:bg-manage/90',
          onClick: handleWalkinSubmit,
          disabled: walkinMutation.isPending,
        }}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">{t('visitors.form.firstName')}</Label>
              <Input placeholder={t('visitors.form.firstNamePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={walkinData.firstName} onChange={e => updateWalkin('firstName', e.target.value)} />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.form.lastName')}</Label>
              <Input placeholder={t('visitors.form.lastNamePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={walkinData.lastName} onChange={e => updateWalkin('lastName', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">{t('visitors.form.phone')}</Label>
              <Input placeholder={t('visitors.form.phonePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={walkinData.phone} onChange={e => updateWalkin('phone', e.target.value)} />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.form.company')}</Label>
              <Input placeholder={t('visitors.form.companyPlaceholder')} className="mt-1 h-8 text-[13px]"
                value={walkinData.company} onChange={e => updateWalkin('company', e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.form.purposeSelect')}</Label>
            <Select className="mt-1 h-8 text-[12px]" value={walkinData.purpose}
              onChange={e => updateWalkin('purpose', e.target.value)}>
              {PURPOSES.map(p => <SelectOption key={p} value={p}>{t(`visitors.purpose.${p}`)}</SelectOption>)}
            </Select>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
