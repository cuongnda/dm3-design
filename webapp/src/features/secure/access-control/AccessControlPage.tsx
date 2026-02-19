import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { cn } from '@/lib/utils';
import type { Door } from '@/types/models';

const mockDoors: Door[] = [
  { id: '1', name: 'Main Entrance', location: 'Bldg A, Floor 1', type: 'door', status: 'online', lastEvent: { id: 'e1', time: '09:15', personName: '', point: '', result: 'granted' } },
  { id: '2', name: 'Gate 1 — Vehicle Entry', location: 'Bldg A, Exterior', type: 'barrier', status: 'online', lastEvent: { id: 'e2', time: '09:14', personName: '', point: '', result: 'granted' } },
  { id: '3', name: 'Gate 2 — Vehicle Exit', location: 'Bldg A, Exterior', type: 'barrier', status: 'online', lastEvent: { id: 'e3', time: '09:12', personName: '', point: '', result: 'denied' } },
  { id: '4', name: 'Door 3 — Office Wing', location: 'Bldg A, Floor 2', type: 'door', status: 'online', lastEvent: { id: 'e4', time: '09:11', personName: '', point: '', result: 'granted' } },
  { id: '5', name: 'Door 5 — Lab Access', location: 'Bldg A, Floor 3', type: 'door', status: 'alarm', lastEvent: { id: 'e5', time: '09:10', personName: '', point: '', result: 'forced' } },
  { id: '6', name: 'Lift 1 — Main', location: 'Bldg A, Lobby', type: 'lift', status: 'online', lastEvent: { id: 'e6', time: '09:09', personName: '', point: '', result: 'granted' } },
  { id: '7', name: 'Turnstile 1', location: 'Bldg A, Lobby', type: 'turnstile', status: 'online', lastEvent: { id: 'e7', time: '09:08', personName: '', point: '', result: 'granted' } },
  { id: '8', name: 'Server Room', location: 'Bldg A, Floor 4', type: 'door', status: 'warning', lastEvent: { id: 'e8', time: '08:45', personName: '', point: '', result: 'granted' } },
  { id: '9', name: 'Door 8 — Storage', location: 'Bldg B, Floor 1', type: 'door', status: 'offline', lastEvent: { id: 'e9', time: '07:30', personName: '', point: '', result: 'granted' } },
  { id: '10', name: 'Turnstile 2', location: 'Bldg A, Lobby', type: 'turnstile', status: 'online', lastEvent: { id: 'e10', time: '09:07', personName: '', point: '', result: 'granted' } },
  { id: '11', name: 'Door 10 — Meeting Zone', location: 'Bldg A, Floor 5', type: 'door', status: 'online', lastEvent: { id: 'e11', time: '09:05', personName: '', point: '', result: 'granted' } },
  { id: '12', name: 'Door 12 — Loading Dock', location: 'Bldg B, Ground', type: 'gate', status: 'offline' },
  { id: '13', name: 'Door 14 — Rooftop', location: 'Bldg A, Roof', type: 'door', status: 'offline' },
  { id: '14', name: 'Lift 2 — Service', location: 'Bldg A, Rear', type: 'lift', status: 'online', lastEvent: { id: 'e14', time: '09:01', personName: '', point: '', result: 'granted' } },
  { id: '15', name: 'Door 15 — Emergency Exit B', location: 'Bldg B, Floor 2', type: 'door', status: 'offline' },
];

const typeColors: Record<string, { text: string; border: string }> = {
  door: { text: 'text-[#3B82F6]', border: 'border-[#3B82F6]/30' },
  gate: { text: 'text-[#8B5CF6]', border: 'border-[#8B5CF6]/30' },
  barrier: { text: 'text-[#F59E0B]', border: 'border-[#F59E0B]/30' },
  lift: { text: 'text-[#06B6D4]', border: 'border-[#06B6D4]/30' },
  turnstile: { text: 'text-[#22C55E]', border: 'border-[#22C55E]/30' },
};

const resultClass: Record<string, string> = {
  granted: 'text-[#22C55E]',
  denied: 'text-[#EF4444]',
  forced: 'text-[#EF4444] font-bold',
};

const tabs = [
  { label: 'All', count: 52, filter: null },
  { label: 'Online', count: 46, filter: 'online' },
  { label: 'Offline', count: 4, filter: 'offline' },
  { label: 'Alarm', count: 1, filter: 'alarm' },
  { label: 'Warning', count: 1, filter: 'warning' },
];

export function AccessControlPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = mockDoors.filter((d) => {
    if (activeTab && d.status !== activeTab) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const columns: Column<Door>[] = [
    {
      key: 'name', header: 'Name', sortable: true,
      render: (r) => (
        <span className={cn('font-medium', r.status === 'alarm' && 'text-[#EF4444]')}>
          {r.status === 'alarm' && '⚠ '}{r.name}
        </span>
      ),
    },
    { key: 'location', header: 'Location', sortable: true, render: (r) => <span className="text-[#94A3B8]">{r.location}</span> },
    {
      key: 'type', header: 'Type', width: '100px',
      render: (r) => {
        const tc = typeColors[r.type];
        return (
          <span className={cn('inline-block px-2 py-0.5 rounded text-[11px] font-medium border capitalize', tc.text, tc.border)}>
            {r.type}
          </span>
        );
      },
    },
    {
      key: 'status', header: 'Status', width: '110px',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'lastEvent', header: 'Last Event', width: '180px',
      render: (r) => {
        if (!r.lastEvent) return <span className="text-[#64748B]">—</span>;
        return (
          <span>
            <span className="font-mono text-[11px] text-[#64748B] mr-2">{r.lastEvent.time}</span>
            <span className={cn('text-[12px] font-medium', resultClass[r.lastEvent.result])}>
              {r.lastEvent.result === 'granted' ? 'Granted' : r.lastEvent.result === 'denied' ? 'Denied' : '⚠ Forced'}
            </span>
          </span>
        );
      },
    },
    {
      key: 'actions', header: '', width: '50px',
      render: () => (
        <button className="px-2 py-1 text-[#64748B] hover:bg-[#334155] hover:text-[#F8FAFC] rounded text-[14px]">⋮</button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Access Control">
        <button className="px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#F8FAFC] text-[12px] font-medium">⚙️ Rules</button>
        <button className="px-3 py-1.5 bg-[#2563EB] rounded-md text-white text-[12px] font-medium">+ Add Door</button>
      </PageHeader>

      {/* Tabs */}
      <div className="flex border-b border-[#1E293B] mb-4">
        {tabs.map((t) => (
          <button
            key={t.label}
            onClick={() => setActiveTab(t.filter)}
            className={cn(
              'px-4 py-2 text-[13px] font-medium border-b-2 transition-colors',
              activeTab === t.filter
                ? 'text-[#F8FAFC] border-[#3B82F6]'
                : 'text-[#94A3B8] border-transparent hover:text-[#F8FAFC]'
            )}
          >
            {t.label}
            <span className={cn(
              'ml-1.5 text-[11px] px-1.5 py-0 rounded-full',
              activeTab === t.filter ? 'bg-[#1E3A5F] text-[#3B82F6]' : 'bg-[#334155] text-[#94A3B8]'
            )}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search doors..."
          className="flex-1 h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none"
        />
        <select className="h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]">
          <option>All Buildings</option>
        </select>
        <select className="h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]">
          <option>All Floors</option>
        </select>
        <select className="h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]">
          <option>All Types</option>
        </select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/secure/access-control/${r.id}`)}
        rowClassName={(r) =>
          r.status === 'alarm' ? 'bg-[#7F1D1D]/10' :
          r.status === 'offline' ? 'opacity-60' : ''
        }
      />
    </div>
  );
}
