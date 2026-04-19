import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search,
  DoorOpen,
  Lock,
  Unlock,
  ShieldAlert,
  AlertTriangle,
  Play,
  MapPin,
  CheckCircle2,
  CircleOff,
  Siren,
} from 'lucide-react';
import {
  PageHeader,
  StatCard,
  DataTable,
  type Column,
  Input,
  Badge,
  Button,
  TablePaginationFooter,
  AppModal,
  Label,
} from '@dm3/ui';
import { cn } from '@/lib/utils';
import { fetchAccessPoints, sendDoorCommand, type AccessPointDTO, type AccessPointStats } from '@/lib/api';
import { toast } from '@/lib/toast';

/* ── Door state config ─────────────────────────────────────── */

const doorStateConfig: Record<string, { color: string; label: string; icon: typeof Lock }> = {
  closed:     { color: 'border-success/30 bg-success/10 text-success',           label: 'Closed',      icon: Lock },
  open:       { color: 'border-warning/30 bg-warning/10 text-warning',           label: 'Open',        icon: Unlock },
  held_open:  { color: 'border-operate/30 bg-operate/10 text-operate',           label: 'Held Open',   icon: DoorOpen },
  held_close: { color: 'border-error/30 bg-error/10 text-error',                label: 'Held Close',  icon: ShieldAlert },
  forced:     { color: 'border-error/30 bg-error/10 text-error',                label: 'Forced',      icon: AlertTriangle },
  alarm:      { color: 'border-error/30 bg-error/10 text-error animate-pulse',  label: 'Alarm',       icon: ShieldAlert },
};

const POLL_INTERVAL = 3000;

/* ── Main page ─────────────────────────────────────────────── */

export function AccessControlPage() {
  const { t } = useTranslation('secure');
  const navigate = useNavigate();
  const [accessPoints, setAccessPoints] = useState<AccessPointDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AccessPointStats>({ online: 0, offline: 0, warning: 0, alarm: 0 });
  const pageSize = 20;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pauseUntilRef = useRef(0); // skip polls until this timestamp

  /* ── Fetch ───────────────────────────────────────────────── */

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (searchTerm) params.search = searchTerm;
      const res = await fetchAccessPoints(page, pageSize, params);
      // Always update stats (dashboard)
      setTotal(res.total ?? 0);
      if (res.stats) setStats(res.stats);
      // During pause window, preserve optimistic door_state on rows
      if (silent && Date.now() < pauseUntilRef.current) {
        setAccessPoints((prev) => {
          const serverMap = new Map((res.data || []).map((ap) => [ap.id, ap]));
          return prev.map((ap) => {
            const fresh = serverMap.get(ap.id);
            return fresh ? { ...fresh, door_state: ap.door_state } : ap;
          });
        });
      } else {
        setAccessPoints(res.data || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm]);

  // Initial load + polling every 5s for real-time status
  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  /* ── Door command dialog ──────────────────────────────────── */

  const [cmdDialog, setCmdDialog] = useState<{ ap: AccessPointDTO; action: string } | null>(null);
  const [cmdDuration, setCmdDuration] = useState(5);
  const [cmdSending, setCmdSending] = useState(false);

  const actionToState: Record<string, string> = {
    unlock: 'open', lock: 'closed', hold_open: 'held_open', hold_close: 'held_close', release: 'closed',
  };

  const cmdLabels: Record<string, { title: string; desc: string; variant: 'default' | 'destructive'; showDuration: boolean }> = {
    unlock:     { title: 'Unlock Door',     desc: 'Door will unlock for the specified duration then re-lock automatically.',  variant: 'default',      showDuration: true },
    lock:       { title: 'Lock Door',       desc: 'Door will lock for the specified duration then return to normal mode.',    variant: 'default',      showDuration: true },
    hold_open:  { title: 'Hold Open',       desc: 'Door will remain open until manually released. Are you sure?',            variant: 'destructive',  showDuration: false },
    hold_close: { title: 'Hold Close',      desc: 'Door will remain locked and deny all access until manually released. This is a critical action.', variant: 'destructive', showDuration: false },
  };

  const openCmdDialog = (ap: AccessPointDTO, action: string) => {
    if (action === 'release') {
      // Release is instant — no dialog
      executeDoorAction(ap, action);
      return;
    }
    setCmdDuration(5);
    setCmdDialog({ ap, action });
  };

  const executeDoorAction = async (ap: AccessPointDTO, action: string, durationMs?: number) => {
    const newState = actionToState[action];
    if (newState) {
      setAccessPoints((prev) =>
        prev.map((p) => p.id === ap.id ? { ...p, door_state: newState } : p),
      );
    }
    pauseUntilRef.current = Date.now() + 5000;

    try {
      await sendDoorCommand(ap.id, action, durationMs);
      toast(t('accessControl.toast.commandSent', { action, name: ap.name }), 'success');
    } catch {
      toast(t('accessControl.toast.commandFailed', { action, name: ap.name }), 'error');
      pauseUntilRef.current = 0;
      load(true);
    }
  };

  const handleCmdConfirm = async () => {
    if (!cmdDialog) return;
    setCmdSending(true);
    const { ap, action } = cmdDialog;
    const label = cmdLabels[action];
    const durationMs = label?.showDuration ? cmdDuration * 1000 : undefined;
    await executeDoorAction(ap, action, durationMs);
    setCmdSending(false);
    setCmdDialog(null);
  };

  /* ── Columns ─────────────────────────────────────────────── */

  const columns: Column<AccessPointDTO>[] = [
    {
      key: 'name',
      header: t('accessControl.table.name'),
      sortable: true,
      render: (ap) => (
        <div>
          <span className="text-[13px] font-medium text-foreground">{ap.name}</span>
          {ap.description && (
            <span className="block text-[11px] text-muted-foreground mt-0.5 truncate max-w-[200px]">{ap.description}</span>
          )}
        </div>
      ),
    },
    {
      key: 'zone_name',
      header: t('accessControl.table.zone'),
      width: '140px',
      sortable: true,
      render: (ap) => (
        ap.zone_name
          ? <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"><MapPin size={11} />{ap.zone_name}</span>
          : <span className="text-[11px] text-muted-foreground">—</span>
      ),
    },
    {
      key: 'device_status',
      header: t('accessControl.table.status'),
      width: '100px',
      sortable: true,
      render: (ap) => {
        const s = ap.device_status;
        const color = s === 'online' ? 'text-success' : s === 'warning' ? 'text-warning' : 'text-muted-foreground';
        const dot = s === 'online' ? 'bg-success animate-pulse' : s === 'warning' ? 'bg-warning animate-pulse' : 'bg-muted-foreground';
        const label = s === 'online' ? 'Online' : s === 'warning' ? 'Warning' : 'Offline';
        return (
          <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium', color)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
            {label}
          </span>
        );
      },
    },
    {
      key: 'door_state',
      header: t('accessControl.table.doorState'),
      width: '120px',
      sortable: true,
      render: (ap) => {
        if (!ap.door_state) return <span className="text-[11px] text-muted-foreground">—</span>;
        const cfg = doorStateConfig[ap.door_state] || { color: 'text-muted-foreground', label: ap.door_state, icon: Lock };
        const Icon = cfg.icon;
        return (
          <Badge variant="outline" className={cn('text-[11px] gap-1', cfg.color)}>
            <Icon size={11} /> {cfg.label}
          </Badge>
        );
      },
    },
    {
      key: 'access_device_count',
      header: t('accessControl.table.devices'),
      width: '80px',
      render: (ap) => (
        <span className="text-[12px] font-mono text-muted-foreground">{ap.access_device_count}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '200px',
      render: (ap) => {
        const disabled = ap.device_status !== 'online';
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" title="Unlock" disabled={disabled}
              onClick={() => openCmdDialog(ap, 'unlock')} data-testid={`access-button-unlock-${ap.id}`}>
              <Unlock size={14} className="text-success" />
            </Button>
            <Button variant="ghost" size="sm" title="Lock" disabled={disabled}
              onClick={() => openCmdDialog(ap, 'lock')} data-testid={`access-button-lock-${ap.id}`}>
              <Lock size={14} className="text-secure" />
            </Button>
            <Button variant="ghost" size="sm" title="Hold Open" disabled={disabled}
              onClick={() => openCmdDialog(ap, 'hold_open')} data-testid={`access-button-holdopen-${ap.id}`}>
              <DoorOpen size={14} className="text-operate" />
            </Button>
            <Button variant="ghost" size="sm" title="Hold Close" disabled={disabled}
              onClick={() => openCmdDialog(ap, 'hold_close')} data-testid={`access-button-holdclose-${ap.id}`}>
              <ShieldAlert size={14} className="text-error" />
            </Button>
            <Button variant="ghost" size="sm" title="Release" disabled={disabled}
              onClick={() => openCmdDialog(ap, 'release')} data-testid={`access-button-release-${ap.id}`}>
              <Play size={14} className="text-muted-foreground" />
            </Button>
          </div>
        );
      },
    },
  ];

  /* ── Render ──────────────────────────────────────────────── */

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
      <PageHeader title={t('accessControl.title')} description={t('accessControl.description')}>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Live · {POLL_INTERVAL / 1000}s
        </span>
      </PageHeader>

      {/* Stats */}
      <div className="shrink-0 grid grid-cols-5 gap-3">
        <StatCard label={t('accessControl.stats.total')} value={String(total)} icon={<DoorOpen size={14} />} domain="secure" sub={t('accessControl.stats.accessPoints')} />
        <StatCard label={t('accessControl.stats.online')} value={String(stats.online)} icon={<CheckCircle2 size={14} />} domain="secure" sub={t('accessControl.stats.connected')} />
        <StatCard label={t('accessControl.stats.warning')} value={String(stats.warning)} icon={<AlertTriangle size={14} />} domain={stats.warning > 0 ? 'error' : 'default'} sub={t('accessControl.stats.partial')} />
        <StatCard label={t('accessControl.stats.offline')} value={String(stats.offline)} icon={<CircleOff size={14} />} domain={stats.offline > 0 ? 'error' : 'default'} sub={t('accessControl.stats.disconnected')} />
        <StatCard label={t('accessControl.stats.alerts')} value={String(stats.alarm)} icon={<Siren size={14} />} domain={stats.alarm > 0 ? 'error' : 'default'} sub={t('accessControl.stats.forcedAlarm')} />
      </div>

      {/* Search */}
      <div className="relative shrink-0">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('accessControl.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          className="pl-9 h-9 text-[13px]"
          data-testid="access-input-search"
        />
      </div>

      {/* Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        <div className="min-h-0 flex-1 overflow-auto">
          <DataTable
            embedded
            stickyHeader
            paginate={false}
            loading={loading}
            columns={columns}
            data={accessPoints}
            rowKey={(ap) => ap.id}
            emptyIcon={<DoorOpen size={32} strokeWidth={1.2} />}
            emptyTitle={searchTerm ? 'No access points match your search' : 'No access points configured yet'}
            emptyDescription={searchTerm
              ? 'Try a different name or location, or clear the search to see every access point.'
              : 'Access points are the doors, turnstiles, and barriers that devices control. Add one under Access → Access Points, then link it to a zone and assign access rules.'}
            emptyAction={searchTerm
              ? { label: 'Clear search', variant: 'outline', onClick: () => { setSearchTerm(''); setPage(1); }, 'data-testid': 'access-button-clear-search-empty' }
              : undefined}
          />
        </div>
        <TablePaginationFooter
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
          loading={loading}
        />
      </div>

      {/* ── Door Command Dialog ────────────────────────────── */}
      {cmdDialog && (() => {
        const label = cmdLabels[cmdDialog.action];
        if (!label) return null;
        const Icon = cmdDialog.action === 'unlock' ? Unlock
          : cmdDialog.action === 'lock' ? Lock
          : cmdDialog.action === 'hold_open' ? DoorOpen
          : ShieldAlert;
        return (
          <AppModal
            open
            onOpenChange={(open) => { if (!open) setCmdDialog(null); }}
            title={
              <span className="inline-flex items-center gap-2">
                <Icon size={16} /> {label.title} — {cmdDialog.ap.name}
              </span>
            }
            description={label.desc}
            size="sm"
            showCancelButton
            cancelLabel="Cancel"
            primaryAction={{
              label: cmdSending ? 'Sending...' : label.title,
              onClick: handleCmdConfirm,
              variant: label.variant,
              disabled: cmdSending,
              loading: cmdSending,
            }}
          >
            {label.showDuration && (
              <div className="space-y-2">
                <Label htmlFor="cmd-duration" className="text-[12px]">Duration (seconds)</Label>
                <Input
                  id="cmd-duration"
                  type="number"
                  min={1}
                  max={3600}
                  value={cmdDuration}
                  onChange={(e) => setCmdDuration(Math.max(1, Number(e.target.value)))}
                  className="w-full"
                  data-testid="access-input-duration"
                />
                <p className="text-[11px] text-muted-foreground">
                  Door will {cmdDialog.action} for {cmdDuration}s then return to normal mode.
                </p>
              </div>
            )}
          </AppModal>
        );
      })()}
    </div>
  );
}
