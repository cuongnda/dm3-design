import type { AccessTimeSlot } from '../types';

export const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LABELS_MIN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

interface NormalizedRange {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

function hhmm(value: string): string {
  return value.length >= 5 ? value.substring(0, 5) : value;
}

function isFullDay(ranges: NormalizedRange[]): boolean {
  return ranges.some((r) => r.start === '00:00' && (r.end === '24:00' || r.end === '23:59' || r.end === '00:00'));
}

function rangesEqual(a: NormalizedRange[], b: NormalizedRange[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x.start.localeCompare(y.start));
  const sortedB = [...b].sort((x, y) => x.start.localeCompare(y.start));
  return sortedA.every((r, i) => r.start === sortedB[i].start && r.end === sortedB[i].end);
}

function formatRanges(ranges: NormalizedRange[]): string {
  if (ranges.length === 0) return '';
  if (isFullDay(ranges) && ranges.length === 1) return '24h';
  return ranges
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((r) => `${r.start}–${r.end}`)
    .join(', ');
}

function contiguousGroupLabel(days: number[]): string {
  if (days.length === 0) return '';
  const sorted = [...days].sort((a, b) => a - b);
  // Detect Mon-Fri
  if (sorted.length === 5 && sorted.every((d, i) => d === WEEKDAYS[i])) return 'Mon–Fri';
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return 'Sat–Sun';
  if (sorted.length === 7) return 'Every day';
  if (sorted.length === 1) return DAY_LABELS_SHORT[sorted[0]];
  // Check contiguous
  let contiguous = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      contiguous = false;
      break;
    }
  }
  if (contiguous) {
    return `${DAY_LABELS_SHORT[sorted[0]]}–${DAY_LABELS_SHORT[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => DAY_LABELS_SHORT[d]).join(', ');
}

export interface ScheduleSummary {
  headline: string;
  detail?: string;
  activeDays: Set<number>;
  totalHours: number;
}

/**
 * Build a human-readable summary of a schedule.
 * Examples: "24/7", "Mon–Fri, 08:00–18:00", "Weekdays + Sat morning", "3 days, varied hours".
 */
export function summarizeSchedule(slots?: AccessTimeSlot[] | null): ScheduleSummary {
  if (!slots || slots.length === 0) {
    return { headline: 'No schedule', activeDays: new Set(), totalHours: 0 };
  }

  // Group by day
  const byDay = new Map<number, NormalizedRange[]>();
  for (const slot of slots) {
    if (!slot.is_active) continue;
    const start = hhmm(slot.start_time);
    const end = hhmm(slot.end_time);
    const list = byDay.get(slot.day_of_week) ?? [];
    list.push({ start, end });
    byDay.set(slot.day_of_week, list);
  }

  const activeDays = new Set<number>(byDay.keys());

  // Compute total hours in week
  let totalHours = 0;
  byDay.forEach((ranges) => {
    for (const r of ranges) {
      const [sh, sm] = r.start.split(':').map(Number);
      const [eh, em] = r.end.split(':').map(Number);
      const mins = (eh * 60 + em) - (sh * 60 + sm);
      if (mins > 0) totalHours += mins / 60;
    }
  });

  if (activeDays.size === 0) {
    return { headline: 'No schedule', activeDays, totalHours: 0 };
  }

  // 24/7: all 7 days, every slot is full-day
  const allFullDay = ALL_DAYS.every((d) => {
    const ranges = byDay.get(d);
    return ranges && isFullDay(ranges);
  });
  if (allFullDay) {
    return { headline: '24/7', detail: 'Always open', activeDays, totalHours };
  }

  // Same hours every active day?
  const dayEntries = Array.from(byDay.entries());
  const firstRanges = dayEntries[0][1];
  const allSame = dayEntries.every(([, ranges]) => rangesEqual(ranges, firstRanges));

  if (allSame) {
    const daysLabel = contiguousGroupLabel(Array.from(activeDays));
    const hoursLabel = formatRanges(firstRanges);
    return {
      headline: `${daysLabel}, ${hoursLabel}`,
      activeDays,
      totalHours,
    };
  }

  // Try to split: weekdays + weekend
  const weekdayRanges = WEEKDAYS.map((d) => byDay.get(d)).filter(Boolean) as NormalizedRange[][];
  const weekendRanges = WEEKEND.map((d) => byDay.get(d)).filter(Boolean) as NormalizedRange[][];

  const weekdaysCovered = weekdayRanges.length === 5;
  const weekdaysUniform = weekdaysCovered && weekdayRanges.every((r) => rangesEqual(r, weekdayRanges[0]));

  if (weekdaysUniform && weekendRanges.length === 0) {
    return {
      headline: `Mon–Fri, ${formatRanges(weekdayRanges[0])}`,
      activeDays,
      totalHours,
    };
  }

  if (weekdaysUniform && weekendRanges.length > 0) {
    return {
      headline: `Mon–Fri, ${formatRanges(weekdayRanges[0])}`,
      detail: `+ ${weekendRanges.length === 2 ? 'weekend' : DAY_LABELS_SHORT[weekendRanges.length === 1 ? (byDay.has(0) ? 0 : 6) : 0]}`,
      activeDays,
      totalHours,
    };
  }

  // Fallback: varied
  return {
    headline: `${activeDays.size} day${activeDays.size === 1 ? '' : 's'}, varied hours`,
    detail: `${totalHours.toFixed(0)}h / week`,
    activeDays,
    totalHours,
  };
}

export function slotsByDay(slots?: AccessTimeSlot[] | null): Map<number, AccessTimeSlot[]> {
  const map = new Map<number, AccessTimeSlot[]>();
  if (!slots) return map;
  for (const slot of slots) {
    if (!slot.is_active) continue;
    const list = map.get(slot.day_of_week) ?? [];
    list.push(slot);
    map.set(slot.day_of_week, list);
  }
  return map;
}
