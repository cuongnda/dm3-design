import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataTable, type Column, Button, AppModal, Input, Label } from '@dm3/ui';
import { Plus, Trash2 } from 'lucide-react';
import {
  listParkingPasses,
  createParkingPass,
  deleteParkingPass,
  listParkingVehicles,
  listParkingZones,
  type ParkingPassDTO,
} from '@dm3/api-client';

export function ParkingPassesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [zoneId, setZoneId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [passType, setPassType] = useState('monthly');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [feeAmount, setFeeAmount] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['parking-passes', page],
    queryFn: () => listParkingPasses({ page, limit: 20 }),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ['parking-vehicles-all'],
    queryFn: () => listParkingVehicles({ limit: 100 }),
  });

  const { data: zonesData } = useQuery({
    queryKey: ['parking-zones-all'],
    queryFn: () => listParkingZones({ limit: 100 }),
  });

  const resetForm = () => {
    setZoneId(''); setVehicleId(''); setPassType('monthly');
    setValidFrom(''); setValidUntil(''); setFeeAmount(0);
  };

  const createMutation = useMutation({
    mutationFn: () => createParkingPass({
      zone_id: zoneId,
      vehicle_id: vehicleId,
      pass_type: passType,
      valid_from: new Date(validFrom).toISOString(),
      valid_until: new Date(validUntil).toISOString(),
      fee_amount: feeAmount,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parking-passes'] });
      setShowForm(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteParkingPass(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parking-passes'] }),
  });

  const passes = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: Column<ParkingPassDTO>[] = [
    { key: 'pass_type', header: 'Type', width: '90px', render: (r) => <span className="capitalize text-[12px] font-medium">{r.pass_type}</span> },
    { key: 'vehicle_id', header: 'Vehicle', width: '120px', render: (r) => <span className="font-mono text-[12px]">{r.vehicle_id.slice(0, 8)}...</span> },
    { key: 'zone_id', header: 'Zone', width: '120px', render: (r) => <span className="text-[12px] text-muted-foreground">{r.zone_id.slice(0, 8)}...</span> },
    {
      key: 'valid_from', header: 'Valid From', width: '110px',
      render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{new Date(r.valid_from).toLocaleDateString()}</span>,
    },
    {
      key: 'valid_until', header: 'Valid Until', width: '110px',
      render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{new Date(r.valid_until).toLocaleDateString()}</span>,
    },
    { key: 'fee_amount', header: 'Fee', width: '100px', render: (r) => <span className="text-[12px]">{r.fee_amount.toLocaleString()} VND</span> },
    { key: 'status', header: 'Status', width: '80px', render: (r) => (
      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
        r.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
        r.status === 'expired' ? 'bg-gray-500/20 text-gray-400' :
        'bg-muted text-muted-foreground'
      }`}>{r.status}</span>
    )},
    { key: 'auto_renew', header: 'Auto', width: '50px', render: (r) => <span className="text-[12px]">{r.auto_renew ? 'Yes' : 'No'}</span> },
    {
      key: 'actions', header: '', width: '60px',
      render: (r) => (
        <Button size="xs" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(r.id)} data-testid="parking-button-delete-pass">
          <Trash2 size={14} />
        </Button>
      ),
    },
  ];

  const canCreate = zoneId && vehicleId && validFrom && validUntil;

  return (
    <div>
      <PageHeader title="Parking Passes" description="Manage monthly and special parking passes">
        <Button size="sm" onClick={() => setShowForm(true)} className="bg-amber-600 hover:bg-amber-700" data-testid="parking-button-create-pass">
          <Plus size={16} className="mr-1" /> Create Pass
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading passes...</div>
      ) : (
        <DataTable columns={columns} data={passes} rowKey={(r) => r.id} pageSize={20} />
      )}

      <AppModal open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); resetForm(); } }} title="Create Parking Pass">
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">Vehicle *</Label>
            <select className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} data-testid="parking-select-pass-vehicle">
              <option value="">Select vehicle...</option>
              {(vehiclesData?.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.plate_number} ({v.type})</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[12px]">Zone *</Label>
            <select className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]" value={zoneId} onChange={(e) => setZoneId(e.target.value)} data-testid="parking-select-pass-zone">
              <option value="">Select zone...</option>
              {(zonesData?.data ?? []).map((z) => (
                <option key={z.id} value={z.id}>{z.name} ({z.code})</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[12px]">Pass Type</Label>
            <select className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]" value={passType} onChange={(e) => setPassType(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="vip">VIP</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Valid From *</Label>
              <Input type="date" className="mt-1 h-8 text-[13px]" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} data-testid="parking-input-pass-from" />
            </div>
            <div>
              <Label className="text-[12px]">Valid Until *</Label>
              <Input type="date" className="mt-1 h-8 text-[13px]" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} data-testid="parking-input-pass-until" />
            </div>
          </div>
          <div>
            <Label className="text-[12px]">Fee Amount (VND)</Label>
            <Input type="number" className="mt-1 h-8 text-[13px]" value={feeAmount} onChange={(e) => setFeeAmount(Number(e.target.value))} min={0} data-testid="parking-input-pass-fee" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button size="sm" disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()} className="bg-amber-600 hover:bg-amber-700" data-testid="parking-button-submit-pass">
              {createMutation.isPending ? 'Saving...' : 'Create'}
            </Button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
