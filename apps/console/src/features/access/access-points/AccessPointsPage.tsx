import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Plus, Search, MoreHorizontal, Edit, Trash2, Eye,
} from 'lucide-react';
import {
  Button, Input, Badge, AppModal,
  DataTableCard, DataTable, type Column,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Select, SelectOption, Label,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { useAccessPoints } from './hooks/useAccessPoints';
import type { AccessPoint, AccessPointFormData, Zone, AccessTime } from './types';

// ---------------------------------------------------------------------------
// Inline modal for create / edit
// ---------------------------------------------------------------------------

interface AccessPointModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial?: AccessPoint;
  zones: Zone[];
  accessTimes: AccessTime[];
  onSubmit: (data: AccessPointFormData) => Promise<boolean>;
}

function AccessPointModal({
  open,
  onOpenChange,
  title,
  initial,
  zones,
  accessTimes,
  onSubmit,
}: AccessPointModalProps) {
  const { t } = useTranslation('accessPoints');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<AccessPointFormData>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    zone_id: initial?.zone_id ?? '',
    access_time_id: initial?.access_time_id ?? '',
  });
  const [nameError, setNameError] = useState('');

  // Reset form when modal opens with new initial data
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setForm({
        name: initial?.name ?? '',
        description: initial?.description ?? '',
        zone_id: initial?.zone_id ?? '',
        access_time_id: initial?.access_time_id ?? '',
      });
      setNameError('');
    }
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setNameError(t('validation.nameRequired', 'Name is required'));
      return;
    }
    setSubmitting(true);
    const payload: AccessPointFormData = {
      name: form.name.trim(),
      ...(form.description?.trim() && { description: form.description.trim() }),
      ...(form.zone_id && { zone_id: form.zone_id }),
      ...(form.access_time_id && { access_time_id: form.access_time_id }),
    };
    const ok = await onSubmit(payload);
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  const set = (field: keyof AccessPointFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'name') setNameError('');
  };

  return (
    <AppModal
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      size="sm"
      showCancelButton
      cancelLabel={t('cancel', 'Cancel')}
      primaryAction={{
        label: submitting ? t('saving', 'Saving…') : t('save', 'Save'),
        onClick: handleSubmit,
        disabled: submitting,
      }}
    >
      <div className="space-y-4">
        {/* Name */}
        <div>
          <Label htmlFor="ap-name">{t('name', 'Name')} *</Label>
          <Input
            id="ap-name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t('namePlaceholder', 'e.g. Main Entrance')}
            className={nameError ? 'border-destructive' : ''}
            disabled={submitting}
          />
          {nameError && (
            <p className="mt-1 text-[11px] text-destructive">{nameError}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <Label htmlFor="ap-description">{t('description', 'Description')}</Label>
          <Input
            id="ap-description"
            value={form.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
            placeholder={t('descriptionPlaceholder', 'Optional description')}
            disabled={submitting}
          />
        </div>

        {/* Zone */}
        <div>
          <Label>{t('zone', 'Zone')}</Label>
          <Select
            value={form.zone_id ?? ''}
            onValueChange={(v) => set('zone_id', v)}
            placeholder={t('noZone', '— No zone —')}
            disabled={submitting}
          >
            <SelectOption value="">{t('noZone', '— No zone —')}</SelectOption>
            {zones.map((z) => (
              <SelectOption key={z.id} value={z.id}>{z.name}</SelectOption>
            ))}
          </Select>
        </div>

        {/* Access Time */}
        <div>
          <Label>{t('accessTime', 'Access Time')}</Label>
          <Select
            value={form.access_time_id ?? ''}
            onValueChange={(v) => set('access_time_id', v)}
            placeholder={t('noRestriction', 'No restriction (24/7)')}
            disabled={submitting}
          >
            <SelectOption value="">{t('noRestriction', 'No restriction (24/7)')}</SelectOption>
            {accessTimes.map((at) => (
              <SelectOption key={at.id} value={at.id}>{at.name}</SelectOption>
            ))}
          </Select>
        </div>
      </div>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// AccessPointsPage
// ---------------------------------------------------------------------------

export function AccessPointsPage() {
  const { t } = useTranslation('accessPoints');
  const navigate = useNavigate();

  const {
    accessPoints,
    zones,
    accessTimes,
    loading,
    pagination,
    filters,
    fetchAccessPoints,
    createAccessPoint,
    updateAccessPoint,
    updateFilters,
    changePage,
  } = useAccessPoints();

  const [selected, setSelected] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAP, setEditingAP] = useState<AccessPoint | null>(null);
  const [deletingAP, setDeletingAP] = useState<AccessPoint | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const zoneMap = useMemo(
    () => new Map(zones.map((z) => [z.id, z.name])),
    [zones],
  );
  const accessTimeMap = useMemo(
    () => new Map(accessTimes.map((at) => [at.id, at.name])),
    [accessTimes],
  );

  const handleCreate = async (data: AccessPointFormData) =>
    createAccessPoint(data);

  const handleEdit = async (data: AccessPointFormData) => {
    if (!editingAP) return false;
    return updateAccessPoint(editingAP.id, data);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingAP) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/v1/access-points/${deletingAP.id}`, { method: 'DELETE' });
      setDeletingAP(null);
      fetchAccessPoints();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete access point';
      try { const j = JSON.parse(msg.replace(/^API \d+: /, '')); setDeleteError(j.message || j.error || msg); }
      catch { setDeleteError(msg.replace(/^API \d+: /, '')); }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    try {
      await apiFetch('/api/v1/access-points/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: selected }) });
      setSelected([]);
      fetchAccessPoints();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Bulk delete failed');
    }
  };

  const columns = useMemo((): Column<AccessPoint>[] => [
    {
      key: 'name',
      header: t('columnName', 'Name'),
      sortable: true,
      render: (ap) => (
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-primary shrink-0" />
          <div>
            <div className="text-[13px] font-medium">{ap.name}</div>
            {ap.description && (
              <div className="text-[11px] text-muted-foreground">{ap.description}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'zone_id',
      header: t('columnZone', 'Zone'),
      render: (ap) =>
        ap.zone_id && zoneMap.get(ap.zone_id) ? (
          <Badge variant="outline">{zoneMap.get(ap.zone_id)}</Badge>
        ) : (
          <span className="text-[12px] text-muted-foreground">—</span>
        ),
    },
    {
      key: 'access_time_id',
      header: t('columnAccessTime', 'Access Time'),
      render: (ap) =>
        ap.access_time_id && accessTimeMap.get(ap.access_time_id) ? (
          <Badge variant="secondary">{accessTimeMap.get(ap.access_time_id)}</Badge>
        ) : (
          <Badge variant="outline">{t('allDay', '24/7')}</Badge>
        ),
    },
    {
      key: 'door_count',
      header: t('columnDoors', 'Doors'),
      width: '72px',
      render: (ap) => (
        <Badge variant="secondary">{ap.door_count ?? 0}</Badge>
      ),
    },
    {
      key: 'created_at',
      header: t('columnCreated', 'Created'),
      width: '100px',
      render: (ap) => (
        <span className="text-[12px] text-muted-foreground">
          {new Date(ap.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      render: (ap) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => navigate(`/access/access-points/${ap.id}`)}
              >
                <Eye size={14} className="mr-2" />
                {t('view', 'View')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditingAP(ap)}>
                <Edit size={14} className="mr-2" />
                {t('edit', 'Edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeletingAP(ap)}
                className="text-destructive"
              >
                <Trash2 size={14} className="mr-2" />
                {t('delete', 'Delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [t, zoneMap, accessTimeMap, navigate]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">
            {t('title', 'Access Points')}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {t('description', 'Manage physical access points and their door assignments')}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreateModal(true)}>
          <Plus size={14} className="mr-1.5" />
          {t('newAccessPoint', 'New Access Point')}
        </Button>
      </div>

      {/* Toolbar: search + zone filter */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder={t('searchPlaceholder', 'Search access points…')}
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            className="pl-9"
          />
        </div>
        <div className="w-44 shrink-0">
          <Select
            value={filters.zone_id}
            onValueChange={(v) => updateFilters({ zone_id: v })}
            placeholder={t('allZones', 'All Zones')}
          >
            <SelectOption value="">{t('allZones', 'All Zones')}</SelectOption>
            {zones.map((z) => (
              <SelectOption key={z.id} value={z.id}>{z.name}</SelectOption>
            ))}
          </Select>
        </div>
      </div>

      {/* Table */}
      <DataTableCard
        title={
          <span className="text-[14px] font-semibold">
            {t('tableTitle', 'Access Points')} ({pagination.total})
          </span>
        }
        selectedCount={selected.length}
        onClearSelection={() => setSelected([])}
        onBulkDelete={handleBulkDelete}
        bulkDeleteLabel={`${selected.length} access points`}
        pagination={{
          page: pagination.page,
          pageSize: pagination.limit,
          total: pagination.total,
          totalPages: pagination.total_pages,
          pageSizeOptions: [10, 20, 50],
          onPageChange: changePage,
          onPageSizeChange: () => {},
          loading,
        }}
      >
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : accessPoints.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">
            {filters.search || filters.zone_id
              ? t('noResults', 'No access points match your filters')
              : t('empty', 'No access points yet. Add the first one.')}
          </div>
        ) : (
          <DataTable
            embedded
            stickyHeader
            paginate={false}
            columns={columns}
            data={accessPoints}
            rowKey={(ap) => ap.id}
            onRowDoubleClick={(ap) => navigate(`/access/access-points/${ap.id}`)}
            selection={{
              selectedIds: selected,
              onSelectedIdsChange: setSelected,
              selectAllScope: 'page',
            }}
          />
        )}
      </DataTableCard>

      {/* Create modal */}
      <AccessPointModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        title={t('createTitle', 'New Access Point')}
        zones={zones}
        accessTimes={accessTimes}
        onSubmit={handleCreate}
      />

      {/* Edit modal */}
      {editingAP && (
        <AccessPointModal
          open={!!editingAP}
          onOpenChange={(v) => { if (!v) setEditingAP(null); }}
          title={t('editTitle', 'Edit Access Point')}
          initial={editingAP}
          zones={zones}
          accessTimes={accessTimes}
          onSubmit={handleEdit}
        />
      )}

      {/* Delete confirmation */}
      <AppModal
        open={!!deletingAP}
        onOpenChange={(v) => { if (!v) { setDeletingAP(null); setDeleteError(null); } }}
        title={
          <span className="flex items-center gap-2 text-destructive">
            <Trash2 size={16} />
            {t('deleteTitle', 'Delete Access Point')}
          </span>
        }
        size="xs"
        style={{ maxWidth: '22rem' }}
        showCancelButton
        cancelLabel={t('cancel', 'Cancel')}
        cancelDisabled={deleteLoading}
        errorMessage={deleteError ?? undefined}
        primaryAction={{
          label: deleteLoading ? t('deleting', 'Deleting…') : t('delete', 'Delete'),
          variant: 'destructive',
          onClick: handleDeleteConfirm,
          loading: deleteLoading,
          disabled: deleteLoading,
        }}
      >
        <p className="text-[13px] text-muted-foreground">
          {t('deleteConfirm', 'Are you sure you want to delete')}{' '}
          <span className="font-medium text-foreground">"{deletingAP?.name}"</span>?
        </p>
      </AppModal>
    </div>
  );
}
