/**
 * RealtimeProvider — mounts inside the authenticated layout shell.
 * Boots the WebSocket connection and renders in-app critical-event toasts.
 */
import { useEffect, useState } from 'react';
import { useWebSocketConnection, useRealtimeStore } from '@dm3/api-client';
import { cn } from '@/lib/utils';

// ─── Critical event toast ─────────────────────────────────────────────────────

interface ToastItem {
  id: string;
  message: string;
  sub: string;
  severity: 'critical' | 'warning';
  at: number;
}

function CriticalEventToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Subscribe to alarms in the realtime store
  useEffect(() => {
    return useRealtimeStore.subscribe(
      (s) => s.alarms,
      (alarms) => {
        // Only care about the newest unacknowledged alarm (head of array = newest due to sort)
        const latest = alarms[0];
        if (!latest || latest.acknowledged) return;

        // Avoid showing the same alarm twice
        setToasts((prev) => {
          if (prev.some((t) => t.id === latest.id)) return prev;
          const toast: ToastItem = {
            id: latest.id,
            message: latest.alarmType === 'door.forced'
              ? '⚠ Door forced open'
              : latest.alarmType === 'alarm.triggered'
              ? '🚨 Alarm triggered'
              : `Alert: ${latest.alarmType}`,
            sub: [latest.doorId, latest.zone].filter(Boolean).join(' · ') || latest.deviceId,
            severity: latest.severity === 'critical' ? 'critical' : 'warning',
            at: Date.now(),
          };
          return [toast, ...prev].slice(0, 5); // keep max 5 toasts
        });
      },
    );
  }, []);

  // Also subscribe to door-forced events from access events
  useEffect(() => {
    return useRealtimeStore.subscribe(
      (s) => s.events,
      (events) => {
        const latest = events[0];
        if (!latest) return;
        const isForced = latest.reason === 'forced' || latest.reason === 'tamper';
        if (!isForced) return;

        setToasts((prev) => {
          const id = `evt-${latest.id}`;
          if (prev.some((t) => t.id === id)) return prev;
          const toast: ToastItem = {
            id,
            message: latest.reason === 'forced' ? '⚠ Door forced open' : '⚠ Tamper detected',
            sub: [latest.personName, latest.doorName].filter(Boolean).join(' · ') || latest.deviceId,
            severity: 'critical',
            at: Date.now(),
          };
          return [toast, ...prev].slice(0, 5);
        });
      },
    );
  }, []);

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => now - t.at < 6_000));
    }, 1_000);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[280px] max-w-[360px]',
            'animate-in slide-in-from-right-4 fade-in duration-300',
            t.severity === 'critical'
              ? 'bg-[#1A0A0A] border-[#EF4444]/50 text-[#FCA5A5]'
              : 'bg-[#1A1200] border-[#F59E0B]/50 text-[#FCD34D]',
          )}
        >
          <span className={cn(
            'w-2 h-2 rounded-full mt-1.5 flex-shrink-0 animate-pulse',
            t.severity === 'critical' ? 'bg-[#EF4444]' : 'bg-[#F59E0B]',
          )} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold leading-tight">{t.message}</div>
            {t.sub && <div className="text-[11px] opacity-70 mt-0.5 truncate">{t.sub}</div>}
          </div>
          <button
            className="text-[16px] opacity-50 hover:opacity-100 leading-none ml-1 flex-shrink-0"
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Connection status indicator (bottom-left) ────────────────────────────────

function WsStatusDot() {
  const connected = useRealtimeStore((s) => s.connected);
  const connecting = useRealtimeStore((s) => s.connecting);

  return (
    <div
      className="fixed bottom-4 left-4 z-[9998] flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#0B1120]/80 border border-[#1E293B] text-[11px] backdrop-blur-sm"
      title={connected ? 'Real-time connected' : connecting ? 'Connecting…' : 'Real-time disconnected'}
    >
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        connected ? 'bg-[#22C55E] animate-pulse' : connecting ? 'bg-[#F59E0B] animate-pulse' : 'bg-[#64748B]',
      )} />
      <span className={cn(
        connected ? 'text-[#22C55E]' : connecting ? 'text-[#F59E0B]' : 'text-[#64748B]',
      )}>
        {connected ? 'Live' : connecting ? 'Connecting' : 'Offline'}
      </span>
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RealtimeProvider() {
  // This hook auto-connects on mount and disconnects on unmount.
  useWebSocketConnection();

  return (
    <>
      <WsStatusDot />
      <CriticalEventToasts />
    </>
  );
}
