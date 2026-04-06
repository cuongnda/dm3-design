import * as React from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Search, X } from "lucide-react"

import { cn } from "../../lib/utils"
import { Input } from "./input"
import { Checkbox } from "./checkbox"

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
    const q = search.toLowerCase()
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q)
    )
  }, [options, search])

  const selectedSet = React.useMemo(() => new Set(values), [values])

  const displayText = React.useMemo(() => {
    if (values.length === 0) return null
    const labels = options.filter((o) => selectedSet.has(o.value)).map((o) => o.label)
    if (labels.length === 0) return null
    const first2 = labels.slice(0, 2).join(", ")
    return labels.length > 2 ? `${first2} +${labels.length - 2}` : first2
  }, [options, values, selectedSet])

  const allFilteredSelected =
    filteredOptions.length > 0 && filteredOptions.every((o) => selectedSet.has(o.value))
  const someFilteredSelected = filteredOptions.some((o) => selectedSet.has(o.value))

  const toggleValue = (val: string) => {
    if (disabled) return
    if (selectedSet.has(val)) {
      onValuesChange(values.filter((v) => v !== val))
    } else {
      if (typeof maxSelected === "number" && values.length >= maxSelected) return
      onValuesChange([...values, val])
    }
  }

  const selectAll = () => {
    const toAdd = filteredOptions
      .filter((o) => !selectedSet.has(o.value))
      .map((o) => o.value)
    if (typeof maxSelected === "number") {
      const remaining = maxSelected - values.length
      onValuesChange([...values, ...toAdd.slice(0, remaining)])
    } else {
      onValuesChange([...values, ...toAdd])
    }
  }

  const unselectAll = () => {
    const filteredVals = new Set(filteredOptions.map((o) => o.value))
    onValuesChange(values.filter((v) => !filteredVals.has(v)))
  }

  const updatePanelPosition = React.useCallback(() => {
    if (!triggerRef.current) return
    const tr = triggerRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const GAP = 4
    const PAD = 8
    const MAX_H = 280
    const MIN_BELOW = 200

    let left = tr.left
    if (left + tr.width > vw - PAD) {
      left = Math.max(PAD, vw - tr.width - PAD)
    }

    const spaceBelow = vh - tr.bottom - GAP - PAD
    const spaceAbove = tr.top - GAP - PAD
    const openBelow = spaceBelow >= MIN_BELOW || spaceBelow >= spaceAbove

    const base: React.CSSProperties = {
      position: "fixed",
      left,
      width: tr.width,
      minWidth: tr.width,
      maxHeight: openBelow
        ? Math.min(MAX_H, Math.max(80, spaceBelow))
        : Math.min(MAX_H, Math.max(80, spaceAbove)),
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      zIndex: 2147483647,
    }

    setPanelStyle(
      openBelow
        ? { ...base, top: tr.bottom + GAP, bottom: "auto" }
        : { ...base, top: "auto", bottom: vh - tr.top + GAP }
    )
  }, [])

  React.useLayoutEffect(() => {
    if (!open) return
    updatePanelPosition()
    const raf = requestAnimationFrame(() => updatePanelPosition())
    window.addEventListener("resize", updatePanelPosition)
    window.addEventListener("scroll", updatePanelPosition, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", updatePanelPosition)
      window.removeEventListener("scroll", updatePanelPosition, true)
    }
  }, [open, updatePanelPosition, filteredOptions.length])

  React.useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
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
        data-slot="multiselect"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none",
          "bg-input border-border text-foreground",
          "focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/20",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "flex items-center justify-between gap-2",
          open && "border-ring ring-1 ring-ring/20"
        )}
      >
        <span className={cn("truncate flex-1 text-left", !displayText && "text-muted-foreground")}>
          {displayText ?? placeholder}
        </span>
        {values.length > 0 && (
          <span
            className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground shrink-0"
          >
            {values.length}
          </span>
        )}
        <ChevronDown
          size={16}
          className={cn("text-muted-foreground transition-transform shrink-0", open && "rotate-180")}
        />
      </button>

      {open && !disabled &&
        createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="rounded-md border border-border bg-card text-foreground shadow-xl"
          >
            {/* Search */}
            <div className="shrink-0 border-b border-border bg-card p-2">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-8 pl-9 pr-8 bg-background"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Select All / Unselect All */}
            {filteredOptions.length > 0 && (
              <div className="shrink-0 border-b border-border bg-card">
                {someFilteredSelected ? (
                  <button
                    type="button"
                    onClick={unselectAll}
                    className="w-full cursor-pointer px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    Unselect all
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={typeof maxSelected === "number" && values.length >= maxSelected}
                    className="w-full cursor-pointer px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Select all
                  </button>
                )}
              </div>
            )}

            {/* Options */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-card py-1">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">No options found</div>
              ) : (
                filteredOptions.map((option) => {
                  const checked = selectedSet.has(option.value)
                  const disabledOption =
                    !checked && typeof maxSelected === "number" && values.length >= maxSelected

                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={disabledOption}
                      onClick={() => toggleValue(option.value)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm",
                        "hover:bg-muted focus:bg-muted focus:outline-none transition-colors",
                        checked && "bg-primary/5",
                        disabledOption && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        readOnly
                        tabIndex={-1}
                        className="pointer-events-none shrink-0"
                      />
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
