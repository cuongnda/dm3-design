import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppModal, Button, Input, Label } from '@dm3/ui';
import { useTranslation } from 'react-i18next';
import {
  listAccessPoints,
  type CameraDTO,
  type CreateCameraRequest,
  type TestConnectionDTO,
} from '@dm3/api-client';
import { DEVICE_TYPE_MODELS } from '@/lib/device-models';

type RecordingMode = 'event_only' | 'disabled';

const CAMERA_MODELS = DEVICE_TYPE_MODELS['camera'] ?? [];

const RTSP_PLACEHOLDERS: Record<string, string> = {
  tungson: 'rtsp://{ip}:554/live_{device_id}_ch0_s0',
  tbvision: 'rtsp://{ip}:554/stream1',
  camera_dc: 'rtsp://{ip}:554/stream',
  cctv: 'rtsp://{ip}:554/stream',
};

interface FormState {
  name: string;
  model: string;
  rtsp_url: string;
  rtsp_username: string;
  rtsp_password: string;
  brand: string;
  access_point_id: string;
  recording_mode: RecordingMode;
  pre_roll_sec: number;
  post_roll_sec: number;
}

function redactRtspCredentials(s: string | undefined): string {
  if (!s) return '';
  return s.replace(/rtsp(s?):\/\/[^@\s]*@/gi, 'rtsp$1://***@');
}

const emptyForm: FormState = {
  name: '',
  model: '',
  rtsp_url: '',
  rtsp_username: '',
  rtsp_password: '',
  brand: '',
  access_point_id: '',
  recording_mode: 'event_only' as RecordingMode,
  pre_roll_sec: 10,
  post_roll_sec: 10,
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CameraDTO | null;
  onSubmit: (data: CreateCameraRequest) => void;
  onTestConnection?: () => void;
  testResult?: TestConnectionDTO | null;
  testPending?: boolean;
  submitting: boolean;
}

export function CameraFormModal({
  open,
  onOpenChange,
  editing,
  onSubmit,
  onTestConnection,
  testResult,
  testPending,
  submitting,
}: Props) {
  const { t } = useTranslation('common');
  const [form, setForm] = useState<FormState>(emptyForm);

  // Access points for the linkage dropdown. Load all (first 200) — typical tenant
  // will have far fewer, and this avoids async-search complexity for now.
  const { data: accessPointsResp } = useQuery({
    queryKey: ['access-points-all'],
    queryFn: () => listAccessPoints({ limit: 200 }),
    enabled: open,
  });
  const accessPoints = accessPointsResp?.data ?? [];

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        model: (editing as any).model ?? '',
        rtsp_url: editing.rtsp_url,
        rtsp_username: editing.rtsp_username ?? '',
        rtsp_password: '', // never pre-fill password
        brand: editing.brand ?? '',
        access_point_id: editing.access_point_id ?? '',
        recording_mode: editing.recording_mode as RecordingMode,
        pre_roll_sec: editing.pre_roll_sec,
        post_roll_sec: editing.post_roll_sec,
      });
    } else {
      setForm(emptyForm);
    }
  }, [editing, open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    const data: CreateCameraRequest & { model?: string } = {
      name: form.name,
      rtsp_url: form.rtsp_url,
      rtsp_username: form.rtsp_username || undefined,
      rtsp_password: form.rtsp_password || undefined,
      brand: form.brand || undefined,
      model: form.model || undefined,
      access_point_id: form.access_point_id || undefined,
      recording_mode: form.recording_mode,
      pre_roll_sec: form.pre_roll_sec,
      post_roll_sec: form.post_roll_sec,
    };
    onSubmit(data);
  };

  const canSubmit = form.name.trim().length > 0 && form.rtsp_url.trim().length > 0 && !submitting;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t('cctv.cameras.editCamera') : t('cctv.cameras.addCamera')}
    >
      <div className="space-y-3">
        <div>
          <Label className="text-[12px]">{t('cctv.cameras.fields.name')} *</Label>
          <Input
            className="mt-1 h-8 text-[13px]"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t('cctv.cameras.fields.namePlaceholder')}
            data-testid="cctv-input-camera-name"
          />
        </div>

        <div>
          <Label className="text-[12px]">{t('cctv.cameras.fields.model') || 'Camera Model'}</Label>
          <select
            className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]"
            value={form.model}
            onChange={(e) => set('model', e.target.value)}
            data-testid="cctv-select-camera-model"
          >
            <option value="">-- Select model --</option>
            {CAMERA_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-[12px]">{t('cctv.cameras.fields.rtspUrl')} *</Label>
          <Input
            className="mt-1 h-8 text-[13px] font-mono"
            value={form.rtsp_url}
            onChange={(e) => set('rtsp_url', e.target.value)}
            placeholder={RTSP_PLACEHOLDERS[form.model] || 'rtsp://192.168.1.100:554/stream'}
            data-testid="cctv-input-rtsp-url"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">{t('cctv.cameras.fields.rtspUsername')}</Label>
            <Input
              className="mt-1 h-8 text-[13px]"
              value={form.rtsp_username}
              onChange={(e) => set('rtsp_username', e.target.value)}
              placeholder="admin"
              data-testid="cctv-input-rtsp-username"
            />
          </div>
          <div>
            <Label className="text-[12px]">{t('cctv.cameras.fields.rtspPassword')}</Label>
            <Input
              type="password"
              className="mt-1 h-8 text-[13px]"
              value={form.rtsp_password}
              onChange={(e) => set('rtsp_password', e.target.value)}
              placeholder={editing ? t('cctv.cameras.fields.passwordPlaceholder') : ''}
              data-testid="cctv-input-rtsp-password"
            />
          </div>
        </div>

        <div>
          <Label className="text-[12px]">{t('cctv.cameras.fields.accessPoint')}</Label>
          <select
            className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]"
            value={form.access_point_id}
            onChange={(e) => set('access_point_id', e.target.value)}
            data-testid="cctv-select-access-point"
          >
            <option value="">{t('cctv.cameras.fields.accessPointNone')}</option>
            {accessPoints.map((ap) => (
              <option key={ap.id} value={ap.id}>
                {ap.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">{t('cctv.cameras.fields.brand')}</Label>
            <Input
              className="mt-1 h-8 text-[13px]"
              value={form.brand}
              onChange={(e) => set('brand', e.target.value)}
              placeholder="Hikvision"
              data-testid="cctv-input-brand"
            />
          </div>
          <div>
            <Label className="text-[12px]">{t('cctv.cameras.fields.recordingMode')}</Label>
            <select
              className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]"
              value={form.recording_mode}
              onChange={(e) => set('recording_mode', e.target.value as RecordingMode)}
              data-testid="cctv-select-recording-mode"
            >
              <option value="event_only">{t('cctv.cameras.recordingModes.event')}</option>
              <option value="disabled">{t('cctv.cameras.recordingModes.off')}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">{t('cctv.cameras.fields.preRoll')} (s)</Label>
            <Input
              type="number"
              className="mt-1 h-8 text-[13px]"
              min={0}
              max={60}
              value={form.pre_roll_sec}
              onChange={(e) => set('pre_roll_sec', Number(e.target.value))}
              data-testid="cctv-input-pre-roll"
            />
          </div>
          <div>
            <Label className="text-[12px]">{t('cctv.cameras.fields.postRoll')} (s)</Label>
            <Input
              type="number"
              className="mt-1 h-8 text-[13px]"
              min={0}
              max={60}
              value={form.post_roll_sec}
              onChange={(e) => set('post_roll_sec', Number(e.target.value))}
              data-testid="cctv-input-post-roll"
            />
          </div>
        </div>

        {/* Test connection result */}
        {testResult && (
          <div
            className={`rounded-md px-3 py-2 text-[12px] ${
              testResult.ok
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}
          >
            {testResult.ok ? (
              <span>
                {t('cctv.cameras.testOk')} · {testResult.latency_ms}ms
                {testResult.codec && ` · ${testResult.codec}`}
                {testResult.resolution && ` · ${testResult.resolution}`}
              </span>
            ) : (
              <span>{t('cctv.cameras.testFailed')}: {redactRtspCredentials(testResult.error)}</span>
            )}
          </div>
        )}

        <div className="flex justify-between items-center pt-2">
          {onTestConnection && (
            <Button
              size="sm"
              variant="outline"
              onClick={onTestConnection}
              disabled={!form.rtsp_url.trim() || testPending}
              data-testid="cctv-button-test-connection"
            >
              {testPending ? t('cctv.cameras.testing') : t('cctv.cameras.testConnection')}
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('cctv.common.cancel')}
            </Button>
            <Button
              size="sm"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="bg-[#3B82F6] hover:bg-[#2563EB]"
              data-testid="cctv-button-submit-camera"
            >
              {submitting ? t('cctv.common.saving') : editing ? t('cctv.common.saveChanges') : t('cctv.common.create')}
            </Button>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
