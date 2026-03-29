import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@dm3/ui';
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
  const [rowState, setRowState] = useState<Record<string, { company_id: string; name: string; location: string }>>({});

  const { data: devices = [], isLoading: loading, refetch: loadData } = usePendingDevices();
  const approveDevice = useApprovePendingDevice();
  const rejectDevice = useRejectPendingDevice();

  useEffect(() => {
    if (isSystemAdmin) {
      fetchCompanies().then(setCompanies).catch(() => {});
    }
  }, [isSystemAdmin]);

  useEffect(() => {
    // Init row state when devices change
    const init: typeof rowState = {};
    devices.forEach((d) => {
      if (!rowState[d.id]) {
        init[d.id] = { company_id: '', name: '', location: '' };
      } else {
        init[d.id] = rowState[d.id];
      }
    });
    setRowState(init);
  }, [devices]);

  const updateRow = (id: string, field: string, value: string) => {
    setRowState((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleApprove = (d: PendingDevice) => {
    const row = rowState[d.id];
    if (isSystemAdmin && !row?.company_id) return;
    if (!row?.name) return;

    approveDevice.mutate({
      id: d.id,
      data: {
        company_id: row.company_id,
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

  const inputCls = 'h-7 px-2 bg-[#111827] border border-[#1E293B] rounded text-[12px] text-[#F8FAFC] placeholder:text-[#475569] focus:border-[#3B82F6] focus:outline-none';

  return (
    <div className={isSystemAdmin ? 'p-6' : ''}>
      <PageHeader title={t('pendingDevices.title')} description={t('pendingDevices.description')}>
        <button onClick={() => loadData()} className="flex items-center gap-1 px-3 py-1.5 bg-[#1E293B] hover:bg-[#334155] text-[#94A3B8] rounded-md text-[12px] border border-[#334155] transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </PageHeader>

      <div className="border border-[#1E293B] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#111827] text-[11px] text-[#64748B] uppercase tracking-wider">
              <th className="text-left py-2.5 px-4 font-medium">{t('pendingDevices.table.rid')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{t('pendingDevices.table.type')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{t('pendingDevices.table.firmware')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{t('pendingDevices.table.signature')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{t('pendingDevices.table.requested')}</th>
              {isSystemAdmin && <th className="text-left py-2.5 px-4 font-medium">{t('devices.table.company')}</th>}
              <th className="text-left py-2.5 px-4 font-medium">{t('pendingDevices.table.name')}</th>
              <th className="text-right py-2.5 px-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isSystemAdmin ? 8 : 7} className="py-12 text-center">
                  <div className="w-5 h-5 border-2 border-[#3B82F6]/30 border-t-[#3B82F6] rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan={isSystemAdmin ? 8 : 7} className="py-12 text-center text-[13px] text-[#64748B]">
                  No pending registrations
                </td>
              </tr>
            ) : (
              devices.map((d) => (
                <tr key={d.id} className="border-t border-[#1E293B]">
                  <td className="py-2.5 px-4 text-[13px] text-[#F8FAFC] font-mono">{d.rid}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#94A3B8]">{d.device_type}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#94A3B8] font-mono">{d.firmware_version || '—'}</td>
                  <td className="py-2.5 px-4">
                    {d.signature_verified ? (
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#22C55E]/10 text-[#22C55E]">✅ {t('pendingDevices.signature.verified')}</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#EAB308]/10 text-[#EAB308]">⚠️ {t('pendingDevices.signature.unverified')}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-[13px] text-[#64748B]">{timeAgo(d.created_at)}</td>
                  {isSystemAdmin && (
                    <td className="py-2.5 px-4">
                      <select value={rowState[d.id]?.company_id || ''} onChange={(e) => updateRow(d.id, 'company_id', e.target.value)} className={`${inputCls} w-36`}>
                        <option value="">Select...</option>
                        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="py-2.5 px-4">
                    <input value={rowState[d.id]?.name || ''} onChange={(e) => updateRow(d.id, 'name', e.target.value)} placeholder="Device name" className={`${inputCls} w-36`} />
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => handleApprove(d)}
                        disabled={approveDevice.isPending || rejectDevice.isPending || !rowState[d.id]?.name || (isSystemAdmin && !rowState[d.id]?.company_id)}
                        className="px-2.5 py-1 rounded text-[11px] font-medium bg-[#22C55E] hover:bg-[#16A34A] text-white disabled:opacity-40 transition-colors"
                      >
                        {approveDevice.isPending ? 'Approving...' : t('pendingDevices.actions.approve')}
                      </button>
                      <button
                        onClick={() => handleReject(d)}
                        disabled={approveDevice.isPending || rejectDevice.isPending}
                        className="px-2.5 py-1 rounded text-[11px] font-medium bg-[#EF4444] hover:bg-[#DC2626] text-white disabled:opacity-40 transition-colors"
                      >
                        {rejectDevice.isPending ? 'Rejecting...' : t('pendingDevices.actions.reject')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
