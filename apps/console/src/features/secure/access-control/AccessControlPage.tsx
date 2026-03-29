import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { StatusBadge } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useDoors } from '@/lib/hooks';
import { useRealtimeStore, useDoorStatus } from '@dm3/api-client';
import type { DoorDTO } from '@/lib/api';

// Remove dependency on @dm3/api-client Door type, define locally
interface Door {
  id: string;
  name: string;
  location: string;
  type: 'door' | 'gate' | 'barrier' | 'lift' | 'turnstile';
  status: 'online' | 'offline' | 'alarm' | 'warning';
  lastEvent?: { time: string; result: 'granted' | 'denied' | 'forced' };
  realtimeStatus?: {
    state: string;
    lastUpdate: Date;
    forced?: boolean;
  };
}

function mapDoor(d: DoorDTO, realtimeStatuses: any[]): Door {
  const statusMap: Record<string, Door['status']> = {
    online: 'online', 
    offline: 'offline', 
    alarm: 'alarm', 
    warning: 'warning',
  };
  
  const typeMap: Record<string, Door['type']> = {
    door: 'door',
    gate: 'gate', 
    barrier: 'barrier',
    lift: 'lift',
    turnstile: 'turnstile',
  };

  // Check for real-time status override
  const realtimeStatus = realtimeStatuses.find(s => s.doorId === d.id);
  let finalStatus = statusMap[d.status] || 'online';
  
  if (realtimeStatus) {
    // Override status based on real-time data
    if (realtimeStatus.forced) {
      finalStatus = 'alarm';
    } else if (realtimeStatus.state === 'alarm') {
      finalStatus = 'alarm';
    } else if (realtimeStatus.state === 'locked' || realtimeStatus.state === 'unlocked') {
      finalStatus = 'online';
    }
  }
  
  return {
    id: d.id,
    name: d.name,
    location: d.location || '—',
    type: typeMap[d.type] || 'door',
    status: finalStatus,
    lastEvent: d.last_event_at ? {
      time: new Date(d.last_event_at).toLocaleTimeString('vi-VN'),
      result: 'granted' // TODO: Get from event data
    } : undefined,
    realtimeStatus: realtimeStatus ? {
      state: realtimeStatus.state,
      lastUpdate: realtimeStatus.lastUpdate,
      forced: realtimeStatus.forced,
    } : undefined,
  };
}

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

export function AccessControlPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Real-time state — connection managed by <RealtimeProvider> in App.tsx
  const isConnected = useRealtimeStore((s) => s.connected);
  const doorStatuses = useDoorStatus() as any[];

  // Build search params for API
  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (activeTab) params.status = activeTab;
  if (typeFilter) params.type = typeFilter;
  
  const { data: doorsData, isLoading, error } = useDoors(1, params);
  const doors: Door[] = (doorsData?.data ?? []).map(d => mapDoor(d, doorStatuses));

  const onlineCount = doors.filter((d) => d.status === 'online').length;
  const offlineCount = doors.filter((d) => d.status === 'offline').length;
  const alarmCount = doors.filter((d) => d.status === 'alarm').length;
  const warningCount = doors.filter((d) => d.status === 'warning').length;

  const tabs = [
    { label: 'All', count: doors.length, filter: null },
    { label: 'Online', count: onlineCount, filter: 'online' },
    { label: 'Offline', count: offlineCount, filter: 'offline' },
    { label: 'Alarm', count: alarmCount, filter: 'alarm' },
    { label: 'Warning', count: warningCount, filter: 'warning' },
  ];

  // Apply additional client-side filters not handled by API
  const filtered = doors.filter((d) => {
    // API already handles search and status filter
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
      render: (r) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={r.status} />
          {r.realtimeStatus && (
            <span className="text-[10px] text-[#64748B]">
              {isConnected && <span className="text-[#22C55E]">●</span>} 
              {r.realtimeStatus.state}
            </span>
          )}
        </div>
      ),
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
        <select 
          value={buildingFilter}
          onChange={(e) => setBuildingFilter(e.target.value)}
          className="h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]"
        >
          <option value="">All Buildings</option>
          {/* TODO: Get building list from API */}
        </select>
        <select 
          value={floorFilter}
          onChange={(e) => setFloorFilter(e.target.value)}
          className="h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]"
        >
          <option value="">All Floors</option>
          {/* TODO: Get floor list from API */}
        </select>
        <select 
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]"
        >
          <option value="">All Types</option>
          <option value="door">Door</option>
          <option value="gate">Gate</option>
          <option value="barrier">Barrier</option>
          <option value="lift">Lift</option>
          <option value="turnstile">Turnstile</option>
        </select>
      </div>

      {/* Loading & Error States */}
      {isLoading && <div className="text-center py-8 text-[#94A3B8]">Đang tải...</div>}
      {error && <div className="text-center py-8 text-[#EF4444]">Có lỗi xảy ra khi tải dữ liệu</div>}

      {/* Table */}
      {!isLoading && !error && (
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
      )}
    </div>
  );
}
