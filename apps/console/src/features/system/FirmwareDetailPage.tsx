import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Package, Save, Trash2, Download, Rocket } from 'lucide-react';
import {
  fetchFirmware,
  updateFirmware,
  deleteFirmware,
  getFirmwareDownloadUrl,
  getToken,
  type FirmwareDTO,
} from '@/lib/api';
import { ALL_DEVICE_MODELS } from '@/lib/device-models';
import { Button, Input, Label } from '@dm3/ui';

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success border-success/20',
  inactive: 'bg-error/10 text-error border-error/20',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

  useEffect(() => {
    if (!id) return;
    fetchFirmware(id)
      .then((fw) => {
        setFirmware(fw);
        setForm({
          version: fw.version,
          description: fw.description || '',
          is_active: fw.is_active,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await updateFirmware(id, {
        version: form.version,
        description: form.description,
        is_active: form.is_active,
      });
      setFirmware(updated);
      setEditing(false);
    } catch {
      /* */
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!id || !firmware) return;
    if (!confirm(t('firmware.confirmDelete'))) return;
    try {
      await deleteFirmware(id);
      navigate('/system/firmware');
    } catch {
      /* */
    }
  };

  const handleDownload = () => {
    if (!id) return;
    const url = getFirmwareDownloadUrl(id);
    const token = getToken();
    // Open download with auth
    const a = document.createElement('a');
    a.href = `${url}?token=${token}`;
    a.download = '';
    a.click();
  };

  const handleDeploy = () => {
    alert(t('firmware.deployPlaceholder'));
  };

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
    <div className="p-6 max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/system/firmware')}
        className="mb-4 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={15} /> {t('firmware.backToList')}
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-operate/10 flex items-center justify-center">
            <Package size={20} className="text-operate" />
          </div>
          <div>
            <h1 data-testid="detail-text-version" className="text-[20px] font-semibold text-foreground font-mono">
              {firmware.version}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[12px] text-muted-foreground font-mono">{ALL_DEVICE_MODELS.find(m => m.value === firmware.device_type)?.label ?? firmware.device_type}</span>
              <span
                data-testid="detail-badge-status"
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${
                  firmware.is_active ? statusColors.active : statusColors.inactive
                }`}
              >
                {firmware.is_active ? t('firmware.statusActive') : t('firmware.statusInactive')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            data-testid="detail-button-download"
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="gap-1"
          >
            <Download size={14} /> {t('firmware.download')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeploy}
            className="gap-1 border-operate/30 text-operate hover:bg-operate/10"
          >
            <Rocket size={14} /> {t('firmware.deploy')}
          </Button>
          <Button
            data-testid="detail-button-delete"
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="border-error/30 text-error hover:bg-error/10"
          >
            <Trash2 size={14} /> {t('firmware.delete')}
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
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
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                {t('firmware.cancel')}
              </Button>
              <Button
                data-testid="detail-button-edit"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                <Save size={12} /> {saving ? t('firmware.saving') : t('firmware.save')}
              </Button>
            </div>
          ) : (
            <Button
              data-testid="detail-button-edit"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              className="text-operate"
            >
              {t('firmware.edit')}
            </Button>
          )}
        </div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div>
            <Label>{t('firmware.form.version')}</Label>
            <Input
              disabled={!editing}
              value={form.version}
              onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t('firmware.form.deviceType')}</Label>
            <div className="text-[13px] text-muted-foreground py-1.5 font-mono">{ALL_DEVICE_MODELS.find(m => m.value === firmware.device_type)?.label ?? firmware.device_type}</div>
          </div>
          <div className="col-span-2">
            <Label>{t('firmware.form.description')}</Label>
            <textarea
              disabled={!editing}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </div>
          <div>
            <Label>{t('firmware.table.status')}</Label>
            {editing ? (
              <label className="flex items-center gap-2 mt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-[13px]">{t('firmware.statusActive')}</span>
              </label>
            ) : (
              <div className="text-[13px] py-1.5">
                {firmware.is_active ? t('firmware.statusActive') : t('firmware.statusInactive')}
              </div>
            )}
          </div>
          <div>
            <Label>{t('firmware.uploadedBy')}</Label>
            <div className="text-[13px] text-muted-foreground py-1.5">{firmware.uploaded_by || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
