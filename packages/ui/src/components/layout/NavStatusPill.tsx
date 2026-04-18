import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { NAV_STATUS_META, type NavStatus } from '../../lib/navStatus';

interface NavStatusPillProps {
  status: NavStatus;
  className?: string;
}

const VARIANTS: Record<Exclude<NavStatus, 'ready' | 'hidden'>, string> = {
  beta: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  setup: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'coming-soon': 'bg-muted text-muted-foreground border-border',
};

export function NavStatusPill({ status, className }: NavStatusPillProps) {
  if (status === 'ready' || status === 'hidden') return null;

  const meta = NAV_STATUS_META[status];
  const variant = VARIANTS[status];

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center rounded border px-1 py-0 text-[9px] font-semibold uppercase leading-[14px] tracking-wide',
            variant,
            className,
          )}
        >
          {meta.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="bg-popover text-popover-foreground border-border">
        {meta.description}
      </TooltipContent>
    </Tooltip>
  );
}
