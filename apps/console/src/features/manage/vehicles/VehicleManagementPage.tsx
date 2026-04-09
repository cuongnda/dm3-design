import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Edit, Trash2, Trash, Car, Bike, Truck, Search } from 'lucide-react';
import {
  Button, Input, Badge, AppModal, DataTable, type Column,
  Card, TablePaginationFooter, Select, SelectOption, Label,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Vehicle {
  id: string;
  user_id?: string | null;
  plate_number: string;
  vehicle_type: string;
  brand: string;
  model: string;
  color: string;
  description: string;
  status: string;
  owner_name: string;
  created_at: string;
  updated_at: string;
}

interface UserOption {
  id: string;
  full_name: string;
  user_code: string;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  car: <Car size={14} />,
  motorbike: <Bike size={14} />,
  truck: <Truck size={14} />,
};

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active': return 'default';
    case 'inactive': return 'secondary';
    case 'blacklisted': return 'destructive';
    default: return 'outline';
  }
}

// ─── Vehicle Modal ────────────────────────────────────────────────────────────

interface VehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  vehicle?: Vehicle | null;
  users: UserOption[];
  preSelectedUserId?: string;
}

function VehicleModal({ isOpen, onClose, onSave, vehicle, users, preSelectedUserId }: VehicleModalProps) {
  const { t } = useTranslation('vehicles');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    plate_number: '',
    vehicle_type: 'car',
    brand: '',
    model: '',
    color: '',
    description: '',
    user_id: preSelectedUserId || '',
    status: 'active',
  });

  useEffect(() => {
    if (vehicle) {
      setFormData({
        plate_number: vehicle.plate_number,
        vehicle_type: vehicle.vehicle_type,
        brand: vehicle.brand,
        model: vehicle.model,
        color: vehicle.color,
        description: vehicle.description,
        user_id: vehicle.user_id || '',
        status: vehicle.status,
      });
    } else {
      setFormData({
        plate_number: '',
        vehicle_type: 'car',
        brand: '',
        model: '',
        color: '',
        description: '',
        user_id: preSelectedUserId || '',
        status: 'active',
      });
    }
  }, [vehicle, isOpen, preSelectedUserId]);

  const handleSave = async () => {
    if (!formData.plate_number.trim()) {
      toast(t('toast.plateRequired'), 'error');
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { ...formData };
      if (!payload.user_id) delete payload.user_id;
      await onSave(payload);
      onClose();
    } catch (err) {
      // error toast handled by caller
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppModal
      open={isOpen}
      onOpenChange={onClose}
      title={
        <span className="flex items-center gap-2">
          <Car size={16} />
          {vehicle ? t('modal.editTitle') : t('modal.addTitle')}
        </span>
      }
      size="md"
      showCancelButton
      cancelLabel={t('modal.cancel')}
      cancelDisabled={loading}
      primaryAction={{ label: loading ? t('modal.saving') : t('modal.save'), onClick: handleSave, loading, disabled: loading }}
    >
      <div className="space-y-3">
        {/* Plate Number */}
        <div className="space-y-1">
          <Label>{t('modal.plateNumber')} <span className="text-destructive">*</span></Label>
          <Input
            value={formData.plate_number}
            onChange={(e) => setFormData((p) => ({ ...p, plate_number: e.target.value }))}
            placeholder="51A-123.45"
            disabled={loading}
            data-testid="vehicle-input-plate-number"
          />
        </div>

        {/* Type + Color */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{t('modal.vehicleType')}</Label>
            <Select value={formData.vehicle_type} onValueChange={(v) => setFormData((p) => ({ ...p, vehicle_type: v }))}>
              <SelectOption value="car">{t('type.car')}</SelectOption>
              <SelectOption value="motorbike">{t('type.motorbike')}</SelectOption>
              <SelectOption value="bicycle">{t('type.bicycle')}</SelectOption>
              <SelectOption value="truck">{t('type.truck')}</SelectOption>
              <SelectOption value="other">{t('type.other')}</SelectOption>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('modal.color')}</Label>
            <Input
              value={formData.color}
              onChange={(e) => setFormData((p) => ({ ...p, color: e.target.value }))}
              placeholder=""
              disabled={loading}
            />
          </div>
        </div>

        {/* Brand + Model */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{t('modal.brand')}</Label>
            <Input
              value={formData.brand}
              onChange={(e) => setFormData((p) => ({ ...p, brand: e.target.value }))}
              placeholder="Toyota"
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <Label>{t('modal.model')}</Label>
            <Input
              value={formData.model}
              onChange={(e) => setFormData((p) => ({ ...p, model: e.target.value }))}
              placeholder="Camry"
              disabled={loading}
            />
          </div>
        </div>

        {/* Owner (user) */}
        <div className="space-y-1">
          <Label>{t('modal.owner')}</Label>
          <Select value={formData.user_id} onValueChange={(v) => setFormData((p) => ({ ...p, user_id: v }))}>
            <SelectOption value="">{t('modal.ownerNone')}</SelectOption>
            {users.map((u) => (
              <SelectOption key={u.id} value={u.id}>{u.full_name} ({u.user_code})</SelectOption>
            ))}
          </Select>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <Label>{t('modal.description')}</Label>
          <Input
            value={formData.description}
            onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
            placeholder=""
            disabled={loading}
          />
        </div>

        {/* Status (edit only) */}
        {vehicle && (
          <div className="space-y-1">
            <Label>{t('modal.status')}</Label>
            <Select value={formData.status} onValueChange={(v) => setFormData((p) => ({ ...p, status: v }))}>
              <SelectOption value="active">{t('status.active')}</SelectOption>
              <SelectOption value="inactive">{t('status.inactive')}</SelectOption>
              <SelectOption value="blacklisted">{t('status.blacklisted')}</SelectOption>
            </Select>
          </div>
        )}
      </div>
    </AppModal>
  );
}

// ─── VehicleManagementPage ────────────────────────────────────────────────────

export function VehicleManagementPage() {
  const { t } = useTranslation('vehicles');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preUserId = searchParams.get('user_id') || '';

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<string | null>('plate_number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<UserOption[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<Vehicle | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Load users for the owner dropdown
  useEffect(() => {
    apiFetch<{ users: UserOption[] }>('/api/v1/identity/users?limit=200')
      .then((d) => setUsers((d.users || []).map((u: any) => ({ id: u.id, full_name: u.full_name, user_code: u.user_code }))))
      .catch(() => {});
  }, []);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.append('search', search);
      if (preUserId) params.append('user_id', preUserId);
      if (sortBy) params.append('sort_by', sortBy);
      if (sortDir) params.append('sort_order', sortDir.toUpperCase());
      const data = await apiFetch<{
        vehicles: Vehicle[];
        pagination: { total: number; total_pages: number };
      }>(`/api/v1/identity/vehicles?${params}`);
      setVehicles(data.vehicles || []);
      setTotal(data.pagination?.total || 0);
      setTotalPages(data.pagination?.total_pages || 1);
    } catch {
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir, preUserId]);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);
  useEffect(() => { setPage(1); }, [search, pageSize, sortBy, sortDir]);
  useEffect(() => { setSelected(new Set()); }, [page, search]);

  const handleCreate = async (data: Record<string, unknown>) => {
    try {
      await apiFetch('/api/v1/identity/vehicles', { method: 'POST', body: JSON.stringify(data) });
      setShowCreateModal(false);
      fetchVehicles();
      toast(t('toast.created'), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.createFailed'), 'error');
      throw err;
    }
  };

  const handleEdit = async (data: Record<string, unknown>) => {
    if (!editingVehicle) return;
    try {
      await apiFetch(`/api/v1/identity/vehicles/${editingVehicle.id}`, { method: 'PUT', body: JSON.stringify(data) });
      setEditingVehicle(null);
      fetchVehicles();
      toast(t('toast.updated'), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.updateFailed'), 'error');
      throw err;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingVehicle) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/v1/identity/vehicles/${deletingVehicle.id}`, { method: 'DELETE' });
      setDeletingVehicle(null);
      fetchVehicles();
      toast(t('toast.deleted'), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.deleteFailed'), 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    setBulkDeleteLoading(true);
    try {
      await apiFetch('/api/v1/identity/vehicles/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      setSelected(new Set());
      setShowBulkDeleteDialog(false);
      fetchVehicles();
      toast(t('toast.bulkDeleted', { count: selected.size }), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.bulkDeleteFailed'), 'error');
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const handleSortChange = useCallback((col: string | null, dir: 'asc' | 'desc' | null) => {
    setSortBy(col);
    setSortDir(dir);
  }, []);

  const columns = useMemo(
    (): Column<Vehicle>[] => [
      {
        key: 'plate_number',
        header: t('col.plate'),
        sortable: true,
        render: (v) => (
          <span className="font-mono text-[13px] font-semibold tracking-wider">{v.plate_number}</span>
        ),
      },
      {
        key: 'vehicle_type',
        header: t('col.type'),
        width: '96px',
        sortable: true,
        render: (v) => (
          <div className="flex items-center gap-1.5 text-[13px] capitalize">
            {TYPE_ICONS[v.vehicle_type] ?? <Car size={14} />}
            {t(`type.${v.vehicle_type}`, v.vehicle_type)}
          </div>
        ),
      },
      {
        key: 'brand',
        header: t('col.brandModel'),
        sortable: true,
        render: (v) => (
          <span className="text-[13px]">
            {[v.brand, v.model].filter(Boolean).join(' ') || '—'}
          </span>
        ),
      },
      {
        key: 'color',
        header: t('col.color'),
        width: '80px',
        render: (v) => <span className="text-[13px]">{v.color || '—'}</span>,
      },
      {
        key: 'owner_name',
        header: t('col.owner'),
        sortable: true,
        render: (v) =>
          v.owner_name ? (
            <button
              className="text-[13px] text-primary hover:underline"
              onClick={(e) => { e.stopPropagation(); if (v.user_id) navigate(`/manage/users/${v.user_id}`); }}
            >
              {v.owner_name}
            </button>
          ) : (
            <span className="text-[13px] text-muted-foreground">—</span>
          ),
      },
      {
        key: 'status',
        header: t('col.status'),
        width: '96px',
        sortable: true,
        render: (v) => <Badge variant={statusVariant(v.status)}>{t(`status.${v.status}`, v.status)}</Badge>,
      },
      {
        key: 'actions',
        header: tc('table.actions'),
        width: '88px',
        render: (v) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" onClick={() => setEditingVehicle(v)} title={t('action.edit')} data-testid="vehicle-button-edit">
              <Edit size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeletingVehicle(v)}
              title={t('action.delete')}
              className="text-destructive hover:text-destructive"
              data-testid="vehicle-button-delete"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ),
      },
    ],
    [t, tc, navigate],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-semibold text-foreground">{t('title')}</h1>
            <p className="text-[13px] text-muted-foreground">{t('description')}</p>
          </div>
          <Button size="sm" onClick={() => setShowCreateModal(true)} data-testid="vehicle-button-create">
            <Plus size={14} className="mr-1.5" />
            {t('addVehicle')}
          </Button>
        </div>

        {/* Stats */}
        {!loading && (
          <div className="grid grid-cols-4 gap-3">
            <Card className="p-3">
              <div className="text-2xl font-bold">{total}</div>
              <div className="text-xs text-muted-foreground">{t('stat.total')}</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold">{vehicles.filter((v) => v.vehicle_type === 'car').length}</div>
              <div className="text-xs text-muted-foreground">{t('stat.cars')}</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold">{vehicles.filter((v) => v.vehicle_type === 'motorbike').length}</div>
              <div className="text-xs text-muted-foreground">{t('stat.motorbikes')}</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold">{vehicles.filter((v) => v.status === 'blacklisted').length}</div>
              <div className="text-xs text-muted-foreground">{t('stat.blacklisted')}</div>
            </Card>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2">
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-[13px] flex-1"
            data-testid="vehicle-input-search"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        <div className="min-h-0 flex-1 overflow-auto">
          <DataTable
            embedded
            stickyHeader
            paginate={false}
            loading={loading}
            columns={columns}
            data={vehicles}
            rowKey={(v) => v.id}
            sortState={{ col: sortBy, dir: sortDir }}
            onSortChange={handleSortChange}
            onRowDoubleClick={(v) => setEditingVehicle(v)}
            emptyMessage={search ? t('empty.search') : t('empty.default')}
            emptyIcon={<Car size={32} strokeWidth={1.2} />}
            selection={{
              selectedIds: Array.from(selected),
              onSelectedIdsChange: (ids) => setSelected(new Set(ids)),
              selectAllScope: 'page',
              selectOnRowClick: true,
              bulkActions: [
                {
                  icon: <Trash size={13} className="text-destructive" />,
                  label: tc('table.deleteSelected'),
                  variant: 'ghost' as const,
                  className: 'text-destructive hover:text-destructive hover:bg-destructive/10',
                  onClick: () => setShowBulkDeleteDialog(true),
                },
              ],
            }}
          />
        </div>
        <TablePaginationFooter
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          loading={loading}
          sortColumns={[
            { value: 'plate_number', label: t('sort.plate') },
            { value: 'vehicle_type', label: t('sort.type') },
            { value: 'brand', label: t('sort.brand') },
            { value: 'owner_name', label: t('sort.owner') },
            { value: 'status', label: t('sort.status') },
          ]}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
        />
      </div>

      {/* Create Modal */}
      <VehicleModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleCreate}
        users={users}
        preSelectedUserId={preUserId}
      />

      {/* Edit Modal */}
      <VehicleModal
        isOpen={!!editingVehicle}
        onClose={() => setEditingVehicle(null)}
        onSave={handleEdit}
        vehicle={editingVehicle}
        users={users}
      />

      {/* Single Delete */}
      <AppModal
        open={!!deletingVehicle}
        onOpenChange={(open) => { if (!open) setDeletingVehicle(null); }}
        title={<span className="flex items-center gap-2 text-destructive"><Trash2 size={16} /> {t('delete.title')}</span>}
        size="xs"
        showCancelButton
        cancelLabel={t('delete.cancel')}
        cancelDisabled={deleteLoading}
        primaryAction={{
          label: deleteLoading ? t('delete.deleting') : t('delete.submit'),
          variant: 'outline',
          className: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
          onClick: handleDeleteConfirm,
          loading: deleteLoading,
          disabled: deleteLoading,
        }}
      >
        <p className="text-[13px] text-muted-foreground">
          {t('delete.confirm')} <span className="font-mono font-medium text-foreground">{deletingVehicle?.plate_number}</span>{t('delete.confirmSuffix')}
        </p>
      </AppModal>

      {/* Bulk Delete */}
      <AppModal
        open={showBulkDeleteDialog}
        onOpenChange={(open) => { if (!open) setShowBulkDeleteDialog(false); }}
        title={<span className="flex items-center gap-2 text-destructive"><Trash2 size={16} /> {t('delete.bulkTitle')}</span>}
        size="xs"
        showCancelButton
        cancelLabel={t('delete.cancel')}
        cancelDisabled={bulkDeleteLoading}
        primaryAction={{
          label: bulkDeleteLoading ? t('delete.deleting') : t('delete.submit'),
          variant: 'outline',
          className: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
          onClick: handleBulkDeleteConfirm,
          loading: bulkDeleteLoading,
          disabled: bulkDeleteLoading,
        }}
      >
        <p className="text-[13px] text-muted-foreground">
          {t('delete.bulkConfirm')} <span className="font-medium text-foreground">{selected.size}</span> {t('delete.bulkSuffix')}
        </p>
      </AppModal>
    </div>
  );
}
