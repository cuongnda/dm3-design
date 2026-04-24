import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Button, Input, Label } from '@dm3/ui';
import { Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
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
  const { t } = useTranslation('manage');
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
        approval_required: settings.approval_required,
        auto_approve_returning: settings.auto_approve_returning,
        auto_approve_vip: settings.auto_approve_vip,
        require_nda: settings.require_nda,
        require_photo: settings.require_photo,
        require_national_id: settings.require_national_id,
        require_phone: settings.require_phone,
        require_email: settings.require_email,
        require_company: settings.require_company,
        auto_checkout_hour: settings.auto_checkout_hour,
        max_duration_hours: settings.max_duration_hours,
        default_duration_hours: settings.default_duration_hours,
        no_show_grace_minutes: settings.no_show_grace_minutes,
        qr_validity_before_hours: settings.qr_validity_before_hours,
        qr_validity_after_hours: settings.qr_validity_after_hours,
        badge_enabled: settings.badge_enabled,
        badge_auto_assign: settings.badge_auto_assign,
        notify_host_on_arrival: settings.notify_host_on_arrival,
        notify_host_on_register: settings.notify_host_on_register,
        notify_method: settings.notify_method,
        self_service_enabled: settings.self_service_enabled,
        self_service_requires_qr: settings.self_service_requires_qr,
      });
      setDirty(false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => updateVisitorSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visitor-settings'] });
      setDirty(false);
      toast(t('visitors.settings.toast.saved'), 'success');
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : t('visitors.settings.toast.saveFailed'), 'error');
    },
  });

  const update = <K extends keyof UpdateVisitorSettingsRequest>(key: K, value: UpdateVisitorSettingsRequest[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader title={t('visitors.settings.title')} description={t('visitors.settings.description')} />
        <div className="text-center py-12 text-muted-foreground">{t('visitors.settings.loading')}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('visitors.settings.title')} description={t('visitors.settings.description')}>
        <Button
          size="sm"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="bg-emerald-600 hover:bg-emerald-700"
          data-testid="visitors-button-save-settings"
        >
          <Save size={16} className="mr-1" />
          {saveMutation.isPending ? t('visitors.settings.saving') : t('visitors.settings.save')}
        </Button>
      </PageHeader>

      <div className="max-w-2xl space-y-6">
        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">{t('visitors.settings.sections.approval')}</h3>
          <div className="divide-y divide-border">
            <Toggle checked={form.approval_required ?? false} onChange={(v) => update('approval_required', v)} label={t('visitors.settings.fields.approvalRequired')} />
            <Toggle checked={form.auto_approve_returning ?? false} onChange={(v) => update('auto_approve_returning', v)} label={t('visitors.settings.fields.autoApproveReturning')} />
            <Toggle checked={form.auto_approve_vip ?? false} onChange={(v) => update('auto_approve_vip', v)} label={t('visitors.settings.fields.autoApproveVip')} />
            <Toggle checked={form.require_nda ?? false} onChange={(v) => update('require_nda', v)} label={t('visitors.settings.fields.requireNda')} />
            <Toggle checked={form.require_photo ?? false} onChange={(v) => update('require_photo', v)} label={t('visitors.settings.fields.requirePhoto')} />
            <Toggle checked={form.require_national_id ?? false} onChange={(v) => update('require_national_id', v)} label={t('visitors.settings.fields.requireNationalId')} />
            <Toggle checked={form.require_phone ?? false} onChange={(v) => update('require_phone', v)} label={t('visitors.settings.fields.requirePhone')} />
            <Toggle checked={form.require_email ?? false} onChange={(v) => update('require_email', v)} label={t('visitors.settings.fields.requireEmail')} />
            <Toggle checked={form.require_company ?? false} onChange={(v) => update('require_company', v)} label={t('visitors.settings.fields.requireCompany')} />
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">{t('visitors.settings.sections.badge')}</h3>
          <div className="divide-y divide-border">
            <Toggle checked={form.badge_enabled ?? false} onChange={(v) => update('badge_enabled', v)} label={t('visitors.settings.fields.badgeEnabled')} />
            <Toggle checked={form.badge_auto_assign ?? false} onChange={(v) => update('badge_auto_assign', v)} label={t('visitors.settings.fields.badgeAutoAssign')} />
            <Toggle checked={form.notify_host_on_arrival ?? false} onChange={(v) => update('notify_host_on_arrival', v)} label={t('visitors.settings.fields.notifyHostOnArrival')} />
            <Toggle checked={form.notify_host_on_register ?? false} onChange={(v) => update('notify_host_on_register', v)} label={t('visitors.settings.fields.notifyHostOnRegister')} />
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">{t('visitors.settings.sections.selfService')}</h3>
          <div className="divide-y divide-border">
            <Toggle checked={form.self_service_enabled ?? false} onChange={(v) => update('self_service_enabled', v)} label={t('visitors.settings.fields.selfServiceEnabled')} />
            <Toggle checked={form.self_service_requires_qr ?? false} onChange={(v) => update('self_service_requires_qr', v)} label={t('visitors.settings.fields.selfServiceRequiresQr')} />
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">{t('visitors.settings.sections.limits')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-[12px]">{t('visitors.settings.fields.autoCheckoutHour')}</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                min={0}
                max={23}
                value={form.auto_checkout_hour ?? 18}
                onChange={(e) => update('auto_checkout_hour', Number(e.target.value))}
                data-testid="visitors-input-auto-checkout"
              />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.settings.fields.maxDurationHours')}</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                value={form.max_duration_hours ?? 24}
                onChange={(e) => update('max_duration_hours', Number(e.target.value))}
                data-testid="visitors-input-max-duration"
              />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.settings.fields.defaultDurationHours')}</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                value={form.default_duration_hours ?? 8}
                onChange={(e) => update('default_duration_hours', Number(e.target.value))}
                data-testid="visitors-input-default-duration"
              />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.settings.fields.noShowGraceMinutes')}</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                value={form.no_show_grace_minutes ?? 30}
                onChange={(e) => update('no_show_grace_minutes', Number(e.target.value))}
                data-testid="visitors-input-no-show-grace"
              />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.settings.fields.qrValidityBeforeHours')}</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                value={form.qr_validity_before_hours ?? 24}
                onChange={(e) => update('qr_validity_before_hours', Number(e.target.value))}
                data-testid="visitors-input-qr-before"
              />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.settings.fields.qrValidityAfterHours')}</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                value={form.qr_validity_after_hours ?? 2}
                onChange={(e) => update('qr_validity_after_hours', Number(e.target.value))}
                data-testid="visitors-input-qr-after"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
