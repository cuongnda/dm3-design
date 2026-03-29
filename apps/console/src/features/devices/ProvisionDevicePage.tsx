import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { PageHeader } from '@dm3/ui';
import { provisionDevice, regenerateQR, type ProvisionResponse } from '@/lib/api';
import { ArrowLeft, Copy, Check, RefreshCw } from 'lucide-react';

const DEVICE_TYPES = ['terminal', 'controller', 'sensor', 'camera'] as const;

export function ProvisionDevicePage() {
  const [step, setStep] = useState<'form' | 'qr'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ProvisionResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(0);

  // Form state
  const [deviceId, setDeviceId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('terminal');
  const [location, setLocation] = useState('');

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
    setLoading(true);
    try {
      const res = await provisionDevice({
        device_id: deviceId,
        name,
        type,
        location: location || undefined,
      });
      setResult(res);
      setStep('qr');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to provision device');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = useCallback(async () => {
    if (!result) return;
    setLoading(true);
    try {
      const res = await regenerateQR(result.device.id);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate QR');
    } finally {
      setLoading(false);
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
  const timerColor = remaining === 0 ? '#EF4444' : remaining < 300 ? '#F97316' : '#22C55E';

  const inputCls = 'w-full h-9 px-3 bg-[#111827] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/20';
  const labelCls = 'block text-[11px] uppercase text-[#64748B] font-medium mb-1.5';

  if (step === 'qr' && result) {
    return (
      <div className="p-6">
        <button onClick={() => { setStep('form'); setResult(null); }} className="flex items-center gap-1 text-[13px] text-[#94A3B8] hover:text-[#F8FAFC] mb-4 transition-colors">
          <ArrowLeft size={14} /> Back
        </button>

        <div className="max-w-md mx-auto text-center">
          <h2 className="text-[18px] font-semibold text-[#F8FAFC] mb-1">Device Provisioned</h2>
          <p className="text-[13px] text-[#94A3B8] mb-6">Scan this QR on the device to activate</p>

          {/* QR Code */}
          <div className="inline-block p-6 bg-white rounded-xl mb-4">
            <QRCodeSVG value={result.provisioning.qr_data} size={240} level="M" />
          </div>

          <div className="mb-4">
            <div className="text-[15px] font-medium text-[#F8FAFC]">Device: {result.device.device_id}</div>
            <div className="text-[13px] text-[#94A3B8]">{result.device.name} • {result.device.type}</div>
          </div>

          {/* Timer */}
          <div className="mb-4">
            <span className="text-[13px] font-mono font-medium" style={{ color: timerColor }}>
              {isExpired ? '⏰ Token expired' : `⏱ ${mins}:${String(secs).padStart(2, '0')} remaining`}
            </span>
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-2">
            {isExpired ? (
              <button onClick={handleRegenerate} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-md text-[13px] font-medium transition-colors disabled:opacity-50">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Regenerate QR
              </button>
            ) : (
              <button onClick={handleCopy} className="flex items-center gap-1.5 px-4 py-2 bg-[#1E293B] hover:bg-[#334155] text-[#F8FAFC] rounded-md text-[13px] font-medium transition-colors border border-[#334155]">
                {copied ? <Check size={14} className="text-[#22C55E]" /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy activation token'}
              </button>
            )}
          </div>

          {error && <p className="text-[12px] text-[#EF4444] mt-3">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader title="Provision Device" description="Create a new device and generate activation QR code" />

      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <div>
          <label className={labelCls}>Device ID (6-digit)</label>
          <input value={deviceId} onChange={(e) => setDeviceId(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000001" required pattern="\d{6}" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Device Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lobby A — Gate 1" required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Device Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Building A, Floor 1" className={inputCls} />
        </div>

        {error && <p className="text-[12px] text-[#EF4444]">{error}</p>}

        <button type="submit" disabled={loading || deviceId.length !== 6 || !name} className="px-4 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-md text-[13px] font-medium transition-colors disabled:opacity-50">
          {loading ? 'Provisioning...' : 'Create Device & Generate QR'}
        </button>
      </form>
    </div>
  );
}
