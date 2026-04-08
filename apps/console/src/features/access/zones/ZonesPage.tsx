import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus, Search, MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import {
  Button, Input,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Badge, AppModal,
  DataTableCard, DataTable, type Column,
  Select, SelectOption, Label,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { useZones } from './hooks/useZones';
import type { Zone, ZoneFormData } from './types';

interface ZoneFormState {
  name: string;
  description: string;
  parent_id: string;
}

const emptyForm: ZoneFormState = {
  name: '',
  description: '',
  parent_id: '',
};

function zoneFormToData(form: ZoneFormState): ZoneFormData {
  return {
    name: form.name,
    description: form.description || undefined,
    parent_id: form.parent_id || undefined,
  };
}

export function ZonesPage() {
  const { t } = useTranslation('zones');

  const {
    zones,
    loading,
    pagination,
    fetchZones,
    createZone,
    updateZone,
    deleteZone,
    changePage,
  } = useZones();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [zoneToDelete, setZoneToDelete] = useState<Zone | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ZoneFormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  const filteredZones = useMemo(() => {
    if (!search.trim()) return zones;
    const q = search.toLowerCase();
    return zones.filter(
      (z) =>
        z.name.toLowerCase().includes(q) ||
        (z.description ?? '').toLowerCase().includes(q),
    );
  }, [zones, search]);

  const getParentName = (parentId?: string): string | undefined => {
    if (!parentId) return undefined;
    return zones.find((z) => z.id === parentId)?.name;
  };

  const openCreate = () => {
    setFormData(emptyForm);
    setFormErrors({});
    setShowCreateModal(true);
  };

  const openEdit = (zone: Zone) => {
    setFormData({
      name: zone.name,
      description: zone.description ?? '',
      parent_id: zone.parent_id ?? '',
    });
    setFormErrors({});
    setEditingZone(zone);
  };

  const openDelete = (zone: Zone) => {
    setZoneToDelete(zone);
    setDeleteError(null);
    setShowDeleteDialog(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) {
      errors.name = t('validation.nameRequired', 'Name is required');
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSubmit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    const success = await createZone(zoneFormToData(formData));
    setSubmitting(false);
    if (success) setShowCreateModal(false);
  };

  const handleEditSubmit = async () => {
    if (!editingZone || !validateForm()) return;
    setSubmitting(true);
    const success = await updateZone(editingZone.id, zoneFormToData(formData));
    setSubmitting(false);
    if (success) setEditingZone(null);
  };

  const handleDeleteConfirm = async () => {
    if (!zoneToDelete) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/v1/zones/${zoneToDelete.id}`, { method: 'DELETE' });
      setShowDeleteDialog(false);
      setZoneToDelete(null);
      fetchZones();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete zone';
      try { const j = JSON.parse(msg.replace(/^API \d+: /, '')); setDeleteError(j.message || j.error || msg); }
      catch { setDeleteError(msg.replace(/^API \d+: /, '')); }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    try {
      await apiFetch('/api/v1/zones/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: selected }) });
      setSelected([]);
      fetchZones();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Bulk delete failed');
    }
  };

  const handleFieldChange = (field: keyof ZoneFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const columns = useMemo((): Column<Zone>[] => [
    {
      key: 'name',
      header: t('columns.name', 'Name'),
      sortable: true,
      render: (z) => {
        const parentName = getParentName(z.parent_id);
        return (
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-primary shrink-0" />
            <div>
              <div className="text-[13px] font-medium">{z.name}</div>
              {parentName && (
                <div className="text-[11px] text-muted-foreground">
                  {t('parentLabel', 'Parent')}: {parentName}
                </div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'description',
      header: t('columns.description', 'Description'),
      render: (z) =>
        z.description ? (
          <span className="text-[13px] text-muted-foreground truncate max-w-[240px] block">
            {z.description}
          </span>
        ) : (
          <span className="text-[13px] text-muted-foreground">—</span>
        ),
    },
    {
      key: 'access_point_count',
      header: t('columns.accessPoints', 'Access Points'),
      width: '120px',
      render: (z) => (
        <Badge variant="secondary">{z.access_point_count}</Badge>
      ),
    },
    {
      key: 'created_at',
      header: t('columns.createdAt', 'Created'),
      width: '100px',
      render: (z) => (
        <span className="text-[12px] text-muted-foreground">
          {new Date(z.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      render: (z) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(z)}>
                <Edit size={14} className="mr-2" />
                {t('actions.edit', 'Edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openDelete(z)}
                className="text-destructive"
              >
                <Trash2 size={14} className="mr-2" />
                {t('actions.delete', 'Delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [zones, t]);

  const zoneForm = (
    <div className="space-y-4">
      <div>
        <Label htmlFor="zone-name">{t('form.name', 'Name')} *</Label>
        <Input
          id="zone-name"
          value={formData.name}
          onChange={(e) => handleFieldChange('name', e.target.value)}
          placeholder={t('form.namePlaceholder', 'Zone name')}
          className={formErrors.name ? 'border-destructive' : ''}
          disabled={submitting}
        />
        {formErrors.name && (
          <p className="text-sm text-destructive mt-1">{formErrors.name}</p>
        )}
      </div>

      <div>
        <Label htmlFor="zone-description">{t('form.description', 'Description')}</Label>
        <Input
          id="zone-description"
          value={formData.description}
          onChange={(e) => handleFieldChange('description', e.target.value)}
          placeholder={t('form.descriptionPlaceholder', 'Optional description')}
          disabled={submitting}
        />
      </div>

      <div>
        <Label>{t('form.parentZone', 'Parent Zone')}</Label>
        <Select
          value={formData.parent_id}
          onValueChange={(value) => handleFieldChange('parent_id', value)}
          placeholder={t('form.noParent', 'No parent (top-level)')}
          disabled={submitting}
        >
          <SelectOption value="">{t('form.noParent', 'No parent (top-level)')}</SelectOption>
          {zones
            .filter((z) => !editingZone || z.id !== editingZone.id)
            .map((z) => (
              <SelectOption key={z.id} value={z.id}>
                {z.name}
              </SelectOption>
            ))}
        </Select>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">
            {t('title', 'Zones')}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {t('description', 'Manage physical zones and access areas')}
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} className="mr-1.5" />
          {t('addZone', 'Add Zone')}
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            placeholder={t('searchPlaceholder', 'Search zones...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <DataTableCard
        title={
          <span className="text-[14px] font-semibold">
            {t('tableTitle', 'Zones')} ({pagination.total})
          </span>
        }
        selectedCount={selected.length}
        onClearSelection={() => setSelected([])}
        onBulkDelete={handleBulkDelete}
        bulkDeleteLabel={`${selected.length} zones`}
        pagination={{
          page: pagination.page,
          pageSize: pagination.limit,
          total: pagination.total,
          totalPages: Math.ceil(pagination.total / pagination.limit),
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
        ) : filteredZones.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">
            {search
              ? t('noResults', 'No zones match your search')
              : t('empty', 'No zones yet. Add the first one.')}
          </div>
        ) : (
          <DataTable
            embedded
            stickyHeader
            paginate={false}
            columns={columns}
            data={filteredZones}
            rowKey={(z) => z.id}
            onRowDoubleClick={(z) => openEdit(z)}
            selection={{
              selectedIds: selected,
              onSelectedIdsChange: setSelected,
              selectAllScope: 'page',
              selectOnRowClick: true,
            }}
          />
        )}
      </DataTableCard>

      {/* Create Modal */}
      <AppModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        title={
          <span className="flex items-center gap-2">
            <MapPin size={16} />
            {t('createZone', 'Create Zone')}
          </span>
        }
        size="sm"
        showCancelButton
        cancelLabel={t('cancel', 'Cancel')}
        primaryAction={{
          label: submitting ? t('saving', 'Saving...') : t('save', 'Save'),
          onClick: handleCreateSubmit,
          disabled: submitting,
        }}
      >
        {zoneForm}
      </AppModal>

      {/* Edit Modal */}
      <AppModal
        open={!!editingZone}
        onOpenChange={(open) => { if (!open) setEditingZone(null); }}
        title={
          <span className="flex items-center gap-2">
            <MapPin size={16} />
            {t('editZone', 'Edit Zone')}
          </span>
        }
        size="sm"
        showCancelButton
        cancelLabel={t('cancel', 'Cancel')}
        primaryAction={{
          label: submitting ? t('saving', 'Saving...') : t('save', 'Save'),
          onClick: handleEditSubmit,
          disabled: submitting,
        }}
      >
        {zoneForm}
      </AppModal>

      {/* Delete Confirmation */}
      <AppModal
        open={showDeleteDialog}
        onOpenChange={(open) => { if (!open) { setShowDeleteDialog(false); setZoneToDelete(null); setDeleteError(null); } }}
        title={
          <span className="flex items-center gap-2 text-destructive">
            <Trash2 size={16} />
            {t('deleteZone', 'Delete Zone')}
          </span>
        }
        size="xs"
        style={{ maxWidth: '22rem' }}
        showCancelButton
        cancelLabel={t('cancel', 'Cancel')}
        cancelDisabled={deleteLoading}
        errorMessage={deleteError ?? undefined}
        primaryAction={{
          label: deleteLoading ? t('deleting', 'Deleting...') : t('delete', 'Delete'),
          variant: 'destructive',
          onClick: handleDeleteConfirm,
          loading: deleteLoading,
          disabled: deleteLoading,
        }}
      >
        <p className="text-[13px] text-muted-foreground">
          {t('deleteConfirm', 'Are you sure you want to delete')}{' '}
          <span className="font-medium text-foreground">"{zoneToDelete?.name}"</span>?
          {(zoneToDelete?.access_point_count ?? 0) > 0 && (
            <span className="block mt-2 text-destructive">
              ⚠ {t('deleteWarning', 'This zone has')} {zoneToDelete?.access_point_count}{' '}
              {t('deleteWarningPoints', 'access points assigned.')}
            </span>
          )}
        </p>
      </AppModal>
    </div>
  );
}
