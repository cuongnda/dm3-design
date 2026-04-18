import type { AccessTimeSlot } from '../types';
import { DAY_LABELS_MIN, DAY_LABELS_SHORT, slotsByDay } from '../utils/schedule';

interface WeekdayStripProps {
  slots?: AccessTimeSlot[] | null;
  size?: 'sm' | 'md';
  showLabels?: boolean;
  className?: string;
}

/**
 * Compact 7-day visualization. Each day is a block; filled when any active slot
 * covers that day. Hover tooltip summarizes the day's ranges.
 */
export function WeekdayStrip({ slots, size = 'sm', showLabels = true, className = '' }: WeekdayStripProps) {
  const dayMap = slotsByDay(slots);
  const cellSize = size === 'sm' ? 'h-5 w-5 text-[9px]' : 'h-7 w-7 text-[11px]';

  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`}>
      {[0, 1, 2, 3, 4, 5, 6].map((d) => {
        const daySlots = dayMap.get(d) ?? [];
        const hasSlot = daySlots.length > 0;
        const ranges = daySlots
          .map((s) => `${s.start_time.substring(0, 5)}–${s.end_time.substring(0, 5)}`)
          .join(', ');
        return (
          <div
            key={d}
            title={hasSlot ? `${DAY_LABELS_SHORT[d]}: ${ranges}` : `${DAY_LABELS_SHORT[d]}: —`}
            className={`
              ${cellSize}
              flex items-center justify-center rounded
              font-medium border
              ${hasSlot
                ? 'bg-secure/15 border-secure/30 text-secure'
                : 'bg-muted/30 border-border/40 text-muted-foreground/40'}
            `}
          >
            {showLabels ? DAY_LABELS_MIN[d] : ''}
          </div>
        );
      })}
    </div>
  );
}
