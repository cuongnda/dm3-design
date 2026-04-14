import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, DoorOpen,
  Radio, Pause, Play, Trash2, Search,
} from 'lucide-react';
import {
  useRealtimeStore,
  useConnectionStatus,
  type RealtimeAccessEvent,
  type RealtimeAlarm,
  type DoorStatus,
} from '@dm3/api-client';
import { Button, Input, Select, SelectOption, PageHeader } from '@dm3/ui';
import { apiFetch } from '@/lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Merged row rendered in the timeline. Access / alarm / door events all
 * collapse to this shape so the table stays flat and sortable by time.
 */
type RowKind = 'access' | 'alarm' | 'door';

interface TimelineRow {
  id: string;
  kind: RowKind;
  time: Date;
  deviceId: string;
  subject: string;          // person name, alarm type, or door id
  result?: string;          // granted / denied / forced / state
  detail?: string;          // reason / severity / extra info
  department?: string;      // access events only — from identity enrichment
  cardId?: string;          // access events only — primary active card value
}

// ─── Backend event shape (matches handlers.ListEvents) ─────────────────────

interface BackendEvent {
  id: string;
  device_id: string;
  event_type: string;
  user_name: string;
  door_id: string;
  decision: string;
  reason: string;
  time: string;
  department?: string;
  card_id?: string;
}

async function fetchBackendEvents(): Promise<TimelineRow[]> {
  // ListEvents returns a flat JSON array (not wrapped in {events}).
  const res = await apiFetch<BackendEvent[]>(
    '/api/v1/gateway/events?page=1&limit=100',
  );
  const list = Array.isArray(res) ? res : [];
  return list.map((e) => ({
    id: `backend-${e.id}`,
    kind: 'access' as const,
    time: new Date(e.time),
    deviceId: e.device_id,
    subject: e.user_name || 'Unknown',
    result: e.decision,
    detail: e.reason || undefined,
    department: e.department || undefined,
    cardId: e.card_id || undefined,
  }));
}

// ─── Converters for realtime store events ──────────────────────────────────

function accessToRow(e: RealtimeAccessEvent): TimelineRow {
  return {
    id: `access-${e.id}`,
    kind: 'access',
    time: e.time,
    deviceId: e.deviceId,
    subject: e.personName || 'Unknown',
    result: e.decision,
    detail: e.reason,
    department: e.department,
    cardId: e.cardId,
  };
}

function alarmToRow(a: RealtimeAlarm): TimelineRow {
  return {
    id: `alarm-${a.id}`,
    kind: 'alarm',
    time: a.time,
    deviceId: a.deviceId,
    subject: a.alarmType,
    result: a.severity,
    detail: a.doorId ? `door ${a.doorId}` : a.zone,
  };
}

function doorToRow(d: DoorStatus, doorId: string): TimelineRow {
  return {
    id: `door-${doorId}-${d.lastUpdate.getTime()}`,
    kind: 'door',
    time: d.lastUpdate,
    deviceId: d.deviceId ?? '',
    subject: doorId,
    result: d.state,
    detail: d.forced ? 'forced' : undefined,
  };
}

// ─── Styling helpers ───────────────────────────────────────────────────────

const KIND_META: Record<RowKind, { icon: React.ElementType; label: string; color: string }> = {
  access: { icon: CheckCircle2, label: 'Access', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  alarm:  { icon: AlertTriangle, label: 'Alarm',  color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  door:   { icon: DoorOpen,      label: 'Door',   color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
};

function resultBadge(kind: RowKind, result?: string) {
  if (!result) return null;
  let cls = 'text-muted-foreground bg-muted';
  if (kind === 'access') {
    if (result === 'granted') cls = 'text-emerald-400 bg-emerald-500/10';
    else if (result === 'denied') cls = 'text-red-400 bg-red-500/10';
    else if (result === 'forced') cls = 'text-amber-400 bg-amber-500/10';
  } else if (kind === 'alarm') {
    if (result === 'critical') cls = 'text-red-400 bg-red-500/10';
    else if (result === 'warning') cls = 'text-amber-400 bg-amber-500/10';
    else cls = 'text-blue-400 bg-blue-500/10';
  } else if (kind === 'door') {
    if (result === 'open' || result === 'unlocked') cls = 'text-emerald-400 bg-emerald-500/10';
    else if (result === 'closed' || result === 'locked') cls = 'text-muted-foreground bg-muted';
    else cls = 'text-amber-400 bg-amber-500/10';
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${cls}`}>
      {result}
    </span>
  );
}

function formatTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour12: false }) + '.' +
    String(d.getMilliseconds()).padStart(3, '0');
}

// ─── Page ──────────────────────────────────────────────────────────────────

const MAX_ROWS = 200;

export function LiveEventsPage() {
  const { connected, connecting } = useConnectionStatus();

  // Local merged timeline. Realtime store only keeps access events;
  // alarms and door state come from separate store slices. We merge
  // everything here and cap at MAX_ROWS.
  const [rows, setRows] = useState<TimelineRow[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Filters
  const [enabledKinds, setEnabledKinds] = useState<Set<RowKind>>(
    new Set<RowKind>(['access', 'alarm', 'door']),
  );
  const [filterDevice, setFilterDevice] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [search, setSearch] = useState('');

  // Backfill once on mount.
  useEffect(() => {
    let cancelled = false;
    fetchBackendEvents()
      .then((backfill) => {
        if (cancelled) return;
        setRows((prev) => dedupAndCap([...backfill, ...prev]));
      })
      .catch(() => {/* silent — live feed still works */});
    return () => { cancelled = true; };
  }, []);

  // Subscribe to the realtime store without using React selectors (which
  // would re-render every time a new event arrives). We imperatively
  // append new items to our local merged list on each store tick.
  useEffect(() => {
    const handleStore = () => {
      if (pausedRef.current) return;
      const state = useRealtimeStore.getState();
      const merged: TimelineRow[] = [
        ...state.events.map(accessToRow),
        ...state.alarms.map(alarmToRow),
        ...Object.entries(state.doorStatuses).map(([doorId, d]) => doorToRow(d, doorId)),
      ];
      setRows((prev) => dedupAndCap([...merged, ...prev]));
    };
    // Pull once so we pick up anything the store already had before mount.
    handleStore();
    const unsub = useRealtimeStore.subscribe(handleStore);
    return () => { unsub(); };
  }, []);

  // Build the device filter dropdown from distinct devices in the list.
  const devices = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.deviceId) set.add(r.deviceId); });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter((r) => {
      if (!enabledKinds.has(r.kind)) return false;
      if (filterDevice && r.deviceId !== filterDevice) return false;
      if (filterResult && r.result !== filterResult) return false;
      if (q) {
        const hay = `${r.subject} ${r.deviceId} ${r.detail ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, enabledKinds, filterDevice, filterResult, search]);

  const toggleKind = (k: RowKind) => {
    setEnabledKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  // Live connection chip colors.
  const liveColor = connected
    ? 'text-emerald-400 bg-emerald-500/10'
    : connecting
      ? 'text-amber-400 bg-amber-500/10'
      : 'text-red-400 bg-red-500/10';
  const liveLabel = connected ? 'Live' : connecting ? 'Connecting…' : 'Offline';

  return (
    <div className="flex-1 min-h-0 flex flex-col p-6 gap-4">
      <PageHeader
        title="Monitoring"
        description="Real-time access, alarm, and door events across the tenant."
      >
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${liveColor}`}>
            <Radio size={12} className={connected ? 'animate-pulse' : ''} />
            {liveLabel}
          </span>
          <Button
            data-testid="monitoring-button-pause"
            variant="outline"
            size="sm"
            onClick={() => setPaused((p) => !p)}
            className="gap-1"
          >
            {paused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
          </Button>
          <Button
            data-testid="monitoring-button-clear"
            variant="outline"
            size="sm"
            onClick={() => setRows([])}
            className="gap-1"
          >
            <Trash2 size={13} /> Clear
          </Button>
        </div>
      </PageHeader>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(KIND_META) as RowKind[]).map((k) => {
          const meta = KIND_META[k];
          const Icon = meta.icon;
          const active = enabledKinds.has(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleKind(k)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12px] font-medium transition-colors ${
                active ? meta.color : 'text-muted-foreground bg-muted/30 border-border'
              }`}
              data-testid={`monitoring-chip-${k}`}
            >
              <Icon size={12} />
              {meta.label}
            </button>
          );
        })}

        <div className="w-px h-5 bg-border mx-1" />

        <Select
          value={filterDevice}
          onChange={(e) => setFilterDevice(e.target.value)}
          className="w-44"
          data-testid="monitoring-select-device"
        >
          <SelectOption value="">All devices</SelectOption>
          {devices.map((d) => <SelectOption key={d} value={d}>{d}</SelectOption>)}
        </Select>

        <Select
          value={filterResult}
          onChange={(e) => setFilterResult(e.target.value)}
          className="w-36"
          data-testid="monitoring-select-result"
        >
          <SelectOption value="">All results</SelectOption>
          <SelectOption value="granted">Granted</SelectOption>
          <SelectOption value="denied">Denied</SelectOption>
          <SelectOption value="forced">Forced</SelectOption>
        </Select>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search person / door / device"
            className="pl-8 h-8 text-[12px]"
            data-testid="monitoring-input-search"
          />
        </div>

        <div className="ml-auto text-[11px] text-muted-foreground">
          {filtered.length} / {rows.length} rows
          {paused && <span className="ml-2 text-amber-400">(paused)</span>}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border bg-card" data-testid="monitoring-table">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-muted/50 backdrop-blur z-10">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium w-32">Time</th>
              <th className="px-3 py-2 font-medium w-24">Type</th>
              <th className="px-3 py-2 font-medium w-48">Device</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium font-mono">Card ID</th>
              <th className="px-3 py-2 font-medium w-28">Result</th>
              <th className="px-3 py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-16 text-center text-muted-foreground">
                  <Activity size={24} className="mx-auto mb-2 opacity-40" />
                  {connected
                    ? 'Waiting for events…'
                    : 'Not connected to the realtime feed.'}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const meta = KIND_META[r.kind];
                const Icon = meta.icon;
                return (
                  <tr
                    key={r.id}
                    className="border-t border-border/50 hover:bg-muted/30 transition-colors"
                    data-testid={`monitoring-row-${r.id}`}
                  >
                    <td className="px-3 py-1.5 text-muted-foreground font-mono whitespace-nowrap">
                      {formatTime(r.time)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${meta.color}`}>
                        <Icon size={10} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground truncate max-w-[180px]">
                      {r.deviceId || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-foreground truncate max-w-[200px]">
                      {r.subject}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[160px]">
                      {r.department || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground font-mono truncate max-w-[160px]">
                      {r.cardId || '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      {resultBadge(r.kind, r.result)}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[240px]">
                      {r.detail ?? '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function dedupAndCap(list: TimelineRow[]): TimelineRow[] {
  const seen = new Set<string>();
  const out: TimelineRow[] = [];
  for (const r of list.sort((a, b) => b.time.getTime() - a.time.getTime())) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}
