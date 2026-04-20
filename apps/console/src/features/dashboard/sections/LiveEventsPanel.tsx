import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

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

  const granted = statsData?.granted_today ?? 0;
  const denied = statsData?.denied_today ?? 0;
  const total = granted + denied;
  const grantedPct = total > 0 ? (granted / total) * 100 : 0;

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
        <button
          type="button"
          data-testid="dashboard-section-live-events-cta"
          onClick={() => navigate('/monitoring')}
          className="text-[12px] text-secure hover:underline"
        >
          {t('events.viewAll')}
        </button>
      </div>
      <div className="px-4 py-3">
        {total > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>
                <span className="text-success font-medium">{granted}</span>{' '}
                {t('events.granted', 'granted')}
              </span>
              <span>
                <span className="text-error font-medium">{denied}</span>{' '}
                {t('events.denied', 'denied')}
              </span>
            </div>
            <div className="h-1.5 bg-muted/30 rounded overflow-hidden flex">
              <div
                className="bg-success h-full"
                style={{ width: `${grantedPct}%` }}
              />
              <div
                className="bg-error h-full"
                style={{ width: `${100 - grantedPct}%` }}
              />
            </div>
          </div>
        )}
        <EventFeed events={events} />
      </div>
    </div>
  );
}
