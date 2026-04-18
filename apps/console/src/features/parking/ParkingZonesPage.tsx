import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, DataTable, type Column, Button, AppModal, Input, Label } from '@dm3/ui';
import { Plus, Trash2, Warehouse, Map } from 'lucide-react';
import {
  listParkingLots,
  listParkingZones,
  createParkingLot,
  createParkingZone,
  deleteParkingLot,
  deleteParkingZone,
  type ParkingLotDTO,
  type ParkingZoneDTO,
} from '@dm3/api-client';

export function ParkingZonesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'lots' | 'zones'>('lots');
  const [page, setPage] = useState(1);
  const [showLotForm, setShowLotForm] = useState(false);
  const [showZoneForm, setShowZoneForm] = useState(false);

  // Lot form
  const [lotName, setLotName] = useState('');
  const [lotCode, setLotCode] = useState('');
  const [lotDesc, setLotDesc] = useState('');

  // Zone form
  const [zoneName, setZoneName] = useState('');
  const [zoneCode, setZoneCode] = useState('');
  const [zoneLotId, setZoneLotId] = useState('');
  const [zoneSpaces, setZoneSpaces] = useState(0);
  const [zoneType, setZoneType] = useState('open');

  const { data: lotsData, isLoading: lotsLoading } = useQuery({
    queryKey: ['parking-lots', page],
    queryFn: () => listParkingLots({ page, limit: 20 }),
    enabled: tab === 'lots',
  });

  const { data: zonesData, isLoading: zonesLoading } = useQuery({
    queryKey: ['parking-zones', page],
    queryFn: () => listParkingZones({ page, limit: 20 }),
    enabled: tab === 'zones',
  });

  const { data: allLots } = useQuery({
    queryKey: ['parking-lots-all'],
    queryFn: () => listParkingLots({ limit: 100 }),
  });

  const createLotMutation = useMutation({
    mutationFn: () => createParkingLot({ name: lotName, code: lotCode, description: lotDesc || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parking-lots'] });
      setShowLotForm(false);
      setLotName(''); setLotCode(''); setLotDesc('');
    },
  });

  const deleteLotMutation = useMutation({
    mutationFn: (id: string) => deleteParkingLot(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parking-lots'] }),
  });

  const createZoneMutation = useMutation({
    mutationFn: () => createParkingZone({
      lot_id: zoneLotId,
      name: zoneName,
      code: zoneCode,
      type: zoneType,
      total_spaces: zoneSpaces,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parking-zones'] });
      setShowZoneForm(false);
      setZoneName(''); setZoneCode(''); setZoneLotId(''); setZoneSpaces(0); setZoneType('open');
    },
  });

  const deleteZoneMutation = useMutation({
    mutationFn: (id: string) => deleteParkingZone(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parking-zones'] }),
  });

  const lotColumns: Column<ParkingLotDTO>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'code', header: 'Code', width: '100px', render: (r) => <span className="font-mono text-[12px]">{r.code}</span> },
    { key: 'status', header: 'Status', width: '80px', render: (r) => (
      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${r.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>{r.status}</span>
    )},
    { key: 'zone_count', header: 'Zones', width: '70px', render: (r) => <span className="text-muted-foreground">{r.zone_count ?? 0}</span> },
    { key: 'active_session_count', header: 'Active', width: '70px', render: (r) => <span className="text-muted-foreground">{r.active_session_count ?? 0}</span> },
    {
      key: 'actions', header: '', width: '60px',
      render: (r) => (
        <Button size="xs" variant="ghost" className="text-destructive" onClick={() => deleteLotMutation.mutate(r.id)} data-testid="parking-button-delete-lot">
          <Trash2 size={14} />
        </Button>
      ),
    },
  ];

  const zoneColumns: Column<ParkingZoneDTO>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'code', header: 'Code', width: '100px', render: (r) => <span className="font-mono text-[12px]">{r.code}</span> },
    { key: 'type', header: 'Type', width: '90px', render: (r) => <span className="capitalize text-[12px]">{r.type}</span> },
    { key: 'total_spaces', header: 'Spaces', width: '70px', render: (r) => <span>{r.total_spaces}</span> },
    { key: 'status', header: 'Status', width: '80px', render: (r) => (
      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${r.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>{r.status}</span>
    )},
    { key: 'active_session_count', header: 'Active', width: '70px', render: (r) => <span className="text-muted-foreground">{r.active_session_count ?? 0}</span> },
    {
      key: 'actions', header: '', width: '60px',
      render: (r) => (
        <Button size="xs" variant="ghost" className="text-destructive" onClick={() => deleteZoneMutation.mutate(r.id)} data-testid="parking-button-delete-zone">
          <Trash2 size={14} />
        </Button>
      ),
    },
  ];

  const isLoading = tab === 'lots' ? lotsLoading : zonesLoading;
  const tableData = tab === 'lots' ? (lotsData?.data ?? []) : (zonesData?.data ?? []);
  const tableTotal = tab === 'lots' ? (lotsData?.total ?? 0) : (zonesData?.total ?? 0);

  return (
    <div>
      <PageHeader title="Lots & Zones" description="Configure parking lots and their zones">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === 'lots' ? 'default' : 'outline'}
            onClick={() => { setTab('lots'); setPage(1); }}
            className={tab === 'lots' ? 'bg-amber-600 hover:bg-amber-700' : ''}
          >
            Lots
          </Button>
          <Button
            size="sm"
            variant={tab === 'zones' ? 'default' : 'outline'}
            onClick={() => { setTab('zones'); setPage(1); }}
            className={tab === 'zones' ? 'bg-amber-600 hover:bg-amber-700' : ''}
          >
            Zones
          </Button>
          <Button
            size="sm"
            onClick={() => tab === 'lots' ? setShowLotForm(true) : setShowZoneForm(true)}
            className="bg-amber-600 hover:bg-amber-700"
            data-testid="parking-button-create-lot-zone"
          >
            <Plus size={16} className="mr-1" /> {tab === 'lots' ? 'Add Lot' : 'Add Zone'}
          </Button>
        </div>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : tab === 'lots' ? (
        <DataTable
          columns={lotColumns}
          data={(lotsData?.data ?? []) as ParkingLotDTO[]}
          rowKey={(r) => r.id}
          pageSize={20}
          emptyIcon={<Warehouse size={32} strokeWidth={1.2} />}
          emptyTitle="No parking lots configured"
          emptyDescription="A parking lot is the top-level container (e.g. Main Building, Basement). Create one before adding zones and spaces."
          emptyAction={{
            label: 'Add Lot',
            icon: <Plus size={14} />,
            onClick: () => setShowLotForm(true),
            'data-testid': 'parking-button-create-lot-empty',
          }}
        />
      ) : (
        <DataTable
          columns={zoneColumns}
          data={(zonesData?.data ?? []) as ParkingZoneDTO[]}
          rowKey={(r) => r.id}
          pageSize={20}
          emptyIcon={<Map size={32} strokeWidth={1.2} />}
          emptyTitle="No zones configured yet"
          emptyDescription="Zones group spaces by type (open, covered, VIP, etc.) inside a lot, and drive capacity and pricing rules."
          emptyAction={{
            label: 'Add Zone',
            icon: <Plus size={14} />,
            onClick: () => setShowZoneForm(true),
            'data-testid': 'parking-button-create-zone-empty',
          }}
        />
      )}

      <AppModal open={showLotForm} onOpenChange={(o) => { if (!o) setShowLotForm(false); }} title="Create Parking Lot">
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">Name *</Label>
            <Input className="mt-1 h-8 text-[13px]" value={lotName} onChange={(e) => setLotName(e.target.value)} placeholder="Main Parking" data-testid="parking-input-lot-name" />
          </div>
          <div>
            <Label className="text-[12px]">Code *</Label>
            <Input className="mt-1 h-8 text-[13px]" value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="LOT-A" data-testid="parking-input-lot-code" />
          </div>
          <div>
            <Label className="text-[12px]">Description</Label>
            <Input className="mt-1 h-8 text-[13px]" value={lotDesc} onChange={(e) => setLotDesc(e.target.value)} placeholder="Optional" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowLotForm(false)}>Cancel</Button>
            <Button size="sm" disabled={!lotName.trim() || !lotCode.trim() || createLotMutation.isPending} onClick={() => createLotMutation.mutate()} className="bg-amber-600 hover:bg-amber-700" data-testid="parking-button-submit-lot">
              {createLotMutation.isPending ? 'Saving...' : 'Create'}
            </Button>
          </div>
        </div>
      </AppModal>

      <AppModal open={showZoneForm} onOpenChange={(o) => { if (!o) setShowZoneForm(false); }} title="Create Parking Zone">
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">Lot *</Label>
            <select className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]" value={zoneLotId} onChange={(e) => setZoneLotId(e.target.value)} data-testid="parking-select-zone-lot">
              <option value="">Select lot...</option>
              {(allLots?.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Name *</Label>
              <Input className="mt-1 h-8 text-[13px]" value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="Zone A1" data-testid="parking-input-zone-name" />
            </div>
            <div>
              <Label className="text-[12px]">Code *</Label>
              <Input className="mt-1 h-8 text-[13px]" value={zoneCode} onChange={(e) => setZoneCode(e.target.value)} placeholder="A1" data-testid="parking-input-zone-code" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Type</Label>
              <select className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]" value={zoneType} onChange={(e) => setZoneType(e.target.value)}>
                <option value="open">Open</option>
                <option value="covered">Covered</option>
                <option value="underground">Underground</option>
                <option value="rooftop">Rooftop</option>
                <option value="valet">Valet</option>
              </select>
            </div>
            <div>
              <Label className="text-[12px]">Total Spaces *</Label>
              <Input type="number" className="mt-1 h-8 text-[13px]" value={zoneSpaces} onChange={(e) => setZoneSpaces(Number(e.target.value))} min={1} data-testid="parking-input-zone-spaces" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowZoneForm(false)}>Cancel</Button>
            <Button size="sm" disabled={!zoneLotId || !zoneName.trim() || !zoneCode.trim() || zoneSpaces < 1 || createZoneMutation.isPending} onClick={() => createZoneMutation.mutate()} className="bg-amber-600 hover:bg-amber-700" data-testid="parking-button-submit-zone">
              {createZoneMutation.isPending ? 'Saving...' : 'Create'}
            </Button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
