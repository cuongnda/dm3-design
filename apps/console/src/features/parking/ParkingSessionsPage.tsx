import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataTable, type Column, Button } from '@dm3/ui';
import { Ban, ParkingCircle } from 'lucide-react';
import {
  listParkingSessions,
  voidParkingSession,
  type ParkingSessionDTO,
} from '@dm3/api-client';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400',
    completed: 'bg-blue-500/20 text-blue-400',
    disputed: 'bg-red-500/20 text-red-400',
    void: 'bg-gray-500/20 text-gray-400',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${colors[status] ?? 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  );
}

export function ParkingSessionsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['parking-sessions', page, statusFilter],
    queryFn: () => listParkingSessions({ page, limit: 20, status: statusFilter || undefined }),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidParkingSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parking-sessions'] }),
  });

  const sessions = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: Column<ParkingSessionDTO>[] = [
    {
      key: 'plate_number', header: 'Plate', width: '120px',
      render: (r) => <span className="font-mono font-medium text-foreground">{r.plate_number}</span>,
    },
    {
      key: 'vehicle_type', header: 'Type', width: '80px',
      render: (r) => <span className="text-muted-foreground text-[12px] capitalize">{r.vehicle_type}</span>,
    },
    {
      key: 'entry_time', header: 'Entry', width: '150px',
      render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{new Date(r.entry_time).toLocaleString()}</span>,
    },
    {
      key: 'exit_time', header: 'Exit', width: '150px',
      render: (r) => r.exit_time
        ? <span className="font-mono text-[12px] text-muted-foreground">{new Date(r.exit_time).toLocaleString()}</span>
        : <span className="text-[12px] text-amber-400">In progress</span>,
    },
    {
      key: 'duration_minutes', header: 'Duration', width: '80px',
      render: (r) => {
        const mins = r.duration_minutes ?? Math.round((Date.now() - new Date(r.entry_time).getTime()) / 60_000);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return <span className="text-[12px] text-muted-foreground">{h}h{String(m).padStart(2, '0')}m</span>;
      },
    },
    {
      key: 'fee_amount', header: 'Fee', width: '100px',
      render: (r) => <span className="text-[12px] text-foreground">{r.fee_amount != null ? `${r.fee_amount.toLocaleString()} ${r.fee_currency}` : '—'}</span>,
    },
    {
      key: 'status', header: 'Status', width: '90px',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'payment_status', header: 'Payment', width: '90px',
      render: (r) => <span className="text-[12px] text-muted-foreground capitalize">{r.payment_status ?? 'none'}</span>,
    },
    {
      key: 'actions', header: '', width: '60px',
      render: (r) => r.status === 'active' ? (
        <Button size="xs" variant="ghost" className="text-destructive" onClick={() => voidMutation.mutate(r.id)} data-testid="parking-button-void-session">
          <Ban size={14} />
        </Button>
      ) : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Parking Sessions" description="Monitor active and historical parking sessions">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
          data-testid="parking-select-session-status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="disputed">Disputed</option>
          <option value="void">Voided</option>
        </select>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading sessions...</div>
      ) : (
        <DataTable
          columns={columns}
          data={sessions}
          rowKey={(r) => r.id}
          pageSize={20}
          emptyIcon={<ParkingCircle size={32} strokeWidth={1.2} />}
          emptyTitle={statusFilter ? `No ${statusFilter} sessions` : 'No parking sessions yet'}
          emptyDescription={statusFilter
            ? 'Try a different status filter to see other sessions, or wait for vehicles to enter.'
            : 'Sessions appear here automatically when vehicles enter and exit parking lots. Connect parking devices to start collecting data.'}
          emptyAction={statusFilter ? {
            label: 'Clear filter',
            variant: 'outline',
            onClick: () => { setStatusFilter(''); setPage(1); },
            'data-testid': 'parking-button-clear-session-filter-empty',
          } : undefined}
        />
      )}
    </div>
  );
}
