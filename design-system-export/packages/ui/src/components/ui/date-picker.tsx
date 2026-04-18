import * as React from "react"
import { format, isValid, parse } from "date-fns"
import { CalendarIcon, X } from "lucide-react"

import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

export interface DatePickerProps {
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  min?: string
  max?: string
  className?: string
  placeholder?: string
}

export function DatePicker({
  value,
  onChange,
  disabled,
  min,
  max,
  className,
  placeholder = "Select date",
}: DatePickerProps) {
  const selected = React.useMemo(() => {
    if (!value) return null
    const d = parse(value, "yyyy-MM-dd", new Date())
    return isValid(d) ? d : null
  }, [value])

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

  const label = selected ? format(selected, "yyyy-MM-dd") : placeholder

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
                aria-label="Clear date"
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
          mode="single"
          value={selected}
          onSelect={(d) => onChange(format(d, "yyyy-MM-dd"))}
          minDate={minDate}
          maxDate={maxDate}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  )
}

