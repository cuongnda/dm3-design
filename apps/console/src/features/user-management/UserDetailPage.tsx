import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Trash2, User, Camera, CreditCard, Plus, ShieldCheck,
  KeyRound, Fingerprint, QrCode, Save, X, Info, DoorOpen, Car,
  ScanLine, Search, Unlink, Mail, Phone, Hash, Pencil, Radio,
  Building2, Calendar, Shield, Clock, Briefcase, MapPin, FileText,
} from 'lucide-react';
import {
  Button, Input, Label, Badge, AppModal, Select, SelectOption,
  Tabs, TabsContent, TabsList, TabsTrigger, Checkbox,
} from '@dm3/ui';
import { useBreadcrumbStore } from '@dm3/ui';
import { apiFetch, assetUrl } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { User as UserType } from './types';
import { UserSummaryCard } from './components/UserSummaryCard';
import { UserAuditTab } from './components/UserAuditTab';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Credential {
  id: string;
  user_id: string;
  type: 'card' | 'pin' | 'qr' | 'fingerprint' | 'face' | 'uhf';
  value: string;
  status: string;
  valid_from?: string | null;
  valid_until?: string | null;
  created_at: string;
}

interface Vehicle {
  id: string;
  plate_number: string;
  type: string;
  category: string;
  brand: string;
  color: string;
  rfid_tag?: string;
  nfc_card_id?: string;
  owner_id?: string | null;
  registration_status: string;
  created_at: string;
}

interface AccessGroupOption {
  id: string;
  name: string;
  is_default: boolean;
  description?: string;
  access_point_count?: number;
}

interface UserAccessGroup {
  id: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  access_time_id?: string | null;
  access_time_name?: string | null;
  access_point_count: number;
  effective_from?: string | null;
  effective_to?: string | null;
}

interface Department {
  id: string;
  name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CREDENTIAL_ICON_MAP: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  card:        { icon: <CreditCard size={18} />,  color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  pin:         { icon: <KeyRound size={18} />,     color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  qr:          { icon: <QrCode size={18} />,       color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  fingerprint: { icon: <Fingerprint size={18} />,  color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  face:        { icon: <ScanLine size={18} />,     color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-500/20' },
  uhf:         { icon: <Radio size={18} />,        color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-500/20' },
};

// ─── Add Credential Modal ─────────────────────────────────────────────────────

interface AddCredentialModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (type: string, value: string, validFrom: string, validUntil: string) => Promise<void>;
  editData?: { type: string; value: string; valid_from?: string; valid_until?: string } | null;
  defaultValidFrom?: string;
  defaultValidUntil?: string;
}

function AddCredentialModal({ open, onOpenChange, onSubmit, editData, defaultValidFrom, defaultValidUntil }: AddCredentialModalProps) {
  const { t } = useTranslation('users');
  const isEdit = !!editData;
  const fallbackValidFrom = defaultValidFrom && defaultValidFrom.length >= 10
    ? defaultValidFrom.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const fallbackValidUntil = defaultValidUntil && defaultValidUntil.length >= 10
    ? defaultValidUntil.slice(0, 10)
    : '3000-01-01';
  const [type, setType] = useState<string>('card');
  const [value, setValue] = useState('');
  const [validFrom, setValidFrom] = useState(fallbackValidFrom);
  const [validUntil, setValidUntil] = useState(fallbackValidUntil);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setType('card');
    setValue('');
    setValidFrom(fallbackValidFrom);
    setValidUntil(fallbackValidUntil);
    setError('');
  };
  const handleOpenChange = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  useEffect(() => {
    if (!open) return;
    if (editData) {
      setType(editData.type);
      setValue(editData.value);
      const vf = editData.valid_from;
      setValidFrom(vf && vf.length >= 10 ? vf.slice(0, 10) : fallbackValidFrom);
      const vu = editData.valid_until;
      setValidUntil(vu && !vu.startsWith('3000') ? vu.slice(0, 10) : fallbackValidUntil);
    } else {
      setValidFrom(fallbackValidFrom);
      setValidUntil(fallbackValidUntil);
    }
  }, [editData, open, fallbackValidFrom, fallbackValidUntil]);

  const handleSubmit = async () => {
    if (!value.trim()) { setError(t('toast.valueRequired')); return; }
    if (validFrom < fallbackValidFrom) {
      setError(t('credential.startBeforeUser', { date: fallbackValidFrom }));
      return;
    }
    if (validUntil > fallbackValidUntil) {
      setError(t('credential.expiryExceedsUser', { date: fallbackValidUntil }));
      return;
    }
    if (validFrom > validUntil) {
      setError(t('credential.startAfterEnd'));
      return;
    }
    setLoading(true);
    try {
      await onSubmit(type, value.trim(), validFrom, validUntil);
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('toast.credentialAddFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={handleOpenChange}
      title={<span className="flex items-center gap-2"><CreditCard size={16} /> {isEdit ? t('credential.editTitle', 'Edit Credential') : t('credential.addTitle')}</span>}
      size="sm"
      showCancelButton
      cancelLabel={t('actions.cancel')}
      cancelDisabled={loading}
      primaryAction={{ label: loading ? t('actions.saving', 'Saving…') : isEdit ? t('actions.save') : t('actions.add'), onClick: handleSubmit, loading, disabled: loading }}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>{t('credential.type')}</Label>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(CREDENTIAL_ICON_MAP).map(([key, { icon, color, bg }]) => (
              <button
                key={key}
                type="button"
                onClick={() => setType(key)}
                className={`flex flex-col items-center gap-1 rounded-md border p-2.5 text-[11px] capitalize transition-all cursor-pointer ${
                  type === key ? `${bg} ${color} border-current ring-1 ring-current/30` : 'border-border text-muted-foreground hover:border-ring/40'
                }`}
              >
                {icon}
                {key}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label>{t('credential.value')} <span className="text-destructive">*</span></Label>
          <Input
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); }}
            placeholder={type === 'card' ? t('credential.placeholder.card') : type === 'pin' ? t('credential.placeholder.pin') : t('credential.placeholder.default')}
            disabled={loading}
            data-testid="user-input-credential-value"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>{t('credential.validFrom')}</Label>
            <Input
              type="date"
              value={validFrom}
              min={fallbackValidFrom}
              max={validUntil || fallbackValidUntil}
              onChange={(e) => {
                const v = e.target.value || fallbackValidFrom;
                const clamped = v < fallbackValidFrom ? fallbackValidFrom : v;
                setValidFrom(clamped);
                setError('');
              }}
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <Label>{t('credential.expires')}</Label>
            <Input
              type="date"
              value={validUntil}
              min={validFrom || fallbackValidFrom}
              max={fallbackValidUntil}
              onChange={(e) => {
                const v = e.target.value || fallbackValidUntil;
                setValidUntil(v > fallbackValidUntil ? fallbackValidUntil : v);
                setError('');
              }}
              disabled={loading}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">{t('credential.dateHint')}</p>
        {error && <p className="text-[12px] text-destructive">{error}</p>}
      </div>
    </AppModal>
  );
}

// ─── Assign Vehicle Modal ─────────────────────────────────────────────────────

interface AssignVehicleModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  alreadyAssignedIds: string[];
  onAssigned: () => void;
}

function AssignVehicleModal({ open, onOpenChange, userId, alreadyAssignedIds, onAssigned }: AssignVehicleModalProps) {
  const { t } = useTranslation('users');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setSearch('');
    setLoading(true);
    apiFetch<{ data: Vehicle[] }>('/api/v1/parking/vehicles?limit=100')
      .then((data) => {
        const available = (data.data || []).filter(
          (v) => !alreadyAssignedIds.includes(v.id) && v.registration_status !== 'blacklisted'
        );
        setVehicles(available);
      })
      .catch(() => setVehicles([]))
      .finally(() => setLoading(false));
  }, [open, alreadyAssignedIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return vehicles;
    const q = search.toLowerCase();
    return vehicles.filter(
      (v) =>
        v.plate_number.toLowerCase().includes(q) ||
        v.brand?.toLowerCase().includes(q) ||
        v.color?.toLowerCase().includes(q) ||
        v.type.toLowerCase().includes(q)
    );
  }, [vehicles, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    if (selectedIds.size === 0) return;
    setAssigning(true);
    try {
      const promises = Array.from(selectedIds).map((vid) =>
        apiFetch(`/api/v1/parking/vehicles/${vid}`, {
          method: 'PUT',
          body: JSON.stringify({ owner_id: userId }),
        })
      );
      await Promise.all(promises);
      toast(t('toast.vehicleAssigned', { count: selectedIds.size }), 'success');
      onAssigned();
      onOpenChange(false);
    } catch {
      toast(t('toast.vehicleAssignFailed'), 'error');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="flex items-center gap-2"><Car size={16} /> {t('vehicle.assignTitle')}</span>}
      size="md"
      showCancelButton
      cancelLabel={t('actions.cancel')}
      cancelDisabled={assigning}
      primaryAction={{
        label: assigning ? t('actions.assigning') : `${t('actions.assign')} (${selectedIds.size})`,
        onClick: handleAssign,
        loading: assigning,
        disabled: assigning || selectedIds.size === 0,
      }}
    >
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('vehicle.searchPlaceholder')}
            className="pl-9"
            data-testid="user-input-vehicle-search"
          />
        </div>

        <div className="max-h-[320px] overflow-y-auto rounded-md border border-border">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-[13px] text-muted-foreground justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              {t('vehicle.loadingVehicles')}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-muted-foreground/50">
              <Car size={28} strokeWidth={1.1} />
              <p className="text-[13px]">{search ? t('vehicle.noMatch') : t('vehicle.noAvailable')}</p>
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-muted/60 border-b border-border sticky top-0">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 text-left font-medium text-foreground">{t('vehicle.col.plate')}</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground">{t('vehicle.col.type')}</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground">{t('vehicle.col.brandModel')}</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground">{t('vehicle.col.color')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => toggleSelect(v.id)}
                    className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-3 py-2 text-center">
                      <Checkbox checked={selectedIds.has(v.id)} onCheckedChange={() => toggleSelect(v.id)} />
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold tracking-wider">{v.plate_number}</td>
                    <td className="px-3 py-2 capitalize">{v.type}</td>
                    <td className="px-3 py-2 text-muted-foreground">{v.brand || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{v.color || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">{t('vehicle.assignHint')}</p>
      </div>
    </AppModal>
  );
}

// ─── Add To Access Group Modal ────────────────────────────────────────────────
// Inverse of AccessGroupDetailPage's AddUserModal: given a user, pick one or
// more groups to add the user to. Excludes groups the user is already in so the
// user can't accidentally re-POST to the same group.

interface AddToGroupModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  currentGroupIds: Set<string>;
  onAdded: () => void;
}

function AddToGroupModal({ open, onOpenChange, userId, currentGroupIds, onAdded }: AddToGroupModalProps) {
  const { t } = useTranslation('users');
  const [groups, setGroups] = useState<AccessGroupOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setSelected(new Set()); setSearch(''); return; }
    setLoading(true);
    apiFetch<{ data: AccessGroupOption[] }>('/api/v1/access/access-groups?limit=500')
      .then((d) => setGroups(d.data || []))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, [open]);

  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (currentGroupIds.has(g.id)) return false;
      if (!term) return true;
      return g.name.toLowerCase().includes(term) || (g.description ?? '').toLowerCase().includes(term);
    });
  }, [groups, search, currentGroupIds]);

  const toggle = (gid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      for (const gid of selected) {
        await apiFetch(`/api/v1/access/access-groups/${gid}/users`, {
          method: 'POST',
          body: JSON.stringify([{ user_id: userId }]),
        });
      }
      toast(t('toast.accessGroupUpdated'), 'success');
      onAdded();
      onOpenChange(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.accessGroupFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('accessGroup.addToGroup', 'Add to Access Group')}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={selected.size === 0 || saving} data-testid="user-button-add-to-groups-confirm">
            {saving ? t('actions.saving') : t('actions.add', 'Add')}{selected.size > 0 ? ` (${selected.size})` : ''}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t('accessGroup.searchGroups', 'Search groups…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="user-input-search-groups"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : available.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <ShieldCheck size={28} className="mb-2 text-muted-foreground/40" />
            <p className="text-[13px] text-muted-foreground">
              {groups.length === 0
                ? t('accessGroup.noGroups', 'No access groups available')
                : t('accessGroup.allGroupsAssigned', 'User is already in all groups')}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden max-h-[380px] overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/60 border-b border-border sticky top-0">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 text-left font-medium text-foreground">{t('accessGroup.name', 'Name')}</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground">{t('accessGroup.description', 'Description')}</th>
                  <th className="px-3 py-2 text-left font-medium text-foreground">{t('accessGroup.accessPoints')}</th>
                </tr>
              </thead>
              <tbody>
                {available.map((g) => (
                  <tr
                    key={g.id}
                    className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => toggle(g.id)}
                  >
                    <td className="w-10 px-3 py-2">
                      <Checkbox
                        checked={selected.has(g.id)}
                        onCheckedChange={() => toggle(g.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Shield size={13} className="text-primary shrink-0" />
                        <span className="font-medium">{g.name}</span>
                        {g.is_default && <Badge variant="secondary" className="text-[10px]">{t('accessGroup.default', 'Default')}</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{g.description || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{g.access_point_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppModal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UserDetailPage
// ═══════════════════════════════════════════════════════════════════════════════

export function UserDetailPage() {
  const { t } = useTranslation('users');
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setLabel = useBreadcrumbStore((s) => s.setLabel);
  const clearLabel = useBreadcrumbStore((s) => s.clearLabel);

  const isNew = !routeId;
  const id = isNew ? undefined : routeId;

  // ─── State ───────────────────────────────────────────────────────────────
  const [user, setUser] = useState<UserType | null>(isNew ? ({} as UserType) : null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loadingCreds, setLoadingCreds] = useState(true);
  const [userGroups, setUserGroups] = useState<UserAccessGroup[]>([]);
  const [loadingUserGroups, setLoadingUserGroups] = useState(false);
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false);
  const [removingGroupId, setRemovingGroupId] = useState<string | null>(null);
  const [userVehicles, setUserVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);

  const [editForm, setEditForm] = useState<Record<string, string | boolean>>({});
  const [saveLoading, setSaveLoading] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showAddCred, setShowAddCred] = useState(false);
  const [editingCred, setEditingCred] = useState<{ id: string; type: string; value: string; valid_from?: string; valid_until?: string } | null>(null);
  const [deletingCredId, setDeletingCredId] = useState<string | null>(null);
  const [selectedCreds, setSelectedCreds] = useState<Set<string>>(new Set());
  const [bulkDeleteCredLoading, setBulkDeleteCredLoading] = useState(false);

  const [showAssignVehicle, setShowAssignVehicle] = useState(false);
  const [unassigningVehicleId, setUnassigningVehicleId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<string>('profile');

  // ─── Breadcrumb ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isNew) { setLabel('new', t('detail.newUser', 'New User')); return () => clearLabel('new'); }
    if (id && user?.full_name) setLabel(id, user.full_name);
    return () => { if (id) clearLabel(id); };
  }, [id, isNew, user?.full_name, setLabel, clearLabel]);

  // ─── Fetchers ────────────────────────────────────────────────────────────

  const fetchUser = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ user: UserType }>(`/api/v1/identity/users/${id}`);
      const u = data.user ?? null;
      setUser(u);
      setAvatarPreview(u?.avatar ? assetUrl(u.avatar) : null);
      if (u) {
        setEditForm({
          first_name: u.first_name || '',
          last_name: u.last_name || '',
          email: u.email || '',
          position: u.position || '',
          phone: u.phone || '',
          address: u.address || '',
          emp_number: u.emp_number || '',
          birth_day: u.birth_day || '',
          sex: u.sex === true ? 'true' : u.sex === false ? 'false' : '',
          effective_date: u.effective_date || '',
          expired_date: u.expired_date || '',
          department_id: u.department_id || '',
          status: u.status || 'active',
          is_master_card: u.is_master_card ?? false,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('detail.userNotFound'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchCredentials = useCallback(async () => {
    if (!id) return;
    setLoadingCreds(true);
    try {
      const data = await apiFetch<Credential[]>(`/api/v1/identity/users/${id}/credentials`);
      setCredentials(Array.isArray(data) ? data : []);
    } catch { setCredentials([]); }
    finally { setLoadingCreds(false); }
  }, [id]);

  const fetchUserVehicles = useCallback(async () => {
    if (!id) return;
    setLoadingVehicles(true);
    try {
      const data = await apiFetch<{ data: Vehicle[] }>(`/api/v1/parking/vehicles?owner_id=${id}&limit=100`);
      setUserVehicles(data.data || []);
    } catch { setUserVehicles([]); }
    finally { setLoadingVehicles(false); }
  }, [id]);

  const handleUnassignVehicle = useCallback(async (vehicleId: string) => {
    setUnassigningVehicleId(vehicleId);
    try {
      await apiFetch(`/api/v1/parking/vehicles/${vehicleId}`, { method: 'PUT', body: JSON.stringify({ owner_id: null }) });
      toast(t('toast.vehicleUnassigned'), 'success');
      fetchUserVehicles();
    } catch { toast(t('toast.vehicleUnassignFailed'), 'error'); }
    finally { setUnassigningVehicleId(null); }
  }, [fetchUserVehicles]);

  const fetchUserGroups = useCallback(async () => {
    if (!id) return;
    setLoadingUserGroups(true);
    try {
      const data = await apiFetch<{ data?: UserAccessGroup[] }>(`/api/v1/access/access-groups/by-user/${id}`);
      setUserGroups(data.data ?? []);
    } catch { setUserGroups([]); }
    finally { setLoadingUserGroups(false); }
  }, [id]);

  useEffect(() => {
    if (!isNew) {
      fetchUser();
      fetchCredentials();
      fetchUserVehicles();
      fetchUserGroups();
    }
    apiFetch<{ departments: Department[] }>('/api/v1/identity/departments?limit=200')
      .then((d) => setDepartments(d.departments || []))
      .catch(() => {});
  }, [isNew, fetchUser, fetchCredentials, fetchUserVehicles, fetchUserGroups]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaveLoading(true);
    try {
      const payload: Record<string, unknown> = { ...editForm };
      if (!payload.department_id) delete payload.department_id;
      if (!payload.birth_day) delete payload.birth_day;
      if (!payload.effective_date) delete payload.effective_date;
      if (!payload.expired_date) delete payload.expired_date;
      if (payload.sex === '') delete payload.sex;
      else payload.sex = payload.sex === 'true';

      let userId = id;

      if (isNew) {
        const result = await apiFetch<{ id: string }>('/api/v1/identity/users', { method: 'POST', body: JSON.stringify(payload) });
        userId = result.id;
      } else {
        if (!id) return;
        await apiFetch(`/api/v1/identity/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      }

      if (avatarFile && userId) {
        const form = new FormData();
        form.append('avatar', avatarFile);
        await fetch(`/api/v1/identity/users/${userId}/avatar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('dm3-token') ?? ''}` },
          body: form,
        });
      }

      setAvatarFile(null);
      toast(isNew ? t('toast.created') : t('toast.updated'), 'success');
      navigate('/manage/users');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.saveFailed'), 'error');
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/v1/identity/users/${id}`, { method: 'DELETE' });
      toast(t('toast.deleted'), 'success');
      navigate('/manage/users');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.deleteFailed2'), 'error');
    } finally { setDeleteLoading(false); setShowDeleteDialog(false); }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleAddCredential = async (type: string, value: string, validFrom: string, validUntil: string) => {
    if (!id) return;
    const payload: Record<string, unknown> = { type, value, status: 'active' };
    if (validFrom) payload.valid_from = new Date(validFrom).toISOString();
    if (validUntil && validUntil !== '3000-01-01') payload.valid_until = new Date(validUntil).toISOString();
    await apiFetch(`/api/v1/identity/users/${id}/credentials`, { method: 'POST', body: JSON.stringify(payload) });
    await fetchCredentials();
    toast(t('toast.credentialAdded'), 'success');
  };

  const handleUpdateCredential = async (type: string, value: string, validFrom: string, validUntil: string) => {
    if (!id || !editingCred) return;
    const payload: Record<string, unknown> = { type, value, status: 'active' };
    if (validFrom) payload.valid_from = new Date(validFrom).toISOString();
    if (validUntil && validUntil !== '3000-01-01') payload.valid_until = new Date(validUntil).toISOString();
    await apiFetch(`/api/v1/identity/users/${id}/credentials/${editingCred.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    await fetchCredentials();
    setEditingCred(null);
    toast(t('toast.credentialUpdated', 'Credential updated'), 'success');
  };

  const handleDeleteCredential = async (credId: string) => {
    if (!id) return;
    setDeletingCredId(credId);
    try {
      await apiFetch(`/api/v1/identity/users/${id}/credentials/${credId}`, { method: 'DELETE' });
      setSelectedCreds((prev) => { const next = new Set(prev); next.delete(credId); return next; });
      await fetchCredentials();
      toast(t('toast.credentialRemoved'), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.credentialRemoveFailed'), 'error');
    } finally { setDeletingCredId(null); }
  };

  const handleBulkDeleteCredentials = async () => {
    if (!id || selectedCreds.size === 0) return;
    setBulkDeleteCredLoading(true);
    try {
      for (const credId of selectedCreds) {
        await apiFetch(`/api/v1/identity/users/${id}/credentials/${credId}`, { method: 'DELETE' });
      }
      setSelectedCreds(new Set());
      await fetchCredentials();
      toast(t('toast.credentialBulkRemoved', { count: selectedCreds.size }), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.credentialRemoveFailed'), 'error');
    } finally { setBulkDeleteCredLoading(false); }
  };

  const toggleCredSelect = (credId: string) => {
    setSelectedCreds((prev) => {
      const next = new Set(prev);
      if (next.has(credId)) next.delete(credId); else next.add(credId);
      return next;
    });
  };

  const handleRemoveFromGroup = async (groupId: string) => {
    if (!id) return;
    setRemovingGroupId(groupId);
    try {
      await apiFetch(`/api/v1/access/access-groups/${groupId}/users/${id}`, { method: 'DELETE' });
      await fetchUserGroups();
      toast(t('toast.accessGroupUpdated'), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.accessGroupFailed'), 'error');
    } finally { setRemovingGroupId(null); }
  };

  const userGroupIds = useMemo(() => new Set(userGroups.map((g) => g.id)), [userGroups]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditForm((prev) => ({ ...prev, [field]: e.target.value }));

  // ─── Loading / Error states ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!isNew && (error || !user)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <User size={32} className="text-muted-foreground/40" />
        <p className="text-[13px] text-muted-foreground">{error ?? t('detail.userNotFound')}</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/manage/users')}>
          <ArrowLeft size={14} className="mr-1.5" /> {t('detail.backToList')}
        </Button>
      </div>
    );
  }

  const displayName = isNew
    ? t('detail.newUser', 'New User')
    : (user?.full_name || `${user?.first_name} ${user?.last_name}`);
  const initials = isNew
    ? '+'
    : (user?.first_name && user?.last_name
      ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
      : displayName[0]?.toUpperCase() ?? '?');

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden" data-testid="user-detail-page">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/manage/users')}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-3 px-0 h-auto"
        >
          <ArrowLeft size={13} />
          {t('detail.backToList')}
        </Button>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="group relative shrink-0 cursor-pointer"
            >
              <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-border bg-muted flex items-center justify-center">
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" className="h-full w-full object-cover" />
                  : <span className="text-xl font-semibold text-muted-foreground">{initials}</span>}
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera size={16} className="text-white" />
              </div>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} data-testid="user-input-avatar" />

            {/* Name + meta */}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[18px] font-semibold text-foreground">{displayName}</h1>
                {!isNew && user && (
                  <Badge variant={user.status === 'active' ? 'default' : user.status === 'suspended' ? 'destructive' : 'secondary'} className="text-[11px]">
                    {t(`status.${user.status}`, user.status)}
                  </Badge>
                )}
                {!isNew && user?.is_master_card && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                    {t('detail.masterBadge')}
                  </Badge>
                )}
              </div>
              {!isNew && user && <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {user.department_name && (
                  <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                    <Building2 size={11} />
                    {user.department_name}
                  </span>
                )}
                {user.position && (
                  <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                    <Briefcase size={11} />
                    {user.position}
                  </span>
                )}
                {user.email && (
                  <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                    <Mail size={11} />
                    {user.email}
                  </span>
                )}
                {user.phone && (
                  <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                    <Phone size={11} />
                    {user.phone}
                  </span>
                )}
                <span className="text-[12px] text-muted-foreground flex items-center gap-1 font-mono">
                  <Hash size={11} />
                  {user.user_code}
                </span>
                {userGroups.length > 0 && (
                  <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                    <Shield size={11} />
                    {userGroups.length === 1
                      ? userGroups[0].name
                      : t('accessGroup.groupsCount', '{{count}} groups', { count: userGroups.length })}
                  </span>
                )}
              </div>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => navigate('/manage/users')} disabled={saveLoading}>
              <X size={14} className="mr-1.5" /> {t('actions.cancel')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saveLoading} data-testid="user-button-save-form">
              <Save size={14} className="mr-1.5" />
              {saveLoading ? t('actions.saving') : t('actions.save')}
            </Button>
            {!isNew && <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[12px] text-destructive hover:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
              data-testid="user-button-delete"
            >
              <Trash2 size={14} />
            </Button>}
          </div>
        </div>
      </div>

      {/* ── Content row: summary rail + tabs ──────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-4 min-h-0 flex-1 overflow-hidden">
        {!isNew && user && (
          <div className="xl:order-last xl:w-[260px] xl:shrink-0">
            <UserSummaryCard
              user={user}
              userGroups={userGroups}
              credentials={credentials}
              loadingGroups={loadingUserGroups}
              loadingCreds={loadingCreds}
              onAssignAccessGroup={() => setShowAddToGroupModal(true)}
              onGoToAccessTab={() => setActiveTab('access')}
              onGoToCredentialsTab={() => setActiveTab('credentials')}
            />
          </div>
        )}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-1 py-1">
          <TabsList variant="line">
            <TabsTrigger value="profile" className="text-[12px] px-3 whitespace-nowrap" data-testid="user-button-tab-user-info">
              <User size={13} className="mr-1.5" />
              {t('tab.userInfo')}
            </TabsTrigger>
            {!isNew && <TabsTrigger value="access" className="text-[12px] px-3 whitespace-nowrap" data-testid="user-button-tab-access-group">
              <DoorOpen size={13} className="mr-1.5" />
              {t('tab.accessGroup')} ({userGroups.length})
            </TabsTrigger>}
            {!isNew && <TabsTrigger value="credentials" className="text-[12px] px-3 whitespace-nowrap" data-testid="user-button-tab-card-list">
              <CreditCard size={13} className="mr-1.5" />
              {t('tab.cardList')} ({credentials.length})
            </TabsTrigger>}
            {!isNew && <TabsTrigger value="vehicles" className="text-[12px] px-3 whitespace-nowrap" data-testid="user-button-tab-vehicle">
              <Car size={13} className="mr-1.5" />
              {t('tab.vehicles')} ({userVehicles.length})
            </TabsTrigger>}
            {!isNew && <TabsTrigger value="audit" className="text-[12px] px-3 whitespace-nowrap" data-testid="user-button-tab-audit">
              <FileText size={13} className="mr-1.5" />
              {t('tab.audit')}
            </TabsTrigger>}
          </TabsList>

          {/* Context actions per tab */}
          {activeTab === 'credentials' && (
            <div className="flex items-center gap-2">
              {selectedCreds.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[12px] text-destructive hover:text-destructive"
                  onClick={handleBulkDeleteCredentials}
                  disabled={bulkDeleteCredLoading}
                  data-testid="user-button-delete-cards"
                >
                  <Trash2 size={13} className="mr-1" />
                  {t('actions.delete')} ({selectedCreds.size})
                </Button>
              )}
              <Button size="sm" onClick={() => setShowAddCred(true)} data-testid="user-modal-add-card-trigger">
                <Plus size={14} className="mr-1.5" /> {t('credential.addCard')}
              </Button>
            </div>
          )}
          {activeTab === 'vehicles' && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/parking/vehicles')}>
                {t('vehicle.manageAll')}
              </Button>
              <Button size="sm" onClick={() => setShowAssignVehicle(true)} data-testid="user-button-add-vehicle">
                <Plus size={14} className="mr-1.5" /> {t('vehicle.assign')}
              </Button>
            </div>
          )}
          {activeTab === 'access' && (
            <Button size="sm" onClick={() => setShowAddToGroupModal(true)} data-testid="user-button-add-to-group">
              <Plus size={14} className="mr-1.5" /> {t('accessGroup.addToGroup', 'Add to group')}
            </Button>
          )}
        </div>

        {/* ╔══ Credentials Tab ════════════════════════════════════════════ */}
        <TabsContent value="credentials" className="min-h-0 flex-1 overflow-auto">
          {loadingCreds ? (
            <div className="flex justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
          ) : credentials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CreditCard size={36} className="mb-3 text-muted-foreground/40" />
              <p className="text-[13px] font-medium text-foreground">{t('credential.empty')}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{t('credential.description')}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddCred(true)}>
                <Plus size={14} className="mr-1.5" /> {t('credential.addCard')}
              </Button>
            </div>
          ) : (
            <div className="p-4">
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead className="bg-muted/60 border-b border-border">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="px-3 py-2 text-left font-medium text-foreground">{t('credential.type')}</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">{t('credential.value')}</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">{t('modal.status', 'Status')}</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">{t('credential.validFrom')}</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">{t('credential.expires')}</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">{t('modal.created')}</th>
                      <th className="px-3 py-2 text-right font-medium text-foreground">{t('actions.actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credentials.map((cred) => {
                      const info = CREDENTIAL_ICON_MAP[cred.type] ?? CREDENTIAL_ICON_MAP.card;
                      const hasExpiry = !!cred.valid_until;
                      return (
                        <tr
                          key={cred.id}
                          className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                        >
                          <td className="w-10 px-3 py-2">
                            <Checkbox
                              checked={selectedCreds.has(cred.id)}
                              onCheckedChange={() => toggleCredSelect(cred.id)}
                              aria-label={t('credential.selectLabel')}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className={info.color}>{info.icon}</span>
                              <span className="font-medium capitalize">{cred.type}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-[12px] text-muted-foreground">{cred.value}</td>
                          <td className="px-3 py-2">
                            <Badge variant={cred.status === 'active' ? 'default' : 'secondary'} className="text-[11px]">
                              {cred.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-[12px] text-muted-foreground">
                            {cred.valid_from ? new Date(cred.valid_from).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-3 py-2 text-[12px] text-muted-foreground">
                            {hasExpiry ? new Date(cred.valid_until!).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-3 py-2 text-[12px] text-muted-foreground">
                            {new Date(cred.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-right space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[12px]"
                              onClick={() => setEditingCred({ id: cred.id, type: cred.type, value: cred.value, valid_from: cred.valid_from ?? undefined, valid_until: cred.valid_until ?? undefined })}
                            >
                              <Pencil size={13} className="mr-1" />
                              {t('actions.edit')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[12px] text-destructive hover:text-destructive"
                              onClick={() => handleDeleteCredential(cred.id)}
                              disabled={deletingCredId === cred.id}
                            >
                              <Trash2 size={13} className="mr-1" />
                              {deletingCredId === cred.id ? t('actions.removing', 'Removing…') : t('actions.revoke', 'Revoke')}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ╔══ Access Group Tab ═══════════════════════════════════════════ */}
        <TabsContent value="access" className="min-h-0 flex-1 overflow-auto p-4">
          {loadingUserGroups ? (
            <div className="flex justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
          ) : userGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShieldCheck size={36} className="mb-3 text-muted-foreground/40" />
              <p className="text-[13px] font-medium text-foreground">{t('accessGroup.emptyUserGroups', 'User is not in any access group')}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{t('accessGroup.addToGroupHint', 'Add the user to one or more groups to grant access')}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddToGroupModal(true)}>
                <Plus size={14} className="mr-1.5" /> {t('accessGroup.addToGroup', 'Add to group')}
              </Button>
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden" data-testid="user-table-access-groups">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/60 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('accessGroup.name', 'Name')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('accessGroup.description', 'Description')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('accessGroup.accessPoints')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('accessGroup.accessTime', 'Access Time')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('accessGroup.effective', 'Effective')}</th>
                    <th className="px-3 py-2 text-right font-medium text-foreground">{t('actions.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {userGroups.map((g) => (
                    <tr key={g.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors" data-testid={`user-row-group-${g.id}`}>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/access/access-groups/${g.id}`)}
                          className="flex items-center gap-2 font-medium text-left hover:text-primary transition-colors"
                        >
                          <Shield size={13} className="text-primary shrink-0" />
                          {g.name}
                          {g.is_default && <Badge variant="secondary" className="text-[10px]">{t('accessGroup.default', 'Default')}</Badge>}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{g.description || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <DoorOpen size={12} className="text-muted-foreground/70" />
                          {g.access_point_count}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {g.access_time_name ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock size={12} className="text-muted-foreground/70" />
                            {g.access_time_name}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-[12px]">
                        {g.effective_from ? new Date(g.effective_from).toLocaleDateString() : '—'}
                        {g.effective_to && <> → {new Date(g.effective_to).toLocaleDateString()}</>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[12px] text-destructive hover:text-destructive"
                          onClick={() => handleRemoveFromGroup(g.id)}
                          disabled={removingGroupId === g.id}
                          data-testid={`user-button-remove-group-${g.id}`}
                        >
                          <Unlink size={13} className="mr-1" />
                          {removingGroupId === g.id ? t('actions.removing', 'Removing…') : t('actions.remove', 'Remove')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ╔══ Vehicles Tab ══════════════════════════════════════════════ */}
        <TabsContent value="vehicles" className="min-h-0 flex-1 overflow-auto">
          {loadingVehicles ? (
            <div className="flex justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
          ) : userVehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Car size={36} className="mb-3 text-muted-foreground/40" />
              <p className="text-[13px] font-medium text-foreground">{t('vehicle.empty')}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{t('vehicle.description')}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAssignVehicle(true)}>
                <Plus size={14} className="mr-1.5" /> {t('vehicle.assign')}
              </Button>
            </div>
          ) : (
            <div className="p-4">
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead className="bg-muted/60 border-b border-border">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-foreground">{t('vehicle.col.plate')}</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">{t('vehicle.col.type')}</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">{t('vehicle.col.brandModel')}</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">{t('vehicle.col.color')}</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">{t('vehicle.col.status')}</th>
                      <th className="px-3 py-2 text-right font-medium text-foreground" style={{ width: 100 }}>{t('vehicle.col.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userVehicles.map((v) => (
                      <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                        <td className="px-3 py-2 font-mono font-semibold tracking-wider">{v.plate_number}</td>
                        <td className="px-3 py-2 capitalize">{v.type}</td>
                        <td className="px-3 py-2 text-muted-foreground">{v.brand || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{v.color || '—'}</td>
                        <td className="px-3 py-2">
                          <Badge variant={v.registration_status === 'registered' ? 'default' : v.registration_status === 'blacklisted' ? 'destructive' : 'secondary'} className="text-[11px]">
                            {v.registration_status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[12px] text-destructive hover:text-destructive"
                            onClick={() => handleUnassignVehicle(v.id)}
                            disabled={unassigningVehicleId === v.id}
                            data-testid={`user-button-unassign-vehicle-${v.id}`}
                          >
                            <Unlink size={13} className="mr-1" />
                            {unassigningVehicleId === v.id ? t('actions.removing', 'Removing…') : t('vehicle.unassign')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ╔══ Profile Edit Tab ══════════════════════════════════════════ */}
        <TabsContent value="profile" className="min-h-0 flex-1 overflow-auto p-4">
          <div className="max-w-3xl space-y-5">
            {/* Gender */}
            <div className="space-y-1">
              <Label>{t('modal.gender', 'Gender')}</Label>
              <div className="flex items-center gap-4">
                {[
                  { value: 'true', label: t('modal.genderMale', 'Male') },
                  { value: 'false', label: t('modal.genderFemale', 'Female') },
                  { value: '', label: t('modal.genderNotSpecified', 'Not specified') },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1.5 text-[13px] cursor-pointer" data-testid="user-radio-group-gender">
                    <input
                      type="radio" name="sex"
                      checked={String(editForm.sex ?? '') === opt.value}
                      onChange={() => setEditForm((p) => ({ ...p, sex: opt.value }))}
                      className="accent-primary"                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t('modal.firstName', 'First Name')} <span className="text-destructive">*</span></Label>
                <Input value={String(editForm.first_name ?? '')} onChange={set('first_name')} data-testid="user-input-first-name" />
              </div>
              <div className="space-y-1">
                <Label>{t('modal.lastName', 'Last Name')} <span className="text-destructive">*</span></Label>
                <Input value={String(editForm.last_name ?? '')} onChange={set('last_name')} data-testid="user-input-last-name" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t('modal.email', 'Email')} <span className="text-destructive">*</span></Label>
                <Input type="email" value={String(editForm.email ?? '')} onChange={set('email')} data-testid="user-input-email" />
              </div>
              <div className="space-y-1">
                <Label>{t('modal.dateOfBirth', 'Date of Birth')}</Label>
                <Input type="date" value={String(editForm.birth_day ?? '')} onChange={set('birth_day')} data-testid="user-datetime-birth-day" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t('modal.department', 'Department')}</Label>
                <Select value={String(editForm.department_id ?? '')} onValueChange={(v) => setEditForm((p) => ({ ...p, department_id: v }))} data-testid="user-select-department-id">
                  <SelectOption value="">{t('modal.departmentNone', 'None')}</SelectOption>
                  {departments.map((d) => <SelectOption key={d.id} value={d.id}>{d.name}</SelectOption>)}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('modal.position', 'Position')}</Label>
                <Input value={String(editForm.position ?? '')} onChange={set('position')} data-testid="user-input-position-form" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t('modal.effectiveDate', 'Effective Date')}</Label>
                <Input type="date" value={String(editForm.effective_date ?? '')} onChange={set('effective_date')} />
              </div>
              <div className="space-y-1">
                <Label>{t('modal.expiredDate', 'Expiry Date')}</Label>
                <Input type="date" value={String(editForm.expired_date ?? '')} onChange={set('expired_date')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t('modal.userCode', 'User Code')}</Label>
                <p className="text-[13px] py-1 font-mono text-muted-foreground">{user?.user_code || '—'}</p>
              </div>
              <div className="space-y-1">
                <Label>{t('modal.masterCard')}</Label>
                <div className="flex items-center gap-4 py-1">
                  {[{ value: true, label: t('modal.masterYes') }, { value: false, label: t('modal.masterNo') }].map((opt) => (
                    <label key={String(opt.value)} className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                      <input
                        type="radio" name="is_master_card"
                        checked={editForm.is_master_card === opt.value}
                        onChange={() => setEditForm((p) => ({ ...p, is_master_card: opt.value }))}
                        className="accent-primary"                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>{t('modal.status', 'Status')}</Label>
              <Select value={String(editForm.status ?? 'active')} onValueChange={(v) => setEditForm((p) => ({ ...p, status: v }))} data-testid="user-input-status">
                <SelectOption value="active">{t('status.active', 'Active')}</SelectOption>
                <SelectOption value="inactive">{t('status.inactive', 'Inactive')}</SelectOption>
                <SelectOption value="suspended">{t('status.suspended', 'Suspended')}</SelectOption>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>{t('modal.phone', 'Phone')}</Label>
              <Input value={String(editForm.phone ?? '')} onChange={set('phone')} data-testid="user-input-phone" />
            </div>

            <div className="space-y-1">
              <Label>{t('modal.address', 'Address')}</Label>
              <Input value={String(editForm.address ?? '')} onChange={set('address')} data-testid="user-input-address" />
            </div>

            {!isNew && user && (
              <div className="pt-3 mt-3 border-t border-border/50 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{t('modal.created')}</Label>
                    <p className="text-[12px] py-0.5 text-muted-foreground flex items-center gap-1.5">
                      <Clock size={11} />
                      {user.created_on ? new Date(user.created_on).toLocaleString() : '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{t('modal.updated')}</Label>
                    <p className="text-[12px] py-0.5 text-muted-foreground flex items-center gap-1.5">
                      <Clock size={11} />
                      {user.updated_on ? new Date(user.updated_on).toLocaleString() : '—'}
                    </p>
                  </div>
                </div>
                {user.account_id && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{t('modal.accountId')}</Label>
                    <p className="font-mono text-[12px] py-0.5 text-muted-foreground">{user.account_id}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ╔══ Audit Tab ═════════════════════════════════════════════════ */}
        {!isNew && id && (
          <TabsContent value="audit" className="min-h-0 flex-1 overflow-auto p-4">
            <UserAuditTab userId={id} />
          </TabsContent>
        )}
      </Tabs>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      <AddCredentialModal
        open={showAddCred}
        onOpenChange={setShowAddCred}
        onSubmit={handleAddCredential}
        defaultValidFrom={user?.effective_date ?? (typeof editForm.effective_date === 'string' ? editForm.effective_date : undefined)}
        defaultValidUntil={user?.expired_date ?? (typeof editForm.expired_date === 'string' ? editForm.expired_date : undefined)}
      />

      <AddCredentialModal
        open={!!editingCred}
        onOpenChange={(v) => { if (!v) setEditingCred(null); }}
        onSubmit={handleUpdateCredential}
        editData={editingCred}
        defaultValidFrom={user?.effective_date ?? (typeof editForm.effective_date === 'string' ? editForm.effective_date : undefined)}
        defaultValidUntil={user?.expired_date ?? (typeof editForm.expired_date === 'string' ? editForm.expired_date : undefined)}
      />

      {id && (
        <AssignVehicleModal
          open={showAssignVehicle}
          onOpenChange={setShowAssignVehicle}
          userId={id}
          alreadyAssignedIds={userVehicles.map((v) => v.id)}
          onAssigned={fetchUserVehicles}
        />
      )}

      {id && (
        <AddToGroupModal
          open={showAddToGroupModal}
          onOpenChange={setShowAddToGroupModal}
          userId={id}
          currentGroupIds={userGroupIds}
          onAdded={fetchUserGroups}
        />
      )}

      <AppModal
        open={showDeleteDialog}
        onOpenChange={(v) => { if (!v) setShowDeleteDialog(false); }}
        title={
          <span className="flex items-center gap-2 text-destructive">
            <Trash2 size={16} />
            {t('delete.title', 'Delete User')}
          </span>
        }
        size="xs"
        showCancelButton
        cancelLabel={t('delete.cancel', 'Cancel')}
        cancelDisabled={deleteLoading}
        primaryAction={{
          label: deleteLoading ? t('delete.loading', 'Deleting…') : t('delete.submit', 'Delete'),
          variant: 'outline',
          className: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
          onClick: handleDelete,
          loading: deleteLoading,
          disabled: deleteLoading,
        }}
      >
        <p className="text-[13px] text-muted-foreground">
          {t('delete.confirmPre', 'Are you sure you want to delete')}{' '}
          <span className="font-medium text-foreground">{displayName}</span>
          {t('delete.confirmPost', '? This action cannot be undone.')}
        </p>
      </AppModal>
    </div>
  );
}
