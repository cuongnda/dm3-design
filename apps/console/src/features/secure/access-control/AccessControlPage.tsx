import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader, DataTable, type Column, StatusBadge, Button, Input, Select, SelectOption } from '@dm3/ui';
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
  door: { text: 'text-secure', border: 'border-secure/30' },
  gate: { text: 'text-manage', border: 'border-manage/30' },
  barrier: { text: 'text-operate', border: 'border-operate/30' },
  lift: { text: 'text-smart', border: 'border-smart/30' },
  turnstile: { text: 'text-success', border: 'border-success/30' },
};

const resultClass: Record<string, string> = {
  granted: 'text-success',
  denied: 'text-error',
  forced: 'text-error font-bold',
};

export function AccessControlPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('secure');
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
    { label: t('accessControl.tabs.all'), count: doors.length, filter: null },
    { label: t('accessControl.tabs.online'), count: onlineCount, filter: 'online' },
    { label: t('accessControl.tabs.offline'), count: offlineCount, filter: 'offline' },
    { label: t('accessControl.tabs.alarm'), count: alarmCount, filter: 'alarm' },
    { label: t('accessControl.tabs.warning'), count: warningCount, filter: 'warning' },
  ];

  // Apply additional client-side filters not handled by API
  const filtered = doors.filter(() => {
    // API already handles search and status filter
    return true;
  });

  const columns: Column<Door>[] = [
    {
      key: 'name', header: t('accessControl.table.name'), sortable: true,
      render: (r) => (
        <span className={cn('font-medium', r.status === 'alarm' && 'text-error')}>
          {r.status === 'alarm' && '⚠ '}{r.name}
        </span>
      ),
    },
    { key: 'location', header: t('accessControl.table.location'), sortable: true, render: (r) => <span className="text-muted-foreground">{r.location}</span> },
    {
      key: 'type', header: t('accessControl.table.type'), width: '100px',
      render: (r) => {
        const tc = typeColors[r.type];
        return (
          <span className={cn('inline-block px-2 py-0.5 rounded text-[11px] font-medium border', tc.text, tc.border)}>
            {t(`accessControl.types.${r.type}`)}
          </span>
        );
      },
    },
    {
      key: 'status', header: t('accessControl.table.status'), width: '110px',
      render: (r) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={r.status} />
          {r.realtimeStatus && (
            <span className="text-[10px] text-muted-foreground">
              {isConnected && <span className="text-success">●</span>} 
              {r.realtimeStatus.state}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'lastEvent', header: t('accessControl.table.lastEvent'), width: '180px',
      render: (r) => {
        if (!r.lastEvent) return <span className="text-muted-foreground">—</span>;
        return (
          <span>
            <span className="font-mono text-[11px] text-muted-foreground mr-2">{r.lastEvent.time}</span>
            <span className={cn('text-[12px] font-medium', resultClass[r.lastEvent.result])}>
              {r.lastEvent.result === 'granted' ? t('accessControl.events.granted') : 
               r.lastEvent.result === 'denied' ? t('accessControl.events.denied') : 
               t('accessControl.events.forced')}
            </span>
          </span>
        );
      },
    },
    {
      key: 'actions', header: '', width: '50px',
      render: () => (
        <Button variant="ghost" size="icon-xs" className="text-[14px]">⋮</Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t('accessControl.title')}>
        <Button size="sm" variant="outline" onClick={() => navigate('/secure/access-control/rules')}>
          {t('accessControl.rules')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate('/secure/access-control/access-time')}>
          Access Time
        </Button>
        <Button size="sm">{t('accessControl.addDoor')}</Button>
      </PageHeader>

      {/* Tabs */}
      <div className="flex border-b border-border mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActiveTab(tab.filter)}
            className={cn(
              'px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer',
              activeTab === tab.filter
                ? 'text-foreground border-secure'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            )}
          >
            {tab.label}
            <span className={cn(
              'ml-1.5 text-[11px] px-1.5 py-0 rounded-full',
              activeTab === tab.filter ? 'bg-secure/15 text-secure' : 'bg-muted text-muted-foreground'
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('accessControl.searchPlaceholder')}
          className="flex-1 h-8 text-[13px]"
        />
        <Select
          value={buildingFilter}
          onChange={(e) => setBuildingFilter(e.target.value)}
          className="w-40 h-8 text-[12px]"
        >
          <SelectOption value="">{t('accessControl.filters.allBuildings')}</SelectOption>
          {/* TODO: Get building list from API */}
        </Select>
        <Select
          value={floorFilter}
          onChange={(e) => setFloorFilter(e.target.value)}
          className="w-36 h-8 text-[12px]"
        >
          <SelectOption value="">{t('accessControl.filters.allFloors')}</SelectOption>
          {/* TODO: Get floor list from API */}
        </Select>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-36 h-8 text-[12px]"
        >
          <SelectOption value="">{t('accessControl.filters.allTypes')}</SelectOption>
          <SelectOption value="door">{t('accessControl.types.door')}</SelectOption>
          <SelectOption value="gate">{t('accessControl.types.gate')}</SelectOption>
          <SelectOption value="barrier">{t('accessControl.types.barrier')}</SelectOption>
          <SelectOption value="lift">{t('accessControl.types.lift')}</SelectOption>
          <SelectOption value="turnstile">{t('accessControl.types.turnstile')}</SelectOption>
        </Select>
      </div>

      {/* Loading & Error States */}
      {isLoading && <div className="text-center py-8 text-muted-foreground">{t('accessControl.loading')}</div>}
      {error && <div className="text-center py-8 text-error">{t('accessControl.error')}</div>}

      {/* Table */}
      {!isLoading && !error && (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/secure/access-control/${r.id}`)}
          rowClassName={(r) =>
            r.status === 'alarm' ? 'bg-error/5' :
            r.status === 'offline' ? 'opacity-60' : ''
          }
        />
      )}
    </div>
  );
}
