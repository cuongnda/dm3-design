import * as React from "react"
import { format, isValid, parseISO } from "date-fns"
import { CalendarIcon, ChevronDown, X } from "lucide-react"

import { cn } from "../../lib/utils"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

export interface DatetimePreset {
  label: string
  value: Date
}

export interface DatetimePickerProps {
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  min?: string
  max?: string
  className?: string
  placeholder?: string
  presets?: DatetimePreset[]
}

/* ── Tiny inline dropdown for hour / minute ── */
interface TimeMiniSelectProps {
  value: number
  options: number[]
  onChange: (v: number) => void
  disabled?: boolean
}

function TimeMiniSelect({ value, options, onChange, disabled }: TimeMiniSelectProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open])

  React.useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector("[data-active]")
    if (el) el.scrollIntoView({ block: "center" })
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-0.5 rounded px-2 py-1 text-sm font-medium text-foreground transition-colors",
          "hover:bg-muted",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {String(value).padStart(2, "0")}
        <ChevronDown className="size-3 text-muted-foreground" />
      </button>

      {open && (
        <div
          ref={listRef}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 max-h-48 min-w-12 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg py-1"
        >
          {options.map((o) => (
            <button
              key={o}
              type="button"
              data-active={o === value ? "" : undefined}
              onClick={() => {
                onChange(o)
                setOpen(false)
              }}
              className={cn(
                "w-full px-3 py-1 text-sm text-center transition-colors",
                "hover:bg-muted",
                o === value && "bg-primary/10 text-primary font-medium"
              )}
            >
              {String(o).padStart(2, "0")}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

/** Parse value string: accepts ISO 8601 (with tz) or datetime-local (no tz, treated as local). */
function parseValue(v: string | null): Date | null {
  if (!v) return null
  // Try ISO / RFC3339 first (has timezone info)
  const iso = parseISO(v)
  if (isValid(iso)) return iso
  return null
}

/** Format a Date to UTC ISO 8601 string (e.g. 2026-04-08T17:00:00Z). */
function toUTC(d: Date): string {
  return d.toISOString()
}

export function DatetimePicker({
  value,
  onChange,
  disabled,
  min,
  max,
  className,
  placeholder = "Select date & time",
  presets,
}: DatetimePickerProps) {
  const selected = React.useMemo(() => parseValue(value), [value])
  const minDate = React.useMemo(() => (min ? parseValue(min) ?? undefined : undefined), [min])
  const maxDate = React.useMemo(() => (max ? parseValue(max) ?? undefined : undefined), [max])

  const currentHour = selected ? selected.getHours() : 0
  const currentMinute = selected ? selected.getMinutes() : 0

  const label = selected ? format(selected, "MMM dd, yyyy  HH:mm") : placeholder

  const emit = (d: Date) => onChange(toUTC(d))

  const setDate = (d: Date) => {
    const h = selected ? selected.getHours() : 0
    const m = selected ? selected.getMinutes() : 0
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m)
    emit(next)
  }

  const setHour = (h: number) => {
    const base = selected ?? new Date()
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, currentMinute)
    emit(next)
  }

  const setMinute = (m: number) => {
    const base = selected ?? new Date()
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate(), currentHour, m)
    emit(next)
  }

  const handlePreset = (d: Date) => emit(d)

  const hasPresets = presets && presets.length > 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "border-input bg-input text-foreground flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {label}
          </span>
          <span className="flex items-center gap-1">
            {selected ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear datetime"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onChange(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    e.stopPropagation()
                    onChange(null)
                  }
                }}
                className="inline-flex items-center justify-center size-5 rounded-sm hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="size-3" />
              </span>
            ) : null}
            <CalendarIcon className="size-4 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="p-0 w-auto">
        <div className="p-2">
          <Calendar
            mode="single"
            value={selected}
            onSelect={setDate}
            minDate={minDate}
            maxDate={maxDate}
            disabled={disabled}
          />
        </div>

        {/* Footer: presets + time */}
        <div className="border-t border-border px-3 py-2 flex items-center gap-2">
          {hasPresets && (
            <div className="flex gap-1">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePreset(p.value)}
                  className={cn(
                    "px-2 py-1 text-[11px] rounded border border-border transition-colors",
                    "hover:bg-muted text-foreground",
                    selected && format(selected, "yyyy-MM-dd HH:mm") === format(p.value, "yyyy-MM-dd HH:mm")
                      && "bg-primary/10 text-primary border-primary/30 font-medium",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 ml-auto">
            <TimeMiniSelect value={currentHour} options={HOURS} onChange={setHour} disabled={disabled} />
            <span className="text-sm text-muted-foreground font-medium">:</span>
            <TimeMiniSelect value={currentMinute} options={MINUTES} onChange={setMinute} disabled={disabled} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
