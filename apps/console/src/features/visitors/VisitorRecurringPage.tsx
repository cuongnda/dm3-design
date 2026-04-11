import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataTable, type Column, Button } from '@dm3/ui';
import { Trash2, PauseCircle, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  listRecurringTemplates,
  deleteRecurringTemplate,
  updateRecurringTemplate,
  type RecurringTemplateDTO,
} from '@dm3/api-client';

export function VisitorRecurringPage() {
  const qc = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['visitor-recurring'],
    queryFn: () => listRecurringTemplates(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRecurringTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visitor-recurring'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateRecurringTemplate(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visitor-recurring'] }),
  });

  const columns: Column<RecurringTemplateDTO>[] = [
    { key: 'purpose', header: 'Purpose', render: (r) => <span className="font-medium">{r.purpose}</span> },
    {
      key: 'schedule', header: 'Schedule',
      render: (r) => <span className="text-muted-foreground text-[12px]">{r.schedule_description ?? r.schedule_cron}</span>,
    },
    {
      key: 'is_active', header: 'Status', width: '80px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium', r.is_active ? 'text-emerald-400' : 'text-muted-foreground')}>
          {r.is_active ? 'Active' : 'Paused'}
        </span>
      ),
    },
    {
      key: 'next_visit_at', header: 'Next Visit', width: '140px',
      render: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">
          {r.next_visit_at ? new Date(r.next_visit_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions', header: '', width: '100px',
      render: (r) => (
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={() => toggleMutation.mutate({ id: r.id, is_active: !r.is_active })}>
            {r.is_active ? <PauseCircle size={14} className="text-amber-400" /> : <PlayCircle size={14} className="text-emerald-400" />}
          </Button>
          <Button size="xs" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(r.id)}>
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Recurring Visits" description="Manage recurring visit templates for regular visitors" />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No recurring visit templates configured</div>
      ) : (
        <DataTable columns={columns} data={templates} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
