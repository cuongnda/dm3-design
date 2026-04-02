import * as React from "react"
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "../../lib/utils"
import { Button } from "./button"

export type CalendarMode = "single" | "range"

export interface CalendarRangeValue {
  start: Date | null
  end: Date | null
}

export interface CalendarProps {
  mode?: CalendarMode
  value?: Date | null
  rangeValue?: CalendarRangeValue
  onSelect?: (date: Date) => void
  onSelectRange?: (range: CalendarRangeValue) => void
  month?: Date
  onMonthChange?: (month: Date) => void
  minDate?: Date
  maxDate?: Date
  disabled?: boolean
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
  className?: string
}

function clampDate(d: Date, minDate?: Date, maxDate?: Date) {
  if (minDate && isBefore(d, minDate)) return minDate
  if (maxDate && isAfter(d, maxDate)) return maxDate
  return d
}

function isDisabled(d: Date, minDate?: Date, maxDate?: Date) {
  if (minDate && isBefore(d, minDate)) return true
  if (maxDate && isAfter(d, maxDate)) return true
  return false
}

export function Calendar({
  mode = "single",
  value,
  rangeValue,
  onSelect,
  onSelectRange,
  month,
  onMonthChange,
  minDate,
  maxDate,
  disabled,
  weekStartsOn = 1,
  className,
}: CalendarProps) {
  const controlledMonth = month
  const selectedDate = value ?? null
  const selectedRange: CalendarRangeValue = rangeValue ?? { start: null, end: null }

  const initialBase = React.useMemo(() => {
    if (mode === "single") {
      return selectedDate ?? new Date()
    }
    return selectedRange.start ?? selectedRange.end ?? new Date()
  }, [mode, selectedDate, selectedRange.end, selectedRange.start])

  const [internalMonth, setInternalMonth] = React.useState<Date>(() =>
    startOfMonth(clampDate(initialBase, minDate, maxDate))
  )

  React.useEffect(() => {
    if (!controlledMonth) return
    setInternalMonth(startOfMonth(clampDate(controlledMonth, minDate, maxDate)))
  }, [controlledMonth, minDate, maxDate])

  const activeMonth = controlledMonth ? startOfMonth(controlledMonth) : internalMonth

  const setMonth = (next: Date) => {
    const clamped = startOfMonth(clampDate(next, minDate, maxDate))
    if (onMonthChange) onMonthChange(clamped)
    if (!controlledMonth) setInternalMonth(clamped)
  }

  const start = startOfWeek(startOfMonth(activeMonth), { weekStartsOn })
  const end = endOfWeek(endOfMonth(activeMonth), { weekStartsOn })

  const days: Date[] = []
  for (let d = start; !isAfter(d, end); d = addDays(d, 1)) {
    days.push(d)
  }

  const weekdayLabels = React.useMemo(() => {
    const base = startOfWeek(new Date(2020, 0, 5), { weekStartsOn }) // stable week
    return Array.from({ length: 7 }, (_, i) => format(addDays(base, i), "EEEEE"))
  }, [weekStartsOn])

  const inRange = (d: Date) => {
    const { start: s, end: e } = selectedRange
    if (!s || !e) return false
    if (isAfter(s, e)) return false
    return (isAfter(d, s) || isSameDay(d, s)) && (isBefore(d, e) || isSameDay(d, e))
  }

  const isRangeEdge = (d: Date) => {
    const { start: s, end: e } = selectedRange
    return (s && isSameDay(d, s)) || (e && isSameDay(d, e))
  }

  const handlePickSingle = (d: Date) => {
    if (disabled) return
    if (isDisabled(d, minDate, maxDate)) return
    onSelect?.(d)
  }

  const handlePickRange = (d: Date) => {
    if (disabled) return
    if (isDisabled(d, minDate, maxDate)) return

    const { start: s, end: e } = selectedRange

    // If no start, start a range
    if (!s || (s && e)) {
      onSelectRange?.({ start: d, end: null })
      return
    }

    // We have start but no end: choose end (normalize order)
    if (isBefore(d, s)) onSelectRange?.({ start: d, end: s })
    else onSelectRange?.({ start: s, end: d })
  }

  return (
    <div className={cn("w-74", className)} data-slot="calendar">
      <div className="flex items-center justify-between pb-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={() => setMonth(subMonths(activeMonth, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div className="text-sm font-medium">
          {format(activeMonth, "MMMM yyyy")}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={() => setMonth(addMonths(activeMonth, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 pb-1">
        {weekdayLabels.map((w) => (
          <div
            key={w}
            className="text-muted-foreground flex h-7 items-center justify-center text-[11px] font-medium"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const outMonth = !isSameMonth(d, activeMonth)
          const dayDisabled = disabled || isDisabled(d, minDate, maxDate)

          const selectedSingle = mode === "single" && selectedDate && isSameDay(d, selectedDate)

          const rangeHit = mode === "range" && inRange(d)
          const rangeEdge = mode === "range" && isRangeEdge(d)

          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={dayDisabled}
              onClick={() => (mode === "single" ? handlePickSingle(d) : handlePickRange(d))}
              className={cn(
                "relative flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                outMonth && "text-muted-foreground/60",
                dayDisabled && "opacity-40 cursor-not-allowed",
                !dayDisabled && "hover:bg-muted",
                selectedSingle && "bg-primary text-primary-foreground hover:bg-primary/90",
                rangeHit && "bg-muted",
                rangeEdge && "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {format(d, "d")}
              {rangeEdge ? (
                <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-ring/30" />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

