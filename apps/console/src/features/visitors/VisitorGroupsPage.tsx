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
      host_user_id: hostUserId,
      purpose,
      expected_arrival: new Date(expectedArrival).toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit-groups'] });
      setShowForm(false);
      resetForm();
      showToast({ type: 'success', title: 'Group created' });
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: 'Could not create group',
        description: getErrorMessage(err, 'Please check the form and try again.'),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVisitGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit-groups'] });
      showToast({ type: 'success', title: 'Group deleted' });
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: 'Could not delete group',
        description: getErrorMessage(err, 'Try again in a moment.'),
      });
    },
  });

  const groups = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: Column<VisitGroupDTO>[] = [
    { key: 'name', header: t('visitors.groups.name', 'Name'), render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'purpose', header: t('visitors.groups.purpose', 'Purpose'), render: (r) => <span className="text-muted-foreground text-[13px] capitalize">{r.purpose.replace(/_/g, ' ')}</span> },
    {
      key: 'expected_arrival', header: t('visitors.groups.arrival', 'Arrival'), width: '140px',
      render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{new Date(r.expected_arrival).toLocaleDateString()}</span>,
    },
    { key: 'member_count', header: t('visitors.groups.visitCount', 'Visitors'), width: '80px', render: (r) => <span className="text-muted-foreground">{r.member_count}</span> },
    {
      key: 'created_at', header: t('visitors.groups.created', 'Created'), width: '140px',
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

  const canCreate = name.trim() && hostUserId.trim() && purpose.trim() && expectedArrival;

  return (
    <div>
      <PageHeader title={t('visitors.groups.title', 'Visit Groups')} description={t('visitors.groups.description_page', 'Organize visits into groups for batch management')}>
        <Button size="sm" onClick={() => setShowForm(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="visitors-button-create-group">
          <Plus size={16} className="mr-1" /> {t('visitors.groups.create', 'Create Group')}
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.loading', 'Loading...')}</div>
      ) : groups.length === 0 ? (
        <div className="py-10">
          <EmptyState
            icon={<Users size={32} strokeWidth={1.2} />}
            title={t('visitors.groups.empty', 'No visit groups yet')}
            description="Group multiple visitors under one host and purpose — useful for meetings, tours, or delivery batches. Everyone in the group shares a check-in time and access rules."
            primaryAction={{ label: t('visitors.groups.create', 'Create Group'), icon: <Plus size={14} />, onClick: () => setShowForm(true), 'data-testid': 'visitors-button-create-group-empty' }}
          />
        </div>
      ) : (
        <>
          <DataTable columns={columns} data={groups} rowKey={(r) => r.id} />
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
        open={showForm}
        onOpenChange={(open) => { setShowForm(open); if (!open) resetForm(); }}
        title={t('visitors.groups.create', 'Create Group')}
        size="sm"
        showCancelButton
        primaryAction={{
          label: createMutation.isPending ? 'Creating...' : 'Create',
          onClick: () => createMutation.mutate(),
          disabled: !canCreate || createMutation.isPending,
        }}
      >
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">{t('visitors.groups.name', 'Name')} *</Label>
            <Input className="mt-1 h-8 text-[13px]" value={name} onChange={(e) => setName(e.target.value)} data-testid="visitors-input-group-name" />
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.groups.description', 'Description')}</Label>
            <Input className="mt-1 h-8 text-[13px]" value={description} onChange={(e) => setDescription(e.target.value)} data-testid="visitors-input-group-description" />
          </div>
          <div>
            <Label className="text-[12px]">Host *</Label>
            <HostSelect
              value={hostUserId}
              onChange={(host) => setHostUserId(host?.id ?? '')}
              placeholder="Select host user"
              emptyLabel="No matching hosts"
              buttonTestId="visitors-select-group-host"
              searchInputTestId="visitors-search-group-host"
            />
          </div>
          <div>
            <Label className="text-[12px]">Purpose *</Label>
            <Input className="mt-1 h-8 text-[13px]" placeholder="e.g. meeting, interview, delivery" value={purpose} onChange={(e) => setPurpose(e.target.value)} data-testid="visitors-input-group-purpose" />
          </div>
          <div>
            <Label className="text-[12px]">Expected Arrival *</Label>
            <Input type="datetime-local" className="mt-1 h-8 text-[13px]" value={expectedArrival} onChange={(e) => setExpectedArrival(e.target.value)} data-testid="visitors-input-group-arrival" />
          </div>
        </div>
      </AppModal>
    </div>
  );
}
