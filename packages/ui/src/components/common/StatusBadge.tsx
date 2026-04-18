import { cn } from '../../lib/utils';

type StatusVariant = 'online' | 'offline' | 'alarm' | 'warning';

interface StatusBadgeProps {
  status: StatusVariant;
  label?: string;
}

const config: Record<StatusVariant, { dotClass: string; textClass: string; defaultLabel: string }> = {
  online: { dotClass: 'bg-[#22C55E]', textClass: 'text-[#22C55E]', defaultLabel: 'Online' },
  offline: { dotClass: 'bg-[#64748B]', textClass: 'text-[#64748B]', defaultLabel: 'Offline' },
  alarm: { dotClass: 'bg-[#EF4444] animate-pulse-live', textClass: 'text-[#EF4444]', defaultLabel: 'ALARM' },
  warning: { dotClass: 'bg-[#EAB308]', textClass: 'text-[#EAB308]', defaultLabel: 'Warning' },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const c = config[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dotClass)} />
      <span className={c.textClass}>{label || c.defaultLabel}</span>
    </span>
  );
}
