import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Button, Input, Label } from '@dm3/ui';
import { Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  getParkingSettings,
  updateParkingSettings,
  type UpdateParkingSettingsRequest,
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
          checked ? 'bg-amber-500' : 'bg-muted'
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

export function ParkingSettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['parking-settings'],
    queryFn: () => getParkingSettings(),
  });

  const [form, setForm] = useState<UpdateParkingSettingsRequest>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        auto_open_barrier_on_pass: settings.auto_open_barrier_on_pass,
        confidence_threshold: settings.confidence_threshold,
        require_payment_before_exit: settings.require_payment_before_exit,
        free_minutes_global: settings.free_minutes_global,
        max_session_hours: settings.max_session_hours,
        allow_unregistered_entry: settings.allow_unregistered_entry,
        plate_recognition_enabled: settings.plate_recognition_enabled,
        default_fee_currency: settings.default_fee_currency,
        notify_on_disputed: settings.notify_on_disputed,
        capacity_alert_threshold: settings.capacity_alert_threshold,
      });
      setDirty(false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => updateParkingSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parking-settings'] });
      setDirty(false);
    },
  });

  const update = <K extends keyof UpdateParkingSettingsRequest>(key: K, value: UpdateParkingSettingsRequest[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Parking Settings" description="Configure parking management policies" />
        <div className="text-center py-12 text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Parking Settings" description="Configure parking management policies">
        <Button
          size="sm"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="bg-amber-600 hover:bg-amber-700"
          data-testid="parking-button-save-settings"
        >
          <Save size={16} className="mr-1" />
          {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </PageHeader>

      <div className="max-w-2xl space-y-6">
        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">Barrier & Entry</h3>
          <div className="divide-y divide-border">
            <Toggle checked={form.auto_open_barrier_on_pass ?? true} onChange={(v) => update('auto_open_barrier_on_pass', v)} label="Auto-open barrier for valid passes" />
            <Toggle checked={form.allow_unregistered_entry ?? true} onChange={(v) => update('allow_unregistered_entry', v)} label="Allow unregistered vehicle entry" />
            <Toggle checked={form.plate_recognition_enabled ?? true} onChange={(v) => update('plate_recognition_enabled', v)} label="Enable plate recognition" />
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">Payment & Fees</h3>
          <div className="divide-y divide-border">
            <Toggle checked={form.require_payment_before_exit ?? true} onChange={(v) => update('require_payment_before_exit', v)} label="Require payment before exit" />
            <Toggle checked={form.notify_on_disputed ?? true} onChange={(v) => update('notify_on_disputed', v)} label="Notify on disputed sessions" />
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">Limits & Thresholds</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-[12px]">Free minutes (global)</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                min={0}
                value={form.free_minutes_global ?? 0}
                onChange={(e) => update('free_minutes_global', Number(e.target.value))}
                data-testid="parking-input-free-minutes"
              />
            </div>
            <div>
              <Label className="text-[12px]">Max session hours</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                min={1}
                value={form.max_session_hours ?? 24}
                onChange={(e) => update('max_session_hours', Number(e.target.value))}
                data-testid="parking-input-max-session"
              />
            </div>
            <div>
              <Label className="text-[12px]">Recognition confidence (%)</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                min={0}
                max={1}
                step={0.05}
                value={form.confidence_threshold ?? 0.85}
                onChange={(e) => update('confidence_threshold', Number(e.target.value))}
                data-testid="parking-input-confidence"
              />
            </div>
            <div>
              <Label className="text-[12px]">Capacity alert threshold (%)</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                min={0}
                max={100}
                value={form.capacity_alert_threshold ?? 80}
                onChange={(e) => update('capacity_alert_threshold', Number(e.target.value))}
                data-testid="parking-input-capacity-alert"
              />
            </div>
            <div>
              <Label className="text-[12px]">Default fee currency</Label>
              <Input
                className="mt-1 h-8 text-[13px]"
                value={form.default_fee_currency ?? 'VND'}
                onChange={(e) => update('default_fee_currency', e.target.value)}
                data-testid="parking-input-currency"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
