import { useTranslation } from 'react-i18next';

interface Props {
  status: string;
}

const statusStyles: Record<string, string> = {
  online: 'bg-emerald-500/20 text-emerald-400',
  offline: 'bg-slate-500/20 text-slate-400',
  error: 'bg-red-500/20 text-red-400',
  unknown: 'bg-muted text-muted-foreground',
};

const statusI18nKeys: Record<string, string> = {
  online: 'cctv.cameras.statuses.online',
  offline: 'cctv.cameras.statuses.offline',
  error: 'cctv.cameras.statuses.error',
};

export function CameraStatusBadge({ status }: Props) {
  const { t } = useTranslation('common');
  const cls = statusStyles[status] ?? statusStyles.unknown;
  const label = statusI18nKeys[status] ? t(statusI18nKeys[status]) : status;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${cls}`}>
      {label}
    </span>
  );
}
