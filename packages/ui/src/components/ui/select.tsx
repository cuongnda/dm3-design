import * as React from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Search } from "lucide-react"

import { cn } from "../../lib/utils"
import { Input } from "./input"

type NativeSelectProps = React.ComponentProps<"select">

type ParsedOption = {
  value: string
  label: string
  disabled?: boolean
}

function extractOptions(children: React.ReactNode): ParsedOption[] {
  return React.Children.toArray(children)
    .filter(React.isValidElement)
    .map((child) => {
      const element = child as React.ReactElement<React.ComponentProps<"option">>
      const value = String(element.props.value ?? "")
      const label =
        typeof element.props.children === "string"
          ? element.props.children
          : String(element.props.children ?? value)

      return {
        value,
        label,
        disabled: element.props.disabled,
      }
    })
}

function Select({
  className,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  ...props
}: NativeSelectProps) {
  const options = React.useMemo(() => extractOptions(children), [children])
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = React.useState(String(defaultValue ?? ""))
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>({})

  const selectedValue = isControlled ? String(value ?? "") : internalValue
  const selectedOption = options.find((opt) => opt.value === selectedValue)

  const filteredOptions = React.useMemo(() => {
    if (!search) return options
    const q = search.toLowerCase()
    return options.filter((opt) => opt.label.toLowerCase().includes(q))
  }, [options, search])

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
      if (!rootRef.current) return
      if (rootRef.current.contains(target)) return
      if (panelRef.current?.contains(target)) return
      if (!rootRef.current.contains(target)) {
        setOpen(false)
      }
    }

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleOutside)
    document.addEventListener("keydown", handleEsc)
    return () => {
      document.removeEventListener("mousedown", handleOutside)
      document.removeEventListener("keydown", handleEsc)
    }
  }, [])

  const handleSelect = (nextValue: string) => {
    if (!isControlled) {
      setInternalValue(nextValue)
    }

    onChange?.({
      type: "change",
      target: { value: nextValue, name } as EventTarget & HTMLSelectElement,
      currentTarget: { value: nextValue, name } as EventTarget & HTMLSelectElement,
    } as React.ChangeEvent<HTMLSelectElement>)

    setOpen(false)
    setSearch("")
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-slot="select"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none",
          "bg-input border-border text-foreground",
          "focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/20",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "flex items-center justify-between gap-2",
          className
        )}
      >
        <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
          {selectedOption?.label ?? "Select..."}
        </span>
        <ChevronDown size={16} className={cn("text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open &&
        !disabled &&
        createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="rounded-md border border-border bg-card text-foreground shadow-xl overflow-hidden"
          >
            <div className="p-2 border-b border-border bg-card">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="h-8 pl-10 pr-3 bg-background"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto py-1 bg-card">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">No options found</div>
              ) : (
                filteredOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-2",
                      "hover:bg-muted focus:bg-muted focus:outline-none",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      selectedValue === opt.value && "bg-primary/10 text-primary"
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {selectedValue === opt.value ? <Check size={14} className="shrink-0" /> : null}
                  </button>
                ))
              )}
            </div>
          </div>,
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

export { Select, SelectOption }
