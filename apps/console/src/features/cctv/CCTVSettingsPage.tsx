import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Button, Input, Label } from '@dm3/ui';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import {
  getCCTVSettings,
  updateCCTVSettings,
  type UpdateCCTVSettingsRequest,
} from '@dm3/api-client';

export function CCTVSettingsPage() {
  const { t } = useTranslation('common');
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['cctv-settings'],
    queryFn: () => getCCTVSettings(),
  });

  const [form, setForm] = useState<UpdateCCTVSettingsRequest>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        retention_days: settings.retention_days,
        pre_roll_sec_default: settings.pre_roll_sec_default,
        post_roll_sec_default: settings.post_roll_sec_default,
        storage_quota_gb: settings.storage_quota_gb,
      });
      setDirty(false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => updateCCTVSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cctv-settings'] });
      setDirty(false);
    },
  });

  const update = <K extends keyof UpdateCCTVSettingsRequest>(
    key: K,
    value: UpdateCCTVSettingsRequest[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title={t('cctv.settings.title')}
          description={t('cctv.settings.description')}
        />
        <div className="text-center py-12 text-muted-foreground">{t('cctv.common.loading')}</div>
      </div>
    );
  }

  const maxDays = settings?.retention_days_max ?? 365;

  return (
    <div>
      <PageHeader title={t('cctv.settings.title')} description={t('cctv.settings.description')}>
        <Button
          size="sm"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="bg-[#3B82F6] hover:bg-[#2563EB]"
          data-testid="cctv-button-save-settings"
        >
          <Save size={16} className="mr-1" />
          {saveMutation.isPending ? t('cctv.common.saving') : t('cctv.settings.save')}
        </Button>
      </PageHeader>

      <div className="max-w-2xl space-y-6">
        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">{t('cctv.settings.retentionSection')}</h3>
          <div className="space-y-4">
            <div>
              <Label className="text-[12px]">
                {t('cctv.settings.retentionDays')} (1–{maxDays})
              </Label>
              <div className="flex items-center gap-3 mt-1">
                <input
                  type="range"
                  min={1}
                  max={maxDays}
                  value={form.retention_days ?? 30}
                  onChange={(e) => update('retention_days', Number(e.target.value))}
                  className="flex-1 accent-[#3B82F6]"
                  data-testid="cctv-slider-retention-days"
                />
                <span className="w-16 text-right text-[13px] font-mono">
                  {form.retention_days ?? 30}d
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">{t('cctv.settings.rollSection')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-[12px]">{t('cctv.settings.preRollDefault')} (s)</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                min={0}
                max={60}
                value={form.pre_roll_sec_default ?? 10}
                onChange={(e) => update('pre_roll_sec_default', Number(e.target.value))}
                data-testid="cctv-input-pre-roll-default"
              />
            </div>
            <div>
              <Label className="text-[12px]">{t('cctv.settings.postRollDefault')} (s)</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                min={0}
                max={60}
                value={form.post_roll_sec_default ?? 10}
                onChange={(e) => update('post_roll_sec_default', Number(e.target.value))}
                data-testid="cctv-input-post-roll-default"
              />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">{t('cctv.settings.storageSection')}</h3>
          <div>
            <Label className="text-[12px]">{t('cctv.settings.storageQuota')} (GB)</Label>
            <Input
              type="number"
              className="mt-1 h-8 text-[13px]"
              min={1}
              value={form.storage_quota_gb ?? 100}
              onChange={(e) => update('storage_quota_gb', Number(e.target.value))}
              data-testid="cctv-input-storage-quota"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
