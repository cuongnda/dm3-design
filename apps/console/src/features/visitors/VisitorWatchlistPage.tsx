import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PageHeader,
  DataTable,
  type Column,
  Button,
  AppModal,
  Input,
  Label,
  Select,
  SelectOption,
  EmptyState,
} from '@dm3/ui';
import { Plus, Trash2, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WatchlistEntryDTO, CreateWatchlistRequest } from '@dm3/api-client';
import {
  useWatchlist,
  useCreateWatchlistEntry,
  useDeleteWatchlistEntry,
} from '@/features/manage/visitors/hooks/useVisitors';

export function VisitorWatchlistPage() {
  const { t } = useTranslation('manage');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading } = useWatchlist({ page, limit: 20 });
  const createMutation = useCreateWatchlistEntry();
  const deleteMutation = useDeleteWatchlistEntry();

  const [formData, setFormData] = useState<CreateWatchlistRequest>({
    entry_type: 'blacklisted',
    match_field: 'email',
    match_value: '',
    reason: '',
  });

  const entries = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: Column<WatchlistEntryDTO>[] = [
    {
      key: 'entry_type', header: t('visitors.watchlist.type', 'Type'), width: '100px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium px-2 py-0.5 rounded',
          r.entry_type === 'blacklisted' ? 'bg-destructive/20 text-destructive' : 'bg-amber-500/20 text-amber-400'
        )}>
          {r.entry_type === 'blacklisted' ? t('visitors.watchlist.blocklist', 'Blocklist') : t('visitors.watchlist.flagged', 'Flagged')}
        </span>
      ),
    },
    { key: 'match_field', header: t('visitors.watchlist.field', 'Field'), width: '100px', render: (r) => <span className="text-muted-foreground">{r.match_field}</span> },
    { key: 'match_value', header: t('visitors.watchlist.value', 'Value'), render: (r) => <span className="font-medium">{r.match_value}</span> },
    { key: 'reason', header: t('visitors.watchlist.reason', 'Reason'), render: (r) => <span className="text-muted-foreground text-[13px]">{r.reason}</span> },
    {
      key: 'expires_at', header: t('visitors.watchlist.expires', 'Expires'), width: '120px',
      render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{r.expires_at ? new Date(r.expires_at).toLocaleDateString() : '—'}</span>,
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

  const handleSubmit = () => {
    if (!formData.match_value || !formData.reason) return;
    createMutation.mutate(formData, {
      onSuccess: () => {
        setShowForm(false);
        setFormData({ entry_type: 'blacklisted', match_field: 'email', match_value: '', reason: '' });
      },
    });
  };

  return (
    <div>
      <PageHeader title={t('visitors.watchlist.title', 'Watchlist')} description={t('visitors.watchlist.description', 'Manage blocklisted and flagged visitors')}>
        <Button size="sm" onClick={() => setShowForm(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="visitors-button-add-watchlist">
          <Plus size={16} className="mr-1" /> {t('visitors.watchlist.add', 'Add Entry')}
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.loading', 'Loading...')}</div>
      ) : entries.length === 0 ? (
        <div className="py-10">
          <EmptyState
            icon={<ShieldAlert size={32} strokeWidth={1.2} />}
            title={t('visitors.watchlist.empty', 'No watchlist entries')}
            description="Watchlist entries block or flag visitors at check-in by email, phone, national ID, or name. Add an entry to prevent a specific person from registering, or to alert staff when someone attempts a visit."
            primaryAction={{ label: t('visitors.watchlist.add', 'Add Entry'), icon: <Plus size={14} />, onClick: () => setShowForm(true), 'data-testid': 'visitors-button-add-watchlist-empty' }}
          />
        </div>
      ) : (
        <>
          <DataTable columns={columns} data={entries} rowKey={(r) => r.id} />
          {total > 20 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <span className="text-[12px] text-muted-foreground py-1">Page {page} of {Math.ceil(total / 20)}</span>
              <Button size="xs" variant="outline" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}

      <AppModal open={showForm} onOpenChange={setShowForm} title={t('visitors.watchlist.add', 'Add Watchlist Entry')} size="sm" showCancelButton
        primaryAction={{ label: 'Add', onClick: handleSubmit, disabled: !formData.match_value || !formData.reason || createMutation.isPending }}>
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">{t('visitors.watchlist.type', 'Type')}</Label>
            <Select className="mt-1 h-8 text-[12px]" value={formData.entry_type} onChange={(e) => setFormData(prev => ({ ...prev, entry_type: e.target.value }))}>
              <SelectOption value="blacklisted">{t('visitors.watchlist.blocklist', 'Blocklist')}</SelectOption>
              <SelectOption value="vip">{t('visitors.watchlist.flagged', 'Flagged')}</SelectOption>
            </Select>
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.watchlist.field', 'Match Field')}</Label>
            <Select className="mt-1 h-8 text-[12px]" value={formData.match_field} onChange={(e) => setFormData(prev => ({ ...prev, match_field: e.target.value }))}>
              <SelectOption value="email">Email</SelectOption>
              <SelectOption value="phone">Phone</SelectOption>
              <SelectOption value="national_id">National ID</SelectOption>
              <SelectOption value="name">Name</SelectOption>
            </Select>
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.watchlist.value', 'Value')}</Label>
            <Input className="mt-1 h-8 text-[13px]" value={formData.match_value} onChange={(e) => setFormData(prev => ({ ...prev, match_value: e.target.value }))} data-testid="visitors-input-watchlist-value" />
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.watchlist.reason', 'Reason')}</Label>
            <Input className="mt-1 h-8 text-[13px]" value={formData.reason} onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))} data-testid="visitors-input-watchlist-reason" />
          </div>
        </div>
      </AppModal>
    </div>
  );
}
