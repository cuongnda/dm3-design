import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataTable, type Column, Button, AppModal, Input, Label } from '@dm3/ui';
import { Plus, Trash2 } from 'lucide-react';
import {
  listParkingVehicles,
  createParkingVehicle,
  deleteParkingVehicle,
  type ParkingVehicleDTO,
} from '@dm3/api-client';

export function ParkingVehiclesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [plate, setPlate] = useState('');
  const [vType, setVType] = useState('car');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['parking-vehicles', page],
    queryFn: () => listParkingVehicles({ page, limit: 20 }),
  });

  const resetForm = () => { setPlate(''); setVType('car'); setCategory(''); setBrand(''); setColor(''); };

  const createMutation = useMutation({
    mutationFn: () => createParkingVehicle({
      plate_number: plate,
      type: vType,
      category: category || undefined,
      brand: brand || undefined,
      color: color || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parking-vehicles'] });
      setShowForm(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteParkingVehicle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parking-vehicles'] }),
  });

  const vehicles = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: Column<ParkingVehicleDTO>[] = [
    { key: 'plate_number', header: 'Plate', width: '130px', render: (r) => <span className="font-mono font-medium">{r.plate_number}</span> },
    { key: 'type', header: 'Type', width: '80px', render: (r) => <span className="capitalize text-[12px]">{r.type}</span> },
    { key: 'category', header: 'Category', width: '100px', render: (r) => <span className="capitalize text-[12px] text-muted-foreground">{r.category}</span> },
    { key: 'brand', header: 'Brand', width: '100px', render: (r) => <span className="text-[12px] text-muted-foreground">{r.brand ?? '—'}</span> },
    { key: 'color', header: 'Color', width: '80px', render: (r) => <span className="text-[12px] text-muted-foreground">{r.color ?? '—'}</span> },
    { key: 'registration_status', header: 'Status', width: '100px', render: (r) => (
      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
        r.registration_status === 'registered' ? 'bg-emerald-500/20 text-emerald-400' :
        r.registration_status === 'blacklisted' ? 'bg-red-500/20 text-red-400' :
        'bg-muted text-muted-foreground'
      }`}>{r.registration_status}</span>
    )},
    {
      key: 'created_at', header: 'Registered', width: '120px',
      render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>,
    },
    {
      key: 'actions', header: '', width: '60px',
      render: (r) => (
        <Button size="xs" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(r.id)} data-testid="parking-button-delete-vehicle">
          <Trash2 size={14} />
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Registered Vehicles" description="Manage vehicles registered in the parking system">
        <Button size="sm" onClick={() => setShowForm(true)} className="bg-amber-600 hover:bg-amber-700" data-testid="parking-button-create-vehicle">
          <Plus size={16} className="mr-1" /> Register Vehicle
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading vehicles...</div>
      ) : (
        <DataTable columns={columns} data={vehicles} rowKey={(r) => r.id} pageSize={20} />
      )}

      <AppModal open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); resetForm(); } }} title="Register Vehicle">
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">Plate Number *</Label>
            <Input className="mt-1 h-8 text-[13px]" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="e.g. 51A-12345" data-testid="parking-input-plate" />
          </div>
          <div>
            <Label className="text-[12px]">Vehicle Type</Label>
            <select className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]" value={vType} onChange={(e) => setVType(e.target.value)} data-testid="parking-select-vehicle-type">
              <option value="car">Car</option>
              <option value="motorbike">Motorbike</option>
              <option value="bicycle">Bicycle</option>
              <option value="truck">Truck</option>
              <option value="bus">Bus</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Brand</Label>
              <Input className="mt-1 h-8 text-[13px]" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Toyota" />
            </div>
            <div>
              <Label className="text-[12px]">Color</Label>
              <Input className="mt-1 h-8 text-[13px]" value={color} onChange={(e) => setColor(e.target.value)} placeholder="White" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button size="sm" disabled={!plate.trim() || createMutation.isPending} onClick={() => createMutation.mutate()} className="bg-amber-600 hover:bg-amber-700" data-testid="parking-button-submit-vehicle">
              {createMutation.isPending ? 'Saving...' : 'Register'}
            </Button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
