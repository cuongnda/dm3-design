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
} from '@dm3/ui';
import { Plus, Trash2 } from 'lucide-react';
import {
  listVisitGroups,
  createVisitGroup,
  deleteVisitGroup,
  type VisitGroupDTO,
} from '@dm3/api-client';

export function VisitorGroupsPage() {
  const { t } = useTranslation('manage');
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['visit-groups', page],
    queryFn: () => listVisitGroups({ page, limit: 20 }),
  });

  const createMutation = useMutation({
    mutationFn: () => createVisitGroup({ name, description: description || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit-groups'] });
      setShowForm(false);
      setName('');
      setDescription('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVisitGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visit-groups'] }),
  });

  const groups = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: Column<VisitGroupDTO>[] = [
    { key: 'name', header: t('visitors.groups.name', 'Name'), render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'description', header: t('visitors.groups.description', 'Description'), render: (r) => <span className="text-muted-foreground text-[13px]">{r.description || '—'}</span> },
    { key: 'visit_count', header: t('visitors.groups.visitCount', 'Visits'), width: '100px', render: (r) => <span className="text-muted-foreground">{r.visit_count}</span> },
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
        <div className="text-center py-12 text-muted-foreground">{t('visitors.groups.empty', 'No visit groups yet')}</div>
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
        onOpenChange={setShowForm}
        title={t('visitors.groups.create', 'Create Group')}
        size="sm"
        showCancelButton
        primaryAction={{
          label: createMutation.isPending ? 'Creating...' : 'Create',
          onClick: () => createMutation.mutate(),
          disabled: !name.trim() || createMutation.isPending,
        }}
      >
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">{t('visitors.groups.name', 'Name')}</Label>
            <Input className="mt-1 h-8 text-[13px]" value={name} onChange={(e) => setName(e.target.value)} data-testid="visitors-input-group-name" />
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.groups.description', 'Description')}</Label>
            <Input className="mt-1 h-8 text-[13px]" value={description} onChange={(e) => setDescription(e.target.value)} data-testid="visitors-input-group-description" />
          </div>
        </div>
      </AppModal>
    </div>
  );
}
