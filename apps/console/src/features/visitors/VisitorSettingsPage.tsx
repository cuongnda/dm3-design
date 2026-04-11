import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Button, Input, Label } from '@dm3/ui';
import { Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  getVisitorSettings,
  updateVisitorSettings,
  type VisitorSettingsDTO,
  type UpdateVisitorSettingsRequest,
} from '@dm3/api-client';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer group">
      <span className="text-[13px] text-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
          checked ? 'bg-emerald-500' : 'bg-muted'
        )}
      >
        <span className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        )} />
      </button>
    </label>
  );
}

export function VisitorSettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['visitor-settings'],
    queryFn: () => getVisitorSettings(),
  });

  const [form, setForm] = useState<UpdateVisitorSettingsRequest>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        require_approval: settings.require_approval,
        require_nda: settings.require_nda,
        require_photo: settings.require_photo,
        require_id: settings.require_id,
        require_phone: settings.require_phone,
        auto_checkout_hours: settings.auto_checkout_hours,
        max_visit_duration_hours: settings.max_visit_duration_hours,
        qr_expiry_hours: settings.qr_expiry_hours,
        max_reinvites: settings.max_reinvites,
        enable_watchlist: settings.enable_watchlist,
        enable_recurring: settings.enable_recurring,
      });
      setDirty(false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => updateVisitorSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visitor-settings'] });
      setDirty(false);
    },
  });

  const update = <K extends keyof UpdateVisitorSettingsRequest>(key: K, value: UpdateVisitorSettingsRequest[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Visitor Settings" description="Configure visitor management policies for your tenant" />
        <div className="text-center py-12 text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Visitor Settings" description="Configure visitor management policies for your tenant">
        <Button
          size="sm"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="bg-emerald-600 hover:bg-emerald-700"
          data-testid="visitors-button-save-settings"
        >
          <Save size={16} className="mr-1" />
          {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </PageHeader>

      <div className="max-w-2xl space-y-6">
        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">Approval & Verification</h3>
          <div className="divide-y divide-border">
            <Toggle checked={form.require_approval ?? false} onChange={(v) => update('require_approval', v)} label="Require host approval before visit" />
            <Toggle checked={form.require_nda ?? false} onChange={(v) => update('require_nda', v)} label="Require NDA / agreement signature" />
            <Toggle checked={form.require_photo ?? false} onChange={(v) => update('require_photo', v)} label="Require visitor photo at check-in" />
            <Toggle checked={form.require_id ?? false} onChange={(v) => update('require_id', v)} label="Require national ID" />
            <Toggle checked={form.require_phone ?? false} onChange={(v) => update('require_phone', v)} label="Require phone number" />
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">Features</h3>
          <div className="divide-y divide-border">
            <Toggle checked={form.enable_watchlist ?? false} onChange={(v) => update('enable_watchlist', v)} label="Enable visitor watchlist" />
            <Toggle checked={form.enable_recurring ?? false} onChange={(v) => update('enable_recurring', v)} label="Enable recurring visit templates" />
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">Limits & Timing</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-[12px]">Auto-checkout after (hours)</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                value={form.auto_checkout_hours ?? 8}
                onChange={(e) => update('auto_checkout_hours', Number(e.target.value))}
                data-testid="visitors-input-auto-checkout"
              />
            </div>
            <div>
              <Label className="text-[12px]">Max visit duration (hours)</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                value={form.max_visit_duration_hours ?? 24}
                onChange={(e) => update('max_visit_duration_hours', Number(e.target.value))}
                data-testid="visitors-input-max-duration"
              />
            </div>
            <div>
              <Label className="text-[12px]">QR code expiry (hours)</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                value={form.qr_expiry_hours ?? 24}
                onChange={(e) => update('qr_expiry_hours', Number(e.target.value))}
                data-testid="visitors-input-qr-expiry"
              />
            </div>
            <div>
              <Label className="text-[12px]">Max reinvitations</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                value={form.max_reinvites ?? 3}
                onChange={(e) => update('max_reinvites', Number(e.target.value))}
                data-testid="visitors-input-max-reinvites"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
