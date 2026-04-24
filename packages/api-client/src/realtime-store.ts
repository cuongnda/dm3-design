import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { WSEvent, AccessEventData, DoorStateData, DeviceStatusData, AlarmData } from './websocket';

export interface RealtimeAccessEvent {
  id: string;
  time: Date;
  deviceId: string;
  deviceName?: string;
  companyId: string;
  personName?: string;
  userCode?: string;
  avatar?: string;
  doorId?: string;
  doorName?: string;
  decision: string;
  reason?: string;
  credentialType?: string;
  direction?: string;
  confidence?: number;
  // Server-enriched via device-gateway mqtt_handler.enrichAccessData.
  department?: string;
  cardId?: string;
  cardIds?: string[];
  /** Typed credentials list for N-step verify; each entry has its own type. */
  credentials?: Array<{ type: string; value: string }>;
  /** Raw MinIO object key from `data.photo` on the access.log payload.
   *  Empty for events without an attached snapshot. Used as a fallback when
   *  `photoUrl` is absent (legacy event shapes) — assetUrl() handles the
   *  `/photos/...` prefix. */
  photoRef?: string;
  /** Presigned GET URL (5 min) populated when the publishing service had the
   *  object store wired up — most TungSon face paths do. Prefer this over
   *  photoRef: it lets the realtime monitoring page render the image
   *  immediately, without a REST refresh. */
  photoUrl?: string;
  /** Multi-camera snapshot keys from `data.photos` on the access.log payload
   *  (mqtt-protocol.md §4.1). Present when the device captured the event from
   *  multiple angles. Prefer `photoUrls` (presigned) over this raw list. When
   *  only a single photo exists, stays `undefined` and the single-photo
   *  fields above carry the value. */
  photoRefs?: string[];
  /** Parallel presigned GET URL list (5 min TTL), one per entry in photoRefs.
   *  Same precedence as photoUrl vs photoRef — prefer photoUrls when set. */
  photoUrls?: string[];
}

// Named RealtimeDeviceStatus to avoid collision with DeviceStatus const in types/enums
export interface RealtimeDeviceStatus {
  deviceId: string;
  online: boolean;
  lastSeen: Date;
  firmware?: string;
  ip?: string;
  cpuPct?: number;
  memPct?: number;
  diskPct?: number;
  uptimeSeconds?: number;
}

export interface DoorStatus {
  doorId: string;
  state: string;
  lastUpdate: Date;
  forced?: boolean;
  deviceId?: string;
}

export interface RealtimeAlarm {
  id: string;
  time: Date;
  deviceId: string;
  doorId?: string;
  zone?: string;
  alarmType: string;
  severity: 'info' | 'warning' | 'critical';
  acknowledged: boolean;
}

// Live progress for a manual "Transmit Data" job. Mirrors the backend
// gateway.SyncJob struct — see backend/internal/gateway/sync_job.go.
export interface SyncJobTypeStat {
  total: number;
  published: number;
  acked: number;
  status: 'pending' | 'publishing' | 'ok' | 'error';
  error?: string;
}

export interface SyncJob {
  id: string;
  tenant_id: string;
  device_id: string;
  types: string[];
  total: number;
  published: number;
  acked: number;
  started_at: string;
  finished_at?: string;
  per_type: Record<string, SyncJobTypeStat>;
  errors?: string[];
}

export interface RealtimeState {
  // Connection status
  connected: boolean;
  connecting: boolean;
  lastConnected?: Date;

  // Real-time data
  events: RealtimeAccessEvent[];
  deviceStatuses: Record<string, RealtimeDeviceStatus>;
  doorStatuses: Record<string, DoorStatus>;
  alarms: RealtimeAlarm[];
  syncJobs: Record<string, SyncJob>;

  // Actions
  setConnectionStatus: (connected: boolean, connecting?: boolean) => void;
  addAccessEvent: (event: RealtimeAccessEvent) => void;
  updateDeviceStatus: (status: RealtimeDeviceStatus) => void;
  updateDoorStatus: (status: DoorStatus) => void;
  addAlarm: (alarm: RealtimeAlarm) => void;
  acknowledgeAlarm: (alarmId: string) => void;
  upsertSyncJob: (job: SyncJob) => void;
  clearOldEvents: () => void;
  reset: () => void;
}

export const useRealtimeStore = create<RealtimeState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    connected: false,
    connecting: false,
    events: [],
    deviceStatuses: {},
    doorStatuses: {},
    alarms: [],
    syncJobs: {},

    // Actions
    setConnectionStatus: (connected, connecting = false) =>
      set({
        connected,
        connecting,
        lastConnected: connected ? new Date() : get().lastConnected,
      }),

    addAccessEvent: (event) =>
      set((state) => {
        // Check for duplicate
        if (state.events.some(e => e.id === event.id)) {
          return state;
        }

        const newEvents = [event, ...state.events]
          .sort((a, b) => b.time.getTime() - a.time.getTime()) // Latest first
          .slice(0, 50); // Keep max 50 events

        return { events: newEvents };
      }),

    updateDeviceStatus: (status) =>
      set((state) => ({
        deviceStatuses: {
          ...state.deviceStatuses,
          [status.deviceId]: status,
        },
      })),

    updateDoorStatus: (status) =>
      set((state) => ({
        doorStatuses: {
          ...state.doorStatuses,
          [status.doorId]: status,
        },
      })),

    addAlarm: (alarm) =>
      set((state) => {
        // Check for duplicate
        if (state.alarms.some(a => a.id === alarm.id)) {
          return state;
        }

        const newAlarms = [alarm, ...state.alarms]
          .sort((a, b) => b.time.getTime() - a.time.getTime()) // Latest first
          .slice(0, 100); // Keep max 100 alarms

        return { alarms: newAlarms };
      }),

    acknowledgeAlarm: (alarmId) =>
      set((state) => ({
        alarms: state.alarms.map(alarm =>
          alarm.id === alarmId ? { ...alarm, acknowledged: true } : alarm
        ),
      })),

    upsertSyncJob: (job) =>
      set((state) => ({
        syncJobs: { ...state.syncJobs, [job.id]: job },
      })),

    clearOldEvents: () =>
      set((state) => {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return {
          events: state.events.filter(e => e.time > oneDayAgo),
          alarms: state.alarms.filter(a => a.time > oneDayAgo),
        };
      }),

    reset: () =>
      set({
        connected: false,
        connecting: false,
        events: [],
        deviceStatuses: {},
        doorStatuses: {},
        alarms: [],
        syncJobs: {},
      }),
  }))
);

// Helper functions to transform WebSocket events to store format
export function transformAccessEvent(data: AccessEventData, event: WSEvent): RealtimeAccessEvent {
  return {
    id: `${event.device_id}-${event.time}-${data.door_id || 'unknown'}`,
    time: new Date(event.time),
    deviceId: event.device_id,
    companyId: event.company_id,
    deviceName: data.device_name || undefined,
    personName: data.person_name || data.user_name,
    userCode: data.user_code || undefined,
    avatar: data.avatar || undefined,
    doorId: data.door_id,
    doorName: data.door_id, // TODO: Map to actual door name
    decision: data.decision,
    reason: data.reason,
    credentialType: data.credential_type,
    direction: data.direction,
    confidence: data.confidence,
    department: data.department || undefined,
    cardId: data.card_id || undefined,
    cardIds: Array.isArray(data.card_ids) && data.card_ids.length > 0 ? data.card_ids : undefined,
    credentials: Array.isArray(data.credentials) && data.credentials.length > 0 ? data.credentials : undefined,
    photoRef: data.photo || undefined,
    photoUrl: data.photo_url || undefined,
    photoRefs: Array.isArray(data.photos) && data.photos.length > 0 ? data.photos : undefined,
    photoUrls: Array.isArray(data.photo_urls) && data.photo_urls.length > 0 ? data.photo_urls : undefined,
  };
}

export function transformDeviceStatus(data: DeviceStatusData, event: WSEvent): RealtimeDeviceStatus {
  return {
    deviceId: event.device_id,
    online: data.online,
    lastSeen: new Date(event.time),
    firmware: data.firmware,
    ip: data.ip,
    cpuPct: data.cpu_pct,
    memPct: data.mem_pct,
    diskPct: data.disk_pct,
    uptimeSeconds: data.uptime_s,
  };
}

export function transformDoorStatus(data: DoorStateData, event: WSEvent): DoorStatus {
  return {
    doorId: data.door_id,
    state: data.state,
    lastUpdate: new Date(event.time),
    forced: data.forced,
    deviceId: event.device_id,
  };
}

export function transformAlarmEvent(data: AlarmData, event: WSEvent): RealtimeAlarm {
  return {
    id: `${event.device_id}-${event.time}-${data.door_id || 'unknown'}`,
    time: new Date(event.time),
    deviceId: event.device_id,
    doorId: data.door_id,
    zone: data.zone,
    alarmType: data.alarm_type,
    severity: data.severity,
    acknowledged: false,
  };
}

// Selectors for common use cases
// NOTE: useShallow prevents infinite re-render loops when selectors return new
// array/object references (slice, filter, Object.values, object literals).
// In Zustand v5 the equality fn is no longer a second arg — use useShallow wrapper.
export const useConnectionStatus = () =>
  useRealtimeStore(useShallow(state => ({
    connected: state.connected,
    connecting: state.connecting,
    lastConnected: state.lastConnected,
  })));

export const useRecentEvents = (limit = 10) =>
  useRealtimeStore(useShallow(state => state.events.slice(0, limit)));

export const useDeviceStatus = (deviceId?: string) =>
  useRealtimeStore(useShallow(state =>
    deviceId
      ? state.deviceStatuses[deviceId]
      : Object.values(state.deviceStatuses)
  ));

export const useDoorStatus = (doorId?: string) =>
  useRealtimeStore(useShallow(state =>
    doorId
      ? state.doorStatuses[doorId]
      : Object.values(state.doorStatuses)
  ));

export const useActiveAlarms = () =>
  useRealtimeStore(useShallow(state =>
    state.alarms.filter(alarm => !alarm.acknowledged)
  ));

export const useCriticalAlarms = () =>
  useRealtimeStore(useShallow(state =>
    state.alarms.filter(alarm => alarm.severity === 'critical' && !alarm.acknowledged)
  ));
