import * as React from "react"
import { format, isValid, parse } from "date-fns"
import { CalendarIcon, X } from "lucide-react"

import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Calendar, type CalendarRangeValue } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

export interface DateRangeValue {
  start: string | null
  end: string | null
}

export interface DateRangePickerProps {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  disabled?: boolean
  min?: string
  max?: string
  className?: string
  placeholder?: string
}

export function DateRangePicker({
  value,
  onChange,
  disabled,
  min,
  max,
  className,
  placeholder = "Select date range",
}: DateRangePickerProps) {
  const range: CalendarRangeValue = React.useMemo(() => {
    const s = value.start ? parse(value.start, "yyyy-MM-dd", new Date()) : null
    const e = value.end ? parse(value.end, "yyyy-MM-dd", new Date()) : null
    return {
      start: s && isValid(s) ? s : null,
      end: e && isValid(e) ? e : null,
    }
  }, [value.end, value.start])

  const minDate = React.useMemo(() => {
    if (!min) return undefined
    const d = parse(min, "yyyy-MM-dd", new Date())
    return isValid(d) ? d : undefined
  }, [min])

  const maxDate = React.useMemo(() => {
    if (!max) return undefined
    const d = parse(max, "yyyy-MM-dd", new Date())
    return isValid(d) ? d : undefined
  }, [max])

  const label = React.useMemo(() => {
    if (!range.start && !range.end) return placeholder
    if (range.start && !range.end) return `${format(range.start, "yyyy-MM-dd")} - …`
    if (!range.start && range.end) return `… - ${format(range.end, "yyyy-MM-dd")}`
    return `${format(range.start!, "yyyy-MM-dd")} - ${format(range.end!, "yyyy-MM-dd")}`
  }, [placeholder, range.end, range.start])

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
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="p-2">
        <Calendar
          mode="range"
          rangeValue={range}
          onSelectRange={(next) =>
            onChange({
              start: next.start ? format(next.start, "yyyy-MM-dd") : null,
              end: next.end ? format(next.end, "yyyy-MM-dd") : null,
            })
          }
          minDate={minDate}
          maxDate={maxDate}
          disabled={disabled}
          className="w-78"
        />
      </PopoverContent>
    </Popover>
  )
}

