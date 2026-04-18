import { useTranslation } from 'react-i18next';
import { AlertTriangle, VideoOff, Wifi, WifiOff } from 'lucide-react';
import type { CameraDTO } from '@dm3/api-client';

export type Severity = 'online' | 'degraded' | 'offline' | 'no-stream';

const STALE_AFTER_MS = 5 * 60 * 1000;

export function deriveSeverity(camera: Pick<CameraDTO, 'status' | 'last_checked_at'>): Severity {
  if (camera.status === 'offline' || camera.status === 'error') return 'offline';
  if (!camera.last_checked_at) return 'no-stream';
  const ageMs = Date.now() - new Date(camera.last_checked_at).getTime();
  if (ageMs > STALE_AFTER_MS) return 'degraded';
  return 'online';
}

interface StyleSpec {
  wrap: string;
  icon: typeof Wifi;
  showDot?: boolean;
}

const severityStyles: Record<Severity, StyleSpec> = {
  online: {
    wrap: 'bg-success/15 text-success border-success/30',
    icon: Wifi,
    showDot: true,
  },
  degraded: {
    wrap: 'bg-warning/15 text-warning border-warning/30',
    icon: AlertTriangle,
  },
  offline: {
    wrap: 'bg-destructive/15 text-destructive border-destructive/30',
    icon: WifiOff,
  },
  'no-stream': {
    wrap: 'bg-muted text-muted-foreground border-border',
    icon: VideoOff,
  },
};

const severityI18nKeys: Record<Severity, string> = {
  online: 'cctv.severity.online',
  degraded: 'cctv.severity.degraded',
  offline: 'cctv.severity.offline',
  'no-stream': 'cctv.severity.noStream',
};

interface SeverityPillProps {
  severity: Severity;
  size?: 'sm' | 'xs';
}

export function SeverityPill({ severity, size = 'sm' }: SeverityPillProps) {
  const { t } = useTranslation('common');
  const spec = severityStyles[severity];
  const Icon = spec.icon;
  const label = t(severityI18nKeys[severity]);
  const sizeCls = size === 'xs'
    ? 'px-1.5 py-0.5 text-[10px] gap-1'
    : 'px-2 py-0.5 text-[11px] gap-1.5';
  return (
    <span
      className={`inline-flex items-center rounded border font-medium ${sizeCls} ${spec.wrap}`}
      data-testid={`cctv-severity-${severity}`}
    >
      {spec.showDot && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
      )}
      <Icon size={size === 'xs' ? 10 : 12} />
      <span>{label}</span>
    </span>
  );
}

// Legacy status badge kept for any surfaces still passing a raw camera.status string.
interface LegacyProps {
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

export function CameraStatusBadge({ status }: LegacyProps) {
  const { t } = useTranslation('common');
  const cls = statusStyles[status] ?? statusStyles.unknown;
  const label = statusI18nKeys[status] ? t(statusI18nKeys[status]) : status;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${cls}`}>
      {label}
    </span>
  );
}
