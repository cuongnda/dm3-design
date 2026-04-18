import * as React from "react"
import { Check, ChevronRight, type LucideIcon } from "lucide-react"

import { cn } from "../../lib/utils"
import { AppModal, type AppModalProps, type AppModalSize } from "./AppModal"

export interface WizardStep<TId extends string | number = string | number> {
  id: TId
  label: React.ReactNode
  icon?: LucideIcon
}

export interface WizardModalProps<TId extends string | number = string | number>
  extends Omit<AppModalProps, "children" | "size" | "footer"> {
  steps: ReadonlyArray<WizardStep<TId>>
  activeStep: TId
  size?: AppModalSize
  /** Custom footer (usually per-step buttons). Leave empty to hide the footer entirely. */
  footer?: React.ReactNode
  children?: React.ReactNode
  stepperClassName?: string
}

/**
 * Modal wrapper that renders a step indicator above the body.
 * Use when a create/edit flow spans multiple steps that all fit inside a modal.
 * For single-step forms use AppModal directly.
 */
export function WizardModal<TId extends string | number = string | number>({
  steps,
  activeStep,
  size = "xl",
  footer,
  children,
  stepperClassName,
  ...modalProps
}: WizardModalProps<TId>) {
  const activeIndex = steps.findIndex((s) => s.id === activeStep)

  return (
    <AppModal {...modalProps} size={size} footer={footer}>
      <div className={cn("mb-4 flex flex-wrap items-center gap-2", stepperClassName)}>
        {steps.map((step, idx) => {
          const Icon = step.icon
          const isActive = idx === activeIndex
          const isDone = idx < activeIndex
          return (
            <React.Fragment key={step.id}>
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors",
                  isActive && "border-primary/40 bg-primary/10 text-primary",
                  isDone && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                  !isActive && !isDone && "border-border/60 text-muted-foreground",
                )}
                data-active={isActive || undefined}
                data-done={isDone || undefined}
              >
                {isDone ? (
                  <Check size={12} aria-hidden />
                ) : Icon ? (
                  <Icon size={12} aria-hidden />
                ) : (
                  <span className="inline-flex h-3 w-3 items-center justify-center text-[10px] font-semibold">
                    {idx + 1}
                  </span>
                )}
                <span className="font-medium">{step.label}</span>
              </div>
              {idx < steps.length - 1 ? (
                <ChevronRight
                  size={12}
                  className="text-muted-foreground/50"
                  aria-hidden
                />
              ) : null}
            </React.Fragment>
          )
        })}
      </div>
      {children}
    </AppModal>
  )
}
