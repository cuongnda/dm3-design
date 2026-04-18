import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRealtimeStore } from '@dm3/api-client';
import { useAuthStore } from '@/stores/authStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { useApiHealth, type HealthState } from '../../hooks/useApiHealth';

type Tone = 'ok' | 'warn' | 'bad' | 'mute';

const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-destructive',
  mute: 'bg-muted-foreground/40',
};

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
  mute: 'text-muted-foreground',
};

type Variant = 'topbar' | 'sidebar';

interface IndicatorProps {
  label: string;
  tone: Tone;
  value: string;
  tooltip: string;
  testId?: string;
  variant: Variant;
  collapsed?: boolean;
}

function Indicator({ label, tone, value, tooltip, testId, variant, collapsed }: IndicatorProps) {
  // Sidebar-collapsed mode: dot only
  if (variant === 'sidebar' && collapsed) {
    return (
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span
            data-testid={testId}
            className="inline-flex items-center justify-center h-3 w-3 cursor-default select-none"
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', TONE_DOT[tone])} aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-popover text-popover-foreground border-border">
          <span className="inline-flex items-center gap-2">
            <span className="uppercase text-[10px] tracking-wide text-muted-foreground">{label}</span>
            <span className={cn('tabular-nums text-[11px]', TONE_TEXT[tone])}>{value}</span>
          </span>
          <div className="text-[10px] text-muted-foreground mt-0.5">{tooltip}</div>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Sidebar expanded: label on left, value on right
  if (variant === 'sidebar') {
    return (
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span
            data-testid={testId}
            className="flex items-center justify-between gap-2 px-3 h-5 text-[10px] font-medium cursor-default select-none"
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', TONE_DOT[tone])} aria-hidden />
              <span className="text-sidebar-foreground/50 uppercase tracking-wide">{label}</span>
            </span>
            <span className={cn('tabular-nums truncate', TONE_TEXT[tone])}>{value}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-popover text-popover-foreground border-border">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Topbar variant (original)
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          data-testid={testId}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium cursor-default select-none"
        >
          <span className={cn('w-1.5 h-1.5 rounded-full', TONE_DOT[tone])} aria-hidden />
          <span className="text-muted-foreground uppercase tracking-wide">{label}</span>
          <span className={cn('tabular-nums', TONE_TEXT[tone])}>{value}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="bg-popover text-popover-foreground border-border">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function apiTone(state: HealthState): { tone: Tone; value: string } {
  switch (state) {
    case 'ok': return { tone: 'ok', value: 'OK' };
    case 'degraded': return { tone: 'warn', value: 'DEGRADED' };
    case 'down': return { tone: 'bad', value: 'DOWN' };
    default: return { tone: 'mute', value: '—' };
  }
}

function wsTone(connected: boolean, connecting: boolean): { tone: Tone; value: string } {
  if (connected) return { tone: 'ok', value: 'LIVE' };
  if (connecting) return { tone: 'warn', value: 'CONNECTING' };
  return { tone: 'bad', value: 'OFFLINE' };
}

function formatRelative(date: Date | null, now: number): string {
  if (!date) return '—';
  const diffMs = now - date.getTime();
  if (diffMs < 0) return 'just now';
  const s = Math.floor(diffMs / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return date.toLocaleDateString();
}

interface HealthStripProps {
  variant?: Variant;
  collapsed?: boolean;
}

export function HealthStrip({ variant = 'topbar', collapsed = false }: HealthStripProps) {
  const { t } = useTranslation('common');
  const user = useAuthStore((s) => s.user);
  const { state: apiState, lastCheckedAt } = useApiHealth();
  const wsConnected = useRealtimeStore((s) => s.connected);
  const wsConnecting = useRealtimeStore((s) => s.connecting);
  const wsLastConnected = useRealtimeStore((s) => s.lastConnected) ?? null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const api = apiTone(apiState);
  const ws = wsTone(wsConnected, wsConnecting);

  const syncLast = wsLastConnected instanceof Date ? wsLastConnected : null;
  const sync: { tone: Tone; value: string } = wsConnected
    ? { tone: 'ok', value: 'IN SYNC' }
    : syncLast
      ? { tone: 'warn', value: formatRelative(syncLast, now) }
      : { tone: 'mute', value: '—' };

  const tenantLabel = user?.email ? user.email.split('@')[1] ?? user.email : '—';

  const indicators = (
    <>
      <Indicator
        label={t('health.api', 'API')}
        tone={api.tone}
        value={api.value}
        tooltip={t('health.apiTooltip', 'Backend API reachability (checked every 30s).')}
        testId="health-api"
        variant={variant}
        collapsed={collapsed}
      />
      <Indicator
        label={t('health.ws', 'WS')}
        tone={ws.tone}
        value={ws.value}
        tooltip={t('health.wsTooltip', 'Real-time WebSocket connection.')}
        testId="health-ws"
        variant={variant}
        collapsed={collapsed}
      />
      <Indicator
        label={t('health.sync', 'Sync')}
        tone={sync.tone}
        value={sync.value}
        tooltip={t('health.syncTooltip', 'Last successful real-time sync.')}
        testId="health-sync"
        variant={variant}
        collapsed={collapsed}
      />
      <Indicator
        label={t('health.tenant', 'Tenant')}
        tone="mute"
        value={tenantLabel}
        tooltip={t('health.tenantTooltip', 'Active tenant scope.')}
        testId="health-tenant"
        variant={variant}
        collapsed={collapsed}
      />
    </>
  );

  if (variant === 'sidebar') {
    return (
      <div
        data-testid="health-strip"
        className={cn(
          'py-1.5 bg-sidebar',
          collapsed ? 'flex flex-col items-center gap-1.5' : 'flex flex-col gap-0',
        )}
      >
        {indicators}
      </div>
    );
  }

  return (
    <div
      data-testid="health-strip"
      className="h-7 bg-card/50 border-b border-border flex items-center px-6 gap-5 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:h-0 [scrollbar-width:none]"
    >
      {indicators}
      <span
        className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
        data-testid="health-updated"
      >
        <span className="uppercase tracking-wide">{t('health.updated', 'Last updated')}</span>
        <span className="tabular-nums text-foreground/80">{formatRelative(lastCheckedAt, now)}</span>
      </span>
    </div>
  );
}
