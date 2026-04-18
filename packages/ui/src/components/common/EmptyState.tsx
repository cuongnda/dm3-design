import type { ReactNode } from "react"
import { Inbox } from "lucide-react"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"

export interface EmptyStateAction {
  label: string
  onClick?: () => void
  href?: string
  icon?: ReactNode
  variant?:
    | "default"
    | "outline"
    | "ghost"
    | "secondary"
    | "destructive"
    | "link"
  "data-testid"?: string
}

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  primaryAction?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  /** Compact vertical padding — use inside small table cells or cards. */
  compact?: boolean
  className?: string
  "data-testid"?: string
}

function renderAction(action: EmptyStateAction, isPrimary: boolean) {
  const variant = action.variant ?? (isPrimary ? "default" : "outline")
  const content = (
    <>
      {action.icon ? <span className="mr-1.5 inline-flex">{action.icon}</span> : null}
      {action.label}
    </>
  )

  if (action.href) {
    return (
      <Button
        asChild
        size="sm"
        variant={variant}
        data-testid={action["data-testid"]}
      >
        <a href={action.href}>{content}</a>
      </Button>
    )
  }

  return (
    <Button
      size="sm"
      variant={variant}
      onClick={action.onClick}
      data-testid={action["data-testid"]}
    >
      {content}
    </Button>
  )
}

/**
 * Standard empty state for lists, tables, and cards. Answers four questions
 * for the user: what the screen is for, why it's empty, what to do next, and
 * where to get help.
 *
 * Use `compact` inside `DataTable` empty cells — it drops vertical padding so
 * the table keeps its shape.
 */
export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
  className,
  "data-testid": testId,
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 text-center",
        compact ? "py-6" : "py-12",
        className,
      )}
    >
      <div className="text-muted-foreground/50">
        {icon ?? <Inbox size={32} strokeWidth={1.2} />}
      </div>
      <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="max-w-sm text-[12px] text-muted-foreground">
          {description}
        </p>
      ) : null}
      {(primaryAction || secondaryAction) ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {primaryAction ? renderAction(primaryAction, true) : null}
          {secondaryAction ? renderAction(secondaryAction, false) : null}
        </div>
      ) : null}
    </div>
  )
}
