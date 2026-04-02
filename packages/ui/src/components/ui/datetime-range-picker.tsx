import * as React from "react"
import { format, isValid, parse } from "date-fns"
import { CalendarIcon, Clock, X } from "lucide-react"

import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Calendar, type CalendarRangeValue } from "./calendar"
import { Input } from "./input"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

export interface DatetimeRangeValue {
  start: string | null
  end: string | null
}

export interface DatetimeRangePickerProps {
  value: DatetimeRangeValue
  onChange: (value: DatetimeRangeValue) => void
  disabled?: boolean
  min?: string
  max?: string
  className?: string
  placeholder?: string
}

export function DatetimeRangePicker({
  value,
  onChange,
  disabled,
  min,
  max,
  className,
  placeholder = "Select datetime range",
}: DatetimeRangePickerProps) {
  const range: CalendarRangeValue = React.useMemo(() => {
    const s = value.start ? parse(value.start, "yyyy-MM-dd'T'HH:mm", new Date()) : null
    const e = value.end ? parse(value.end, "yyyy-MM-dd'T'HH:mm", new Date()) : null
    return {
      start: s && isValid(s) ? s : null,
      end: e && isValid(e) ? e : null,
    }
  }, [value.end, value.start])

  const minDate = React.useMemo(() => {
    if (!min) return undefined
    const d = parse(min, "yyyy-MM-dd'T'HH:mm", new Date())
    return isValid(d) ? d : undefined
  }, [min])

  const maxDate = React.useMemo(() => {
    if (!max) return undefined
    const d = parse(max, "yyyy-MM-dd'T'HH:mm", new Date())
    return isValid(d) ? d : undefined
  }, [max])

  const startTime = range.start ? format(range.start, "HH:mm") : ""
  const endTime = range.end ? format(range.end, "HH:mm") : ""

  const label = React.useMemo(() => {
    if (!range.start && !range.end) return placeholder
    if (range.start && !range.end) return `${format(range.start, "yyyy-MM-dd HH:mm")} - …`
    if (!range.start && range.end) return `… - ${format(range.end, "yyyy-MM-dd HH:mm")}`
    return `${format(range.start!, "yyyy-MM-dd HH:mm")} - ${format(range.end!, "yyyy-MM-dd HH:mm")}`
  }, [placeholder, range.end, range.start])

  const setRange = (next: CalendarRangeValue) => {
    // Preserve existing time parts when user picks dates
    const nextStart = next.start
      ? parse(
          `${format(next.start, "yyyy-MM-dd")}T${range.start ? format(range.start, "HH:mm") : "00:00"}`,
          "yyyy-MM-dd'T'HH:mm",
          new Date()
        )
      : null
    const nextEnd = next.end
      ? parse(
          `${format(next.end, "yyyy-MM-dd")}T${range.end ? format(range.end, "HH:mm") : "23:59"}`,
          "yyyy-MM-dd'T'HH:mm",
          new Date()
        )
      : null

    onChange({
      start: nextStart && isValid(nextStart) ? format(nextStart, "yyyy-MM-dd'T'HH:mm") : null,
      end: nextEnd && isValid(nextEnd) ? format(nextEnd, "yyyy-MM-dd'T'HH:mm") : null,
    })
  }

  const setTime = (which: "start" | "end", t: string) => {
    if (which === "start") {
      if (!range.start) return
      const d = parse(`${format(range.start, "yyyy-MM-dd")}T${t || "00:00"}`, "yyyy-MM-dd'T'HH:mm", new Date())
      if (!isValid(d)) return
      onChange({ start: format(d, "yyyy-MM-dd'T'HH:mm"), end: value.end })
      return
    }

    if (!range.end) return
    const d = parse(`${format(range.end, "yyyy-MM-dd")}T${t || "23:59"}`, "yyyy-MM-dd'T'HH:mm", new Date())
    if (!isValid(d)) return
    onChange({ start: value.start, end: format(d, "yyyy-MM-dd'T'HH:mm") })
  }

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
          <span className={cn("truncate", !range.start && !range.end && "text-muted-foreground")}>
            {label}
          </span>
          <span className="flex items-center gap-1">
            {range.start || range.end ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onChange({ start: null, end: null })
                }}
                aria-label="Clear range"
              >
                <X className="size-3" />
              </Button>
            ) : null}
            <CalendarIcon className="size-4 text-muted-foreground" />
            <Clock className="size-4 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="p-2">
        <div className="flex gap-2">
          <Calendar
            mode="range"
            rangeValue={range}
            onSelectRange={setRange}
            minDate={minDate}
            maxDate={maxDate}
            disabled={disabled}
          className="w-78"
          />
          <div className="w-44">
            <div className="text-muted-foreground px-1 pb-2 text-xs font-medium">
              Time
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-muted-foreground px-1 pb-1 text-[11px]">Start</div>
                <Input
                  type="time"
                  value={startTime}
                  disabled={disabled || !range.start}
                  onChange={(e) => setTime("start", e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <div className="text-muted-foreground px-1 pb-1 text-[11px]">End</div>
                <Input
                  type="time"
                  value={endTime}
                  disabled={disabled || !range.end}
                  onChange={(e) => setTime("end", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div className="text-muted-foreground px-1 pt-2 text-xs">
              Pick dates, then adjust time.
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

