import { useTranslation } from 'react-i18next';
import { EventFeed } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useStats } from '@/lib/hooks';
import {
  useRealtimeStore,
  useRecentEvents,
} from '@dm3/api-client';
import type { AccessEvent, RealtimeAccessEvent, AccessEventDTO } from '@dm3/api-client';

function realtimeEventToAccessEvent(event: RealtimeAccessEvent): AccessEvent {
  const time = `${String(event.time.getHours()).padStart(2, '0')}:${String(event.time.getMinutes()).padStart(2, '0')}`;
  return {
    id: event.id,
    time,
    personName: event.personName || 'Unknown',
    point: event.doorName || event.doorId || '—',
    result: event.decision === 'granted' ? 'granted' : 'denied',
    credentialType: event.credentialType,
  };
}

function eventDtoToAccessEvent(e: AccessEventDTO): AccessEvent {
  const t = new Date(e.time);
  const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  return {
    id: e.id,
    time,
    personName: e.person_name || 'Unknown',
    point: e.door_name || e.credential_type || '—',
    result: e.decision === 'granted' ? 'granted' : 'denied',
    credentialType: e.credential_type,
  };
}

export function LiveEventsPanel(): React.ReactElement {
  const { t } = useTranslation('dashboard');

  const { data: statsData } = useStats();
  const isConnected = useRealtimeStore((s) => s.connected);
  const realtimeEvents = useRecentEvents(10);

  const realtimeAccessEvents = realtimeEvents.map(realtimeEventToAccessEvent);
  const apiEvents: AccessEvent[] = (statsData?.recent_events ?? []).map(eventDtoToAccessEvent);

  const events =
    realtimeAccessEvents.length > 0
      ? [
          ...realtimeAccessEvents,
          ...apiEvents.filter(
            (e) => !realtimeAccessEvents.some((w) => w.id === e.id),
          ),
        ].slice(0, 10)
      : apiEvents.slice(0, 10);

  return (
    <div
      data-testid="dashboard-section-live-events"
      className="bg-card border border-border rounded-lg overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="text-[13px] font-semibold flex items-center gap-2">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              isConnected ? 'bg-success animate-pulse' : 'bg-error',
            )}
          />
          {t('events.title')} ({isConnected ? t('events.live') : t('events.cached')})
        </div>
        <span className="text-[12px] text-secure cursor-pointer hover:underline">
          {t('events.viewAll')}
        </span>
      </div>
      <div className="px-4 py-3">
        <div className="h-10 mb-3 rounded bg-linear-to-b from-transparent to-secure/10 relative overflow-hidden">
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 400 40"
            preserveAspectRatio="none"
          >
            <path
              d="M0,35 Q20,30 40,28 T80,20 T120,25 T160,15 T200,10 T240,18 T280,8 T320,12 T360,6 T400,10"
              fill="none"
              stroke="currentColor"
              className="text-secure"
              strokeWidth="2"
            />
          </svg>
        </div>
        <EventFeed events={events} />
      </div>
    </div>
  );
}
