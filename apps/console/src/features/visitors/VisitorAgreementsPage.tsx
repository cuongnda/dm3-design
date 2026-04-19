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
import { Plus, PauseCircle, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  listAgreements,
  createAgreement,
  updateAgreement,
  type AgreementDTO,
} from '@dm3/api-client';

export function VisitorAgreementsPage() {
  const { t } = useTranslation('manage');
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');

  const { data: agreements = [], isLoading } = useQuery({
    queryKey: ['visitor-agreements'],
    queryFn: () => listAgreements(),
  });

  const createMutation = useMutation({
    mutationFn: () => createAgreement({ name, content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visitor-agreements'] });
      setShowForm(false);
      setName('');
      setContent('');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateAgreement(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visitor-agreements'] }),
  });

  const columns: Column<AgreementDTO>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: 'active', header: 'Status', width: '100px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium', r.active ? 'text-emerald-400' : 'text-muted-foreground')}>
          {r.active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    { key: 'version', header: 'Version', width: '80px', render: (r) => <span className="text-muted-foreground">v{r.version}</span> },
    {
      key: 'required_for', header: 'Required For', width: '160px',
      render: (r) => <span className="text-muted-foreground text-[12px]">{r.required_for?.join(', ') || 'All purposes'}</span>,
    },
    {
      key: 'created_at', header: 'Created', width: '120px',
      render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>,
    },
    {
      key: 'actions', header: '', width: '60px',
      render: (r) => (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => toggleMutation.mutate({ id: r.id, active: !r.active })}
          title={r.active ? 'Deactivate' : 'Activate'}
        >
          {r.active
            ? <PauseCircle size={14} className="text-amber-400" />
            : <PlayCircle size={14} className="text-emerald-400" />}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Visitor Agreements" description="Manage NDA, safety, and compliance agreements for visitors">
        <Button size="sm" onClick={() => setShowForm(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="visitors-button-create-agreement">
          <Plus size={16} className="mr-1" /> Create Agreement
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : agreements.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No agreements configured yet</div>
      ) : (
        <DataTable columns={columns} data={agreements} rowKey={(r) => r.id} />
      )}

      <AppModal
        open={showForm}
        onOpenChange={(open) => { setShowForm(open); if (!open) { setName(''); setContent(''); } }}
        title="Create Agreement"
        size="md"
        showCancelButton
        primaryAction={{ label: 'Create', onClick: () => createMutation.mutate(), disabled: !name.trim() || !content.trim() || createMutation.isPending }}
      >
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">Name *</Label>
            <Input className="mt-1 h-8 text-[13px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Non-Disclosure Agreement" data-testid="visitors-input-agreement-name" />
          </div>
          <div>
            <Label className="text-[12px]">Content *</Label>
            <textarea
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] min-h-[120px] resize-y"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Agreement text content..."
              data-testid="visitors-input-agreement-content"
            />
          </div>
        </div>
      </AppModal>
    </div>
  );
}
