import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PageHeader,
  DataTable,
  StatCard,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type Column,
} from '@dm3/ui';
import { cn } from '@/lib/utils';
import {
  Flame,
  Lock,
  HeartPulse,
  UserX,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Phone,
  Building2,
  Activity,
  Play,
  Settings2,
  ChevronRight,
  Zap,
  Shield,
  Siren,
  History,
  Users,
  CircleDot,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import {
  emergencyTypeConfig,
  mockPlans,
  mockIncidents,
  mockContacts,
  type EmergencyType,
  type EmergencyPlan,
  type EmergencyIncident,
  type EmergencyContact,
} from './mock-data';

/* ── Icon map for emergency types ──────────────────────────────── */

const typeIcons: Record<EmergencyType, React.ReactNode> = {
  fire: <Flame size={20} />,
  lockdown: <Lock size={20} />,
  medical: <HeartPulse size={20} />,
  intruder: <UserX size={20} />,
};

const typeIconsLg: Record<EmergencyType, React.ReactNode> = {
  fire: <Flame size={32} />,
  lockdown: <Lock size={32} />,
  medical: <HeartPulse size={32} />,
  intruder: <UserX size={32} />,
};

const typeIconsXl: Record<EmergencyType, React.ReactNode> = {
  fire: <Flame size={48} />,
  lockdown: <Lock size={48} />,
  medical: <HeartPulse size={48} />,
  intruder: <UserX size={48} />,
};

const actionTypeIcons: Record<string, React.ReactNode> = {
  door_control: <Lock size={14} />,
  camera_control: <Activity size={14} />,
  alarm_control: <Siren size={14} />,
  lift_control: <Building2 size={14} />,
  intercom: <Phone size={14} />,
  notification: <Zap size={14} />,
};

/* ── Helpers ───────────────────────────────────────────────────── */

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/* ── Confirm Dialog ────────────────────────────────────────────── */

function ConfirmDialog({
  plan,
  onConfirm,
  onCancel,
}: {
  plan: EmergencyPlan;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [count, setCount] = useState(plan.countdownSeconds || 3);
  const cfg = emergencyTypeConfig[plan.type];

  useEffect(() => {
    if (count <= 0) {
      onConfirm();
      return;
    }
    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, onConfirm]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false);
          onCancel();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-md border-border bg-card text-center sm:max-w-md"
      >
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: `${cfg.color}15` }}>
            <div style={{ color: cfg.color }}>{typeIconsXl[plan.type]}</div>
          </div>
          <DialogTitle className="text-[20px] font-bold text-foreground">
            Activate {plan.name}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          {plan.actions.length} actions will execute across {plan.scope.replace('_', ' ')} scope
        </p>
        <div
          className="my-2 text-[64px] font-bold tabular-nums"
          style={{ color: cfg.color }}
        >
          {count}
        </div>
        <p className="text-[12px] text-muted-foreground">
          {plan.confirmationRequired
            ? 'System will activate when countdown reaches zero'
            : 'Immediate activation — no countdown'}
        </p>
        <DialogFooter className="mt-2 sm:justify-center gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            className="px-6"
            data-testid="emergency-button-cancel-confirm"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className="px-6"
            style={{ backgroundColor: cfg.color, color: '#fff' }}
            data-testid="emergency-button-activate-now"
          >
            Activate Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Plan Detail Dialog ────────────────────────────────────────── */

function PlanDetailDialog({
  plan,
  onClose,
  onActivate,
}: {
  plan: EmergencyPlan;
  onClose: () => void;
  onActivate: (plan: EmergencyPlan) => void;
}) {
  const cfg = emergencyTypeConfig[plan.type];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl border-border bg-card sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
            >
              {typeIcons[plan.type]}
            </div>
            <div>
              <DialogTitle className="text-[16px] font-semibold text-foreground">
                {plan.name}
              </DialogTitle>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {plan.scope.replace('_', ' ')} · {plan.severity} severity · {plan.countdownSeconds}s countdown
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Action sequence */}
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Zap size={14} className="text-warning" /> Activation Actions ({plan.actions.length})
          </h3>
          <div className="space-y-2">
            {plan.actions.map((a) => (
              <div
                key={a.order}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                  {a.order}
                </span>
                <span className="text-muted-foreground">{actionTypeIcons[a.type]}</span>
                <span className="text-[13px] text-foreground">{a.description}</span>
                <Badge variant="outline" className="ml-auto text-[10px] uppercase tracking-wider">
                  {a.action}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* All-clear actions */}
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-success" /> All-Clear Actions ({plan.allClearActions.length})
          </h3>
          <div className="space-y-2">
            {plan.allClearActions.map((a) => (
              <div
                key={a.order}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-[11px] font-bold text-success">
                  {a.order}
                </span>
                <span className="text-muted-foreground">{actionTypeIcons[a.type]}</span>
                <span className="text-[13px] text-foreground">{a.description}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Meta */}
        <div className="mt-4 flex gap-4 text-[12px] text-muted-foreground">
          <span>Last activated: {timeAgo(plan.lastActivatedAt)}</span>
          <span>Last drill: {timeAgo(plan.lastDrillAt)}</span>
          <span>Created: {new Date(plan.createdAt).toLocaleDateString()}</span>
        </div>

        <DialogFooter className="mt-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {plan.enabled && (
            <Button
              style={{ backgroundColor: cfg.color, color: '#fff' }}
              onClick={() => onActivate(plan)}
              data-testid={`emergency-button-activate-${plan.type}`}
            >
              <Play size={14} className="mr-1.5" /> Activate Plan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export function EmergencyPage() {
  const { t } = useTranslation('secure');

  /* state */
  const [activeEmergency, setActiveEmergency] = useState<EmergencyPlan | null>(null);
  const [confirmingPlan, setConfirmingPlan] = useState<EmergencyPlan | null>(null);
  const [viewingPlan, setViewingPlan] = useState<EmergencyPlan | null>(null);
  const [plans, setPlans] = useState(mockPlans);

  /* stats */
  const enabledPlans = plans.filter((p) => p.enabled).length;
  const totalIncidents = mockIncidents.filter((i) => !i.isDrill).length;
  const totalDrills = mockIncidents.filter((i) => i.isDrill).length;
  const avgResponse = useMemo(() => {
    const resolved = mockIncidents.filter((i) => i.durationSeconds && !i.isDrill);
    if (!resolved.length) return 0;
    return Math.round(resolved.reduce((s, i) => s + (i.durationSeconds ?? 0), 0) / resolved.length / 60);
  }, []);

  /* handlers */
  const handleActivate = useCallback(() => {
    if (confirmingPlan) {
      setActiveEmergency(confirmingPlan);
      setConfirmingPlan(null);
    }
  }, [confirmingPlan]);

  const handleDeactivate = () => setActiveEmergency(null);

  const handleTogglePlan = (planId: string) => {
    setPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, enabled: !p.enabled } : p)),
    );
  };

  const startActivation = (plan: EmergencyPlan) => {
    setViewingPlan(null);
    setConfirmingPlan(plan);
  };

  /* incident table columns */
  const incidentColumns: Column<EmergencyIncident>[] = [
    {
      key: 'activatedAt',
      header: t('emergency.history.time'),
      width: '150px',
      sortable: true,
      render: (r) => <span className="font-mono text-[12px]">{r.activatedAt}</span>,
    },
    {
      key: 'type',
      header: t('emergency.history.type'),
      sortable: true,
      render: (r) => {
        const cfg = emergencyTypeConfig[r.type];
        return (
          <span className="inline-flex items-center gap-1.5" style={{ color: cfg.color }}>
            {typeIcons[r.type]} {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'planName',
      header: t('emergency.history.plan'),
      render: (r) => <span className="text-[13px] text-foreground">{r.planName}</span>,
    },
    {
      key: 'triggeredBy',
      header: t('emergency.history.triggeredBy'),
      render: (r) => (
        <span className="text-[12px] text-muted-foreground">
          {r.triggeredBy}
          {r.isDrill && (
            <Badge variant="outline" className="ml-1.5 text-[10px] border-warning/30 text-warning">
              DRILL
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'durationSeconds',
      header: t('emergency.history.duration'),
      width: '90px',
      render: (r) => <span className="font-mono text-[12px]">{formatDuration(r.durationSeconds)}</span>,
    },
    {
      key: 'devicesAcked',
      header: t('emergency.history.devices'),
      width: '90px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium', r.devicesAcked === r.devicesTotal ? 'text-success' : 'text-warning')}>
          {r.devicesAcked}/{r.devicesTotal}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('accessControl.table.status'),
      width: '100px',
      render: (r) => (
        <Badge
          variant="outline"
          className={cn(
            'text-[11px]',
            r.status === 'active' && 'border-error/30 bg-error/10 text-error',
            r.status === 'resolved' && 'border-success/30 bg-success/10 text-success',
            r.status === 'cancelled' && 'border-muted-foreground/30 text-muted-foreground',
          )}
        >
          {r.status === 'active' ? 'Active' : r.status === 'resolved' ? 'Resolved' : 'Cancelled'}
        </Badge>
      ),
    },
    {
      key: 'description',
      header: t('emergency.history.description'),
      render: (r) => <span className="text-[12px] text-muted-foreground">{r.description}</span>,
    },
  ];

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div>
      {/* Dialogs */}
      {confirmingPlan && (
        <ConfirmDialog
          plan={confirmingPlan}
          onConfirm={handleActivate}
          onCancel={() => setConfirmingPlan(null)}
        />
      )}
      {viewingPlan && (
        <PlanDetailDialog
          plan={viewingPlan}
          onClose={() => setViewingPlan(null)}
          onActivate={startActivation}
        />
      )}

      {/* Header */}
      <PageHeader title={t('emergency.title')} description={t('emergency.description')} />

      {/* Active emergency banner */}
      {activeEmergency && (
        <div
          className="mb-6 rounded-lg border-2 p-4"
          style={{
            backgroundColor: `${emergencyTypeConfig[activeEmergency.type].color}08`,
            borderColor: emergencyTypeConfig[activeEmergency.type].color,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 animate-pulse items-center justify-center rounded-full"
                style={{
                  backgroundColor: `${emergencyTypeConfig[activeEmergency.type].color}20`,
                  color: emergencyTypeConfig[activeEmergency.type].color,
                }}
              >
                {typeIconsLg[activeEmergency.type]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[16px] font-bold uppercase tracking-wide"
                    style={{ color: emergencyTypeConfig[activeEmergency.type].color }}
                  >
                    {t('emergency.status.emergency')}: {activeEmergency.name}
                  </span>
                  <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-error" />
                </div>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  {activeEmergency.actions.length} actions executing · {activeEmergency.scope.replace('_', ' ')} scope
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleDeactivate}
              className="border-success/30 bg-success/10 text-success hover:bg-success/20"
              data-testid="emergency-button-all-clear"
            >
              <CheckCircle2 size={16} className="mr-1.5" /> All Clear
            </Button>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <StatCard
          label={t('emergency.stats.status')}
          value={activeEmergency ? t('emergency.status.emergency') : t('emergency.status.normal')}
          icon="🛡️"
          domain={activeEmergency ? 'error' : 'secure'}
          sub={activeEmergency ? emergencyTypeConfig[activeEmergency.type].label : 'All systems normal'}
        />
        <StatCard
          label={t('emergency.stats.activePlans')}
          value={String(enabledPlans)}
          icon="📋"
          domain="secure"
          sub={`${plans.length} total plans`}
        />
        <StatCard
          label={t('emergency.stats.incidents')}
          value={String(totalIncidents)}
          icon="🚨"
          domain="error"
          sub={`${totalDrills} drills conducted`}
        />
        <StatCard
          label={t('emergency.stats.avgResponse')}
          value={`${avgResponse}m`}
          icon="⏱️"
          domain="default"
          sub="Average resolution time"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList variant="line" className="mb-4 border-b border-border">
          <TabsTrigger value="overview" className="gap-1.5 text-[13px]" data-testid="emergency-button-tab-overview">
            <ShieldAlert size={14} /> {t('emergency.tabs.overview')}
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-1.5 text-[13px]" data-testid="emergency-button-tab-plans">
            <Settings2 size={14} /> {t('emergency.tabs.plans')}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-[13px]" data-testid="emergency-button-tab-history">
            <History size={14} /> {t('emergency.history.title')}
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-1.5 text-[13px]" data-testid="emergency-button-tab-contacts">
            <Users size={14} /> {t('emergency.contacts.title')}
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: Overview ──────────────────────────────────── */}
        <TabsContent value="overview">
          <OverviewTab
            plans={plans}
            activeEmergency={activeEmergency}
            onActivate={startActivation}
          />
        </TabsContent>

        {/* ── TAB: Plans ─────────────────────────────────────── */}
        <TabsContent value="plans">
          <PlansTab
            plans={plans}
            onToggle={handleTogglePlan}
            onView={setViewingPlan}
            onActivate={startActivation}
          />
        </TabsContent>

        {/* ── TAB: History ───────────────────────────────────── */}
        <TabsContent value="history">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <DataTable
              columns={incidentColumns}
              data={mockIncidents}
              rowKey={(r) => r.id}
            />
          </div>
        </TabsContent>

        {/* ── TAB: Contacts ──────────────────────────────────── */}
        <TabsContent value="contacts">
          <ContactsTab contacts={mockContacts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Overview Tab                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function OverviewTab({
  plans,
  activeEmergency,
  onActivate,
}: {
  plans: EmergencyPlan[];
  activeEmergency: EmergencyPlan | null;
  onActivate: (plan: EmergencyPlan) => void;
}) {
  const enabledPlans = plans.filter((p) => p.enabled);

  return (
    <div className="space-y-6">
      {/* Quick-activate grid — one-click buttons */}
      <div>
        <h2 className="text-[14px] font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <Zap size={14} className="text-warning" /> Quick Activate
        </h2>
        <div className="grid grid-cols-4 gap-4">
          {enabledPlans.map((plan) => {
            const cfg = emergencyTypeConfig[plan.type];
            const isActive = activeEmergency?.type === plan.type;

            return (
              <button
                key={plan.id}
                onClick={() => !isActive && onActivate(plan)}
                disabled={isActive}
                data-testid={`emergency-button-quick-${plan.type}`}
                className={cn(
                  'group relative flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all',
                  isActive
                    ? 'animate-pulse cursor-default'
                    : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
                )}
                style={{
                  backgroundColor: `${cfg.color}${isActive ? '15' : '08'}`,
                  borderColor: `${cfg.color}${isActive ? '' : '40'}`,
                }}
              >
                {/* Icon */}
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
                >
                  {typeIconsLg[plan.type]}
                </div>

                {/* Label */}
                <div className="text-center">
                  <div className="text-[14px] font-bold" style={{ color: cfg.color }}>
                    {cfg.label}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {isActive ? 'ACTIVE' : plan.name}
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock size={10} />
                  {plan.countdownSeconds}s countdown · {plan.actions.length} actions
                </div>

                {/* Active indicator */}
                {isActive && (
                  <span className="absolute right-3 top-3 inline-flex h-3 w-3 rounded-full bg-error animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent incidents preview */}
      <div>
        <h2 className="text-[14px] font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <Activity size={14} className="text-secure" /> Recent Activity
        </h2>
        <div className="space-y-2">
          {mockIncidents.slice(0, 5).map((inc) => {
            const cfg = emergencyTypeConfig[inc.type];
            return (
              <div
                key={inc.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
                >
                  {typeIcons[inc.type]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-foreground truncate">{inc.description}</span>
                    {inc.isDrill && (
                      <Badge variant="outline" className="text-[10px] border-warning/30 text-warning shrink-0">
                        DRILL
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {inc.triggeredBy} · {inc.planName}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-[12px] text-muted-foreground">{inc.activatedAt}</div>
                  <div className="text-[11px] text-muted-foreground">{formatDuration(inc.durationSeconds)}</div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 text-[10px]',
                    inc.status === 'resolved' && 'border-success/30 bg-success/10 text-success',
                    inc.status === 'active' && 'border-error/30 bg-error/10 text-error',
                    inc.status === 'cancelled' && 'border-muted-foreground/30 text-muted-foreground',
                  )}
                >
                  {inc.status}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Plans Tab                                                      */
/* ═══════════════════════════════════════════════════════════════ */

function PlansTab({
  plans,
  onToggle,
  onView,
  onActivate,
}: {
  plans: EmergencyPlan[];
  onToggle: (id: string) => void;
  onView: (plan: EmergencyPlan) => void;
  onActivate: (plan: EmergencyPlan) => void;
}) {
  return (
    <div className="space-y-4">
      {plans.map((plan) => {
        const cfg = emergencyTypeConfig[plan.type];
        return (
          <div
            key={plan.id}
            className={cn(
              'rounded-lg border bg-card p-5 transition-colors',
              plan.enabled ? 'border-border' : 'border-border/40 opacity-60',
            )}
          >
            {/* Header row */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
                >
                  {typeIcons[plan.type]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-semibold text-foreground">{plan.name}</h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] uppercase tracking-wider',
                        plan.severity === 'critical'
                          ? 'border-error/30 text-error'
                          : 'border-warning/30 text-warning',
                      )}
                    >
                      {plan.severity}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[12px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Building2 size={12} /> {plan.scope.replace('_', ' ')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {plan.countdownSeconds}s countdown
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap size={12} /> {plan.actions.length} actions
                    </span>
                    {plan.confirmationRequired && (
                      <span className="flex items-center gap-1">
                        <Shield size={12} /> Requires confirmation
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onToggle(plan.id)}
                  className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`emergency-button-toggle-${plan.id}`}
                >
                  {plan.enabled ? (
                    <ToggleRight size={20} className="text-success" />
                  ) : (
                    <ToggleLeft size={20} />
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onView(plan)}
                  className="gap-1 text-[12px]"
                  data-testid={`emergency-button-view-${plan.id}`}
                >
                  <Settings2 size={14} /> View
                  <ChevronRight size={12} />
                </Button>
                {plan.enabled && (
                  <Button
                    size="sm"
                    className="gap-1 text-[12px]"
                    style={{ backgroundColor: cfg.color, color: '#fff' }}
                    onClick={() => onActivate(plan)}
                    data-testid={`emergency-button-activate-plan-${plan.id}`}
                  >
                    <Play size={12} /> Activate
                  </Button>
                )}
              </div>
            </div>

            {/* Action preview strip */}
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.actions.map((a) => (
                <div
                  key={a.order}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground"
                >
                  <span className="text-muted-foreground">{actionTypeIcons[a.type]}</span>
                  {a.action}
                </div>
              ))}
            </div>

            {/* Footer meta */}
            <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <CircleDot size={10} className={plan.lastActivatedAt ? 'text-error' : ''} />
                Last activated: {timeAgo(plan.lastActivatedAt)}
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle size={10} className={plan.lastDrillAt ? 'text-warning' : ''} />
                Last drill: {timeAgo(plan.lastDrillAt)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Contacts Tab                                                   */
/* ═══════════════════════════════════════════════════════════════ */

function ContactsTab({ contacts }: { contacts: EmergencyContact[] }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {contacts.map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          {/* Avatar */}
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold',
              c.organization ? 'bg-error/10 text-error' : 'bg-secure/10 text-secure',
            )}
          >
            {c.organization ? <Phone size={18} /> : c.name.charAt(0)}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-foreground truncate">{c.name}</span>
              {c.available ? (
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              ) : (
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              )}
            </div>
            <div className="text-[12px] text-muted-foreground">{c.role}</div>
            {c.organization && (
              <div className="text-[11px] text-muted-foreground">{c.organization}</div>
            )}
          </div>

          {/* Phone + types */}
          <div className="text-right shrink-0">
            <div className="font-mono text-[13px] text-foreground">{c.phone}</div>
            <div className="mt-1 flex justify-end gap-1">
              {c.types.map((type) => (
                <span
                  key={type}
                  className="inline-flex h-5 w-5 items-center justify-center rounded"
                  style={{
                    backgroundColor: `${emergencyTypeConfig[type].color}15`,
                    color: emergencyTypeConfig[type].color,
                  }}
                >
                  {type === 'fire' && <Flame size={10} />}
                  {type === 'lockdown' && <Lock size={10} />}
                  {type === 'medical' && <HeartPulse size={10} />}
                  {type === 'intruder' && <UserX size={10} />}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
