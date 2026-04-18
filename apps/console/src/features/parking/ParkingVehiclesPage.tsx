import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataTable, type Column, Button, AppModal, Input, Label } from '@dm3/ui';
import { Plus, Trash2, Pencil, User, Users, CircleDashed, Car } from 'lucide-react';
import {
  listParkingVehicles,
  createParkingVehicle,
  updateParkingVehicle,
  deleteParkingVehicle,
  type ParkingVehicleDTO,
} from '@dm3/api-client';

interface VehicleFormState {
  plate: string;
  vType: string;
  category: string;
  brand: string;
  color: string;
  rfid: string;
  nfc: string;
  status: string;
}

const emptyForm: VehicleFormState = {
  plate: '',
  vType: 'car',
  category: '',
  brand: '',
  color: '',
  rfid: '',
  nfc: '',
  status: 'registered',
};

function OwnerCell({ vehicle }: { vehicle: ParkingVehicleDTO }) {
  if (vehicle.owner_type === 'user') {
    return (
      <div className="flex items-center gap-1.5 text-[12px]">
        <User size={12} className="text-sky-400 shrink-0" />
        <span className="truncate">{vehicle.owner_name ?? 'User'}</span>
      </div>
    );
  }
  if (vehicle.owner_type === 'visitor') {
    return (
      <div className="flex items-center gap-1.5 text-[12px]">
        <Users size={12} className="text-emerald-400 shrink-0" />
        <span className="truncate">{vehicle.owner_name ?? 'Visitor'}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <CircleDashed size={12} className="shrink-0" />
      <span>Anonymous</span>
    </div>
  );
}

export function ParkingVehiclesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleFormState>(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ['parking-vehicles', page],
    queryFn: () => listParkingVehicles({ page, limit: 20 }),
  });

  const closeModal = () => {
    setMode('closed');
    setEditingId(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setMode('create');
  };

  const openEdit = (v: ParkingVehicleDTO) => {
    setEditingId(v.id);
    setForm({
      plate: v.plate_number,
      vType: v.type,
      category: v.category ?? '',
      brand: v.brand ?? '',
      color: v.color ?? '',
      rfid: v.rfid_tag ?? '',
      nfc: v.nfc_card_id ?? '',
      status: v.registration_status,
    });
    setMode('edit');
  };

  const payload = () => ({
    plate_number: form.plate,
    type: form.vType,
    category: form.category || undefined,
    brand: form.brand || undefined,
    color: form.color || undefined,
    rfid_tag: form.rfid || undefined,
    nfc_card_id: form.nfc || undefined,
    registration_status: form.status || undefined,
  });

  const createMutation = useMutation({
    mutationFn: () => createParkingVehicle(payload()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parking-vehicles'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('no vehicle selected');
      return updateParkingVehicle(editingId, payload());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parking-vehicles'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteParkingVehicle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parking-vehicles'] }),
  });

  const vehicles = data?.data ?? [];

  const columns: Column<ParkingVehicleDTO>[] = [
    {
      key: 'plate_number',
      header: 'Plate',
      width: '130px',
      render: (r) => <span className="font-mono font-medium">{r.plate_number}</span>,
    },
    {
      key: 'owner',
      header: 'Owner',
      width: '160px',
      render: (r) => <OwnerCell vehicle={r} />,
    },
    { key: 'type', header: 'Type', width: '80px', render: (r) => <span className="capitalize text-[12px]">{r.type}</span> },
    {
      key: 'category',
      header: 'Category',
      width: '100px',
      render: (r) => <span className="capitalize text-[12px] text-muted-foreground">{r.category}</span>,
    },
    { key: 'brand', header: 'Brand', width: '100px', render: (r) => <span className="text-[12px] text-muted-foreground">{r.brand ?? '—'}</span> },
    { key: 'color', header: 'Color', width: '80px', render: (r) => <span className="text-[12px] text-muted-foreground">{r.color ?? '—'}</span> },
    {
      key: 'registration_status',
      header: 'Status',
      width: '100px',
      render: (r) => (
        <span
          className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
            r.registration_status === 'registered'
              ? 'bg-emerald-500/20 text-emerald-400'
              : r.registration_status === 'blacklisted'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          {r.registration_status}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Registered',
      width: '120px',
      render: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '90px',
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => openEdit(r)}
            data-testid="parking-button-edit-vehicle"
            aria-label="Edit vehicle"
          >
            <Pencil size={14} />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="text-destructive"
            onClick={() => deleteMutation.mutate(r.id)}
            data-testid="parking-button-delete-vehicle"
            aria-label="Delete vehicle"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  const isEdit = mode === 'edit';
  const submitting = isEdit ? updateMutation.isPending : createMutation.isPending;
  const canSubmit = form.plate.trim().length > 0 && !submitting;
  const handleSubmit = () => (isEdit ? updateMutation.mutate() : createMutation.mutate());

  return (
    <div>
      <PageHeader title="Registered Vehicles" description="Manage vehicles registered in the parking system">
        <Button
          size="sm"
          onClick={openCreate}
          className="bg-amber-600 hover:bg-amber-700"
          data-testid="parking-button-create-vehicle"
        >
          <Plus size={16} className="mr-1" /> Register Vehicle
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading vehicles...</div>
      ) : (
        <DataTable
          columns={columns}
          data={vehicles}
          rowKey={(r) => r.id}
          pageSize={20}
          emptyIcon={<Car size={32} strokeWidth={1.2} />}
          emptyTitle="No vehicles registered yet"
          emptyDescription="Register your first vehicle to enable plate-based access and parking permissions."
          emptyAction={{
            label: 'Register Vehicle',
            icon: <Plus size={14} />,
            onClick: openCreate,
            'data-testid': 'parking-button-create-vehicle-empty',
          }}
        />
      )}

      <AppModal
        open={mode !== 'closed'}
        onOpenChange={(o) => {
          if (!o) closeModal();
        }}
        title={isEdit ? 'Edit Vehicle' : 'Register Vehicle'}
      >
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">Plate Number *</Label>
            <Input
              className="mt-1 h-8 text-[13px]"
              value={form.plate}
              onChange={(e) => setForm({ ...form, plate: e.target.value })}
              placeholder="e.g. 51A-12345"
              data-testid="parking-input-plate"
              disabled={isEdit}
            />
            {isEdit && <p className="mt-1 text-[11px] text-muted-foreground">Plate number cannot be changed after registration.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Vehicle Type</Label>
              <select
                className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]"
                value={form.vType}
                onChange={(e) => setForm({ ...form, vType: e.target.value })}
                data-testid="parking-select-vehicle-type"
              >
                <option value="car">Car</option>
                <option value="motorbike">Motorbike</option>
                <option value="bicycle">Bicycle</option>
                <option value="truck">Truck</option>
                <option value="bus">Bus</option>
              </select>
            </div>
            <div>
              <Label className="text-[12px]">Status</Label>
              <select
                className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                data-testid="parking-select-status"
              >
                <option value="registered">Registered</option>
                <option value="pending">Pending</option>
                <option value="blacklisted">Blacklisted</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Brand</Label>
              <Input
                className="mt-1 h-8 text-[13px]"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Toyota"
              />
            </div>
            <div>
              <Label className="text-[12px]">Color</Label>
              <Input
                className="mt-1 h-8 text-[13px]"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                placeholder="White"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">RFID Tag</Label>
              <Input
                className="mt-1 h-8 text-[13px] font-mono"
                value={form.rfid}
                onChange={(e) => setForm({ ...form, rfid: e.target.value })}
                placeholder="E280-1234..."
              />
            </div>
            <div>
              <Label className="text-[12px]">NFC Card ID</Label>
              <Input
                className="mt-1 h-8 text-[13px] font-mono"
                value={form.nfc}
                onChange={(e) => setForm({ ...form, nfc: e.target.value })}
                placeholder="04AB12CD..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="parking-button-submit-vehicle"
            >
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Register'}
            </Button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
