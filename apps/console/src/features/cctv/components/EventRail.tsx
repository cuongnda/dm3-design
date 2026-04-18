import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, DoorOpen, Eye, ShieldAlert, Video } from 'lucide-react';

// TODO: wire to useRealtimeStore events stream once CCTV-specific event feed
// is available. For now we surface representative, plausible events so the
// operate layout communicates intent without blocking on backend work.
interface RailEvent {
  id: string;
  icon: typeof DoorOpen;
  iconClass: string;
  label: string;
  source: string;
  minutesAgo: number;
}

const MOCK_EVENTS: RailEvent[] = [
  { id: '1', icon: ShieldAlert, iconClass: 'text-destructive', label: 'Door forced', source: 'Lobby', minutesAgo: 2 },
  { id: '2', icon: Eye, iconClass: 'text-warning', label: 'Motion detected', source: 'Cam 3', minutesAgo: 5 },
  { id: '3', icon: DoorOpen, iconClass: 'text-secure', label: 'Access granted', source: 'Main Gate', minutesAgo: 8 },
  { id: '4', icon: AlertTriangle, iconClass: 'text-warning', label: 'Stream degraded', source: 'Parking L2', minutesAgo: 12 },
  { id: '5', icon: Video, iconClass: 'text-muted-foreground', label: 'Clip saved', source: 'Cam 1', minutesAgo: 18 },
  { id: '6', icon: DoorOpen, iconClass: 'text-secure', label: 'Access granted', source: 'Back Door', minutesAgo: 24 },
];

function formatAgo(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function EventRail() {
  const { t } = useTranslation('common');
  const events = useMemo(() => MOCK_EVENTS, []);

  return (
    <aside
      className="w-[280px] shrink-0 border-l border-[#1E293B] bg-[#0D1117] flex flex-col"
      data-testid="cctv-event-rail"
    >
      <div className="px-3 py-2.5 border-b border-[#1E293B] flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#F8FAFC] uppercase tracking-wider inline-flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-60 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
          </span>
          {t('cctv.live.recentEvents')}
        </span>
        <span className="text-[10px] text-muted-foreground">{events.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-4 text-center text-[11px] text-muted-foreground">
            {t('cctv.live.noEvents')}
          </div>
        ) : (
          <ul className="divide-y divide-[#1E293B]">
            {events.map((e) => {
              const Icon = e.icon;
              return (
                <li
                  key={e.id}
                  className="px-3 py-2 hover:bg-[#111827] transition-colors cursor-pointer"
                  data-testid={`cctv-event-${e.id}`}
                >
                  <div className="flex items-start gap-2">
                    <Icon size={14} className={`mt-0.5 shrink-0 ${e.iconClass}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-[#F8FAFC] truncate">{e.label}</div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground truncate">{e.source}</span>
                        <span className="text-[10px] text-muted-foreground/70 shrink-0 font-mono">
                          {formatAgo(e.minutesAgo)}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
