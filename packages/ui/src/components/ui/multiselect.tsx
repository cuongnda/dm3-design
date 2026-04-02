import * as React from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Search, X } from "lucide-react"

import { cn } from "../../lib/utils"
import { Input } from "./input"

export interface MultiselectOption {
  value: string
  label: string
  description?: string
  icon?: React.ReactNode
}

export interface MultiselectProps {
  options: MultiselectOption[]
  values: string[]
  onValuesChange: (values: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  maxSelected?: number
  className?: string
}

export function Multiselect({
  options,
  values,
  onValuesChange,
  placeholder = "Select options...",
  searchPlaceholder = "Search...",
  disabled = false,
  maxSelected,
  className,
}: MultiselectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>({})

  const filteredOptions = React.useMemo(() => {
    if (!search) return options
    const query = search.toLowerCase()
    return options.filter((o) => {
      return (
        o.label.toLowerCase().includes(query) ||
        o.value.toLowerCase().includes(query) ||
        o.description?.toLowerCase().includes(query)
      )
    })
  }, [options, search])

  const selectedOptions = React.useMemo(() => {
    const set = new Set(values)
    return options.filter((o) => set.has(o.value))
  }, [options, values])

  const displayText = React.useMemo(() => {
    if (selectedOptions.length === 0) return placeholder
    const firstTwo = selectedOptions.slice(0, 2).map((o) => o.label)
    const restCount = selectedOptions.length - firstTwo.length
    if (restCount > 0) return `${firstTwo.join(", ")} +${restCount} more`
    return firstTwo.join(", ")
  }, [placeholder, selectedOptions])

  const toggleValue = (optionValue: string) => {
    if (disabled) return

    const has = values.includes(optionValue)
    if (has) {
      onValuesChange(values.filter((v) => v !== optionValue))
      return
    }

    if (typeof maxSelected === "number" && values.length >= maxSelected) return
    onValuesChange([...values, optionValue])
  }

  const updatePanelPosition = React.useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPanelStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    })
  }, [])

  React.useEffect(() => {
    if (!open) return
    updatePanelPosition()

    const onReposition = () => updatePanelPosition()
    window.addEventListener("resize", onReposition)
    window.addEventListener("scroll", onReposition, true)
    return () => {
      window.removeEventListener("resize", onReposition)
      window.removeEventListener("scroll", onReposition, true)
    }
  }, [open, updatePanelPosition])

  React.useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleOutside)
    document.addEventListener("keydown", handleEsc)
    return () => {
      document.removeEventListener("mousedown", handleOutside)
      document.removeEventListener("keydown", handleEsc)
    }
  }, [])

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border px-3 py-1 text-sm transition-colors",
          "bg-input border-border text-foreground",
          "hover:bg-muted disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/20 focus-visible:border-ring",
          open && "border-ring ring-1 ring-ring/20"
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={cn(selectedOptions.length === 0 && "text-muted-foreground", "truncate")}>
            {displayText}
          </span>
        </div>

        <ChevronDown size={16} className={cn("transition-transform text-muted-foreground", open && "rotate-180")} />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="rounded-md border border-border bg-card shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-border p-2">
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-8 pl-9 pr-9 bg-background"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearch("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto p-1">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">No options found</div>
              ) : (
                filteredOptions.map((option) => {
                  const selected = values.includes(option.value)
                  const disabledOption =
                    !selected && typeof maxSelected === "number" && values.length >= maxSelected

                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={disabledOption}
                      onClick={() => toggleValue(option.value)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded px-3 py-2 text-left text-sm transition-colors",
                        "hover:bg-muted",
                        selected && "bg-muted",
                        disabledOption && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-5 items-center justify-center rounded border border-border",
                          selected && "border-ring text-ring"
                        )}
                      >
                        {selected ? <Check size={14} /> : null}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {option.icon}
                          <span className="truncate">{option.label}</span>
                        </div>
                        {option.description && (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {option.description}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

