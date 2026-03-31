import * as React from "react"

import { cn } from "../../lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "border-input size-4 shrink-0 rounded border shadow-xs transition-colors outline-none",
        "checked:bg-primary checked:border-primary checked:text-primary-foreground",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "dark:bg-input/30 dark:border-input",
        className
      )}
      {...props}
    />
  )
}

export { Checkbox }
