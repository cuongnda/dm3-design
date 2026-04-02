import * as React from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"

import { cn } from "../../lib/utils"
import { Input } from "./input"

interface Option {
  value: string
  label: string
  description?: string
  icon?: React.ReactNode
}

interface ComboBoxProps {
  options: Option[]
  value?: string
  placeholder?: string
  searchPlaceholder?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  className?: string
}

function ComboBox({
  options,
  value,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  onValueChange,
  disabled = false,
  className,
}: ComboBoxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  
  const filteredOptions = React.useMemo(() => {
    if (!search) return options
    const query = search.toLowerCase()
    return options.filter(
      option =>
        option.label.toLowerCase().includes(query) ||
        option.value.toLowerCase().includes(query) ||
        option.description?.toLowerCase().includes(query)
    )
  }, [options, search])

  const selectedOption = options.find(option => option.value === value)

  const handleSelect = (optionValue: string) => {
    onValueChange?.(optionValue)
    setOpen(false)
    setSearch("")
  }

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border px-3 py-1 text-sm transition-colors",
          "bg-input border-border text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/20 focus-visible:border-ring",
          "hover:bg-muted disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
          open && "border-ring ring-1 ring-ring/20"
        )}
      >
        <div className="flex items-center gap-2 flex-1">
          {selectedOption?.icon}
          <span className={cn(!selectedOption && "text-muted-foreground", "truncate")}>
            {selectedOption?.label || placeholder}
          </span>
          {selectedOption?.description && (
            <span className="text-muted-foreground text-xs ml-auto">{selectedOption.description}</span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={cn(
            "transition-transform text-muted-foreground",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover text-popover-foreground border border-border rounded-md shadow-lg max-h-80 overflow-hidden">
            {/* Search */}
            <div className="relative p-2 border-b border-border">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 pl-8 pr-8"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Options */}
            <div className="overflow-y-auto max-h-64">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">No options found</div>
              ) : (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors",
                      "hover:bg-muted focus:bg-muted focus:outline-none",
                      value === option.value && "bg-primary/10"
                    )}
                  >
                    {option.icon}
                    <div className="flex-1">
                      <div className="text-foreground">{option.label}</div>
                      {option.description && (
                        <div className="text-muted-foreground text-xs">{option.description}</div>
                      )}
                    </div>
                    {value === option.value && (
                      <Check size={14} className="text-primary" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export { ComboBox, type Option }