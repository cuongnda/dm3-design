import { useMemo, useState, useCallback } from 'react';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@dm3/ui';
import { Check, ChevronsUpDown, Loader2, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import type { VisitDTO } from '@dm3/api-client';
import { getVisitorSettings } from '@dm3/api-client';
import { useQuery } from '@tanstack/react-query';
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
const HOST_SEARCH_LIMIT = 10;

/**
 * Format the current local time as a value accepted by <input type="datetime-local">.
 * Shape: YYYY-MM-DDTHH:mm (no seconds, no timezone — browser interprets as local).
 * Can't reuse new Date().toISOString() because that's UTC and has seconds +
 * trailing Z, which the datetime-local input ignores / renders blank.
 */
function nowAsDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type TabStatus = '' | 'pre_registered' | 'approved' | 'waiting' | 'checked_in' | 'checked_out';

type HostOption = {
  id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  department_name?: string;
  position?: string;
  status?: string;
};

function getHostLabel(host: HostOption) {
  const fullName = host.full_name?.trim();
  if (fullName) return fullName;
  const fallback = [host.first_name, host.last_name].filter(Boolean).join(' ').trim();
  return fallback || host.email || host.id;
}

function getHostMeta(host: HostOption) {
  return [host.position, host.department_name, host.email].filter(Boolean).join(' • ');
}

function useHostOptions(search: string) {
  return useQuery({
    queryKey: ['visitor-host-options', search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: '1',
        limit: String(HOST_SEARCH_LIMIT),
        status: 'active',
        sort_by: 'full_name',
        sort_order: 'ASC',
      });

      const trimmedSearch = search.trim();
      if (trimmedSearch) {
        params.set('search', trimmedSearch);
      }

      // Vite proxy only routes /api/v1/identity/ to identity-svc (see
      // apps/console/vite.config.ts). Bare /api/v1/users doesn't reach
      // the backend in dev mode — that's why the host dropdown was empty.
      const response = await apiFetch<{ users?: HostOption[] }>(`/api/v1/identity/users?${params.toString()}`);
      return (response.users ?? []).filter((host) => host.id);
    },
    staleTime: 60_000,
  });
}

interface HostSelectProps {
  value: string;
  onChange: (host: HostOption | null) => void;
  disabled?: boolean;
  placeholder: string;
  buttonTestId: string;
  searchInputTestId: string;
}

function HostSelect({ value, onChange, disabled, placeholder, buttonTestId, searchInputTestId }: HostSelectProps) {
  const { t } = useTranslation('manage');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: hosts = [], isLoading } = useHostOptions(search);

  const selectedHost = useMemo(() => hosts.find((host) => host.id === value) ?? null, [hosts, value]);

  const handleSelect = (host: HostOption) => {
    onChange(host);
    setOpen(false);
    setSearch('');
  };

  const buttonLabel = selectedHost ? getHostLabel(selectedHost) : placeholder;
  const selectedMeta = selectedHost ? getHostMeta(selectedHost) : '';

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setSearch('');
    }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="mt-1 h-auto min-h-8 w-full justify-between px-3 py-2 text-left text-[13px]"
          disabled={disabled}
          data-testid={buttonTestId}
        >
          <div className="flex min-w-0 flex-col">
            <span className={cn('truncate', !selectedHost && 'text-muted-foreground')}>{buttonLabel}</span>
            {selectedMeta && <span className="truncate text-[11px] text-muted-foreground">{selectedMeta}</span>}
          </div>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-60 p-0"
        align="start"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
            data-testid={searchInputTestId}
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>{t('visitors.loading')}</span>
              </div>
            ) : (
              <>
                <CommandEmpty>{t('visitors.form.hostEmpty')}</CommandEmpty>
                <CommandGroup>
                  {hosts.map((host) => {
                    const label = getHostLabel(host);
                    const meta = getHostMeta(host);
                    const isSelected = host.id === value;

                    return (
                      <CommandItem
                        key={host.id}
                        value={`${label} ${host.email ?? ''} ${host.department_name ?? ''}`}
                        onSelect={() => handleSelect(host)}
                        className="items-start py-2"
                        data-testid={`manage-select-host-option-${host.id}`}
                      >
                        <Check className={cn('mt-0.5 size-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">{label}</div>
                          {meta && <div className="truncate text-[11px] text-muted-foreground">{meta}</div>}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
  const { data: visitorSettings } = useQuery({
    queryKey: ['visitor-settings'],
    queryFn: () => getVisitorSettings(),
    staleTime: 5 * 60_000,
  });
  // Host is required only when the tenant has the approval workflow on —
  // otherwise the visit auto-approves and there's no host to route to.
  const hostRequired = visitorSettings?.approval_required ?? true;
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

  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '', company: '',
    hostUserId: '', hostLabel: '', purpose: 'meeting' as string,
    expectedArrival: '', vehiclePlate: '',
  });

  const handlePreRegSubmit = () => {
    if (!formData.firstName || !formData.lastName || !formData.purpose) return;
    if (hostRequired && !formData.hostUserId) return;
    // <input type="datetime-local"> yields "2026-04-24T14:30" without a
    // timezone — Go's time.Time JSON decoder rejects that and leaves the
    // field zero, which BE then reports as "expected_arrival is required".
    // Normalise to full RFC3339 by roundtripping through Date.
    const expectedArrivalIso = formData.expectedArrival
      ? new Date(formData.expectedArrival).toISOString()
      : new Date().toISOString();
    createVisitMutation.mutate({
      visitor: {
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        company: formData.company || undefined,
      },
      host_user_id: formData.hostUserId || undefined,
      purpose: formData.purpose,
      expected_arrival: expectedArrivalIso,
      vehicle_plate: formData.vehiclePlate || undefined,
    }, {
      onSuccess: () => {
        setShowPreRegForm(false);
        setFormData({ firstName: '', lastName: '', email: '', phone: '', company: '', hostUserId: '', hostLabel: '', purpose: 'meeting', expectedArrival: '', vehiclePlate: '' });
      },
    });
  };

  const [walkinData, setWalkinData] = useState({
    firstName: '', lastName: '', phone: '', company: '', hostUserId: '', hostLabel: '',
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
      host_user_id: walkinData.hostUserId || undefined,
      purpose: walkinData.purpose,
    }, {
      onSuccess: () => {
        setShowWalkinForm(false);
        setWalkinData({ firstName: '', lastName: '', phone: '', company: '', hostUserId: '', hostLabel: '', purpose: 'meeting' });
      },
    });
  };

  const updateForm = (field: string, value: string) => setFormData(prev => ({ ...prev, [field]: value }));
  const updateWalkin = (field: string, value: string) => setWalkinData(prev => ({ ...prev, [field]: value }));

  return (
    <div>
      <PageHeader title={t('visitors.title')} description={t('visitors.description')}>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowWalkinForm(true)} data-testid="manage-button-walkin-visitor">
            {t('visitors.actions.walkin')}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              // Seed expectedArrival to "now" each time the modal opens so
              // stale values from yesterday's session don't leak through.
              setFormData((prev) => ({ ...prev, expectedArrival: nowAsDatetimeLocal() }));
              setShowPreRegForm(true);
            }}
            className="bg-manage hover:bg-manage/90"
            data-testid="manage-button-preregister-visitor"
          >
            {t('visitors.preRegister')}
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('visitors.stats.totalExpected')} value={String(summary?.total_expected ?? 0)} sub="total" domain="manage" />
        <StatCard label={t('visitors.stats.inside')} value={String(summary?.checked_in ?? 0)} sub="checked in" domain="manage" />
        <StatCard label={t('visitors.stats.waiting')} value={String(summary?.waiting ?? 0)} sub="in queue" domain="manage" />
        <StatCard label={t('visitors.stats.noShow')} value={String(summary?.no_show ?? 0)} sub="no show" domain="manage" />
      </div>

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
          disabled: createVisitMutation.isPending || (hostRequired && !formData.hostUserId),
        }}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">{t('visitors.form.firstName')}</Label>
              <Input data-testid="manage-input-visitor-first-name" placeholder={t('visitors.form.firstNamePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={formData.firstName} onChange={e => updateForm('firstName', e.target.value)} />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.form.lastName')}</Label>
              <Input data-testid="manage-input-visitor-last-name" placeholder={t('visitors.form.lastNamePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={formData.lastName} onChange={e => updateForm('lastName', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">{t('visitors.form.email')}</Label>
              <Input data-testid="manage-input-visitor-email" type="email" placeholder={t('visitors.form.emailPlaceholder')} className="mt-1 h-8 text-[13px]"
                value={formData.email} onChange={e => updateForm('email', e.target.value)} />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.form.phone')}</Label>
              <Input data-testid="manage-input-visitor-phone" placeholder={t('visitors.form.phonePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={formData.phone} onChange={e => updateForm('phone', e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.form.company')}</Label>
            <Input data-testid="manage-input-visitor-company" placeholder={t('visitors.form.companyPlaceholder')} className="mt-1 h-8 text-[13px]"
              value={formData.company} onChange={e => updateForm('company', e.target.value)} />
          </div>
          <div>
            <Label className="text-[12px]">
              {t('visitors.form.host')}{hostRequired ? ' *' : ''}
            </Label>
            <HostSelect
              value={formData.hostUserId}
              onChange={(host) => setFormData((prev) => ({
                ...prev,
                hostUserId: host?.id ?? '',
                hostLabel: host ? getHostLabel(host) : '',
              }))}
              disabled={createVisitMutation.isPending}
              placeholder={t('visitors.form.hostPlaceholder')}
              buttonTestId="manage-select-visitor-host"
              searchInputTestId="manage-input-visitor-host-search"
            />
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.form.purposeSelect')}</Label>
            <Select data-testid="manage-select-visitor-purpose" className="mt-1 h-8 text-[12px]" value={formData.purpose}
              onChange={e => updateForm('purpose', e.target.value)}>
              {PURPOSES.map(p => <SelectOption key={p} value={p}>{t(`visitors.purpose.${p}`)}</SelectOption>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">{t('visitors.form.expectedArrival')}</Label>
              <Input data-testid="manage-input-visitor-expected-arrival" type="datetime-local" className="mt-1 h-8 text-[12px]"
                value={formData.expectedArrival} onChange={e => updateForm('expectedArrival', e.target.value)} />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.form.vehiclePlate')}</Label>
              <Input data-testid="manage-input-visitor-vehicle-plate" placeholder={t('visitors.form.vehiclePlatePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={formData.vehiclePlate} onChange={e => updateForm('vehiclePlate', e.target.value)} />
            </div>
          </div>
        </div>
      </AppModal>

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
              <Input data-testid="manage-input-walkin-first-name" placeholder={t('visitors.form.firstNamePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={walkinData.firstName} onChange={e => updateWalkin('firstName', e.target.value)} />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.form.lastName')}</Label>
              <Input data-testid="manage-input-walkin-last-name" placeholder={t('visitors.form.lastNamePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={walkinData.lastName} onChange={e => updateWalkin('lastName', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">{t('visitors.form.phone')}</Label>
              <Input data-testid="manage-input-walkin-phone" placeholder={t('visitors.form.phonePlaceholder')} className="mt-1 h-8 text-[13px]"
                value={walkinData.phone} onChange={e => updateWalkin('phone', e.target.value)} />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.form.company')}</Label>
              <Input data-testid="manage-input-walkin-company" placeholder={t('visitors.form.companyPlaceholder')} className="mt-1 h-8 text-[13px]"
                value={walkinData.company} onChange={e => updateWalkin('company', e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-[12px]">
              {t('visitors.form.host')}{hostRequired ? ' *' : ''}
            </Label>
            <HostSelect
              value={walkinData.hostUserId}
              onChange={(host) => setWalkinData((prev) => ({
                ...prev,
                hostUserId: host?.id ?? '',
                hostLabel: host ? getHostLabel(host) : '',
              }))}
              disabled={walkinMutation.isPending}
              placeholder={t('visitors.form.hostPlaceholder')}
              buttonTestId="manage-select-walkin-host"
              searchInputTestId="manage-input-walkin-host-search"
            />
            <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
              <UserRound className="size-3" />
              {t('visitors.form.walkinHostHint')}
            </p>
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.form.purposeSelect')}</Label>
            <Select data-testid="manage-select-walkin-purpose" className="mt-1 h-8 text-[12px]" value={walkinData.purpose}
              onChange={e => updateWalkin('purpose', e.target.value)}>
              {PURPOSES.map(p => <SelectOption key={p} value={p}>{t(`visitors.purpose.${p}`)}</SelectOption>)}
            </Select>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
