interface Props {
  status: string;
}

const statusStyles: Record<string, string> = {
  online: 'bg-emerald-500/20 text-emerald-400',
  offline: 'bg-slate-500/20 text-slate-400',
  error: 'bg-red-500/20 text-red-400',
  unknown: 'bg-muted text-muted-foreground',
};

export function CameraStatusBadge({ status }: Props) {
  const cls = statusStyles[status] ?? statusStyles.unknown;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}
