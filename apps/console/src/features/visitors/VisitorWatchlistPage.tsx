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
      key: 'entry_type', header: t('visitors.watchlist.form.typeLabel'), width: '100px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium px-2 py-0.5 rounded',
          r.entry_type === 'blacklisted' ? 'bg-destructive/20 text-destructive' : 'bg-amber-500/20 text-amber-400'
        )}>
          {r.entry_type === 'blacklisted' ? t('visitors.watchlist.blocklistLabel') : t('visitors.watchlist.flaggedLabel')}
        </span>
      ),
    },
    { key: 'match_field', header: t('visitors.watchlist.columnField'), width: '100px', render: (r) => <span className="text-muted-foreground">{r.match_field}</span> },
    { key: 'match_value', header: t('visitors.watchlist.columnValue'), render: (r) => <span className="font-medium">{r.match_value}</span> },
    { key: 'reason', header: t('visitors.watchlist.reason'), render: (r) => <span className="text-muted-foreground text-[13px]">{r.reason}</span> },
    {
      key: 'expires_at', header: t('visitors.watchlist.columnExpires'), width: '120px',
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
      <PageHeader title={t('visitors.watchlist.title')} description={t('visitors.watchlist.description')}>
        <Button size="sm" onClick={() => setShowForm(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="visitors-button-add-watchlist">
          <Plus size={16} className="mr-1" /> {t('visitors.watchlist.add')}
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.loading')}</div>
      ) : entries.length === 0 ? (
        <div className="py-10">
          <EmptyState
            icon={<ShieldAlert size={32} strokeWidth={1.2} />}
            title={t('visitors.watchlist.empty.title')}
            description={t('visitors.watchlist.empty.description')}
            primaryAction={{ label: t('visitors.watchlist.add'), icon: <Plus size={14} />, onClick: () => setShowForm(true), 'data-testid': 'visitors-button-add-watchlist-empty' }}
          />
        </div>
      ) : (
        <>
          <DataTable columns={columns} data={entries} rowKey={(r) => r.id} />
          {total > 20 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('visitors.history.prev')}</Button>
              <span className="text-[12px] text-muted-foreground py-1">{t('visitors.history.pageOf', { page, total: Math.ceil(total / 20) })}</span>
              <Button size="xs" variant="outline" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>{t('visitors.history.next')}</Button>
            </div>
          )}
        </>
      )}

      <AppModal open={showForm} onOpenChange={setShowForm} title={t('visitors.watchlist.form.addTitle')} size="sm" showCancelButton
        primaryAction={{ label: t('visitors.watchlist.form.addSubmit'), onClick: handleSubmit, disabled: !formData.match_value || !formData.reason || createMutation.isPending }}>
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">{t('visitors.watchlist.form.typeLabel')}</Label>
            <Select className="mt-1 h-8 text-[12px]" value={formData.entry_type} onChange={(e) => setFormData(prev => ({ ...prev, entry_type: e.target.value }))}>
              <SelectOption value="blacklisted">{t('visitors.watchlist.blocklistLabel')}</SelectOption>
              <SelectOption value="vip">{t('visitors.watchlist.flaggedLabel')}</SelectOption>
            </Select>
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.watchlist.form.fieldLabel')}</Label>
            <Select className="mt-1 h-8 text-[12px]" value={formData.match_field} onChange={(e) => setFormData(prev => ({ ...prev, match_field: e.target.value }))}>
              <SelectOption value="email">{t('visitors.watchlist.form.fieldEmail')}</SelectOption>
              <SelectOption value="phone">{t('visitors.watchlist.form.fieldPhone')}</SelectOption>
              <SelectOption value="national_id">{t('visitors.watchlist.form.fieldNationalId')}</SelectOption>
              <SelectOption value="name">{t('visitors.watchlist.form.fieldName')}</SelectOption>
            </Select>
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.watchlist.form.valueLabel')}</Label>
            <Input className="mt-1 h-8 text-[13px]" value={formData.match_value} onChange={(e) => setFormData(prev => ({ ...prev, match_value: e.target.value }))} data-testid="visitors-input-watchlist-value" />
          </div>
          <div>
            <Label className="text-[12px]">{t('visitors.watchlist.reason')}</Label>
            <Input className="mt-1 h-8 text-[13px]" value={formData.reason} onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))} data-testid="visitors-input-watchlist-reason" />
          </div>
        </div>
      </AppModal>
    </div>
  );
}
