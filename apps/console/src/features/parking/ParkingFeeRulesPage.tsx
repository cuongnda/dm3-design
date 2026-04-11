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

function formatRate(rates: Record<string, unknown>): string {
  const currency = (rates.currency as string) ?? 'VND';
  const firstHour = rates.first_hour as number | undefined;
  const amount = rates.amount as number | undefined;
  if (firstHour != null) return `${firstHour.toLocaleString()} ${currency}`;
  if (amount != null) return `${amount.toLocaleString()} ${currency}`;
  return '—';
}

function formatCurrency(rates: Record<string, unknown>): string {
  return (rates.currency as string) ?? 'VND';
}

export function ParkingFeeRulesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [rateType, setRateType] = useState('hourly');
  const [vehicleType, setVehicleType] = useState('car');
  const [firstHour, setFirstHour] = useState(0);
  const [additionalHour, setAdditionalHour] = useState(0);
  const [freeMinutes, setFreeMinutes] = useState(0);
  const [maxDaily, setMaxDaily] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['parking-fee-rules', page],
    queryFn: () => listParkingFeeRules({ page, limit: 20 }),
  });

  const resetForm = () => {
    setName(''); setRateType('hourly'); setVehicleType('car');
    setFirstHour(0); setAdditionalHour(0); setFreeMinutes(0); setMaxDaily(0);
  };

  const createMutation = useMutation({
    mutationFn: () => createParkingFeeRule({
      name,
      rate_type: rateType,
      vehicle_type: vehicleType,
      rates: { first_hour: firstHour, additional_hour: additionalHour, currency: 'VND' },
      free_minutes: freeMinutes,
      max_daily: maxDaily || undefined,
      applies_to: 'all',
      priority: 10,
      enabled: true,
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
    { key: 'vehicle_type', header: 'Vehicle', width: '90px', render: (r) => <span className="capitalize text-[12px] text-muted-foreground">{r.vehicle_type || 'All'}</span> },
    { key: 'rates', header: 'Rate', width: '120px', render: (r) => <span className="text-[12px]">{formatRate(r.rates)}</span> },
    { key: 'free_minutes', header: 'Free Min', width: '80px', render: (r) => <span className="text-[12px]">{r.free_minutes}</span> },
    { key: 'max_daily', header: 'Daily Max', width: '110px', render: (r) => <span className="text-[12px]">{r.max_daily ? `${r.max_daily.toLocaleString()} ${formatCurrency(r.rates)}` : '—'}</span> },
    { key: 'applies_to', header: 'Applies To', width: '90px', render: (r) => <span className="capitalize text-[12px] text-muted-foreground">{r.applies_to}</span> },
    { key: 'priority', header: 'Priority', width: '70px', render: (r) => <span className="text-[12px] text-muted-foreground">{r.priority}</span> },
    { key: 'enabled', header: 'Status', width: '80px', render: (r) => (
      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${r.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>{r.enabled ? 'active' : 'disabled'}</span>
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
                <option value="daily">Daily</option>
              </select>
            </div>
            <div>
              <Label className="text-[12px]">Vehicle Type *</Label>
              <select className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                <option value="car">Car</option>
                <option value="motorbike">Motorbike</option>
                <option value="truck">Truck</option>
                <option value="bicycle">Bicycle</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">First Hour (VND)</Label>
              <Input type="number" className="mt-1 h-8 text-[13px]" value={firstHour} onChange={(e) => setFirstHour(Number(e.target.value))} min={0} data-testid="parking-input-fee-first-hour" />
            </div>
            <div>
              <Label className="text-[12px]">Additional Hour (VND)</Label>
              <Input type="number" className="mt-1 h-8 text-[13px]" value={additionalHour} onChange={(e) => setAdditionalHour(Number(e.target.value))} min={0} data-testid="parking-input-fee-additional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Free Minutes</Label>
              <Input type="number" className="mt-1 h-8 text-[13px]" value={freeMinutes} onChange={(e) => setFreeMinutes(Number(e.target.value))} min={0} />
            </div>
            <div>
              <Label className="text-[12px]">Daily Max (VND)</Label>
              <Input type="number" className="mt-1 h-8 text-[13px]" value={maxDaily} onChange={(e) => setMaxDaily(Number(e.target.value))} min={0} />
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
