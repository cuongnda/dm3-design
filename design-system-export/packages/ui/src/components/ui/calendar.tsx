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
  setMonth as setDateMonth,
  setYear as setDateYear,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

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

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/* ── Tiny inline dropdown (no portal, no search) ── */
interface MiniSelectProps {
  value: number
  options: { value: number; label: string }[]
  onChange: (v: number) => void
  disabled?: boolean
  className?: string
}

function MiniSelect({ value, options, onChange, disabled, className }: MiniSelectProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  React.useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open])

  // scroll to selected when opened
  React.useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector("[data-active]")
    if (el) el.scrollIntoView({ block: "center" })
  }, [open])

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-0.5 text-sm font-medium text-foreground rounded px-1.5 py-0.5 transition-colors",
          "hover:bg-muted",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {selected?.label ?? value}
        <ChevronDown className="size-3 text-muted-foreground" />
      </button>

      {open && (
        <div
          ref={listRef}
          className="absolute top-full left-0 mt-1 z-50 max-h-48 min-w-[5rem] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg py-1"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              data-active={o.value === value ? "" : undefined}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className={cn(
                "w-full px-3 py-1 text-sm text-left transition-colors",
                "hover:bg-muted",
                o.value === value && "bg-primary/10 text-primary font-medium"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
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

  const currentYear = activeMonth.getFullYear()
  const currentMonthIdx = activeMonth.getMonth()

  const monthOptions = React.useMemo(
    () => MONTH_NAMES.map((name, i) => ({ value: i, label: name })),
    []
  )

  const yearOptions = React.useMemo(() => {
    const now = new Date().getFullYear()
    const from = minDate ? minDate.getFullYear() : now - 10
    const to = maxDate ? maxDate.getFullYear() : now + 10
    const years: { value: number; label: string }[] = []
    for (let y = from; y <= to; y++) years.push({ value: y, label: String(y) })
    return years
  }, [minDate, maxDate])

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

    if (!s || (s && e)) {
      onSelectRange?.({ start: d, end: null })
      return
    }

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

        <div className="flex items-center gap-0.5">
          <MiniSelect
            value={currentMonthIdx}
            options={monthOptions}
            onChange={(m) => setMonth(setDateMonth(activeMonth, m))}
            disabled={disabled}
          />
          <MiniSelect
            value={currentYear}
            options={yearOptions}
            onChange={(y) => setMonth(setDateYear(activeMonth, y))}
            disabled={disabled}
          />
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
        {weekdayLabels.map((w, i) => (
          <div
            key={i}
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
                "focus-visible:ring-2 focus-visible:ring-ring/30",
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
