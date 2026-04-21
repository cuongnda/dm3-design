import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EmergencyPlanModal } from './EmergencyPlanModal';
import {
  PageHeader,
  DataTable,
  StatCard,
  Badge,
  Button,
  AppModal,
  EmptyState,
  TablePaginationFooter,
  type Column,
} from '@dm3/ui';
import { cn } from '@/lib/utils';
import {
  Flame, Lock, Unlock, HeartPulse, UserX, ShieldAlert, CheckCircle2,
  Plus, Play, Trash2, Edit, Settings2, DoorOpen, Zap, AlertTriangle,
  ClipboardList, ShieldCheck, Siren, Clock, DoorClosed,
} from 'lucide-react';
import {
  fetchEmergencyPlans, deleteEmergencyPlan,
  activateEmergency, allClearEmergency, sendBulkDoorCommand,
  fetchEmergencyIncidents, fetchActiveEmergencies,
  type EmergencyPlanDTO, type EmergencyIncidentDTO,
} from '@/lib/api';
import { toast } from '@/lib/toast';

/* ── Icon map ──────────────────────────────────────────────── */

const iconMap: Record<string, React.ReactNode> = {
  flame: <Flame size={20} />,
  lock: <Lock size={20} />,
  unlock: <Unlock size={20} />,
  'heart-pulse': <HeartPulse size={20} />,
  'user-x': <UserX size={20} />,
  'shield-alert': <ShieldAlert size={20} />,
  'door-open': <DoorOpen size={20} />,
  zap: <Zap size={20} />,
  'alert-triangle': <AlertTriangle size={20} />,
};

const iconMapLg: Record<string, React.ReactNode> = {
  flame: <Flame size={32} />,
  lock: <Lock size={32} />,
  unlock: <Unlock size={32} />,
  'heart-pulse': <HeartPulse size={32} />,
  'user-x': <UserX size={32} />,
  'shield-alert': <ShieldAlert size={32} />,
  'door-open': <DoorOpen size={32} />,
  zap: <Zap size={32} />,
  'alert-triangle': <AlertTriangle size={32} />,
};

const ICON_OPTIONS = ['flame', 'lock', 'unlock', 'heart-pulse', 'user-x', 'shield-alert', 'door-open', 'zap', 'alert-triangle'];
const ACTION_OPTIONS = ['unlock', 'lock', 'hold_open', 'hold_close'];
const TARGET_OPTIONS = ['all', 'zone', 'access_point', 'device'];
const actionLabels: Record<string, string> = {
  unlock: 'Unlock',
  lock: 'Lock',
  hold_open: 'Open All Doors',
  hold_close: 'Lockdown',
  release: 'Release',
};
const actionLabel = (action: string) => actionLabels[action] || action;

const POLL_INTERVAL = 5000;

function formatElapsed(from: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - from.getTime());
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatAbs(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/* ── Main page ─────────────────────────────────────────────── */

export function EmergencyPage() {
  const { t } = useTranslation('secure');

  const [plans, setPlans] = useState<EmergencyPlanDTO[]>([]);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [incidents, setIncidents] = useState<EmergencyIncidentDTO[]>([]);
  const [activeIncidents, setActiveIncidents] = useState<EmergencyIncidentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [incidentPage, setIncidentPage] = useState(1);
  const [incidentTotal, setIncidentTotal] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [deletingPlan, setDeletingPlan] = useState<EmergencyPlanDTO | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Activate modal
  const [activatingPlan, setActivatingPlan] = useState<EmergencyPlanDTO | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [activating, setActivating] = useState(false);

  /* ── Load ────────────────────────────────────────────────── */

  const loadPlans = useCallback(async () => {
    try {
      const data = await fetchEmergencyPlans();
      setPlans(data || []);
    } catch { /* ignore */ }
  }, []);

  const loadIncidents = useCallback(async () => {
    try {
      const [incRes, activeRes] = await Promise.all([
        fetchEmergencyIncidents(incidentPage, 10),
        fetchActiveEmergencies(),
      ]);
      setIncidents(incRes.data || []);
      setIncidentTotal(incRes.total ?? 0);
      setActiveIncidents(activeRes || []);
    } catch { /* ignore */ }
  }, [incidentPage]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    await Promise.all([loadPlans(), loadIncidents()]);
    setLoading(false);
  }, [loadPlans, loadIncidents]);

  useEffect(() => {
    loadAll();
    pollRef.current = setInterval(() => loadAll(true), POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadAll]);

  /* ── Activate ────────────────────────────────────────────── */

  const handleActivate = useCallback(async (plan: EmergencyPlanDTO) => {
    setActivating(true);
    try {
      const res = await activateEmergency(plan.id);
      // Send the actual door command via gateway
      if (res.access_point_ids?.length > 0) {
        try {
          await sendBulkDoorCommand(res.access_point_ids, res.action);
        } catch {
          toast('Emergency activated but door command failed — check device connectivity', 'error');
        }
      }
      toast(t('emergency.toast.activated', { name: plan.name }), 'success');
      setActivatingPlan(null);
      loadAll(true);
    } catch {
      toast(t('emergency.toast.activateFailed', { name: plan.name }), 'error');
    } finally {
      setActivating(false);
    }
  }, [loadAll, t]);

  const handleAllClear = async (incident: EmergencyIncidentDTO) => {
    try {
      const res = await allClearEmergency(incident.id);
      // Send release command to restore all affected devices to normal
      if (res.access_point_ids?.length > 0) {
        try {
          await sendBulkDoorCommand(res.access_point_ids, 'release');
        } catch {
          toast('All clear issued but door command failed — check device connectivity', 'error');
        }
      }
      toast(t('emergency.toast.allClear'), 'success');
      loadAll(true);
    } catch {
      toast(t('emergency.toast.allClearFailed'), 'error');
    }
  };

  /* ── Countdown dialog ────────────────────────────────────── */

  useEffect(() => {
    if (!activatingPlan) { setCountdown(0); return; }
    setCountdown(activatingPlan.countdown_seconds);
  }, [activatingPlan]);

  useEffect(() => {
    if (!activatingPlan || countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, activatingPlan]);

  useEffect(() => {
    if (activatingPlan && countdown === 0 && !activating) {
      handleActivate(activatingPlan);
    }
  }, [countdown, activatingPlan, activating, handleActivate]);

  /* ── Delete plan ─────────────────────────────────────────── */

  const handleDeletePlan = async () => {
    if (!deletingPlan) return;
    try {
      await deleteEmergencyPlan(deletingPlan.id);
      toast(t('emergency.toast.planDeleted'), 'success');
      setDeletingPlan(null);
      loadPlans();
    } catch {
      toast(t('emergency.toast.planDeleteFailed'), 'error');
    }
  };

  /* ── Stats ───────────────────────────────────────────────── */

  const enabledPlans = plans.filter((p) => p.enabled).length;

  /* ── Incident columns ────────────────────────────────────── */

  const incidentColumns: Column<EmergencyIncidentDTO>[] = [
    {
      key: 'activated_at', header: 'Time', width: '150px', sortable: true,
      render: (r) => <span className="font-mono text-[12px]">{new Date(r.activated_at).toLocaleString()}</span>,
    },
    {
      key: 'plan_name', header: 'Plan',
      render: (r) => <span className="text-[13px] font-medium text-foreground">{r.plan_name}</span>,
    },
    {
      key: 'action', header: 'Action', width: '100px',
      render: (r) => <Badge variant="outline" className="text-[11px]">{actionLabel(r.action)}</Badge>,
    },
    {
      key: 'triggered_by_email', header: 'Triggered By',
      render: (r) => <span className="text-[12px] text-muted-foreground">{r.triggered_by_email || '—'}</span>,
    },
    {
      key: 'duration_seconds', header: 'Duration', width: '90px',
      render: (r) => {
        if (!r.duration_seconds) return <span className="text-[12px] text-muted-foreground">—</span>;
        const m = Math.floor(r.duration_seconds / 60);
        return <span className="font-mono text-[12px]">{m}m</span>;
      },
    },
    {
      key: 'target_summary', header: 'Targets',
      render: (r) => <span className="text-[12px] text-muted-foreground">{r.target_summary}</span>,
    },
    {
      key: 'status', header: 'Status', width: '110px',
      render: (r) => (
        <Badge variant="outline" className={cn('text-[11px]',
          r.status === 'active' && 'border-error/30 bg-error/10 text-error animate-pulse',
          r.status === 'all_clear' && 'border-success/30 bg-success/10 text-success',
          r.status === 'cancelled' && 'border-muted-foreground/30 text-muted-foreground',
        )}>
          {r.status === 'active' ? 'Active' : r.status === 'all_clear' ? 'Resolved' : 'Cancelled'}
        </Badge>
      ),
    },
    {
      key: 'actions', header: '', width: '80px',
      render: (r) => r.status === 'active' ? (
        <Button variant="outline" size="sm" className="text-[11px] border-success/30 text-success"
          onClick={(e) => { e.stopPropagation(); handleAllClear(r); }}>
          <CheckCircle2 size={12} className="mr-1" /> Clear
        </Button>
      ) : null,
    },
  ];

  /* ── Render ──────────────────────────────────────────────── */

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
      <PageHeader title={t('emergency.title')} description={t('emergency.description')}>
        <Button
          data-testid="emergency-button-create"
          size="sm"
          onClick={() => { setEditingPlanId(null); setShowPlanModal(true); }}
        >
          <Plus size={14} className="mr-1.5" /> New Plan
        </Button>
      </PageHeader>

      {/* Active emergency banner */}
      {activeIncidents.map((inc) => {
        const triggeredAt = new Date(inc.activated_at);
        const aps = inc.access_points || [];
        const visibleAps = aps.slice(0, 6);
        const hiddenApCount = aps.length - visibleAps.length;
        return (
          <div
            key={inc.id}
            data-testid={`emergency-banner-${inc.id}`}
            className="shrink-0 rounded-lg border-2 border-error p-4 bg-error/5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <span className="inline-flex h-3 w-3 mt-1.5 animate-pulse rounded-full bg-error shrink-0" />
                <div className="min-w-0">
                  <div className="text-[16px] font-bold uppercase tracking-wide text-error">
                    EMERGENCY: {inc.plan_name}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground mt-1">
                    <span
                      className="flex items-center gap-1.5 font-medium text-foreground"
                      data-testid={`emergency-banner-${inc.id}-elapsed`}
                      title={triggeredAt.toLocaleString()}
                    >
                      <Clock size={12} className="text-error" />
                      Running {formatElapsed(triggeredAt, now)}
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <span>
                      Triggered {formatAbs(triggeredAt)} by{' '}
                      <span className="text-foreground">{inc.triggered_by_email || 'system'}</span>
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <span>
                      Action: <span className="text-foreground font-medium">{actionLabel(inc.action)}</span>
                    </span>
                  </div>
                </div>
              </div>
              <Button
                data-testid={`emergency-button-all-clear-${inc.id}`}
                variant="outline"
                className="border-success/30 bg-success/10 text-success shrink-0"
                onClick={() => handleAllClear(inc)}
              >
                <CheckCircle2 size={14} className="mr-1.5" /> All Clear
              </Button>
            </div>

            {aps.length > 0 && (
              <div className="mt-3 pt-3 border-t border-error/20">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide mb-2">
                  <DoorClosed size={12} />
                  {aps.length} access {aps.length === 1 ? 'point' : 'points'} affected
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {visibleAps.map((ap) => (
                    <span
                      key={ap.id}
                      data-testid={`emergency-banner-${inc.id}-ap-${ap.id}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-error/10 border border-error/20 text-[11px] text-foreground"
                    >
                      <DoorClosed size={10} className="text-error" />
                      {ap.name}
                    </span>
                  ))}
                  {hiddenApCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/20 border border-border text-[11px] text-muted-foreground">
                      +{hiddenApCount} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Stats */}
      <div className="shrink-0 grid grid-cols-4 gap-3">
        <StatCard label="Status" value={activeIncidents.length > 0 ? 'EMERGENCY' : 'Normal'}
          icon={<ShieldCheck size={14} />} domain={activeIncidents.length > 0 ? 'error' : 'secure'}
          sub={activeIncidents.length > 0 ? `${activeIncidents.length} active` : 'All systems normal'} />
        <StatCard label="Plans" value={String(enabledPlans)} icon={<ClipboardList size={14} />} domain="secure" sub={`${plans.length} total`} />
        <StatCard label="Incidents" value={String(incidentTotal)} icon={<Siren size={14} />} domain="error" sub="Total recorded" />
        <StatCard label="Active" value={String(activeIncidents.length)} icon={<AlertTriangle size={14} />}
          domain={activeIncidents.length > 0 ? 'error' : 'default'} sub="Right now" />
      </div>

      {/* Quick activate grid */}
      {plans.filter((p) => p.enabled).length > 0 && (
        <div className="shrink-0">
          <h2 className="text-[14px] font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Zap size={14} className="text-warning" /> {t('emergency.quickActivate')}
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {plans.filter((p) => p.enabled).map((plan) => (
              <button
                key={plan.id}
                data-testid={`emergency-button-quick-activate-${plan.id}`}
                onClick={() => setActivatingPlan(plan)}
                className="group relative flex flex-col items-center gap-2 rounded-xl border-2 p-5 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                style={{
                  backgroundColor: `${plan.color}08`,
                  borderColor: `${plan.color}40`,
                }}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${plan.color}15`, color: plan.color }}>
                  {iconMapLg[plan.icon] || <ShieldAlert size={32} />}
                </div>
                <div className="text-[13px] font-bold" style={{ color: plan.color }}>{plan.name}</div>
                <div className="text-[10px] text-muted-foreground">{actionLabel(plan.action)} · {plan.countdown_seconds}s</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plans list */}
      <div className="shrink-0">
        <h2 className="text-[14px] font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <Settings2 size={14} /> {t('emergency.plans')}
        </h2>
        <div className="space-y-2">
          {plans.map((plan) => (
            <div key={plan.id} className={cn('flex items-center gap-3 rounded-lg border bg-card px-4 py-3', !plan.enabled && 'opacity-50')}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${plan.color}15`, color: plan.color }}>
                {iconMap[plan.icon] || <ShieldAlert size={20} />}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[13px] font-medium text-foreground">{plan.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {actionLabel(plan.action)} · {plan.countdown_seconds}s countdown
                </span>
              </div>
              <Badge variant="outline" className={cn('text-[10px]', plan.enabled ? 'text-success border-success/30' : 'text-muted-foreground')}>
                {plan.enabled ? t('emergency.statusActive') : t('emergency.statusDisabled')}
              </Badge>
              <Button data-testid={`emergency-button-edit-${plan.id}`} variant="ghost" size="sm" onClick={() => { setEditingPlanId(plan.id); setShowPlanModal(true); }}>
                <Edit size={14} />
              </Button>
              <Button data-testid={`emergency-button-delete-${plan.id}`} variant="ghost" size="sm" className="text-destructive" onClick={() => setDeletingPlan(plan)}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          {plans.length === 0 && !loading && (
            <EmptyState
              icon={<ShieldAlert size={32} strokeWidth={1.2} />}
              title="No emergency plans configured yet"
              description="Emergency plans pre-wire a one-tap response for fires, lockdowns, and evacuations — unlocking all doors, locking a building, or triggering sirens. Define a plan so operators can react without hunting for devices."
              primaryAction={{ label: 'New Plan', icon: <Plus size={14} />, onClick: () => { setEditingPlanId(null); setShowPlanModal(true); }, 'data-testid': 'emergency-button-create-plan-empty' }}
              compact
            />
          )}
        </div>
      </div>

      {/* Incident history */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-[14px] font-semibold text-foreground">{t('emergency.incidentHistory')}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <DataTable embedded stickyHeader paginate={false} loading={loading}
            columns={incidentColumns} data={incidents} rowKey={(r) => r.id}
            emptyIcon={<ShieldAlert size={32} strokeWidth={1.2} />}
            emptyTitle="No incidents recorded"
            emptyDescription="Incidents appear here every time an emergency plan is activated or cleared. A quiet history is a good sign — it means no one has had to press the panic button." />
        </div>
        <TablePaginationFooter page={incidentPage} pageSize={10}
          total={incidentTotal} totalPages={Math.ceil(incidentTotal / 10)}
          onPageChange={setIncidentPage} loading={loading} />
      </div>

      {/* ── Activate countdown dialog ──────────────────────── */}
      {activatingPlan && (
        <AppModal open onOpenChange={(open) => { if (!open) { setActivatingPlan(null); } }}
          title={<span className="flex items-center gap-2" style={{ color: activatingPlan.color }}>
            {iconMap[activatingPlan.icon]} Activate: {activatingPlan.name}
          </span>}
          size="sm" showCancelButton cancelLabel="Cancel"
          primaryAction={{
            label: activating ? 'Activating...' : 'Activate Now',
            onClick: () => handleActivate(activatingPlan),
            loading: activating,
            variant: 'destructive',
            'data-testid': 'emergency-button-confirm-activate',
          }}>
          <div className="text-center">
            <p className="text-[13px] text-muted-foreground mb-2">
              Action: <strong>{actionLabel(activatingPlan.action)}</strong>
            </p>
            <div className="text-[64px] font-bold tabular-nums my-4" style={{ color: activatingPlan.color }}>
              {countdown}
            </div>
            <p className="text-[12px] text-muted-foreground">System will activate when countdown reaches zero</p>
          </div>
        </AppModal>
      )}

      {/* ── Delete confirm ─────────────────────────────────── */}
      <AppModal open={!!deletingPlan} onOpenChange={(v) => { if (!v) setDeletingPlan(null); }}
        title={<span className="text-destructive flex items-center gap-2"><Trash2 size={16} /> Delete Plan</span>}
        size="xs" showCancelButton
        primaryAction={{ label: 'Delete', variant: 'destructive', onClick: handleDeletePlan }}>
        <p className="text-[13px] text-muted-foreground">
          Delete <strong>"{deletingPlan?.name}"</strong>? This cannot be undone.
        </p>
      </AppModal>

      {/* ── Plan create/edit wizard ────────────────────────── */}
      <EmergencyPlanModal
        open={showPlanModal}
        onOpenChange={(v) => { setShowPlanModal(v); if (!v) setEditingPlanId(null); }}
        planId={editingPlanId}
        onSaved={loadPlans}
      />
    </div>
  );
}

