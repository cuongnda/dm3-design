import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { PageHeader, Button, Input, Label, Select, SelectOption } from '@dm3/ui';
import { regenerateQR, type ProvisionResponse, type RegenerateQRResponse } from '@/lib/api';
import { useProvisionDevice } from '@/lib/hooks';
import { ArrowLeft, Copy, Check, RefreshCw } from 'lucide-react';

const DEVICE_TYPES = ['terminal', 'controller', 'sensor', 'camera'] as const;

export function ProvisionDevicePage() {
  const { t } = useTranslation('devices');
  const [step, setStep] = useState<'form' | 'qr'>('form');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ProvisionResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(0);

  // Form state
  const [deviceId, setDeviceId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('terminal');
  const [location, setLocation] = useState('');

  const provisionMutation = useProvisionDevice();

  // Countdown timer
  useEffect(() => {
    if (!result) return;
    const exp = new Date(result.provisioning.expires_at).getTime();
    const tick = () => {
      const left = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      setRemaining(left);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [result]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await provisionMutation.mutateAsync({
        device_id: deviceId,
        name,
        type,
        location: location || undefined,
      });
      setResult(res);
      setStep('qr');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to provision device');
    }
  };

  const handleRegenerate = useCallback(async () => {
    if (!result) return;
    try {
      // Backend returns flat provisioning object; preserve existing device info
      const provisioning: RegenerateQRResponse = await regenerateQR(result.device.id);
      setResult(prev => prev ? { ...prev, provisioning } : null);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate QR');
    }
  }, [result]);

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.provisioning.qr_token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = remaining <= 0 && result !== null;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timerCls = remaining === 0 ? 'text-error' : remaining < 300 ? 'text-operate' : 'text-success';

  if (step === 'qr' && result) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => { setStep('form'); setResult(null); }} className="mb-4 gap-1">
          <ArrowLeft size={14} /> Back
        </Button>

        <div className="max-w-md mx-auto text-center">
          <h2 className="text-[18px] font-semibold text-foreground mb-1">Device Provisioned</h2>
          <p className="text-[13px] text-muted-foreground mb-6">Scan this QR on the device to activate</p>

          {/* QR Code */}
          <div className="inline-block p-6 bg-white rounded-xl mb-4">
            <QRCodeSVG value={result.provisioning.qr_data} size={240} level="M" />
          </div>

          <div className="mb-4">
            <div className="text-[15px] font-medium text-foreground">Device: {result.device.device_id}</div>
            <div className="text-[13px] text-muted-foreground">{result.device.name} • {result.device.type}</div>
          </div>

          {/* Timer */}
          <div className="mb-4">
            <span className={`text-[13px] font-mono font-medium ${timerCls}`}>
              {isExpired ? '⏰ Token expired' : `⏱ ${mins}:${String(secs).padStart(2, '0')} remaining`}
            </span>
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-2">
            {isExpired ? (
              <Button onClick={handleRegenerate} disabled={provisionMutation.isPending}>
                <RefreshCw size={14} className={provisionMutation.isPending ? 'animate-spin' : ''} /> Regenerate QR
              </Button>
            ) : (
              <Button variant="outline" onClick={handleCopy}>
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy activation token'}
              </Button>
            )}
          </div>

          {error && <p className="text-[12px] text-error mt-3">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader title={t('provisionDevice.title')} description="Create a new device and generate activation QR code" />

      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <div>
          <Label className="text-[11px] uppercase font-medium">{t('provisionDevice.form.deviceId')}</Label>
          <Input data-testid="provision-input-device-id" value={deviceId} onChange={(e) => setDeviceId(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('provisionDevice.form.deviceIdPlaceholder')} required pattern="\d{6}" className="mt-1.5" />
        </div>
        <div>
          <Label className="text-[11px] uppercase font-medium">{t('provisionDevice.form.deviceName')}</Label>
          <Input data-testid="provision-input-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('provisionDevice.form.deviceNamePlaceholder')} required className="mt-1.5" />
        </div>
        <div>
          <Label className="text-[11px] uppercase font-medium">{t('provisionDevice.form.deviceType')}</Label>
          <Select data-testid="provision-select-type" value={type} onChange={(e) => setType(e.target.value)} className="mt-1.5">
            {DEVICE_TYPES.map((dt) => <SelectOption key={dt} value={dt}>{dt.charAt(0).toUpperCase() + dt.slice(1)}</SelectOption>)}
          </Select>
        </div>
        <div>
          <Label className="text-[11px] uppercase font-medium">{t('provisionDevice.form.location')}</Label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('provisionDevice.form.locationPlaceholder')} className="mt-1.5" />
        </div>

        {error && <p className="text-[12px] text-error">{error}</p>}

        <Button data-testid="provision-button-submit" type="submit" disabled={provisionMutation.isPending || deviceId.length !== 6 || !name}>
          {provisionMutation.isPending ? 'Provisioning...' : t('provisionDevice.form.submit')}
        </Button>
      </form>
    </div>
  );
}
