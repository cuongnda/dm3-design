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
  owner_id?: string | null;
  visitor_id?: string | null;
  plate_number: string;
  type: string;
  category: string;
  brand?: string;
  color?: string;
  rfid_tag?: string;
  nfc_card_id?: string;
  registration_status: string;
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
    type: 'car',
    category: 'resident',
    brand: '',
    color: '',
    rfid_tag: '',
    nfc_card_id: '',
    owner_id: preSelectedUserId || '',
    registration_status: 'registered',
  });

  useEffect(() => {
    if (vehicle) {
      setFormData({
        plate_number: vehicle.plate_number,
        type: vehicle.type,
        category: vehicle.category,
        brand: vehicle.brand || '',
        color: vehicle.color || '',
        rfid_tag: vehicle.rfid_tag || '',
        nfc_card_id: vehicle.nfc_card_id || '',
        owner_id: vehicle.owner_id || '',
        registration_status: vehicle.registration_status,
      });
    } else {
      setFormData({
        plate_number: '',
        type: 'car',
        category: 'resident',
        brand: '',
        color: '',
        rfid_tag: '',
        nfc_card_id: '',
        owner_id: preSelectedUserId || '',
        registration_status: 'registered',
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
      if (!payload.owner_id) delete payload.owner_id;
      if (!payload.rfid_tag) delete payload.rfid_tag;
      if (!payload.nfc_card_id) delete payload.nfc_card_id;
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

        {/* Type + Category */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{t('modal.vehicleType')}</Label>
            <Select value={formData.type} onValueChange={(v) => setFormData((p) => ({ ...p, type: v }))}>
              <SelectOption value="car">{t('type.car')}</SelectOption>
              <SelectOption value="motorbike">{t('type.motorbike')}</SelectOption>
              <SelectOption value="bicycle">{t('type.bicycle')}</SelectOption>
              <SelectOption value="truck">{t('type.truck')}</SelectOption>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('modal.category', 'Category')}</Label>
            <Select value={formData.category} onValueChange={(v) => setFormData((p) => ({ ...p, category: v }))}>
              <SelectOption value="resident">{t('category.resident', 'Resident')}</SelectOption>
              <SelectOption value="visitor">{t('category.visitor', 'Visitor')}</SelectOption>
              <SelectOption value="temporary">{t('category.temporary', 'Temporary')}</SelectOption>
            </Select>
          </div>
        </div>

        {/* Brand + Color */}
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
            <Label>{t('modal.color')}</Label>
            <Input
              value={formData.color}
              onChange={(e) => setFormData((p) => ({ ...p, color: e.target.value }))}
              placeholder=""
              disabled={loading}
            />
          </div>
        </div>

        {/* Credentials: RFID + NFC */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{t('modal.rfidTag', 'RFID Tag (UHF)')}</Label>
            <Input
              value={formData.rfid_tag}
              onChange={(e) => setFormData((p) => ({ ...p, rfid_tag: e.target.value }))}
              placeholder="E200-xxxx-xxxx"
              disabled={loading}
              data-testid="vehicle-input-rfid"
            />
          </div>
          <div className="space-y-1">
            <Label>{t('modal.nfcCard', 'NFC Card ID')}</Label>
            <Input
              value={formData.nfc_card_id}
              onChange={(e) => setFormData((p) => ({ ...p, nfc_card_id: e.target.value }))}
              placeholder="04:xx:xx:xx:xx:xx"
              disabled={loading}
              data-testid="vehicle-input-nfc"
            />
          </div>
        </div>

        {/* Owner (user) */}
        <div className="space-y-1">
          <Label>{t('modal.owner')}</Label>
          <Select value={formData.owner_id} onValueChange={(v) => setFormData((p) => ({ ...p, owner_id: v }))}>
            <SelectOption value="">{t('modal.ownerNone')}</SelectOption>
            {users.map((u) => (
              <SelectOption key={u.id} value={u.id}>{u.full_name} ({u.user_code})</SelectOption>
            ))}
          </Select>
        </div>

        {/* Registration Status (edit only) */}
        {vehicle && (
          <div className="space-y-1">
            <Label>{t('modal.status', 'Status')}</Label>
            <Select value={formData.registration_status} onValueChange={(v) => setFormData((p) => ({ ...p, registration_status: v }))}>
              <SelectOption value="registered">{t('status.registered', 'Registered')}</SelectOption>
              <SelectOption value="visitor">{t('status.visitor', 'Visitor')}</SelectOption>
              <SelectOption value="temporary">{t('status.temporary', 'Temporary')}</SelectOption>
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
  const preUserId = searchParams.get('owner_id') || searchParams.get('user_id') || '';

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
      if (search) params.append('plate', search);
      if (preUserId) params.append('owner_id', preUserId);
      const data = await apiFetch<{
        data: Vehicle[];
        total: number;
      }>(`/api/v1/parking/vehicles?${params}`);
      setVehicles(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(Math.max(1, Math.ceil((data.total || 0) / pageSize)));
    } catch {
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, preUserId]);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);
  useEffect(() => { setPage(1); }, [search, pageSize, sortBy, sortDir]);
  useEffect(() => { setSelected(new Set()); }, [page, search]);

  const handleCreate = async (data: Record<string, unknown>) => {
    try {
      await apiFetch('/api/v1/parking/vehicles', { method: 'POST', body: JSON.stringify(data) });
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
      await apiFetch(`/api/v1/parking/vehicles/${editingVehicle.id}`, { method: 'PUT', body: JSON.stringify(data) });
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
      await apiFetch(`/api/v1/parking/vehicles/${deletingVehicle.id}`, { method: 'DELETE' });
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
      await apiFetch('/api/v1/parking/vehicles/bulk-delete', {
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
        key: 'type',
        header: t('col.type'),
        width: '96px',
        render: (v) => (
          <div className="flex items-center gap-1.5 text-[13px] capitalize">
            {TYPE_ICONS[v.type] ?? <Car size={14} />}
            {t(`type.${v.type}`, v.type)}
          </div>
        ),
      },
      {
        key: 'category',
        header: t('col.category', 'Category'),
        width: '96px',
        render: (v) => (
          <span className="text-[13px] capitalize">{t(`category.${v.category}`, v.category)}</span>
        ),
      },
      {
        key: 'brand',
        header: t('col.brandModel'),
        render: (v) => (
          <span className="text-[13px]">{v.brand || '—'}</span>
        ),
      },
      {
        key: 'credentials',
        header: t('col.credentials', 'Credentials'),
        render: (v) => (
          <div className="flex flex-col gap-0.5 text-[12px] text-muted-foreground">
            {v.rfid_tag && <span>RFID: {v.rfid_tag}</span>}
            {v.nfc_card_id && <span>NFC: {v.nfc_card_id}</span>}
            {!v.rfid_tag && !v.nfc_card_id && <span>Plate only</span>}
          </div>
        ),
      },
      {
        key: 'registration_status',
        header: t('col.status'),
        width: '96px',
        render: (v) => <Badge variant={statusVariant(v.registration_status === 'blacklisted' ? 'blacklisted' : v.registration_status === 'registered' ? 'active' : 'secondary')}>{t(`status.${v.registration_status}`, v.registration_status)}</Badge>,
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
    [t, tc],
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
              <div className="text-2xl font-bold">{vehicles.filter((v) => v.type === 'car').length}</div>
              <div className="text-xs text-muted-foreground">{t('stat.cars')}</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold">{vehicles.filter((v) => v.type === 'motorbike').length}</div>
              <div className="text-xs text-muted-foreground">{t('stat.motorbikes')}</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold">{vehicles.filter((v) => v.registration_status === 'blacklisted').length}</div>
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
            { value: 'type', label: t('sort.type') },
            { value: 'brand', label: t('sort.brand') },
            { value: 'category', label: t('sort.category', 'Category') },
            { value: 'registration_status', label: t('sort.status') },
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
