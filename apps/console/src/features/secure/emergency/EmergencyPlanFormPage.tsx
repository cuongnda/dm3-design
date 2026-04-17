import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  PageHeader, Button, Input, Label, Select, SelectOption, Badge, Checkbox,
} from '@dm3/ui';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Flame, Lock, Unlock, HeartPulse, UserX, ShieldAlert,
  DoorOpen, Zap, AlertTriangle, ChevronRight, ChevronDown, MapPin,
} from 'lucide-react';
import {
  fetchEmergencyPlan, createEmergencyPlan, updateEmergencyPlan,
  fetchZones, fetchAccessPoints,
  type EmergencyPlanDTO, type ZoneDTO, type AccessPointDTO,
} from '@/lib/api';
import { toast } from '@/lib/toast';

/* ── Icon config ───────────────────────────────────────────── */

const iconMap: Record<string, React.ReactNode> = {
  flame: <Flame size={20} />, lock: <Lock size={20} />, unlock: <Unlock size={20} />,
  'heart-pulse': <HeartPulse size={20} />, 'user-x': <UserX size={20} />,
  'shield-alert': <ShieldAlert size={20} />, 'door-open': <DoorOpen size={20} />,
  zap: <Zap size={20} />, 'alert-triangle': <AlertTriangle size={20} />,
};

const ICON_OPTIONS = Object.keys(iconMap);
const ACTION_OPTIONS = [
  { value: 'hold_open', label: 'Hold Open (stay open until release)' },
  { value: 'hold_close', label: 'Hold Close (lockdown until release)' },
];

/* ── Main ──────────────────────────────────────────────────── */

export function EmergencyPlanFormPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('secure');
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState<ZoneDTO[]>([]);
  const [accessPoints, setAccessPoints] = useState<AccessPointDTO[]>([]);

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    icon: 'shield-alert',
    color: '#EF4444',
    action: 'hold_open',
    countdown_seconds: 5,
    enabled: true,
  });
  const [selectedAPIds, setSelectedAPIds] = useState<Set<string>>(new Set());

  // Load zones + access points + plan (if editing)
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [zoneData, apRes] = await Promise.all([
          fetchZones(),
          fetchAccessPoints(1, 500),
        ]);
        setZones(zoneData);
        setAccessPoints(apRes.data || []);

        if (isEdit) {
          const plan = await fetchEmergencyPlan(id);
          if (plan) {
            setForm({
              name: plan.name,
              description: plan.description,
              icon: plan.icon,
              color: plan.color,
              action: plan.action,
              countdown_seconds: plan.countdown_seconds,
              enabled: plan.enabled,
            });
            // If target_type is 'all', select all APs
            if (plan.target_type === 'all') {
              setSelectedAPIds(new Set((apRes.data || []).map((ap) => ap.id)));
            } else if (plan.target_type === 'access_point') {
              setSelectedAPIds(new Set(plan.target_ids));
            } else if (plan.target_type === 'zone') {
              // Select all APs in the target zones
              const apIds = (apRes.data || [])
                .filter((ap) => ap.zone_id && plan.target_ids.includes(ap.zone_id))
                .map((ap) => ap.id);
              setSelectedAPIds(new Set(apIds));
            }
          }
        }
      } catch {
        toast(t('emergency.toast.loadFailed'), 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isEdit]);

  // Group access points by zone
  const tree = useMemo(() => {
    const zoneMap = new Map(zones.map((z) => [z.id, z]));
    const groups: { zone: ZoneDTO | null; aps: AccessPointDTO[] }[] = [];
    const byZone = new Map<string, AccessPointDTO[]>();
    const noZone: AccessPointDTO[] = [];

    for (const ap of accessPoints) {
      if (ap.zone_id) {
        const list = byZone.get(ap.zone_id) || [];
        list.push(ap);
        byZone.set(ap.zone_id, list);
      } else {
        noZone.push(ap);
      }
    }

    for (const [zoneId, aps] of byZone) {
      groups.push({ zone: zoneMap.get(zoneId) ?? { id: zoneId, name: zoneId, tenant_id: '' }, aps });
    }
    if (noZone.length > 0) {
      groups.push({ zone: null, aps: noZone });
    }
    return groups;
  }, [zones, accessPoints]);

  // Selection helpers
  const toggleAP = (apId: string) => {
    setSelectedAPIds((prev) => {
      const next = new Set(prev);
      if (next.has(apId)) next.delete(apId);
      else next.add(apId);
      return next;
    });
  };

  const toggleZone = (zoneAPs: AccessPointDTO[]) => {
    const ids = zoneAPs.map((ap) => ap.id);
    const allSelected = ids.every((id) => selectedAPIds.has(id));
    setSelectedAPIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedAPIds.size === accessPoints.length) {
      setSelectedAPIds(new Set());
    } else {
      setSelectedAPIds(new Set(accessPoints.map((ap) => ap.id)));
    }
  };

  // Save
  const handleSave = async () => {
    if (!form.name.trim()) { toast(t('emergency.toast.nameRequired'), 'error'); return; }
    if (selectedAPIds.size === 0) { toast(t('emergency.toast.selectAP'), 'error'); return; }

    setSaving(true);
    try {
      const isAll = selectedAPIds.size === accessPoints.length;
      const data = {
        name: form.name.trim(),
        description: form.description,
        icon: form.icon,
        color: form.color,
        action: form.action,
        target_type: isAll ? 'all' : 'access_point',
        target_ids: isAll ? [] : Array.from(selectedAPIds),
        countdown_seconds: form.countdown_seconds,
        enabled: form.enabled,
      };

      if (isEdit && id) {
        await updateEmergencyPlan(id, data);
        toast(t('emergency.toast.planUpdated'), 'success');
      } else {
        await createEmergencyPlan(data);
        toast(t('emergency.toast.planCreated'), 'success');
      }
      navigate('/secure/emergency');
    } catch {
      toast(t('emergency.toast.planSaveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-secure/30 border-t-secure rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/secure/emergency')} className="gap-1 mb-2">
        <ArrowLeft size={14} /> Back to Emergency
      </Button>

      <PageHeader
        title={isEdit ? 'Edit Emergency Plan' : 'New Emergency Plan'}
        description="Configure quick-activate emergency action with target access points"
      />

      <div className="grid grid-cols-3 gap-6">
        {/* ── Left: Form fields ──────────────────────────────── */}
        <div className="col-span-1 space-y-4">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Fire Evacuation" />
          </div>

          <div>
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional" />
          </div>

          <div>
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ICON_OPTIONS.map((ic) => (
                <button key={ic} type="button" onClick={() => setForm((f) => ({ ...f, icon: ic }))}
                  className={cn('flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                    form.icon === ic ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground')}
                  style={form.icon === ic ? { color: form.color } : undefined}>
                  {iconMap[ic]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Color</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="h-9 w-12 rounded border border-border cursor-pointer" />
              <Input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="flex-1 font-mono text-[12px]" />
            </div>
          </div>

          <div>
            <Label>Action (door command)</Label>
            <Select value={form.action} onValueChange={(v) => setForm((f) => ({ ...f, action: v }))}>
              {ACTION_OPTIONS.map((a) => <SelectOption key={a.value} value={a.value}>{a.label}</SelectOption>)}
            </Select>
          </div>

          <div>
            <Label>Countdown (seconds)</Label>
            <Input type="number" min={0} max={60} value={form.countdown_seconds}
              onChange={(e) => setForm((f) => ({ ...f, countdown_seconds: Number(e.target.value) }))} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="plan-enabled" checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: !!v }))} />
            <Label htmlFor="plan-enabled">Enabled</Label>
          </div>

          {/* Preview */}
          <div className="mt-4 rounded-xl border-2 p-4 text-center"
            style={{ backgroundColor: `${form.color}08`, borderColor: `${form.color}40` }}>
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-full"
              style={{ backgroundColor: `${form.color}15`, color: form.color }}>
              {iconMap[form.icon] || <ShieldAlert size={20} />}
            </div>
            <div className="text-[14px] font-bold mt-2" style={{ color: form.color }}>{form.name || 'Plan Name'}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{form.action} · {form.countdown_seconds}s</div>
          </div>
        </div>

        {/* ── Right: Zone → Access Point tree ────────────────── */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-[14px] font-semibold">Target Access Points</Label>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[11px]">
                {selectedAPIds.size} / {accessPoints.length} selected
              </Badge>
              <Button variant="outline" size="sm" className="text-[12px]" onClick={selectAll}>
                {selectedAPIds.size === accessPoints.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-auto max-h-[600px]">
            {tree.map((group) => (
              <ZoneGroup
                key={group.zone?.id ?? '__no_zone__'}
                zone={group.zone}
                accessPoints={group.aps}
                selectedIds={selectedAPIds}
                onToggleAP={toggleAP}
                onToggleZone={() => toggleZone(group.aps)}
              />
            ))}
            {tree.length === 0 && (
              <p className="py-8 text-center text-[13px] text-muted-foreground">No access points found</p>
            )}
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <Button variant="outline" onClick={() => navigate('/secure/emergency')}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Update Plan' : 'Create Plan'}
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  Zone Group (collapsible tree node)                             */
/* ═══════════════════════════════════════════════════════════════ */

function ZoneGroup({
  zone, accessPoints, selectedIds, onToggleAP, onToggleZone,
}: {
  zone: { id: string; name: string } | null;
  accessPoints: AccessPointDTO[];
  selectedIds: Set<string>;
  onToggleAP: (id: string) => void;
  onToggleZone: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const allSelected = accessPoints.every((ap) => selectedIds.has(ap.id));
  const someSelected = accessPoints.some((ap) => selectedIds.has(ap.id));

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Zone header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded((e) => !e)}>
        {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={() => onToggleZone()}
          onClick={(e) => e.stopPropagation()}
        />
        <MapPin size={13} className="text-muted-foreground" />
        <span className="text-[13px] font-medium text-foreground">{zone?.name ?? 'No Zone'}</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">{accessPoints.length}</Badge>
      </div>

      {/* Access points */}
      {expanded && (
        <div>
          {accessPoints.map((ap) => (
            <label key={ap.id}
              className="flex items-center gap-3 px-3 py-2 pl-10 cursor-pointer hover:bg-muted/20 transition-colors">
              <Checkbox
                checked={selectedIds.has(ap.id)}
                onCheckedChange={() => onToggleAP(ap.id)}
              />
              <div className="min-w-0 flex-1">
                <span className="text-[13px] text-foreground">{ap.name}</span>
                {ap.description && (
                  <span className="block text-[11px] text-muted-foreground truncate">{ap.description}</span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">{ap.access_device_count} devices</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
