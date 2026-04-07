import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Input,
  PageHeader,
  Select,
  SelectOption,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@dm3/ui';
import { fetchCompanies, type PendingDevice, type CompanyDTO } from '@/lib/api';
import { usePendingDevices, useApprovePendingDevice, useRejectPendingDevice } from '@/lib/hooks';
import { RefreshCw } from 'lucide-react';

interface Props {
  /** If true, shows company selector (system admin view) */
  isSystemAdmin?: boolean;
}

export function PendingDevicesPage({ isSystemAdmin = false }: Props) {
  const { t } = useTranslation('devices');
  const [companies, setCompanies] = useState<CompanyDTO[]>([]);

  // Per-row form state
  const [rowState, setRowState] = useState<Record<string, { tenant_id: string; name: string; location: string }>>({});

  const { data: devices = [], isLoading: loading, refetch: loadData } = usePendingDevices();
  const approveDevice = useApprovePendingDevice();
  const rejectDevice = useRejectPendingDevice();

  useEffect(() => {
    if (isSystemAdmin) {
      fetchCompanies().then(setCompanies).catch(() => {});
    }
  }, [isSystemAdmin]);

  useEffect(() => {
    // Only add entries for new devices, never overwrite existing form state
    setRowState((prev) => {
      let changed = false;
      const next = { ...prev };
      devices.forEach((d) => {
        if (!prev[d.id]) {
          next[d.id] = { tenant_id: '', name: '', location: '' };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [devices]);

  const updateRow = (id: string, field: string, value: string) => {
    setRowState((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleApprove = (d: PendingDevice) => {
    const row = rowState[d.id];
    if (isSystemAdmin && !row?.tenant_id) return;
    if (!row?.name) return;

    approveDevice.mutate({
      id: d.id,
      data: {
        tenant_id: row.tenant_id,
        name: row.name,
        location: row.location || undefined,
      },
    });
  };

  const handleReject = (d: PendingDevice) => {
    rejectDevice.mutate(d.id);
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const inputCls =
    'h-7 px-2 text-[12px] bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]';

  return (
    <div className={isSystemAdmin ? 'p-6' : ''}>
      <PageHeader title={t('pendingDevices.title')} description={t('pendingDevices.description')}>
        <Button data-testid="pending-button-refresh" variant="outline" size="sm" onClick={() => loadData()} className="gap-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </PageHeader>

      <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="pending-table-list">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('pendingDevices.table.rid')}</TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('pendingDevices.table.type')}</TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('pendingDevices.table.firmware')}</TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('pendingDevices.table.signature')}</TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('pendingDevices.table.requested')}</TableHead>
              {isSystemAdmin && (
                <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('devices.table.company')}</TableHead>
              )}
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t('pendingDevices.table.name')}</TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={isSystemAdmin ? 8 : 7} className="py-12 text-center">
                  <div className="w-5 h-5 border-2 border-ring/30 border-t-ring rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSystemAdmin ? 8 : 7} className="py-12 text-center text-[13px] text-muted-foreground">
                  No pending registrations
                </TableCell>
              </TableRow>
            ) : (
              devices.map((d) => (
                <TableRow key={d.id} data-testid={`pending-row-${d.id}`}>
                  <TableCell className="px-4 text-[13px] font-mono text-foreground">{d.rid}</TableCell>
                  <TableCell className="px-4 text-[13px] text-muted-foreground">{d.device_type}</TableCell>
                  <TableCell className="px-4 text-[13px] text-muted-foreground font-mono">{d.firmware_version || '—'}</TableCell>
                  <TableCell className="px-4">
                    {d.signature_verified ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        ✅ {t('pendingDevices.signature.verified')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        ⚠️ {t('pendingDevices.signature.unverified')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 text-[13px] text-muted-foreground">{timeAgo(d.created_at)}</TableCell>
                  {isSystemAdmin && (
                    <TableCell className="px-4">
                      <Select
                        value={rowState[d.id]?.tenant_id || ''}
                        onChange={(e) => updateRow(d.id, 'tenant_id', e.target.value)}
                        className={`${inputCls} w-36`}
                      >
                        <SelectOption value="">Select...</SelectOption>
                        {companies.map((c) => (
                          <SelectOption key={c.id} value={c.id}>
                            {c.name}
                          </SelectOption>
                        ))}
                      </Select>
                    </TableCell>
                  )}
                  <TableCell className="px-4">
                    <Input
                      value={rowState[d.id]?.name || ''}
                      onChange={(e) => updateRow(d.id, 'name', e.target.value)}
                      placeholder="Device name"
                      className={`${inputCls} w-36`}
                    />
                  </TableCell>
                  <TableCell className="px-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        data-testid={`pending-button-approve-${d.id}`}
                        size="xs"
                        onClick={() => handleApprove(d)}
                        disabled={approveDevice.isPending || rejectDevice.isPending || !rowState[d.id]?.name || (isSystemAdmin && !rowState[d.id]?.tenant_id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {approveDevice.isPending ? 'Approving...' : t('pendingDevices.actions.approve')}
                      </Button>
                      <Button
                        data-testid={`pending-button-reject-${d.id}`}
                        size="xs"
                        onClick={() => handleReject(d)}
                        disabled={approveDevice.isPending || rejectDevice.isPending}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        {rejectDevice.isPending ? 'Rejecting...' : t('pendingDevices.actions.reject')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
