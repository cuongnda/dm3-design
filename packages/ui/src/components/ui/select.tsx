import * as React from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Search, X } from "lucide-react"

import { cn } from "../../lib/utils"
import { Input } from "./input"

export interface SelectRichOption {
  value: string
  label: string
  description?: string
  icon?: React.ReactNode
  disabled?: boolean
}

// Backward compat alias
export type Option = SelectRichOption

type ParsedOption = {
  value: string
  label: string
  disabled?: boolean
}

/** Avoid String([20, ' / page']) → "20, / page" when SelectOption uses mixed JSX children. */
function optionChildrenToLabel(node: React.ReactNode): string {
  if (node == null || node === false) return ""
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint")
    return String(node)
  if (Array.isArray(node)) return node.map(optionChildrenToLabel).join("")
  if (React.isValidElement(node)) {
    const ch = (node.props as { children?: React.ReactNode }).children
    return optionChildrenToLabel(ch)
  }
  return ""
}

function extractOptions(children: React.ReactNode): ParsedOption[] {
  return React.Children.toArray(children)
    .filter(React.isValidElement)
    .map((child) => {
      const element = child as React.ReactElement<React.ComponentProps<"option">>
      const value = String(element.props.value ?? "")
      const label = optionChildrenToLabel(element.props.children) || value
      return { value, label, disabled: element.props.disabled }
    })
}

type SelectProps = {
  value?: string
  defaultValue?: string
  disabled?: boolean
  name?: string
  className?: string
  placeholder?: string
  searchPlaceholder?: string
  "data-testid"?: string
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
  onValueChange?: (value: string) => void
  /** Rich options with icon/description — use instead of children */
  options?: SelectRichOption[]
  children?: React.ReactNode
}

function Select({
  "data-testid": testId,
  className,
  children,
  options: richOptions,
  value,
  defaultValue,
  onChange,
  onValueChange,
  disabled,
  name,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
}: SelectProps) {
  const childOptions = React.useMemo(
    () => (richOptions ? [] : extractOptions(children)),
    [richOptions, children]
  )

  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = React.useState(String(defaultValue ?? ""))
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>({})

  const selectedValue = isControlled ? String(value ?? "") : internalValue
  const selectedRich = richOptions?.find(o => o.value === selectedValue)
  const selectedChild = childOptions.find(o => o.value === selectedValue)

  const filteredOptions = React.useMemo(() => {
    const q = search.toLowerCase()
    if (richOptions) {
      return search
        ? richOptions.filter(o =>
            o.label.toLowerCase().includes(q) ||
            o.value.toLowerCase().includes(q) ||
            o.description?.toLowerCase().includes(q)
          )
        : richOptions
    }
    return search ? childOptions.filter(o => o.label.toLowerCase().includes(q)) : childOptions
  }, [search, richOptions, childOptions])

  const updatePanelPosition = React.useCallback(() => {
    if (!triggerRef.current) return
    const tr = triggerRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const GAP = 4
    const PAD = 8
    const MAX_H = 280
    /** Prefer flipping above when less than this remains below (footer selects, taskbar). */
    const MIN_BELOW = 200

    const minW = richOptions ? Math.max(tr.width, 300) : tr.width
    let left = tr.left
    if (left + minW > vw - PAD) {
      left = Math.max(PAD, vw - minW - PAD)
    }

    const spaceBelow = vh - tr.bottom - GAP - PAD
    const spaceAbove = tr.top - GAP - PAD
    const openBelow = spaceBelow >= MIN_BELOW || spaceBelow >= spaceAbove

    const base: React.CSSProperties = {
      position: "fixed",
      left,
      width: tr.width,
      minWidth: richOptions ? 300 : tr.width,
      maxHeight: openBelow ? Math.min(MAX_H, Math.max(80, spaceBelow)) : Math.min(MAX_H, Math.max(80, spaceAbove)),
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      zIndex: 2147483647,
    }

    if (openBelow) {
      setPanelStyle({
        ...base,
        top: tr.bottom + GAP,
        bottom: "auto",
      })
    } else {
      setPanelStyle({
        ...base,
        top: "auto",
        bottom: vh - tr.top + GAP,
      })
    }
  }, [richOptions])

  React.useLayoutEffect(() => {
    if (!open) return
    updatePanelPosition()
    let raf = 0
    raf = requestAnimationFrame(() => updatePanelPosition())
    window.addEventListener("resize", updatePanelPosition)
    window.addEventListener("scroll", updatePanelPosition, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", updatePanelPosition)
      window.removeEventListener("scroll", updatePanelPosition, true)
    }
  }, [open, updatePanelPosition, filteredOptions.length, search])

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

  const handleSelect = (nextValue: string) => {
    if (!isControlled) setInternalValue(nextValue)
    onValueChange?.(nextValue)
    onChange?.({
      type: "change",
      target: { value: nextValue, name } as EventTarget & HTMLSelectElement,
      currentTarget: { value: nextValue, name } as EventTarget & HTMLSelectElement,
    } as React.ChangeEvent<HTMLSelectElement>)
    setOpen(false)
    setSearch("")
  }

  return (
    <div ref={rootRef} className={cn("relative", className)} data-testid={testId}>
      <button
        ref={triggerRef}
        type="button"
        data-slot="select"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        aria-expanded={open}
        className={cn(
          "h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none cursor-pointer",
          "bg-input border-border text-foreground",
          "focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/20",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "flex items-center justify-between gap-2",
          open && "border-ring ring-1 ring-ring/20"
        )}
      >
        {richOptions ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {selectedRich?.icon}
            <span className={cn("truncate", !selectedRich && "text-muted-foreground")}>
              {selectedRich?.label ?? placeholder}
            </span>
            {selectedRich?.description && (
              <span className="text-muted-foreground text-xs ml-auto shrink-0">{selectedRich.description}</span>
            )}
          </div>
        ) : (
          <span className={cn("truncate", !selectedChild && "text-muted-foreground")}>
            {selectedChild?.label ?? placeholder}
          </span>
        )}
        <ChevronDown
          size={16}
          className={cn("text-muted-foreground transition-transform shrink-0", open && "rotate-180")}
        />
      </button>

      {open && !disabled && createPortal(
        <>
          {/* Invisible full-screen blocker: sits above dialog (z>51) but below panel, prevents dialog content from capturing events */}
          {/* pointerEvents: auto overrides pointer-events: none set by Radix Dialog on document.body */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 2147483646, pointerEvents: 'auto' }} />
          <div
            ref={panelRef}
            style={{ ...panelStyle, pointerEvents: 'auto' }}
            className="rounded-md border border-border bg-card text-foreground shadow-xl"
          >
          <div className="shrink-0 border-b border-border bg-card p-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 pl-9 pr-8 bg-background"
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

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-card py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No options found</div>
            ) : richOptions ? (
              (filteredOptions as SelectRichOption[]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 text-sm text-left cursor-pointer select-none",
                    "hover:bg-muted focus:bg-muted focus:outline-none",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    selectedValue === opt.value && "bg-primary/10 text-primary"
                  )}
                >
                  {opt.icon}
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground">{opt.label}</div>
                    {opt.description && (
                      <div className="text-muted-foreground text-xs">{opt.description}</div>
                    )}
                  </div>
                  {selectedValue === opt.value && <Check size={14} className="shrink-0" />}
                </button>
              ))
            ) : (
              (filteredOptions as ParsedOption[]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2 cursor-pointer select-none",
                    "hover:bg-muted focus:bg-muted focus:outline-none",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    selectedValue === opt.value && "bg-primary/10 text-primary"
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {selectedValue === opt.value && <Check size={14} className="shrink-0" />}
                </button>
              ))
            )}
          </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

function SelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return <option className={cn("bg-card text-foreground", className)} {...props} />
}

// Backward compat alias — ComboBox is now just Select
const ComboBox = Select

// Additional exports for compatibility with Radix UI pattern
const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  >
    {children}
  </button>
))
SelectTrigger.displayName = "SelectTrigger"

const SelectValue = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & {
    placeholder?: string
  }
>(({ className, placeholder, ...props }, ref) => (
  <span
    ref={ref}
    className={cn("block truncate", className)}
    {...props}
  >
    {props.children || <span className="text-muted-foreground">{placeholder}</span>}
  </span>
))
SelectValue.displayName = "SelectValue"

const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
      className
    )}
    {...props}
  >
    {children}
  </div>
))
SelectContent.displayName = "SelectContent"

const SelectItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    value: string
  }
>(({ className, children, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    {children}
  </button>
))
SelectItem.displayName = "SelectItem"

export {
  Select,
  SelectOption,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  ComboBox
}
