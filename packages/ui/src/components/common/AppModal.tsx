import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"

export type AppModalSize =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "4xl"
  | "full"

const sizeStyle: Record<AppModalSize, string> = {
  xs: "20rem",
  sm: "24rem",
  md: "28rem",
  lg: "32rem",
  xl: "36rem",
  "2xl": "42rem",
  "4xl": "56rem",
  full: "min(96rem, calc(100% - 2rem))",
}

/** Footer action: label, handler, optional variant / loading / disabled (for validation). */
export interface AppModalAction {
  label: React.ReactNode
  onClick: () => void | Promise<void>
  variant?: React.ComponentProps<typeof Button>["variant"]
  size?: React.ComponentProps<typeof Button>["size"]
  disabled?: boolean
  /** When set, overrides internal busy state from awaiting `onClick`. */
  loading?: boolean
  className?: string
}

export interface AppModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  /** Main content; omit for title + description + actions only. */
  children?: React.ReactNode

  size?: AppModalSize
  showCloseButton?: boolean

  /** Merged into primary `disabled` — use for form validity from parent (`!formState.isValid`). */
  submitDisabled?: boolean

  /** Optional validation / API error line above the footer. */
  errorMessage?: React.ReactNode
  errorClassName?: string

  /** Primary button (e.g. Save). Busy: set `loading` or return a Promise from `onClick`. */
  primaryAction?: AppModalAction
  /** Extra button(s) before primary (e.g. secondary flow). Shown after cancel if both exist. */
  secondaryAction?: AppModalAction
  /**
   * Cancel control calling `onOpenChange(false)`, or `onCancel` when provided.
   * Combine with `primaryAction` for a standard Save / Cancel bar.
   */
  showCancelButton?: boolean
  cancelLabel?: React.ReactNode
  onCancel?: () => void
  /** e.g. disable Cancel while a destructive request is in flight */
  cancelDisabled?: boolean

  /** Replace the entire footer (header + body unchanged). */
  footer?: React.ReactNode

  className?: string
  style?: React.CSSProperties
  bodyClassName?: string
  footerClassName?: string
  headerClassName?: string
}

function AppModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "lg",
  showCloseButton = true,
  submitDisabled = false,
  errorMessage,
  errorClassName,
  primaryAction,
  secondaryAction,
  showCancelButton = false,
  cancelLabel = "Cancel",
  onCancel,
  cancelDisabled = false,
  footer,
  className,
  style,
  bodyClassName,
  footerClassName,
  headerClassName,
}: AppModalProps) {
  const [internalBusy, setInternalBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) setInternalBusy(false)
  }, [open])

  const primaryLoading =
    primaryAction?.loading === true ||
    (primaryAction?.loading === undefined && internalBusy)

  const runPrimary = React.useCallback(async () => {
    if (!primaryAction) return
    if (primaryAction.disabled || submitDisabled || primaryLoading) return
    const { onClick, loading } = primaryAction
    const useInternalBusy = loading === undefined
    if (useInternalBusy) setInternalBusy(true)
    try {
      await Promise.resolve(onClick())
    } finally {
      if (useInternalBusy) setInternalBusy(false)
    }
  }, [primaryAction, submitDisabled, primaryLoading])

  const primaryDisabled =
    Boolean(primaryAction?.disabled) ||
    submitDisabled ||
    primaryLoading
  const destructivePrimaryClass =
    "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
  const primaryClassName = cn(
    primaryAction?.variant === "destructive" && destructivePrimaryClass,
    primaryAction?.className
  )

  const dismissCancel = React.useCallback(() => {
    if (onCancel) onCancel()
    else onOpenChange(false)
  }, [onCancel, onOpenChange])

  const defaultFooter =
    !footer &&
    (showCancelButton || secondaryAction || primaryAction) ? (
      <DialogFooter
        className={cn(
          "flex-row justify-end gap-2 border-t border-border px-6 py-4",
          footerClassName
        )}
      >
        {showCancelButton ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={primaryLoading || cancelDisabled}
            onClick={dismissCancel}
          >
            {cancelLabel}
          </Button>
        ) : null}
        {secondaryAction ? (
          <Button
            type="button"
            variant={secondaryAction.variant ?? "outline"}
            size={secondaryAction.size ?? "sm"}
            disabled={secondaryAction.disabled || primaryLoading}
            className={secondaryAction.className}
            onClick={() => void Promise.resolve(secondaryAction.onClick())}
          >
            {secondaryAction.label}
          </Button>
        ) : null}
        {primaryAction ? (
          <Button
            type="button"
            variant={primaryAction.variant ?? "default"}
            size={primaryAction.size ?? "sm"}
            disabled={primaryDisabled}
            className={primaryClassName}
            onClick={() => void runPrimary()}
          >
            {primaryLoading ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : null}
            {primaryAction.label}
          </Button>
        ) : null}
      </DialogFooter>
    ) : footer ? (
      <div className={cn("border-t border-border px-6 py-4", footerClassName)}>{footer}</div>
    ) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={showCloseButton}
        style={{ maxWidth: sizeStyle[size], ...style }}
        className={cn(
          "flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0",
          className
        )}
      >
        <div className={cn("space-y-1.5 border-b border-border px-6 py-4", headerClassName)}>
          <DialogHeader className="space-y-1.5 p-0">
            <DialogTitle className="text-left">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="text-left">{description}</DialogDescription>
            ) : null}
          </DialogHeader>
        </div>

        {children != null ? (
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-4", bodyClassName)}>
            {children}
          </div>
        ) : null}

        {errorMessage ? (
          <p
            role="alert"
            className={cn("px-6 text-sm text-destructive", errorClassName)}
          >
            {errorMessage}
          </p>
        ) : null}

        {defaultFooter}
      </DialogContent>
    </Dialog>
  )
}

export { AppModal }
