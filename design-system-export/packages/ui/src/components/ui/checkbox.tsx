import * as React from "react"
import { cn } from "../../lib/utils"

interface CheckboxProps extends Omit<React.ComponentProps<"input">, "type" | "onChange"> {
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}

function Checkbox({
  className,
  indeterminate,
  onCheckedChange,
  onChange,
  ...props
}: CheckboxProps) {
  const ref = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate ?? false
    }
  }, [indeterminate])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e)
    onCheckedChange?.(e.target.checked)
  }

  return (
    <input
      ref={ref}
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "size-4 shrink-0 cursor-pointer rounded border shadow-xs transition-colors outline-none",
        "border-slate-300 bg-background",
        "checked:bg-primary checked:border-primary checked:text-primary-foreground",
        "indeterminate:bg-primary indeterminate:border-primary",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "dark:border-input dark:bg-input/30",
        className
      )}
      onChange={handleChange}
      {...props}
    />
  )
}

export { Checkbox }
