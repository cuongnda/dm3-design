import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  type Column,
  Button,
  AppModal,
  Input,
  Label,
  EmptyState,
  showToast,
} from '@dm3/ui';
import { Plus, Trash2, Users } from 'lucide-react';
import {
  listVisitGroups,
  createVisitGroup,
  deleteVisitGroup,
  getVisitorSettings,
  type VisitGroupDTO,
} from '@dm3/api-client';
import { HostSelect } from '@/components/common/HostSelect';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function VisitorGroupsPage() {
  const { t } = useTranslation('manage');
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hostUserId, setHostUserId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [expectedArrival, setExpectedArrival] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['visit-groups', page],
    queryFn: () => listVisitGroups({ page, limit: 20 }),
  });

  const { data: visitorSettings } = useQuery({
    queryKey: ['visitor-settings'],
    queryFn: () => getVisitorSettings(),
    staleTime: 5 * 60_000,
  });
  // Host is required only when the tenant has the approval workflow on —
  // otherwise the visit auto-approves and there's no host to route to.
  const hostRequired = visitorSettings?.approval_required ?? true;

  const resetForm = () => {
    setName('');
    setDescription('');
    setHostUserId('');
    setPurpose('');
    setExpectedArrival('');
  };

  const createMutation = useMutation({
    mutationFn: () => createVisitGroup({
      name,
      description: description || undefined,
      host_user_id: hostUserId || undefined,
      purpose,
      expected_arrival: new Date(expectedArrival).toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit-groups'] });
      setShowForm(false);
      resetForm();
      showToast({ type: 'success', title: t('visitors.groups.toasts.created') });
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: t('visitors.groups.toasts.createError'),
        description: getErrorMessage(err, t('visitors.groups.toasts.createErrorFallback')),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVisitGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit-groups'] });
      showToast({ type: 'success', title: t('visitors.groups.toasts.deleted') });
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: t('visitors.groups.toasts.deleteError'),
        description: getErrorMessage(err, t('visitors.groups.toasts.deleteErrorFallback')),
      });
    },
  });

  const groups = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: Column<VisitGroupDTO>[] = [
    { key: 'name', header: t('visitors.groups.name'), render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'purpose', header: t('visitors.groups.purpose'), render: (r) => <span className="text-muted-foreground text-[13px] capitalize">{r.purpose.replace(/_/g, ' ')}</span> },
    {
      key: 'expected_arrival', header: t('visitors.groups.arrival'), width: '140px',
      render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{new Date(r.expected_arrival).toLocaleDateString()}</span>,
    },
    { key: 'member_count', header: t('visitors.groups.visitCount'), width: '80px', render: (r) => <span className="text-muted-foreground">{r.member_count}</span> },
    {
      key: 'created_at', header: t('visitors.groups.created'), width: '140px',
      render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>,
    },
    {
      key: 'actions', header: '', width: '60px',
      render: (r) => (
        <Button size="xs" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(r.id)}>
          <Trash2 size={14} />
        </Button>
      ),
    },
  ];

  const canCreate = Boolean(
    name.trim() && purpose.trim() && expectedArrival && (!hostRequired || hostUserId.trim()),
  );

  return (
    <div>
      <PageHeader title={t('visitors.groups.title')} description={t('visitors.groups.pageDescription')}>
        <Button size="sm" onClick={() => setShowForm(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="visitors-button-create-group">
          <Plus size={16} className="mr-1" /> {t('visitors.groups.create')}
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.loading')}</div>
      ) : groups.length === 0 ? (
        <div className="py-10">
          <EmptyState
            icon={<Users size={32} strokeWidth={1.2} />}
            title={t('visitors.groups.empty')}
            description={t('visitors.groups.empty.description')}
            primaryAction={{ label: t('visitors.groups.create'), icon: <Plus size={14} />, onClick: () => setShowForm(true), 'data-testid': 'visitors-button-create-group-empty' }}
          />
        </div>
      ) : (
        <>
          <DataTable columns={columns} data={groups} rowKey={(r) => r.id} />
          {total > 20 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('visitors.history.prev')}</Button>
              <span className="text-[12px] text-muted-foreground py-1">{t('visitors.history.pageOf', { page, total: Math.ceil(total / 20) })}</span>
              <Button size="xs" variant="outline" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>{t('visitors.history.next')}</Button>
            </div>
          )}
        </>
      )}

      <AppModal
        open={showForm}
        onOpenChange={(open) => { setShowForm(open); if (!open) resetForm(); }}
        title={t('visitors.groups.create')}
        size="sm"
        showCancelButton
        primaryAction={{
          label: createMutation.isPending ? t('visitors.groups.form.creatingLabel') : t('visitors.recurring.buttons.createLabel'),
          onClick: () => createMutation.mutate(),
          disabled: !canCreate || createMutation.isPending,
        }}
      >
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">{t('visitors.groups.name')} *</Label>
            <Input className="mt-1 h-8 text-[13px]" value={name} onChange={(e) => setName(e.target.value)} data-testid="visitors-input-group-name" />
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.groups.description')}</Label>
            <Input className="mt-1 h-8 text-[13px]" value={description} onChange={(e) => setDescription(e.target.value)} data-testid="visitors-input-group-description" />
          </div>
          <div>
            <Label className="text-[12px]">
              {t('visitors.form.host')}{hostRequired ? ' *' : ''}
            </Label>
            <HostSelect
              value={hostUserId}
              onChange={(host) => setHostUserId(host?.id ?? '')}
              placeholder={t('visitors.form.hostPlaceholder')}
              emptyLabel={t('visitors.form.hostEmpty')}
              buttonTestId="visitors-select-group-host"
              searchInputTestId="visitors-search-group-host"
            />
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.groups.form.purposeLabel')}</Label>
            <Input className="mt-1 h-8 text-[13px]" placeholder={t('visitors.groups.form.purposePlaceholder')} value={purpose} onChange={(e) => setPurpose(e.target.value)} data-testid="visitors-input-group-purpose" />
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.groups.form.arrivalLabel')}</Label>
            <Input type="datetime-local" className="mt-1 h-8 text-[13px]" value={expectedArrival} onChange={(e) => setExpectedArrival(e.target.value)} data-testid="visitors-input-group-arrival" />
          </div>
        </div>
      </AppModal>
    </div>
  );
}
