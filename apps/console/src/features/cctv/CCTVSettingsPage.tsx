import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Button, Input, Label, Select, SelectOption } from '@dm3/ui';
import { useTranslation } from 'react-i18next';
import { Save, RefreshCw, Eye, EyeOff } from 'lucide-react';
import {
  getCCTVSettings,
  updateCCTVSettings,
  listHanetPlaces,
  type UpdateCCTVSettingsRequest,
  type HanetPlaceDTO,
} from '@dm3/api-client';

const HANET_DEFAULT_SERVER = 'https://partner.hanet.ai';

export function CCTVSettingsPage() {
  const { t } = useTranslation('common');
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['cctv-settings'],
    queryFn: () => getCCTVSettings(),
  });

  const [form, setForm] = useState<UpdateCCTVSettingsRequest>({});
  const [dirty, setDirty] = useState(false);

  // Secret inputs (client_secret, access_token, refresh_token) start blank
  // every time the page loads — the server never returns the plaintext. The
  // `has_*` flags on `settings` tell us whether a value is currently stored.
  // A blank input submitted in the form is ignored (undefined => keep
  // existing); typing anything sets the replacement; explicit clear is via
  // the trash button next to each secret row.
  const [showSecrets, setShowSecrets] = useState<{ [k in 'client_secret' | 'access_token' | 'refresh_token']: boolean }>(
    { client_secret: false, access_token: false, refresh_token: false },
  );

  useEffect(() => {
    if (settings) {
      setForm({
        retention_days: settings.retention_days,
        pre_roll_sec_default: settings.pre_roll_sec_default,
        post_roll_sec_default: settings.post_roll_sec_default,
        storage_quota_gb: settings.storage_quota_gb,
        hanet_client_id: settings.hanet_client_id,
        hanet_server_url: settings.hanet_server_url || HANET_DEFAULT_SERVER,
        hanet_place_id: settings.hanet_place_id,
      });
      setDirty(false);
    }
  }, [settings]);

  // Place list. Fetched lazily — pressing the refresh icon or the first
  // render when an access token is present. 412 from the server means
  // "no access token configured yet" — we surface that as a hint.
  const placesQuery = useQuery({
    queryKey: ['cctv-hanet-places'],
    queryFn: () => listHanetPlaces(),
    enabled: !!settings?.has_hanet_access_token,
    retry: false,
  });
  const places: HanetPlaceDTO[] = Array.isArray(placesQuery.data) ? placesQuery.data : [];

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
    <div className="flex h-full min-h-0 flex-col">
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

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="max-w-2xl space-y-6 pb-6">
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
              <p
                className="mt-2 text-[11px] text-muted-foreground"
                data-testid="cctv-hint-retention-max"
              >
                {t('cctv.settings.retentionMaxHint', { max: maxDays })}
              </p>
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

        {/*
          Event capture section — governs the rolling buffer, coalescer cap,
          worker pool size, and the tenant-wide default action taken when no
          event_rule matches. Per-event fine-grained rules live in the
          separate Event Rules page; these are the fallbacks.
        */}
        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-3">Event capture</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-[12px]">Rolling buffer (s) — 0 disables</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                min={0}
                max={300}
                value={form.rolling_buffer_sec ?? 30}
                onChange={(e) => update('rolling_buffer_sec', Number(e.target.value))}
                data-testid="cctv-input-rolling-buffer"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Disk dung lượng thường trực ≈ bitrate × giá trị này × số cam.
              </p>
            </div>
            <div>
              <Label className="text-[12px]">Max clip duration (s)</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                min={30}
                max={3600}
                value={form.max_clip_duration_sec ?? 600}
                onChange={(e) => update('max_clip_duration_sec', Number(e.target.value))}
                data-testid="cctv-input-max-clip-duration"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Coalesced clip đạt ngưỡng này sẽ finalize và clip mới được mở.
              </p>
            </div>
            <div>
              <Label className="text-[12px]">Max concurrent extractions</Label>
              <Input
                type="number"
                className="mt-1 h-8 text-[13px]"
                min={1}
                max={64}
                value={form.max_concurrent_extractions ?? 8}
                onChange={(e) => update('max_concurrent_extractions', Number(e.target.value))}
                data-testid="cctv-input-max-concurrent-extractions"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Cap số ffmpeg job cùng lúc khi có event burst.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-5">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={form.default_record_enabled ?? true}
                  onChange={(e) => update('default_record_enabled', e.target.checked)}
                  data-testid="cctv-check-default-record"
                /> Default: record video on access events
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={form.default_snapshot_enabled ?? false}
                  onChange={(e) => update('default_snapshot_enabled', e.target.checked)}
                  data-testid="cctv-check-default-snapshot"
                /> Default: snapshot on access events
              </label>
            </div>
          </div>
        </section>

        {/* ── Hanet integration ────────────────────────────────────────── */}
        <section className="rounded-lg border border-border p-4">
          <h3 className="text-[13px] font-semibold mb-1">
            {t('cctv.settings.hanetSection', 'Hanet integration')}
          </h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            {t(
              'cctv.settings.hanetHint',
              'OAuth credentials for Hanet partner API. Tokens are encrypted at rest and never shown again after saving.',
            )}
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="text-[12px]">{t('cctv.settings.hanetServerURL', 'Server URL')}</Label>
              <Input
                type="text"
                className="mt-1 h-8 text-[13px] font-mono"
                placeholder={HANET_DEFAULT_SERVER}
                value={form.hanet_server_url ?? ''}
                onChange={(e) => update('hanet_server_url', e.target.value)}
                data-testid="cctv-input-hanet-server-url"
              />
            </div>
            <div>
              <Label className="text-[12px]">{t('cctv.settings.hanetClientID', 'Client ID')}</Label>
              <Input
                type="text"
                className="mt-1 h-8 text-[13px] font-mono"
                value={form.hanet_client_id ?? ''}
                onChange={(e) => update('hanet_client_id', e.target.value)}
                data-testid="cctv-input-hanet-client-id"
              />
            </div>
            <SecretInput
              label={t('cctv.settings.hanetClientSecret', 'Client Secret')}
              testid="cctv-input-hanet-client-secret"
              hasValue={!!settings?.has_hanet_client_secret}
              visible={showSecrets.client_secret}
              onToggleVisible={() =>
                setShowSecrets((s) => ({ ...s, client_secret: !s.client_secret }))
              }
              onChange={(v) => update('hanet_client_secret', v)}
            />
            <SecretInput
              label={t('cctv.settings.hanetAccessToken', 'Access Token')}
              testid="cctv-input-hanet-access-token"
              hasValue={!!settings?.has_hanet_access_token}
              visible={showSecrets.access_token}
              onToggleVisible={() =>
                setShowSecrets((s) => ({ ...s, access_token: !s.access_token }))
              }
              onChange={(v) => update('hanet_access_token', v)}
            />
            <SecretInput
              label={t('cctv.settings.hanetRefreshToken', 'Refresh Token')}
              testid="cctv-input-hanet-refresh-token"
              hasValue={!!settings?.has_hanet_refresh_token}
              visible={showSecrets.refresh_token}
              onToggleVisible={() =>
                setShowSecrets((s) => ({ ...s, refresh_token: !s.refresh_token }))
              }
              onChange={(v) => update('hanet_refresh_token', v)}
            />
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-[12px]">{t('cctv.settings.hanetPlaceID', 'Place')}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px] text-muted-foreground"
                  disabled={!settings?.has_hanet_access_token || placesQuery.isFetching}
                  onClick={() => placesQuery.refetch()}
                  data-testid="cctv-button-refresh-hanet-places"
                >
                  <RefreshCw
                    size={12}
                    className={`mr-1 ${placesQuery.isFetching ? 'animate-spin' : ''}`}
                  />
                  {t('cctv.settings.hanetRefreshPlaces', 'Reload places')}
                </Button>
              </div>
              {settings?.has_hanet_access_token ? (
                // Children must be a flat list of <SelectOption>. Don't wrap
                // the populated branch in a Fragment — @dm3/ui's Select uses
                // React.Children.toArray, which keeps Fragments as a single
                // element and then concatenates all inner labels into one
                // option (the "all 8 places merged into 1 row" bug).
                <Select
                  value={form.hanet_place_id ?? ''}
                  onValueChange={(v) => update('hanet_place_id', v)}
                  data-testid="cctv-select-hanet-place"
                  disabled={places.length === 0}
                >
                  {places.length === 0 && (
                    <SelectOption value="">
                      {placesQuery.isFetching
                        ? t('cctv.settings.hanetPlacesLoading', 'Loading places…')
                        : t('cctv.settings.hanetPlacesEmpty', 'No places returned by Hanet')}
                    </SelectOption>
                  )}
                  {places.length > 0 && (
                    <SelectOption value="">
                      {t('cctv.settings.hanetPlacesChoose', '— select a place —')}
                    </SelectOption>
                  )}
                  {places.map((p) => (
                    <SelectOption key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </SelectOption>
                  ))}
                </Select>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  {t(
                    'cctv.settings.hanetPlacesNeedToken',
                    'Save an access token first, then reload to populate the place list.',
                  )}
                </p>
              )}
              {placesQuery.isError && (
                <p className="mt-1 text-[11px] text-red-400">
                  {(placesQuery.error as Error | undefined)?.message ??
                    t('cctv.settings.hanetPlacesError', 'Hanet request failed')}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
      </div>
    </div>
  );
}

// SecretInput is a one-line field with a show/hide toggle. When a secret is
// already stored server-side (`hasValue`), we keep the input empty and
// placeholder-hint the user so they know blanks = "no change". Typing
// anything marks the form dirty and sends the new value on Save; submitting
// `""` explicitly via the Clear button — not implemented here for now since
// the user can always overwrite by typing. If full clearing is needed later,
// add a trash button that calls `onChange('')`.
function SecretInput({
  label,
  testid,
  hasValue,
  visible,
  onToggleVisible,
  onChange,
}: {
  label: string;
  testid: string;
  hasValue: boolean;
  visible: boolean;
  onToggleVisible: () => void;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState('');
  return (
    <div>
      <Label className="text-[12px]">{label}</Label>
      <div className="relative mt-1">
        <Input
          type={visible ? 'text' : 'password'}
          className="h-8 text-[13px] font-mono pr-8"
          placeholder={hasValue ? '•••••••• (stored)' : ''}
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            onChange(e.target.value);
          }}
          data-testid={testid}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 px-2 text-muted-foreground hover:text-foreground"
          onClick={onToggleVisible}
          tabIndex={-1}
          data-testid={`${testid}-toggle`}
          aria-label={visible ? 'Hide' : 'Show'}
        >
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}
