import * as React from "react"

import { cn } from "../../lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "block text-[11px] text-muted-foreground mb-1 font-medium uppercase tracking-wider",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
