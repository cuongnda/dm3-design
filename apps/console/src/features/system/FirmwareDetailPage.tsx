import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Package, Save, Trash2, Download, Rocket, CheckCircle2, XCircle, Loader2, Clock, Monitor } from 'lucide-react';
import {
  fetchFirmware, updateFirmware, deleteFirmware, downloadFirmware,
  deployFirmware, fetchFirmwareDeployments, apiFetch,
  type FirmwareDTO, type FirmwareDeploymentDTO,
} from '@/lib/api';
import { ALL_DEVICE_MODELS } from '@/lib/device-models';
import { Button, Input, Label, Badge, AppModal, Checkbox, DataTable, type Column, TablePaginationFooter } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success border-success/20',
  inactive: 'bg-error/10 text-error border-error/20',
};

const deployStatusConfig: Record<string, { color: string; label: string }> = {
  pending:      { color: 'text-muted-foreground',  label: 'Pending' },
  sent:         { color: 'text-secure',             label: 'Sent' },
  downloading:  { color: 'text-operate',            label: 'Downloading' },
  installing:   { color: 'text-warning',            label: 'Installing' },
  success:      { color: 'text-success',            label: 'Success' },
  failed:       { color: 'text-error',              label: 'Failed' },
  rolled_back:  { color: 'text-warning',            label: 'Rolled Back' },
  expired:      { color: 'text-muted-foreground',   label: 'Expired' },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface DeviceOption {
  id: string;
  device_id: string;
  name: string;
  type: string;
  model: string;
  status: string;
  firmware_version?: string;
}

export function FirmwareDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const [firmware, setFirmware] = useState<FirmwareDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ version: '', description: '', is_active: true });

  // Deploy state
  const [showDeploy, setShowDeploy] = useState(false);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [deploying, setDeploying] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);

  // Deployments table
  const [deployments, setDeployments] = useState<FirmwareDeploymentDTO[]>([]);
  const [deployPage, setDeployPage] = useState(1);
  const [deployTotal, setDeployTotal] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchFirmware(id)
      .then((fw) => {
        setFirmware(fw);
        setForm({ version: fw.version, description: fw.description || '', is_active: fw.is_active });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // Load deployments + poll for status updates
  const loadDeployments = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetchFirmwareDeployments(id, deployPage, 10);
      setDeployments(res.data || []);
      setDeployTotal(res.total ?? 0);
    } catch { /* ignore */ }
  }, [id, deployPage]);

  useEffect(() => {
    loadDeployments();
    pollRef.current = setInterval(loadDeployments, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadDeployments]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await updateFirmware(id, { version: form.version, description: form.description, is_active: form.is_active });
      setFirmware(updated);
      setEditing(false);
    } catch {
      toast(t('firmware.toast.saveFailed'), 'error');
    }
    setSaving(false);
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteFirmware(id);
      toast(t('firmware.toast.deleteSuccess'), 'success');
      navigate('/system/firmware');
    } catch {
      toast(t('firmware.toast.deployFailed'), 'error');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDownload = async () => {
    if (!id) return;
    await downloadFirmware(id);
  };

  // Open deploy dialog — fetch devices matching firmware model
  const openDeployDialog = async () => {
    if (!firmware) return;
    setShowDeploy(true);
    setSelectedDevices(new Set());
    try {
      const res = await apiFetch<DeviceOption[]>(
        `/api/v1/gateway/system/devices?model=${encodeURIComponent(firmware.device_type)}`
      );
      setDevices(res || []);
    } catch {
      setDevices([]);
    }
  };

  const handleDeploy = async () => {
    if (!id || selectedDevices.size === 0) return;
    setDeploying(true);
    try {
      const res = await deployFirmware(id, Array.from(selectedDevices), forceUpdate);
      const sent = res.results.filter((r) => r.status === 'sent').length;
      const failed = res.results.filter((r) => r.status === 'failed').length;
      if (failed === 0) {
        toast(t('firmware.toast.deploySuccess', { count: sent }), 'success');
      } else {
        toast(t('firmware.toast.deployPartial', { sent, failed }), sent > 0 ? 'success' : 'error');
      }
      setShowDeploy(false);
      loadDeployments();
    } catch {
      toast(t('firmware.toast.deployFailed'), 'error');
    } finally {
      setDeploying(false);
    }
  };

  const toggleDevice = (deviceId: string) => {
    setSelectedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  // Deployment table columns
  const deployColumns: Column<FirmwareDeploymentDTO>[] = [
    {
      key: 'device_id', header: 'Device', sortable: true,
      render: (d) => <span className="font-mono text-[12px]">{d.device_id}</span>,
    },
    {
      key: 'status', header: 'Status', width: '120px',
      render: (d) => {
        const cfg = deployStatusConfig[d.status] || deployStatusConfig.pending;
        return (
          <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium', cfg.color)}>
            {d.status === 'success' && <CheckCircle2 size={12} />}
            {(d.status === 'failed' || d.status === 'rolled_back') && <XCircle size={12} />}
            {(d.status === 'downloading' || d.status === 'installing') && <Loader2 size={12} className="animate-spin" />}
            {(d.status === 'pending' || d.status === 'sent') && <Clock size={12} />}
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'progress_pct', header: 'Progress', width: '120px',
      render: (d) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={cn('h-full rounded-full transition-all',
              d.status === 'success' ? 'bg-success' : d.status === 'failed' ? 'bg-error' : 'bg-secure')}
              style={{ width: `${d.progress_pct}%` }} />
          </div>
          <span className="text-[11px] text-muted-foreground w-8 text-right">{d.progress_pct}%</span>
        </div>
      ),
    },
    {
      key: 'deployed_by_email', header: 'Deployed By',
      render: (d) => <span className="text-[12px] text-muted-foreground">{d.deployed_by_email || '—'}</span>,
    },
    {
      key: 'created_at', header: 'Time', width: '150px',
      render: (d) => <span className="font-mono text-[11px] text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>,
    },
    {
      key: 'error_message', header: 'Error',
      render: (d) => d.error_message ? <span className="text-[11px] text-error">{d.error_message}</span> : null,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-operate/30 border-t-operate rounded-full animate-spin" />
      </div>
    );
  }

  if (!firmware) {
    return <div className="p-6 text-muted-foreground text-[13px]">{t('firmware.notFound')}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/system/firmware')} className="text-muted-foreground hover:text-foreground">
        <ArrowLeft size={15} /> {t('firmware.backToList')}
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-operate/10 flex items-center justify-center">
            <Package size={20} className="text-operate" />
          </div>
          <div>
            <h1 data-testid="detail-text-version" className="text-[20px] font-semibold text-foreground font-mono">{firmware.version}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[12px] text-muted-foreground font-mono">{ALL_DEVICE_MODELS.find(m => m.value === firmware.device_type)?.label ?? firmware.device_type}</span>
              <span data-testid="detail-badge-status" className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${firmware.is_active ? statusColors.active : statusColors.inactive}`}>
                {firmware.is_active ? t('firmware.statusActive') : t('firmware.statusInactive')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button data-testid="detail-button-download" variant="outline" size="sm" onClick={handleDownload} className="gap-1">
            <Download size={14} /> {t('firmware.download')}
          </Button>
          <Button data-testid="detail-button-deploy" variant="outline" size="sm" onClick={openDeployDialog}
            className="gap-1 border-operate/30 text-operate hover:bg-operate/10" disabled={!firmware.is_active}>
            <Rocket size={14} /> {t('firmware.deploy')}
          </Button>
          <Button data-testid="detail-button-delete" variant="outline" size="sm" onClick={() => setShowDeleteConfirm(true)}
            className="border-error/30 text-error hover:bg-error/10">
            <Trash2 size={14} /> {t('firmware.delete')}
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border rounded-lg p-3 bg-card">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{t('firmware.table.size')}</span>
          <div className="text-[18px] font-semibold text-foreground mt-1">{formatSize(firmware.file_size)}</div>
        </div>
        <div className="border border-border rounded-lg p-3 bg-card">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{t('firmware.table.uploadedAt')}</span>
          <div className="text-[14px] font-medium text-foreground mt-1">{new Date(firmware.created_at).toLocaleString()}</div>
        </div>
        <div className="border border-border rounded-lg p-3 bg-card">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">SHA-256</span>
          <div className="text-[11px] font-mono text-foreground mt-1 break-all">{firmware.checksum || '—'}</div>
        </div>
      </div>

      {/* Editable fields */}
      <div className="border border-border rounded-lg bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-[14px] font-medium text-foreground">{t('firmware.details')}</h2>
          {editing ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>{t('firmware.cancel')}</Button>
              <Button data-testid="detail-button-save" size="sm" onClick={handleSave} disabled={saving}>
                <Save size={12} /> {saving ? t('firmware.saving') : t('firmware.save')}
              </Button>
            </div>
          ) : (
            <Button data-testid="detail-button-edit" variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-operate">
              {t('firmware.edit')}
            </Button>
          )}
        </div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div>
            <Label>{t('firmware.form.version')}</Label>
            <Input disabled={!editing} value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} />
          </div>
          <div>
            <Label>{t('firmware.form.deviceType')}</Label>
            <div className="text-[13px] text-muted-foreground py-1.5 font-mono">{ALL_DEVICE_MODELS.find(m => m.value === firmware.device_type)?.label ?? firmware.device_type}</div>
          </div>
          <div className="col-span-2">
            <Label>{t('firmware.form.description')}</Label>
            <textarea disabled={!editing} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
          </div>
          <div>
            <Label>{t('firmware.table.status')}</Label>
            {editing ? (
              <label className="flex items-center gap-2 mt-1 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                <span className="text-[13px]">{t('firmware.statusActive')}</span>
              </label>
            ) : (
              <div className="text-[13px] py-1.5">{firmware.is_active ? t('firmware.statusActive') : t('firmware.statusInactive')}</div>
            )}
          </div>
          <div>
            <Label>{t('firmware.uploadedBy')}</Label>
            <div className="text-[13px] text-muted-foreground py-1.5">{firmware.uploaded_by || '—'}</div>
          </div>
        </div>
      </div>

      {/* Deployment History */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-[14px] font-medium text-foreground flex items-center gap-1.5">
            <Rocket size={14} className="text-operate" /> Deployment History
          </h2>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Live
          </span>
        </div>
        {deployments.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">No deployments yet</div>
        ) : (
          <>
            <DataTable embedded stickyHeader paginate={false}
              columns={deployColumns} data={deployments} rowKey={(d) => d.id} />
            <TablePaginationFooter page={deployPage} pageSize={10}
              total={deployTotal} totalPages={Math.ceil(deployTotal / 10)}
              onPageChange={setDeployPage} />
          </>
        )}
      </div>

      {/* Deploy Dialog */}
      <AppModal open={showDeploy} onOpenChange={(v) => { if (!v) setShowDeploy(false); }}
        title={<span className="flex items-center gap-2"><Rocket size={16} className="text-operate" /> Deploy {firmware.version} to Devices</span>}
        description={`Select devices to receive firmware ${firmware.version} (${firmware.device_type}). Download link expires in 5 minutes.`}
        size="2xl" showCancelButton
        primaryAction={{
          label: deploying ? 'Deploying...' : `Deploy to ${selectedDevices.size} device(s)`,
          onClick: handleDeploy,
          loading: deploying,
          disabled: deploying || selectedDevices.size === 0,
        }}>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox id="force-update" checked={forceUpdate} onCheckedChange={(v) => setForceUpdate(!!v)} />
            <Label htmlFor="force-update" className="text-[13px]">Force immediate update (skip device schedule)</Label>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">{devices.length} matching devices</span>
            <Badge variant="secondary" className="text-[11px]">{selectedDevices.size} selected</Badge>
          </div>

          <div className="rounded-lg border border-border max-h-[400px] overflow-auto">
            {devices.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-muted-foreground">No devices found for type "{firmware.device_type}"</div>
            ) : (
              devices.map((d) => (
                <label key={d.id}
                  className="flex items-center gap-3 px-3 py-2.5 border-b border-border/60 last:border-b-0 cursor-pointer hover:bg-muted/20">
                  <Checkbox checked={selectedDevices.has(d.id)} onCheckedChange={() => toggleDevice(d.id)} />
                  <Monitor size={14} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-medium text-foreground">{d.name || d.device_id}</span>
                    <span className="block text-[11px] text-muted-foreground">{d.device_id} · {d.model || d.type}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={cn('text-[11px] font-medium', d.status === 'online' ? 'text-success' : 'text-muted-foreground')}>
                      {d.status}
                    </span>
                    {d.firmware_version && (
                      <span className="block font-mono text-[10px] text-muted-foreground">v{d.firmware_version}</span>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
      </AppModal>

      {/* Delete Confirm Dialog */}
      <AppModal
        open={showDeleteConfirm}
        onOpenChange={(v) => { if (!v) setShowDeleteConfirm(false); }}
        title={
          <span className="flex items-center gap-2 text-destructive">
            <Trash2 size={16} /> {t('firmware.delete')}
          </span>
        }
        size="xs"
        showCancelButton
        cancelDisabled={deleting}
        primaryAction={{
          label: deleting ? t('firmware.deleting', 'Deleting...') : t('firmware.delete'),
          variant: 'destructive',
          onClick: handleDeleteConfirm,
          loading: deleting,
          disabled: deleting,
        }}
      >
        <p className="text-[13px] text-muted-foreground">
          {t('firmware.confirmDelete')}{' '}
          <span className="font-medium text-foreground font-mono">"{firmware?.version}"</span>?
        </p>
      </AppModal>
    </div>
  );
}
