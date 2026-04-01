import * as React from "react"

import { cn } from "../../lib/utils"

function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // Dark theme styles for DM3
        "bg-[#0B1120] border-[#1E293B] text-[#F8FAFC]",
        "focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]/20",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

function SelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return <option 
    className={cn(
      // Dark theme for options
      "bg-[#0B1120] text-[#F8FAFC] hover:bg-[#1E293B]", 
      className
    )} 
    {...props} 
  />
}

export { Select, SelectOption }
