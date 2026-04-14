import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Building2, ImageIcon, Info, Map, MapPin, Save, Upload, X } from 'lucide-react';
import { Button, Input, Label, Select, SelectOption } from '@dm3/ui';
import { toast } from '@/lib/toast';
import { useZones } from './hooks/useZones';
import { emptyZoneForm, zoneFormToData, zoneToForm, type ZoneFormState } from './zone-form';
import type { Zone } from './types';

interface ZoneFormPageProps {
  mode: 'create' | 'edit';
}

export function ZoneFormPage({ mode }: ZoneFormPageProps) {
  const { t } = useTranslation('zones');
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { zones, fetchZone, createZone, updateZone } = useZones();

  const isNew = mode === 'create';
  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ZoneFormState>(emptyZoneForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // The currently-loaded zone (only set in edit mode). We need this so the
  // map upload knows the zone id, and so we can render the title.
  const [zone, setZone] = useState<Zone | null>(null);

  const [mapUploading, setMapUploading] = useState(false);
  // Holds a file the user picked before the zone exists (create flow). On
  // first save, we POST the zone, then upload the file against the new id.
  const [pendingMapFile, setPendingMapFile] = useState<File | null>(null);
  const mapFileInputRef = useRef<HTMLInputElement>(null);

  // Load the zone on mount when editing.
  useEffect(() => {
    if (isNew || !id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const z = await fetchZone(id);
      if (cancelled) return;
      if (!z) {
        setError(t('toast.notFound', 'Zone not found'));
        setLoading(false);
        return;
      }
      setZone(z);
      setFormData(zoneToForm(z));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, isNew, fetchZone, t]);

  const handleFieldChange = (field: keyof ZoneFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = t('validation.nameRequired', 'Name is required');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Upload a freshly-picked file against an existing zone id. Returns the
  // updated zone shape from the API or null on failure.
  const uploadMapToZone = async (zoneID: string, file: File): Promise<Zone | null> => {
    setMapUploading(true);
    try {
      const fd = new FormData();
      fd.append('map', file);
      const token = localStorage.getItem('dm3-token') ?? '';
      const res = await fetch(`/api/v1/access/zones/${zoneID}/map/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Upload failed (${res.status})`);
      }
      const updated = await res.json() as Zone;
      return updated;
    } catch (err) {
      toast(err instanceof Error ? err.message : t('form.mapUploadFailed', 'Map upload failed'), 'error');
      return null;
    } finally {
      setMapUploading(false);
    }
  };

  const handleMapFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isNew && zone) {
      // Edit mode: upload immediately so the user sees the new image right away.
      const updated = await uploadMapToZone(zone.id, file);
      if (updated) {
        setZone(updated);
        setFormData((prev) => ({
          ...prev,
          map_image_url: updated.map_image_url ?? '',
          map_image_width: updated.map_width != null ? String(updated.map_width) : '',
          map_image_height: updated.map_height != null ? String(updated.map_height) : '',
        }));
        toast(t('form.mapUploadSuccess', 'Map image uploaded'), 'success');
      }
    } else {
      // Create mode: stage the file. Show local preview via blob URL so the
      // operator gets immediate feedback even though the upload is deferred
      // until the zone is saved.
      setPendingMapFile(file);
      const blobUrl = URL.createObjectURL(file);
      setFormData((prev) => ({ ...prev, map_image_url: blobUrl }));
    }
    if (mapFileInputRef.current) mapFileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      // Strip a stray blob: preview URL — it would never resolve server-side.
      const dataToSend = formData.map_image_url.startsWith('blob:')
        ? { ...formData, map_image_url: '' }
        : formData;

      if (isNew) {
        const created = await createZone(zoneFormToData(dataToSend));
        if (!created) {
          setSubmitting(false);
          return;
        }
        // If the operator picked a file before saving, upload it against the
        // new zone id now. The success toast above already fired; we just
        // chain a second toast for the upload.
        if (pendingMapFile) {
          const updated = await uploadMapToZone(created.id, pendingMapFile);
          if (updated) {
            toast(t('form.mapUploadSuccess', 'Map image uploaded'), 'success');
          }
          setPendingMapFile(null);
        }
        navigate('/access/zones');
      } else {
        if (!id) return;
        const ok = await updateZone(id, zoneFormToData(dataToSend));
        if (!ok) {
          setSubmitting(false);
          return;
        }
        navigate('/access/zones');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const Section = ({
    icon: Icon,
    title,
    desc,
    children,
  }: {
    icon: React.ElementType;
    title: string;
    desc: string;
    children: React.ReactNode;
  }) => (
    <div className="border border-border rounded-lg bg-card">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon size={16} className="text-primary" />
        </div>
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary mx-auto mt-16" />
      </div>
    );
  }

  if (!isNew && (error || !zone)) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-3xl">
        <div className="flex flex-col items-start gap-3 mt-16">
          <MapPin size={32} className="text-muted-foreground/40" />
          <p className="text-[13px] text-muted-foreground">{error ?? t('toast.notFound', 'Zone not found')}</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/access/zones')}>
            <ArrowLeft size={14} className="mr-1.5" /> {t('backToList', 'Back to zones')}
          </Button>
        </div>
      </div>
    );
  }

  const displayName = isNew
    ? t('createZone', 'Create Zone')
    : zone?.name ?? t('editZone', 'Edit Zone');

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden">
      {/* Pinned header — stays put while the form body scrolls below.
          Lives inside the parent <main> p-6, so we use minimal internal
          padding to avoid stacking margins. */}
      <div className="shrink-0 border-b border-border bg-background pb-3">
        <div className="max-w-3xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/access/zones')}
            className="mb-1.5 px-0 h-auto py-0 text-muted-foreground hover:text-foreground gap-1"
            disabled={submitting}
            data-testid="zone-button-back"
          >
            <ArrowLeft size={14} /> {t('backToList', 'Zones')}
          </Button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[18px] font-semibold text-foreground leading-tight">{displayName}</h1>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {isNew
                  ? t('description', 'Manage spatial zones, indoor maps, and access point layouts')
                  : t('editZoneSubtitle', 'Update the zone details and indoor map')}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => navigate('/access/zones')} disabled={submitting}>
                <X size={14} className="mr-1.5" /> {t('cancel', 'Cancel')}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={submitting} data-testid="zone-button-save">
                <Save size={14} className="mr-1.5" />
                {submitting ? t('saving', 'Saving…') : t('save', 'Save')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable form body */}
      <div className="min-h-0 flex-1 overflow-y-auto pt-4">
        <div className="max-w-3xl space-y-5">
          <Section
            icon={Info}
            title={t('form.section.identity', 'Identity')}
            desc={t('form.section.identityDesc', 'Name, description, and parent zone')}
          >
            <div className="space-y-4">
            <div>
              <Label htmlFor="zone-name" className="text-[12px]">{t('form.name', 'Name')} *</Label>
              <Input
                id="zone-name"
                value={formData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                placeholder={t('form.namePlaceholder', 'Zone name')}
                className={`mt-1 ${formErrors.name ? 'border-destructive' : ''}`}
                disabled={submitting}
              />
              {formErrors.name && <p className="mt-1 text-[12px] text-destructive">{formErrors.name}</p>}
            </div>
            <div>
              <Label htmlFor="zone-description" className="text-[12px]">{t('form.description', 'Description')}</Label>
              <Input
                id="zone-description"
                value={formData.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                placeholder={t('form.descriptionPlaceholder', 'Optional description')}
                className="mt-1"
                disabled={submitting}
              />
            </div>
            <div>
              <Label className="text-[12px]">{t('form.parentZone', 'Parent Zone')}</Label>
              <Select
                value={formData.parent_id}
                onValueChange={(value) => handleFieldChange('parent_id', value)}
                disabled={submitting}
                className="mt-1"
              >
                <SelectOption value="">{t('form.noParent', 'No parent (top-level)')}</SelectOption>
                {zones.filter((z) => !zone || z.id !== zone.id).map((z) => (
                  <SelectOption key={z.id} value={z.id}>{z.name}</SelectOption>
                ))}
              </Select>
            </div>
            </div>
          </Section>

          <Section
            icon={Building2}
            title={t('form.section.location', 'Location')}
            desc={t('form.section.locationDesc', 'Timezone, address, and geographic coordinates')}
          >
            <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">{t('form.timezone', 'Timezone')}</Label>
                <Input
                  value={formData.timezone}
                  onChange={(e) => handleFieldChange('timezone', e.target.value)}
                  placeholder={t('form.timezonePlaceholder', 'e.g. Asia/Ho_Chi_Minh')}
                  className="mt-1"
                  disabled={submitting}
                />
              </div>
              <div>
                <Label className="text-[12px]">{t('form.address', 'Address')}</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => handleFieldChange('address', e.target.value)}
                  placeholder={t('form.addressPlaceholder', 'Street, city')}
                  className="mt-1"
                  disabled={submitting}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">{t('form.building', 'Building')}</Label>
                <Input
                  value={formData.building}
                  onChange={(e) => handleFieldChange('building', e.target.value)}
                  placeholder={t('form.buildingPlaceholder', 'e.g. Building A')}
                  className="mt-1"
                  disabled={submitting}
                />
              </div>
              <div>
                <Label className="text-[12px]">{t('form.floor', 'Floor')}</Label>
                <Input
                  value={formData.floor}
                  onChange={(e) => handleFieldChange('floor', e.target.value)}
                  placeholder={t('form.floorPlaceholder', 'e.g. 3')}
                  className="mt-1"
                  disabled={submitting}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">{t('form.geoLat', 'Latitude')}</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.geo_lat}
                  onChange={(e) => handleFieldChange('geo_lat', e.target.value)}
                  placeholder="10.7769"
                  className="mt-1 font-mono"
                  disabled={submitting}
                />
              </div>
              <div>
                <Label className="text-[12px]">{t('form.geoLng', 'Longitude')}</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.geo_lng}
                  onChange={(e) => handleFieldChange('geo_lng', e.target.value)}
                  placeholder="106.7009"
                  className="mt-1 font-mono"
                  disabled={submitting}
                />
              </div>
            </div>
            </div>
          </Section>

          <Section
            icon={Map}
            title={t('form.section.map', 'Indoor map')}
            desc={t('form.section.mapDesc', 'Floor plan image and pixel dimensions')}
          >
            <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[12px]">{t('form.mapImageUrl', 'Map image URL')}</Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={mapFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif"
                    className="hidden"
                    onChange={handleMapFile}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => mapFileInputRef.current?.click()}
                    disabled={submitting || mapUploading}
                    className="h-7 gap-1.5 text-[11px]"
                  >
                    {mapUploading ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        {t('form.mapUploading', 'Uploading…')}
                      </>
                    ) : (
                      <>
                        <Upload size={12} />
                        {t('form.mapUploadButton', 'Upload image')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <Input
                value={formData.map_image_url}
                onChange={(e) => handleFieldChange('map_image_url', e.target.value)}
                placeholder={t('form.mapImageUrlPlaceholder', 'https://… or /maps/floor-3.png')}
                className="mt-1"
                disabled={submitting || mapUploading}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {pendingMapFile
                  ? t('form.mapUploadPending', 'Image will be uploaded after the zone is saved')
                  : t('form.mapImageUrlHint', 'Floor plan image used in the indoor map view')}
              </p>
              {formData.map_image_url && (
                <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-card p-2">
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
                    <img
                      src={formData.map_image_url}
                      alt="map preview"
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                        const sibling = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (sibling) sibling.style.display = 'flex';
                      }}
                    />
                    <div className="hidden h-full w-full items-center justify-center text-muted-foreground">
                      <ImageIcon size={20} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-mono text-muted-foreground" title={formData.map_image_url}>
                      {formData.map_image_url}
                    </div>
                    {(formData.map_image_width || formData.map_image_height) && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {formData.map_image_width || '?'} × {formData.map_image_height || '?'} px
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">{t('form.mapWidth', 'Map width (px)')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.map_image_width}
                  onChange={(e) => handleFieldChange('map_image_width', e.target.value)}
                  placeholder="1920"
                  className="mt-1 font-mono"
                  disabled={submitting}
                />
              </div>
              <div>
                <Label className="text-[12px]">{t('form.mapHeight', 'Map height (px)')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.map_image_height}
                  onChange={(e) => handleFieldChange('map_image_height', e.target.value)}
                  placeholder="1080"
                  className="mt-1 font-mono"
                  disabled={submitting}
                />
              </div>
            </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
