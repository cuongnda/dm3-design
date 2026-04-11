import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataTable, type Column, Button, AppModal, Input, Label } from '@dm3/ui';
import { Plus, Trash2 } from 'lucide-react';
import {
  listParkingFeeRules,
  createParkingFeeRule,
  deleteParkingFeeRule,
  type ParkingFeeRuleDTO,
} from '@dm3/api-client';

export function ParkingFeeRulesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [rateType, setRateType] = useState('hourly');
  const [vehicleType, setVehicleType] = useState('');
  const [baseRate, setBaseRate] = useState(0);
  const [hourlyRate, setHourlyRate] = useState(0);
  const [dailyMax, setDailyMax] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['parking-fee-rules', page],
    queryFn: () => listParkingFeeRules({ page, limit: 20 }),
  });

  const resetForm = () => {
    setName(''); setRateType('hourly'); setVehicleType('');
    setBaseRate(0); setHourlyRate(0); setDailyMax(0);
  };

  const createMutation = useMutation({
    mutationFn: () => createParkingFeeRule({
      name,
      rate_type: rateType,
      vehicle_type: vehicleType || undefined,
      base_rate: baseRate,
      hourly_rate: hourlyRate,
      daily_max: dailyMax || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parking-fee-rules'] });
      setShowForm(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteParkingFeeRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parking-fee-rules'] }),
  });

  const rules = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: Column<ParkingFeeRuleDTO>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'rate_type', header: 'Rate Type', width: '100px', render: (r) => <span className="capitalize text-[12px]">{r.rate_type}</span> },
    { key: 'vehicle_type', header: 'Vehicle', width: '90px', render: (r) => <span className="capitalize text-[12px] text-muted-foreground">{r.vehicle_type ?? 'All'}</span> },
    { key: 'base_rate', header: 'Base Rate', width: '100px', render: (r) => <span className="text-[12px]">{r.base_rate.toLocaleString()} {r.currency}</span> },
    { key: 'hourly_rate', header: 'Hourly', width: '100px', render: (r) => <span className="text-[12px]">{r.hourly_rate.toLocaleString()} {r.currency}</span> },
    { key: 'daily_max', header: 'Daily Max', width: '100px', render: (r) => <span className="text-[12px]">{r.daily_max ? `${r.daily_max.toLocaleString()} ${r.currency}` : '—'}</span> },
    { key: 'priority', header: 'Priority', width: '70px', render: (r) => <span className="text-[12px] text-muted-foreground">{r.priority}</span> },
    { key: 'status', header: 'Status', width: '80px', render: (r) => (
      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${r.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>{r.status}</span>
    )},
    {
      key: 'actions', header: '', width: '60px',
      render: (r) => (
        <Button size="xs" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(r.id)} data-testid="parking-button-delete-fee-rule">
          <Trash2 size={14} />
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Fee Rules" description="Configure parking fee schedules and pricing">
        <Button size="sm" onClick={() => setShowForm(true)} className="bg-amber-600 hover:bg-amber-700" data-testid="parking-button-create-fee-rule">
          <Plus size={16} className="mr-1" /> Add Fee Rule
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading fee rules...</div>
      ) : (
        <DataTable columns={columns} data={rules} rowKey={(r) => r.id} pageSize={20} />
      )}

      <AppModal open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); resetForm(); } }} title="Create Fee Rule">
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">Name *</Label>
            <Input className="mt-1 h-8 text-[13px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard Hourly Rate" data-testid="parking-input-fee-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Rate Type</Label>
              <select className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]" value={rateType} onChange={(e) => setRateType(e.target.value)}>
                <option value="hourly">Hourly</option>
                <option value="flat">Flat</option>
                <option value="tiered">Tiered</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <div>
              <Label className="text-[12px]">Vehicle Type</Label>
              <select className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                <option value="">All</option>
                <option value="car">Car</option>
                <option value="motorbike">Motorbike</option>
                <option value="truck">Truck</option>
                <option value="bicycle">Bicycle</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[12px]">Base Rate (VND)</Label>
              <Input type="number" className="mt-1 h-8 text-[13px]" value={baseRate} onChange={(e) => setBaseRate(Number(e.target.value))} min={0} data-testid="parking-input-fee-base" />
            </div>
            <div>
              <Label className="text-[12px]">Hourly Rate (VND)</Label>
              <Input type="number" className="mt-1 h-8 text-[13px]" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} min={0} data-testid="parking-input-fee-hourly" />
            </div>
            <div>
              <Label className="text-[12px]">Daily Max (VND)</Label>
              <Input type="number" className="mt-1 h-8 text-[13px]" value={dailyMax} onChange={(e) => setDailyMax(Number(e.target.value))} min={0} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button size="sm" disabled={!name.trim() || createMutation.isPending} onClick={() => createMutation.mutate()} className="bg-amber-600 hover:bg-amber-700" data-testid="parking-button-submit-fee-rule">
              {createMutation.isPending ? 'Saving...' : 'Create'}
            </Button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
