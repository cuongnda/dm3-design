// Real-time event feed — powered by the WebSocket connection in <RealtimeProvider>.
// Replaces the old stub that returned an empty array.
import { useRealtimeStore, type RealtimeAccessEvent } from '@dm3/api-client';
import type { AccessEvent } from '@dm3/api-client';

/** Map a realtime store event to the shared AccessEvent shape used by <EventFeed>. */
function toAccessEvent(e: RealtimeAccessEvent): AccessEvent {
  const t = e.time;
  const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  return {
    id: e.id,
    time,
    personName: e.personName || 'Unknown',
    point: e.doorName || e.doorId || '—',
    result: e.decision === 'granted' ? 'granted' : e.reason === 'forced' ? 'forced' : 'denied',
    credentialType: e.credentialType,
  };
}

/** Returns the most recent `limit` real-time access events in AccessEvent shape. */
export function useRealTimeEvents(limit = 20) {
  const raw = useRealtimeStore((s) => s.events.slice(0, limit));
  return { events: raw.map(toAccessEvent) };
}
