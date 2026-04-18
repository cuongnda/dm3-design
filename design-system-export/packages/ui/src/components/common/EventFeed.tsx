import { cn } from '../../lib/utils';
import type { AccessEvent } from '@dm3/api-client';

interface EventFeedProps {
  events: AccessEvent[];
  maxItems?: number;
}

export function EventFeed({ events, maxItems = 10 }: EventFeedProps) {
  const displayed = events.slice(0, maxItems);

  return (
    <div className="space-y-0">
      {displayed.map((event) => (
        <div
          key={event.id}
          className={cn(
            'flex items-center gap-3 py-1.5 border-b border-[#1E293B]/50 text-[12px]',
            event.result === 'denied' && 'bg-[#7F1D1D]/10'
          )}
        >
          <span className="font-mono text-[11px] text-[#64748B] min-w-[40px]">{event.time}</span>
          <span className="text-[#F8FAFC] font-medium min-w-[100px] truncate">{event.personName}</span>
          <span className="text-[#94A3B8] min-w-[80px]">→ {event.point}</span>
          <span
            className={cn(
              'font-semibold',
              event.result === 'granted' && 'text-[#22C55E]',
              event.result === 'denied' && 'text-[#EF4444]',
              event.result === 'forced' && 'text-[#EF4444] font-bold'
            )}
          >
            {event.result === 'granted' ? '✓ Granted' : event.result === 'denied' ? '✗ Denied' : '⚠ Forced'}
          </span>
        </div>
      ))}
    </div>
  );
}
