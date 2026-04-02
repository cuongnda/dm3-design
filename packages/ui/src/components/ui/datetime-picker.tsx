import * as React from "react"
import { format, isValid, parse } from "date-fns"
import { CalendarIcon, Clock, X } from "lucide-react"

import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import { Input } from "./input"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

export interface DatetimePickerProps {
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  min?: string
  max?: string
  className?: string
  placeholder?: string
}

export function DatetimePicker({
  value,
  onChange,
  disabled,
  min,
  max,
  className,
  placeholder = "Select date & time",
}: DatetimePickerProps) {
  const selected = React.useMemo(() => {
    if (!value) return null
    const d = parse(value, "yyyy-MM-dd'T'HH:mm", new Date())
    return isValid(d) ? d : null
  }, [value])

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

  const datePart = selected ? format(selected, "yyyy-MM-dd") : null
  const timePart = selected ? format(selected, "HH:mm") : ""

  const label = selected ? format(selected, "yyyy-MM-dd HH:mm") : placeholder

  const setDate = (d: Date) => {
    const time = selected ? format(selected, "HH:mm") : "00:00"
    const next = parse(`${format(d, "yyyy-MM-dd")}T${time}`, "yyyy-MM-dd'T'HH:mm", new Date())
    if (!isValid(next)) return
    onChange(format(next, "yyyy-MM-dd'T'HH:mm"))
  }

  const setTime = (t: string) => {
    if (!t) {
      // keep date, clear time -> default 00:00
      if (!datePart) return
      const next = parse(`${datePart}T00:00`, "yyyy-MM-dd'T'HH:mm", new Date())
      if (!isValid(next)) return
      onChange(format(next, "yyyy-MM-dd'T'HH:mm"))
      return
    }
    if (!datePart) return
    const next = parse(`${datePart}T${t}`, "yyyy-MM-dd'T'HH:mm", new Date())
    if (!isValid(next)) return
    onChange(format(next, "yyyy-MM-dd'T'HH:mm"))
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
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {label}
          </span>
          <span className="flex items-center gap-1">
            {selected ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onChange(null)
                }}
                aria-label="Clear datetime"
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
            mode="single"
            value={selected}
            onSelect={setDate}
            minDate={minDate}
            maxDate={maxDate}
            disabled={disabled}
          />
          <div className="w-36">
            <div className="text-muted-foreground px-1 pb-2 text-xs font-medium">
              Time
            </div>
            <Input
              type="time"
              value={timePart}
              disabled={disabled}
              onChange={(e) => setTime(e.target.value)}
              className="h-9"
            />
            <div className="text-muted-foreground px-1 pt-2 text-xs">
              {datePart ? datePart : "Pick a date"}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

