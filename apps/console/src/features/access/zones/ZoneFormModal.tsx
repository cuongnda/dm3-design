import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon, MapPin, Upload, X } from 'lucide-react';
import { AppModal, Button, Input, Label, Select, SelectOption } from '@dm3/ui';
import { authenticatedUrl, getToken } from '@dm3/api-client';
import { toast } from '@/lib/toast';
import { useZones } from './hooks/useZones';
import { emptyZoneForm, zoneFormToData, type ZoneFormState } from './zone-form';
import { ZONE_TYPES, type Zone, type ZoneType } from './types';

interface ZoneFormModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated?: (zone: Zone) => void;
}

export function ZoneFormModal({ open, onOpenChange, onCreated }: ZoneFormModalProps) {
    const { t } = useTranslation('zones');
    const { zones, createZone } = useZones();

    const [formData, setFormData] = useState<ZoneFormState>(emptyZoneForm);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [pendingMapFile, setPendingMapFile] = useState<File | null>(null);
    const [previewLoadFailed, setPreviewLoadFailed] = useState(false);
    const [mapUploading, setMapUploading] = useState(false);
    const mapFileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) return;
        // Reset everything when the modal closes so the next open starts fresh.
        setFormData(emptyZoneForm);
        setFormErrors({});
        setSubmitting(false);
        setPendingMapFile(null);
        setPreviewLoadFailed(false);
        setMapUploading(false);
    }, [open]);

    const handleField = (field: keyof ZoneFormState, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: '' }));
    };

    const validate = (): boolean => {
        const errors: Record<string, string> = {};
        if (!formData.name.trim()) errors.name = t('validation.nameRequired', 'Name is required');
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleMapFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPendingMapFile(file);
        const blobUrl = URL.createObjectURL(file);
        setFormData((prev) => ({ ...prev, map_image_url: blobUrl }));
        setPreviewLoadFailed(false);
        if (mapFileInputRef.current) mapFileInputRef.current.value = '';
    };

    const clearMapFile = () => {
        setPendingMapFile(null);
        setFormData((prev) => ({ ...prev, map_image_url: '' }));
        setPreviewLoadFailed(false);
    };

    const uploadMapToZone = async (zoneID: string, file: File): Promise<boolean> => {
        setMapUploading(true);
        try {
            const fd = new FormData();
            fd.append('map', file);
            const token = getToken() ?? '';
            const res = await fetch(`/api/v1/access/zones/${zoneID}/map/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || `Upload failed (${res.status})`);
            }
            return true;
        } catch (err) {
            toast(
                err instanceof Error ? err.message : t('form.mapUploadFailed', 'Map upload failed'),
                'error',
            );
            return false;
        } finally {
            setMapUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        setSubmitting(true);
        try {
            // A blob: URL only exists client-side — strip it from the create
            // payload. The map upload happens as a second request against the
            // newly-created zone id.
            const dataToSend = formData.map_image_url.startsWith('blob:')
                ? { ...formData, map_image_url: '' }
                : formData;

            const created = await createZone(zoneFormToData(dataToSend));
            if (!created) return;

            if (pendingMapFile) {
                const ok = await uploadMapToZone(created.id, pendingMapFile);
                if (ok) toast(t('form.mapUploadSuccess', 'Map image uploaded'), 'success');
            }

            onCreated?.(created);
            onOpenChange(false);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AppModal
            open={open}
            onOpenChange={onOpenChange}
            title={
                <span className="flex items-center gap-2">
                    <MapPin size={16} className="text-primary" />
                    {t('createZone', 'Create Zone')}
                </span>
            }
            description={t('createZoneDescription', 'Add a new spatial zone to the tree')}
            size="xl"
            showCancelButton
            cancelLabel={t('cancel', 'Cancel')}
            cancelDisabled={submitting || mapUploading}
            submitDisabled={submitting || !formData.name.trim()}
            primaryAction={{
                label: submitting
                    ? t('creating', 'Creating…')
                    : t('create', 'Create'),
                onClick: handleSubmit,
                loading: submitting || mapUploading,
                'data-testid': 'zone-button-submit',
            }}
        >
            <div className="space-y-4">
                <div>
                    <Label htmlFor="zone-modal-name" className="text-[12px]">
                        {t('form.name', 'Name')} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="zone-modal-name"
                        data-testid="zone-input-name"
                        value={formData.name}
                        onChange={(e) => handleField('name', e.target.value)}
                        placeholder={t('form.namePlaceholder', 'Zone name')}
                        className={`mt-1 ${formErrors.name ? 'border-destructive' : ''}`}
                        disabled={submitting}
                        autoFocus
                    />
                    {formErrors.name && (
                        <p className="mt-1 text-[12px] text-destructive">{formErrors.name}</p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label className="text-[12px]">{t('form.type', 'Type')}</Label>
                        <Select
                            value={formData.type}
                            onValueChange={(value) => handleField('type', value as ZoneType)}
                            disabled={submitting}
                            className="mt-1"
                        >
                            {ZONE_TYPES.map((zt) => (
                                <SelectOption key={zt} value={zt}>
                                    {zt.charAt(0).toUpperCase() + zt.slice(1)}
                                </SelectOption>
                            ))}
                        </Select>
                    </div>
                    <div>
                        <Label className="text-[12px]">{t('form.parentZone', 'Parent Zone')}</Label>
                        <Select
                            value={formData.parent_id}
                            onValueChange={(value) => handleField('parent_id', value)}
                            disabled={submitting}
                            className="mt-1"
                        >
                            <SelectOption value="">
                                {t('form.noParent', 'No parent (top-level)')}
                            </SelectOption>
                            {zones.map((z) => (
                                <SelectOption key={z.id} value={z.id}>
                                    {z.name}
                                </SelectOption>
                            ))}
                        </Select>
                    </div>
                </div>

                <div>
                    <Label htmlFor="zone-modal-description" className="text-[12px]">
                        {t('form.description', 'Description')}
                    </Label>
                    <Input
                        id="zone-modal-description"
                        data-testid="zone-input-description"
                        value={formData.description}
                        onChange={(e) => handleField('description', e.target.value)}
                        placeholder={t('form.descriptionPlaceholder', 'Optional description')}
                        className="mt-1"
                        disabled={submitting}
                    />
                </div>

                <div>
                    <Label className="text-[12px]">{t('form.address', 'Address')}</Label>
                    <Input
                        value={formData.address}
                        onChange={(e) => handleField('address', e.target.value)}
                        placeholder={t('form.addressPlaceholder', 'Street, city')}
                        className="mt-1"
                        disabled={submitting}
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label className="text-[12px]">{t('form.building', 'Building')}</Label>
                        <Input
                            value={formData.building}
                            onChange={(e) => handleField('building', e.target.value)}
                            placeholder={t('form.buildingPlaceholder', 'e.g. Building A')}
                            className="mt-1"
                            disabled={submitting}
                        />
                    </div>
                    <div>
                        <Label className="text-[12px]">{t('form.floor', 'Floor')}</Label>
                        <Input
                            value={formData.floor}
                            onChange={(e) => handleField('floor', e.target.value)}
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
                            onChange={(e) => handleField('geo_lat', e.target.value)}
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
                            onChange={(e) => handleField('geo_lng', e.target.value)}
                            placeholder="106.7009"
                            className="mt-1 font-mono"
                            disabled={submitting}
                        />
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between">
                        <Label className="text-[12px]">{t('form.mapImage', 'Map image')}</Label>
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
                                <Upload size={12} />
                                {t('form.mapUploadButton', 'Upload image')}
                            </Button>
                            {formData.map_image_url ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearMapFile}
                                    disabled={submitting || mapUploading}
                                    className="h-7 w-7 p-0"
                                >
                                    <X size={12} />
                                </Button>
                            ) : null}
                        </div>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        {pendingMapFile
                            ? t(
                                  'form.mapUploadPending',
                                  'Image will be uploaded after the zone is saved',
                              )
                            : t(
                                  'form.mapImageUrlHint',
                                  'Floor plan image used in the indoor map view',
                              )}
                    </p>
                    {formData.map_image_url ? (
                        <div className="mt-2 rounded-md border border-border bg-muted p-2">
                            <div className="flex min-h-[140px] items-center justify-center overflow-hidden rounded">
                                {previewLoadFailed ? (
                                    <div className="flex h-[140px] w-full items-center justify-center text-muted-foreground">
                                        <ImageIcon size={28} />
                                    </div>
                                ) : (
                                    <img
                                        key={formData.map_image_url}
                                        src={authenticatedUrl(formData.map_image_url)}
                                        alt="map preview"
                                        className="max-h-[220px] w-full object-contain"
                                        onError={() => setPreviewLoadFailed(true)}
                                    />
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </AppModal>
    );
}
