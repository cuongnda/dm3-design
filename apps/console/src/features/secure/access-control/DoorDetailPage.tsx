import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, DoorOpen, Lock, ShieldAlert, Wrench, Video,
  Clock, Cpu, Wifi, User, CreditCard, Fingerprint,
  KeyRound, Smartphone, Eye, Settings, Calendar, List, Shield,
  Check, X,
} from 'lucide-react';
import { DataTable, type Column, StatusBadge, Tabs, TabsList, TabsTrigger, TabsContent, AppModal, Button, Input, Label, Select, SelectOption, useBreadcrumbStore } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useAccessDevice, useEvents, useRules, useUpdateAccessDevice, useSendCommand } from '@/lib/hooks';
import type { EventDTO, AccessRuleDTO } from '@/lib/api';

/* ── Helper Functions ─────────────────────────────────────────────── */

function formatSchedule(rule: AccessRuleDTO): string {
  // Simplified schedule formatting - in a real implementation,
  // you'd parse the schedule JSON properly
  if (rule.schedule) {
    return 'Custom schedule'; // TODO: Parse schedule JSON
  }
  return '24/7';
}

// Schedule grid: 7 days x 24 hours
const scheduleData: boolean[][] = Array.from({ length: 7 }, (_, day) =>
  Array.from({ length: 24 }, (_, hour) => {
    if (day < 5) return hour >= 7 && hour < 19; // Mon-Fri 7-19
    return hour >= 8 && hour < 16; // Sat-Sun 8-16
  })
);
const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const credentialIcons: Record<string, React.ReactNode> = {
  card: <CreditCard size={14} />,
  face: <Eye size={14} />,
  fingerprint: <Fingerprint size={14} />,
  pin: <KeyRound size={14} />,
  mobile: <Smartphone size={14} />,
};

/* ── Component ─────────────────────────────────────────────── */

export function DoorDetailPage() {
  const { t } = useTranslation('secure');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setLabel = useBreadcrumbStore((s) => s.setLabel);
  const clearLabel = useBreadcrumbStore((s) => s.clearLabel);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    name: '',
    mode: 'Normal',
    unlockDuration: 5,
    antiPassback: false,
  });

  const { data: door, isLoading: doorLoading } = useAccessDevice(id!);
  const { data: eventsData } = useEvents(1, { access_device_id: id ?? '' });
  const { data: rulesData } = useRules(1, { access_device_id: id ?? '' });
  const updateDoorMutation = useUpdateAccessDevice();
  const sendCommandMutation = useSendCommand();

  // Initialize settings when door data loads
  useEffect(() => {
    if (door) {
      setSettings({
        name: door.name,
        mode: door.mode || 'Normal',
        unlockDuration: Math.round(door.unlock_duration_ms / 1000),
        antiPassback: door.anti_passback || false,
      });
    }
  }, [door]);

  useEffect(() => {
    if (id && door?.name) setLabel(id, door.name);
    return () => { if (id) clearLabel(id); };
  }, [id, door?.name, setLabel, clearLabel]);

  if (!id) {
    return <div className="text-center py-8 text-error">{/* TODO: add i18n key */}ID không hợp lệ</div>;
  }

  if (doorLoading) {
    return <div className="text-center py-8 text-muted-foreground">{t('accessControl.loading')}</div>;
  }

  if (!door) {
    return <div className="text-center py-8 text-error">{/* TODO: add i18n key */}Không tìm thấy cửa</div>;
  }

  const stateConfig = {
    locked: { icon: Lock, color: 'text-success', bg: 'bg-success/10', label: t('intrusion.status.armed') },
    unlocked: { icon: DoorOpen, color: 'text-operate', bg: 'bg-operate/10', label: t('intrusion.status.disarmed') },
    alarm: { icon: ShieldAlert, color: 'text-error', bg: 'bg-error/10', label: t('intrusion.status.alarm') },
  };
  const sc = stateConfig[door.state as keyof typeof stateConfig] || stateConfig.locked;
  const StateIcon = sc.icon;

  const eventColumns: Column<EventDTO>[] = [
    {
      key: 'time', header: t('alerts.table.time'), width: '170px', sortable: true,
      render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{new Date(r.time).toLocaleString('vi-VN')}</span>,
    },
    {
      key: 'person_name', header: t('alerts.table.person'), sortable: true,
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
            <User size={12} />
          </span>
          <span className="text-foreground font-medium">{r.person_name || '—'}</span>
        </span>
      ),
    },
    {
      key: 'credential_type', header: t('alerts.table.credential'), width: '130px',
      render: (r) => (
        <span className="flex items-center gap-1.5 text-muted-foreground text-[12px] capitalize">
          {r.credential_type && credentialIcons[r.credential_type]}
          {r.credential_type || '—'}
        </span>
      ),
    },
    {
      key: 'decision', header: t('alerts.table.reason'), width: '100px',
      render: (r) => (
        <span className={cn('inline-flex items-center gap-1 text-[12px] font-semibold', r.decision === 'granted' ? 'text-success' : 'text-error')}>
          {r.decision === 'granted' ? <><Check size={12} /> {t('accessControl.events.granted')}</> : <><X size={12} /> {t('accessControl.events.denied')}</>}
        </span>
      ),
    },
  ];

  const handleAction = (action: string) => {
    if (action === 'camera') {
      // no confirm needed
      return;
    }
    setConfirmAction(action);
  };

  const actionCommandMap: Record<string, string> = {
    open: 'unlock',
    lockdown: 'lockdown',
    maintenance: 'maintenance_mode',
  };

  const confirmLabels: Record<string, { title: string; desc: string; variant: 'default' | 'destructive' }> = {
    open: { title: 'Remote Open Door', desc: 'This will unlock the door for the configured duration. Continue?', variant: 'default' }, // TODO: add i18n keys
    lockdown: { title: 'Lock Down Door', desc: 'This will immediately lock the door and deny all access until manually released. This is a critical action.', variant: 'destructive' }, // TODO: add i18n keys
    maintenance: { title: 'Maintenance Mode', desc: 'Door will be set to maintenance mode. Access rules will be suspended.', variant: 'default' }, // TODO: add i18n keys
  };

  const handleConfirmAction = async () => {
    if (!confirmAction || !door?.device_id) {
      setConfirmAction(null);
      return;
    }
    try {
      await sendCommandMutation.mutateAsync({
        deviceId: door.device_id,
        command: actionCommandMap[confirmAction] ?? confirmAction,
      });
    } catch (err) {
      console.error('Command failed:', err);
    }
    setConfirmAction(null);
  };

  const handleSaveSettings = async () => {
    try {
      await updateDoorMutation.mutateAsync({
        id: id!,
        data: {
          name: settings.name,
          mode: settings.mode,
          unlock_duration_ms: settings.unlockDuration * 1000,
          anti_passback: settings.antiPassback,
        },
      });
      // TODO: Show success toast
    } catch (error) {
      console.error('Failed to update door:', error);
      // TODO: Show error toast
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate('/secure/access-control')}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-semibold text-foreground">{door.name}</h1>
            <StatusBadge status={door.status as 'online' | 'offline' | 'alarm' | 'warning'} />
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">{door.type}</p>
        </div>
      </div>

      {/* Status Card + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Door Status */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
          <div className="flex items-start gap-5">
            <div className={cn('w-16 h-16 rounded-xl flex items-center justify-center', sc.bg)}>
              <StateIcon size={28} className={sc.color} />
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <InfoItem icon={<Lock size={14} />} label={/* TODO: add i18n key */"State"} value={sc.label} valueClass={sc.color} />
              <InfoItem icon={<Shield size={14} />} label={/* TODO: add i18n key */"Mode"} value={door.mode || /* TODO: add i18n key */"Normal"} />
              <InfoItem icon={<Clock size={14} />} label={/* TODO: add i18n key */"Last Event"} value={door.last_event_at ? new Date(door.last_event_at).toLocaleTimeString('vi-VN') : '—'} />
              <InfoItem icon={<Cpu size={14} />} label={/* TODO: add i18n key */"Device ID"} value={door.device_id || '—'} />
              <InfoItem icon={<Wifi size={14} />} label={/* TODO: add i18n key */"IP Address"} value={door.ip_address || '—'} />
              <InfoItem icon={<Settings size={14} />} label={/* TODO: add i18n key */"Firmware"} value={door.firmware_version || '—'} />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-[13px] font-medium text-muted-foreground mb-3">{/* TODO: add i18n key */}Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn icon={<DoorOpen size={16} />} label={/* TODO: add i18n key */"Remote Open"} color="#3B82F6" onClick={() => handleAction('open')} />
            <ActionBtn icon={<Lock size={16} />} label={/* TODO: add i18n key */"Lock Down"} color="#EF4444" onClick={() => handleAction('lockdown')} />
            <ActionBtn icon={<Wrench size={16} />} label={/* TODO: add i18n key */"Maintenance"} color="#F59E0B" onClick={() => handleAction('maintenance')} />
            <ActionBtn icon={<Video size={16} />} label={/* TODO: add i18n key */"View Camera"} color="#06B6D4" onClick={() => handleAction('camera')} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="events">
        <TabsList variant="line" className="border-b border-border mb-4">
          <TabsTrigger value="events" className="gap-1.5 text-[13px]"><List size={14} />{t('doorDetail.events')}</TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5 text-[13px]"><Shield size={14} />{t('accessRules.title')}</TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5 text-[13px]"><Calendar size={14} />{/* TODO: add i18n key */}Schedule</TabsTrigger>
          <TabsTrigger value="camera" className="gap-1.5 text-[13px]"><Video size={14} />{/* TODO: add i18n key */}Camera</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 text-[13px]"><Settings size={14} />{t('doorDetail.settings')}</TabsTrigger>
        </TabsList>

        {/* Events Tab */}
        <TabsContent value="events">
          <DataTable columns={eventColumns} data={eventsData?.data || []} rowKey={(r) => r.id} />
        </TabsContent>

        {/* Access Rules Tab */}
        <TabsContent value="rules">
          <div className="space-y-2">
            {rulesData?.data?.map((rule) => (
              <div
                key={rule.id}
                className={cn(
                  'flex items-center justify-between p-3 bg-card border border-border rounded-lg transition-opacity',
                  !rule.enabled && 'opacity-50'
                )}
              >
                <div>
                  <p className="text-[13px] font-medium text-foreground">{rule.name}</p>
                  <p className="text-[12px] text-muted-foreground">{formatSchedule(rule)}</p>
                </div>
                <span className={cn(
                  'px-2 py-1 rounded text-[11px] font-medium',
                  rule.enabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                )}>
                  {rule.enabled ? /* TODO: add i18n key */'Enabled' : /* TODO: add i18n key */'Disabled'}
                </span>
              </div>
            ))}
            {!rulesData?.data?.length && (
              <p className="text-center py-8 text-muted-foreground">{/* TODO: add i18n key */}Không có quy tắc nào áp dụng cho cửa này</p>
            )}
          </div>
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule">
          <div className="bg-card border border-border rounded-lg p-4 overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Hour labels */}
              <div className="flex ml-10 mb-1">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground">
                    {h.toString().padStart(2, '0')}
                  </div>
                ))}
              </div>
              {/* Grid rows */}
              {scheduleData.map((hours, dayIdx) => (
                <div key={dayIdx} className="flex items-center mb-1">
                  <span className="w-10 text-[11px] text-muted-foreground font-medium">{dayLabels[dayIdx]}</span>
                  <div className="flex flex-1 gap-px">
                    {hours.map((active, h) => (
                      <div
                        key={h}
                        className={cn(
                          'flex-1 h-6 rounded-[2px] transition-colors',
                          active ? 'bg-secure/60' : 'bg-muted'
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-4 mt-3 ml-10">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="w-3 h-3 rounded-[2px] bg-secure/60" /> {/* TODO: add i18n key */}Accessible
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="w-3 h-3 rounded-[2px] bg-muted border border-border" /> {t('intrusion.status.armed')}
                </span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Camera Tab */}
        <TabsContent value="camera">
          <div className="bg-card border border-border rounded-lg p-8 flex flex-col items-center justify-center min-h-[300px]">
            <Video size={48} className="text-muted-foreground/30 mb-4" />
            <p className="text-[14px] text-muted-foreground font-medium">{/* TODO: add i18n key */}Camera Feed</p>
            <p className="text-[12px] text-muted-foreground/70 mt-1">{/* TODO: add i18n key */}Linked camera stream will appear here</p>
            <p className="text-[11px] text-muted-foreground/50 mt-3">{/* TODO: add i18n key */}Camera: CAM-001 · Main Entrance</p>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="bg-card border border-border rounded-lg p-5 max-w-xl space-y-4">
            <SettingField label={/* TODO: add i18n key */"Door Name"}>
              <Input
                value={settings.name}
                onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
                className="h-8 text-[13px]"
              />
            </SettingField>
            <SettingField label={/* TODO: add i18n key */"Mode"}>
              <Select
                value={settings.mode}
                onChange={(e) => setSettings((s) => ({ ...s, mode: e.target.value }))}
                className="h-8 text-[13px]"
              >
                {/* TODO: add i18n keys for mode options */}
                <SelectOption value="Normal">Normal</SelectOption>
                <SelectOption value="Card Only">Card Only</SelectOption>
                <SelectOption value="Card + PIN">Card + PIN</SelectOption>
                <SelectOption value="Locked Down">Locked Down</SelectOption>
                <SelectOption value="Free Access">Free Access</SelectOption>
              </Select>
            </SettingField>
            <SettingField label={/* TODO: add i18n key */"Unlock Duration (seconds)"}>
              <Input
                type="number"
                value={settings.unlockDuration}
                onChange={(e) => setSettings((s) => ({ ...s, unlockDuration: Number(e.target.value) }))}
                className="h-8 text-[13px]"
              />
            </SettingField>
            <SettingField label={/* TODO: add i18n key */"Anti-Passback"}>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, antiPassback: !s.antiPassback }))}
                className={cn(
                  'w-9 h-5 rounded-full relative transition-colors cursor-pointer',
                  settings.antiPassback ? 'bg-secure' : 'bg-muted'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  settings.antiPassback ? 'left-[18px]' : 'left-0.5'
                )} />
              </button>
            </SettingField>
            <SettingField label={/* TODO: add i18n key */"Device ID"}>
              <p className="text-[13px] text-muted-foreground">{door.device_id || '—'}</p>
            </SettingField>
            <SettingField label={/* TODO: add i18n key */"Last Heartbeat"}>
              <p className="text-[13px] text-muted-foreground">
                {door.last_heartbeat_at ? new Date(door.last_heartbeat_at).toLocaleString('vi-VN') : '—'}
              </p>
            </SettingField>
            <div className="pt-2">
              <Button
                onClick={handleSaveSettings}
                disabled={updateDoorMutation.isPending}
              >
                {updateDoorMutation.isPending ? /* TODO: add i18n key */'Saving...' : /* TODO: add i18n key */'Save Changes'}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog */}
      <AppModal
        open={!!confirmAction}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        title={confirmAction && confirmLabels[confirmAction] ? confirmLabels[confirmAction].title : ''}
        description={confirmAction && confirmLabels[confirmAction] ? confirmLabels[confirmAction].desc : undefined}
        size="md"
        showCancelButton
        cancelLabel={/* TODO: add i18n key */'Cancel'}
        cancelDisabled={sendCommandMutation.isPending}
        primaryAction={
          confirmAction && confirmLabels[confirmAction]
            ? {
                label: sendCommandMutation.isPending ? /* TODO: add i18n key */'Sending...' : /* TODO: add i18n key */'Confirm',
                variant: confirmLabels[confirmAction].variant,
                onClick: handleConfirmAction,
                loading: sendCommandMutation.isPending,
                disabled: sendCommandMutation.isPending,
              }
            : undefined
        }
      />
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

function InfoItem({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">{icon}{label}</span>
      <p className={cn('text-[13px] font-medium text-foreground', valueClass)}>{value}</p>
    </div>
  );
}

function ActionBtn({ icon, label, color, onClick }: { icon: React.ReactNode; label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-border/80 hover:bg-muted transition-colors cursor-pointer"
      style={{ color }}
    >
      {icon}
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
    </button>
  );
}

function SettingField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[12px] mb-1 block">{label}</Label>
      {children}
    </div>
  );
}
