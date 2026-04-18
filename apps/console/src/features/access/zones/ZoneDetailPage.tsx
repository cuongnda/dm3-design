import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Crosshair, Map, MapPin, Network, Plus, Save } from 'lucide-react';
import { AppModal, Badge, Button, Card, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger, useBreadcrumbStore } from '@dm3/ui';
import { authenticatedUrl } from '@dm3/api-client';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Zone, ZoneMapResponse } from './types';

interface ZonesResponse {
  data?: Zone[];
}

export function ZoneDetailPage() {
  const { t } = useTranslation('zones');
  const { id } = useParams<{ id: string }>();
  const setLabel = useBreadcrumbStore((s) => s.setLabel);
  const clearLabel = useBreadcrumbStore((s) => s.clearLabel);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<string | null>(null);

  const [zone, setZone] = useState<Zone | null>(null);
  const [allZones, setAllZones] = useState<Zone[]>([]);
  const [layoutData, setLayoutData] = useState<ZoneMapResponse | null>(null);
  const [draftPositions, setDraftPositions] = useState<Record<string, { map_x: number; map_y: number }>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('list');
  const [mapImageFailed, setMapImageFailed] = useState(false);
  // "Add Access Point" dialog state. Scoped here (rather than a shared hook)
  // because this page already owns the zone-scoped data refresh.
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createNameError, setCreateNameError] = useState('');
  const draftPositionsRef = useRef<Record<string, { map_x: number; map_y: number }>>({});

  useEffect(() => { draftPositionsRef.current = draftPositions; }, [draftPositions]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [zoneRes, mapRes, zonesRes] = await Promise.all([
        apiFetch<Zone>(`/api/v1/access/zones/${id}`),
        apiFetch<ZoneMapResponse>(`/api/v1/access/zones/${id}/map`),
        apiFetch<ZonesResponse>('/api/v1/access/zones?limit=200'),
      ]);
      setZone(zoneRes);
      setLayoutData(mapRes);
      setAllZones(zonesRes.data ?? []);
      setMapImageFailed(false);
      const nextDrafts = Object.fromEntries((mapRes.access_points ?? []).map((point) => [point.id, { map_x: point.map_x ?? 0.5, map_y: point.map_y ?? 0.5 }]));
      setDraftPositions(nextDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load zone');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (id && zone?.name) setLabel(id, zone.name);
    return () => { if (id) clearLabel(id); };
  }, [id, zone?.name, setLabel, clearLabel]);

  const childZones = useMemo(() => allZones.filter((item) => item.parent_id === zone?.id), [allZones, zone?.id]);
  const parentZone = useMemo(() => allZones.find((item) => item.id === zone?.parent_id), [allZones, zone?.parent_id]);
  const accessPoints = layoutData?.access_points ?? [];

  const updateDraftFromPointer = useCallback((clientX: number, clientY: number) => {
    const pointId = draggingRef.current;
    const mapElement = mapRef.current;
    if (!pointId || !mapElement) return;
    const rect = mapElement.getBoundingClientRect();
    const nextX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const nextY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    setDraftPositions((prev) => ({ ...prev, [pointId]: { map_x: Number(nextX.toFixed(3)), map_y: Number(nextY.toFixed(3)) } }));
  }, []);

  // Only POST the access points whose draft position actually differs from
  // what's currently persisted server-side. Uses a small epsilon so fp noise
  // from the drag math doesn't trip the check.
  const dirtyPointIds = useMemo(() => {
    const out: string[] = [];
    for (const ap of accessPoints) {
      const draft = draftPositions[ap.id];
      if (!draft) continue;
      const serverX = ap.map_x ?? 0.5;
      const serverY = ap.map_y ?? 0.5;
      if (Math.abs(draft.map_x - serverX) > 1e-4 || Math.abs(draft.map_y - serverY) > 1e-4) {
        out.push(ap.id);
      }
    }
    return out;
  }, [accessPoints, draftPositions]);

  const saveAllPositions = useCallback(async () => {
    if (!id) return;
    const ids = dirtyPointIds;
    if (ids.length === 0) return;
    setSaveError(null);
    setSavingAll(true);
    try {
      await Promise.all(ids.map((pointId) => {
        const draft = draftPositionsRef.current[pointId];
        if (!draft) return Promise.resolve();
        return apiFetch(`/api/v1/access/access-points/${pointId}`, {
          method: 'PUT',
          body: JSON.stringify({ zone_id: id, map_x: draft.map_x, map_y: draft.map_y }),
        });
      }));
      const refreshed = await apiFetch<ZoneMapResponse>(`/api/v1/access/zones/${id}/map`);
      setLayoutData(refreshed);
      setDraftPositions(Object.fromEntries((refreshed.access_points ?? []).map((point) => [point.id, { map_x: point.map_x ?? 0.5, map_y: point.map_y ?? 0.5 }])));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save access point positions');
    } finally {
      setSavingAll(false);
    }
  }, [id, dirtyPointIds]);

  const resetCreateForm = useCallback(() => {
    setCreateName('');
    setCreateDescription('');
    setCreateNameError('');
    setCreateSubmitting(false);
  }, []);

  const handleCreateOpenChange = useCallback((next: boolean) => {
    setCreateOpen(next);
    if (!next) resetCreateForm();
  }, [resetCreateForm]);

  const handleCreateAccessPoint = useCallback(async () => {
    if (!id) return;
    const name = createName.trim();
    if (!name) {
      setCreateNameError(t('validation.nameRequired', 'Name is required'));
      return;
    }
    setCreateSubmitting(true);
    try {
      await apiFetch('/api/v1/access/access-points', {
        method: 'POST',
        body: JSON.stringify({
          name,
          zone_id: id,
          ...(createDescription.trim() && { description: createDescription.trim() }),
        }),
      });
      toast(t('detail.createdAccessPoint', 'Access point created'), 'success');
      setCreateOpen(false);
      resetCreateForm();
      await fetchData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create access point', 'error');
    } finally {
      setCreateSubmitting(false);
    }
  }, [id, createName, createDescription, fetchData, resetCreateForm, t]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => updateDraftFromPointer(event.clientX, event.clientY);
    const handlePointerUp = () => {
      draggingRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [updateDraftFromPointer]);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /></div>;
  }

  if (error || !zone || !layoutData) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/access/zones"><ArrowLeft size={14} className="mr-1.5" />{t('backToList', 'Back to Zones')}</Link>
        </Button>
        <Card className="p-6 text-sm text-destructive">{error ?? t('detail.notFound', 'Zone not found')}</Card>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button asChild variant="outline" size="sm" data-testid="zone-detail-back">
            <Link to="/access/zones"><ArrowLeft size={14} className="mr-1.5" />{t('backToList', 'Back to Zones')}</Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[20px] font-semibold text-foreground">{zone.name}</h1>
              <Badge variant="secondary">{accessPoints.length} {t('summary.accessPoints', 'APs')}</Badge>
              {layoutData.zone.map_image_url ? <Badge variant="default">{t('badges.mapReady', 'Map ready')}</Badge> : <Badge variant="outline">{t('badges.noMap', 'No map')}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{zone.description || t('detail.noDescription', 'No description')}</p>
          </div>
        </div>
        <div className="grid gap-2 text-right text-xs text-muted-foreground">
          <span>{t('parentLabel', 'Parent')}: {parentZone?.name || '—'}</span>
          <span>{t('detail.location', 'Location')}: {zone.building || '—'} / {zone.floor || '—'}</span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
            <TabsList variant="line">
              <TabsTrigger value="list" className="text-[12px] px-3 whitespace-nowrap" data-testid="zone-detail-tab-list">
                <Network size={14} className="mr-1.5" />
                {t('detail.listView', 'List View')}
              </TabsTrigger>
              <TabsTrigger value="map" className="text-[12px] px-3 whitespace-nowrap" data-testid="zone-detail-tab-map">
                <Map size={14} className="mr-1.5" />
                {t('detail.mapView', 'Map View')}
              </TabsTrigger>
            </TabsList>
            {activeTab === 'map' ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline">{t('detail.mapHint', 'Drag markers to reposition access points')}</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateOpen(true)}
                  data-testid="zone-detail-add-ap-map"
                >
                  <Plus size={14} className="mr-1.5" />
                  {t('detail.addAccessPoint', 'Add access point')}
                </Button>
                <Button
                  size="sm"
                  onClick={saveAllPositions}
                  disabled={savingAll || dirtyPointIds.length === 0}
                  data-testid="zone-detail-save-all"
                >
                  <Save size={14} className="mr-1.5" />
                  {savingAll
                    ? t('saving', 'Saving...')
                    : dirtyPointIds.length > 0
                      ? t('detail.saveAllPositions', 'Save ({{count}})', { count: dirtyPointIds.length })
                      : t('detail.savePositions', 'Save positions')}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
                data-testid="zone-detail-add-ap"
              >
                <Plus size={14} className="mr-1.5" />
                {t('detail.addAccessPoint', 'Add access point')}
              </Button>
            )}
          </div>

          <TabsContent value="list" className="mt-0 min-h-0 flex-1 overflow-auto p-4">
              <div className="overflow-hidden rounded-xl border border-border/60">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('columns.name', 'Name')}</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('detail.coordinates', 'Coordinates')}</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('detail.mapStatus', 'Map status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {accessPoints.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">{t('detail.noAccessPoints', 'No access points assigned to this zone yet.')}</td>
                      </tr>
                    ) : accessPoints.map((point) => {
                      const draft = draftPositions[point.id];
                      return (
                        <tr key={point.id} data-testid={`zone-detail-row-${point.id}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{point.name}</div>
                            <Link to={`/access/access-points/${point.id}`} className="text-xs text-primary hover:underline">{t('detail.openAccessPoint', 'Open access point')}</Link>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">X {draft?.map_x ?? point.map_x ?? 0.5} · Y {draft?.map_y ?? point.map_y ?? 0.5}</td>
                          <td className="px-4 py-3">{point.map_x != null && point.map_y != null ? <Badge variant="secondary">{t('detail.positioned', 'Positioned')}</Badge> : <Badge variant="outline">{t('detail.notPositioned', 'Needs placement')}</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>

          <TabsContent value="map" className="mt-0 min-h-0 flex-1 space-y-4 overflow-auto p-4">
              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
              <div
                ref={mapRef}
                className="relative h-[420px] overflow-hidden rounded-2xl border border-border/60 bg-muted/20 lg:h-[500px]"
                data-testid="zone-detail-map-canvas"
              >
                {layoutData.zone.map_image_url && !mapImageFailed ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.12),transparent_60%)] p-4">
                    <img
                      src={authenticatedUrl(layoutData.zone.map_image_url)}
                      alt={layoutData.zone.name}
                      className="h-full w-full object-contain opacity-90"
                      onError={() => setMapImageFailed(true)}
                    />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
                    <MapPin size={20} />
                    <p className="text-sm">
                      {layoutData.zone.map_image_url
                        ? t('detail.mapUnavailable', 'Zone map is unavailable right now. Check the uploaded asset URL or storage permissions.')
                        : t('detail.noMapConfigured', 'No indoor map configured for this zone')}
                    </p>
                  </div>
                )}

                {accessPoints.map((point) => {
                  const draft = draftPositions[point.id] ?? { map_x: point.map_x ?? 0.5, map_y: point.map_y ?? 0.5 };
                  return (
                    <button
                      key={point.id}
                      type="button"
                      className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-primary/40 bg-background/95 px-2 py-1 shadow-sm"
                      style={{ left: `${draft.map_x * 100}%`, top: `${draft.map_y * 100}%` }}
                      onPointerDown={(event) => {
                        draggingRef.current = point.id;
                        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
                      }}
                      data-testid={`zone-detail-marker-${point.id}`}
                    >
                      <Crosshair size={12} className="text-primary" />
                      <span className="text-xs font-medium text-foreground">{point.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {accessPoints.map((point) => {
                  const draft = draftPositions[point.id] ?? { map_x: point.map_x ?? 0.5, map_y: point.map_y ?? 0.5 };
                  const isDirty = dirtyPointIds.includes(point.id);
                  return (
                    <Card key={point.id} className="flex items-center justify-between gap-3 border-border/60 p-3" data-testid={`zone-detail-ap-${point.id}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{point.name}</span>
                          {isDirty ? <Badge variant="outline">{t('detail.unsaved', 'Unsaved')}</Badge> : null}
                        </div>
                        <div className="text-xs text-muted-foreground">X {draft.map_x} · Y {draft.map_y}</div>
                      </div>
                    </Card>
                  );
                })}
              </div>
          </TabsContent>
        </Tabs>

        <div className="min-h-0 space-y-4 overflow-auto">
          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-foreground">{t('detail.zoneSummary', 'Zone summary')}</h2>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div>{t('detail.address', 'Address')}: {zone.address || '—'}</div>
              <div>{t('detail.children', 'Child zones')}: {childZones.length}</div>
              <div>{t('detail.mapStatus', 'Map status')}: {zone.map_image_url ? t('badges.mapReady', 'Map ready') : t('badges.noMap', 'No map')}</div>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-foreground">{t('detail.childZones', 'Child zones')}</h2>
            {childZones.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('detail.noChildZones', 'No child zones')}</p>
            ) : (
              <div className="space-y-2">
                {childZones.map((child) => (
                  <Link key={child.id} to={`/access/zones/${child.id}`} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/40" data-testid={`zone-detail-child-${child.id}`}>
                    <span>{child.name}</span>
                    <Badge variant="outline">{child.access_point_count} {t('summary.accessPoints', 'APs')}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <AppModal
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        title={t('detail.addAccessPointTitle', 'Add access point to {{zone}}', { zone: zone.name })}
        size="sm"
        showCancelButton
        cancelLabel={t('cancel', 'Cancel')}
        primaryAction={{
          label: createSubmitting ? t('saving', 'Saving...') : t('save', 'Save'),
          onClick: handleCreateAccessPoint,
          disabled: createSubmitting,
          loading: createSubmitting,
        }}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="zone-ap-name">{t('name', 'Name')} *</Label>
            <Input
              id="zone-ap-name"
              data-testid="zone-detail-ap-name"
              value={createName}
              onChange={(e) => { setCreateName(e.target.value); if (createNameError) setCreateNameError(''); }}
              placeholder={t('namePlaceholder', 'e.g. Main Entrance')}
              disabled={createSubmitting}
              className={createNameError ? 'border-destructive' : ''}
            />
            {createNameError ? <p className="mt-1 text-[11px] text-destructive">{createNameError}</p> : null}
          </div>
          <div>
            <Label htmlFor="zone-ap-description">{t('description', 'Description')}</Label>
            <Input
              id="zone-ap-description"
              data-testid="zone-detail-ap-description"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder', 'Optional description')}
              disabled={createSubmitting}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('detail.addAccessPointHint', 'Position on the map can be set after creation by dragging the marker.')}
          </p>
        </div>
      </AppModal>
    </div>
  );
}
