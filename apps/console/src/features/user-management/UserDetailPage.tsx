import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Trash2, User, Camera, CreditCard, Plus, ShieldCheck,
  KeyRound, Fingerprint, QrCode, Save, X, Info, DoorOpen, Car,
  ScanLine, Search, Unlink,
} from 'lucide-react';
import {
  Button, Input, Label, Badge, AppModal, Select, SelectOption,
  Tabs, TabsContent, TabsList, TabsTrigger, Card, Checkbox,
} from '@dm3/ui';
import { useBreadcrumbStore } from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { User as UserType } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Credential {
  id: string;
  user_id: string;
  type: 'card' | 'pin' | 'qr' | 'fingerprint' | 'face';
  value: string;
  status: string;
  valid_from?: string | null;
  valid_until?: string | null;
  created_at: string;
}

interface Vehicle {
  id: string;
  plate_number: string;
  vehicle_type: string;
  brand: string;
  model: string;
  color: string;
  status: string;
  created_at: string;
}

interface AccessGroupOption {
  id: string;
  name: string;
  is_default: boolean;
  description?: string;
  access_point_count?: number;
}

interface AccessGroupAccessPoint {
  id: string;
  access_point_id: string;
  access_point?: {
    id: string;
    name: string;
    description?: string;
    zone_id?: string;
    zone?: { id: string; name: string };
  };
}

interface Department {
  id: string;
  name: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active': return 'default';
    case 'inactive': return 'secondary';
    case 'suspended': return 'destructive';
    default: return 'outline';
  }
}

const CREDENTIAL_ICON_MAP: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  card:        { icon: <CreditCard size={22} />,  color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  pin:         { icon: <KeyRound size={22} />,     color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  qr:          { icon: <QrCode size={22} />,       color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  fingerprint: { icon: <Fingerprint size={22} />,  color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  face:        { icon: <ScanLine size={22} />,     color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-500/20' },
};

// ─── Add Credential Modal ─────────────────────────────────────────────────────

interface AddCredentialModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (type: string, value: string, validUntil: string) => Promise<void>;
}

function AddCredentialModal({ open, onOpenChange, onSubmit }: AddCredentialModalProps) {
  const { t } = useTranslation('users');
  const [type, setType] = useState<string>('card');
  const [value, setValue] = useState('');
  const [validUntil, setValidUntil] = useState('3000-01-01');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setType('card'); setValue(''); setValidUntil('3000-01-01'); setError(''); };
  const handleOpenChange = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const handleSubmit = async () => {
    if (!value.trim()) { setError(t('toast.valueRequired')); return; }
    setLoading(true);
    try {
      await onSubmit(type, value.trim(), validUntil);
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
      title={<span className="flex items-center gap-2"><CreditCard size={16} /> {t('credential.addTitle')}</span>}
      size="sm"
      showCancelButton
      cancelLabel={t('actions.cancel')}
      cancelDisabled={loading}
      primaryAction={{ label: loading ? t('actions.adding') : t('actions.add'), onClick: handleSubmit, loading, disabled: loading }}
    >
      <div className="space-y-3">
        {/* Type selector — visual grid */}
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
        <div className="space-y-1">
          <Label>{t('credential.expires')}</Label>
          <Input
            type="date"
            value={validUntil === '3000-01-01' ? '' : validUntil}
            onChange={(e) => setValidUntil(e.target.value || '3000-01-01')}
            disabled={loading}
          />
          <p className="text-[11px] text-muted-foreground">{t('credential.expiryHint')}</p>
        </div>
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
    apiFetch<{ vehicles: Vehicle[] }>('/api/v1/identity/vehicles?limit=100')
      .then((data) => {
        const available = (data.vehicles || []).filter(
          (v) => !alreadyAssignedIds.includes(v.id) && v.status !== 'blacklisted'
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
        v.model?.toLowerCase().includes(q) ||
        v.vehicle_type.toLowerCase().includes(q)
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
        apiFetch(`/api/v1/identity/vehicles/${vid}`, {
          method: 'PUT',
          body: JSON.stringify({ user_id: userId }),
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
              <thead className="bg-muted/40 border-b border-border sticky top-0">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground text-[11px] uppercase">{t('vehicle.col.plate')}</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground text-[11px] uppercase">{t('vehicle.col.type')}</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground text-[11px] uppercase">{t('vehicle.col.brandModel')}</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground text-[11px] uppercase">{t('vehicle.col.color')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => toggleSelect(v.id)}
                    className={`cursor-pointer border-b border-border/30 transition-colors ${
                      selectedIds.has(v.id) ? 'bg-primary/5' : 'hover:bg-muted/20'
                    }`}
                  >
                    <td className="px-3 py-2 text-center">
                      <Checkbox
                        checked={selectedIds.has(v.id)}
                        onCheckedChange={() => toggleSelect(v.id)}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold tracking-wider">{v.plate_number}</td>
                    <td className="px-3 py-2 capitalize">{v.vehicle_type}</td>
                    <td className="px-3 py-2 text-muted-foreground">{[v.brand, v.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{v.color || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          {t('vehicle.assignHint')}
        </p>
      </div>
    </AppModal>
  );
}

// ─── Visual Card Component ────────────────────────────────────────────────────

function CredentialCard({
  cred, selected, onSelect, onDelete, deleting,
}: {
  cred: Credential;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { t } = useTranslation('users');
  const info = CREDENTIAL_ICON_MAP[cred.type] ?? CREDENTIAL_ICON_MAP.card;
  const hasExpiry = cred.valid_until && !cred.valid_until.startsWith('3000');
  return (
    <div
      className={`relative flex w-[170px] shrink-0 flex-col items-center gap-2 rounded-lg border p-4 transition-all ${
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card hover:border-ring/40'
      }`}
    >
      {/* Checkbox */}
      <div className="absolute top-2 left-2">
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={t('credential.selectLabel')}
        />
      </div>
      {/* Delete */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        disabled={deleting}
        className="absolute top-2 right-2 rounded p-0.5 text-muted-foreground/40 hover:text-destructive transition-colors cursor-pointer"
        title={t('actions.delete')}
      >
        {deleting
          ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-destructive/30 border-t-destructive" />
          : <Trash2 size={12} />}
      </button>

      {/* Icon */}
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${info.bg} ${info.color}`}>
        {info.icon}
      </div>
      {/* Type */}
      <span className="text-[12px] font-semibold capitalize text-foreground">{cred.type}</span>
      {/* Value */}
      <span className="w-full truncate text-center font-mono text-[11px] text-muted-foreground" title={cred.value}>
        {cred.value}
      </span>
      {/* Status */}
      <Badge variant={cred.status === 'active' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
        {cred.status}
      </Badge>
      {/* Expiry */}
      {hasExpiry && (
        <span className="text-[10px] text-muted-foreground">
          {t('credential.expires')}: {new Date(cred.valid_until!).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UserDetailPage
// ═══════════════════════════════════════════════════════════════════════════════

export function UserDetailPage() {
  const { t } = useTranslation('users');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setLabel = useBreadcrumbStore((s) => s.setLabel);
  const clearLabel = useBreadcrumbStore((s) => s.clearLabel);

  // ─── User state ──────────────────────────────────────────────────────────
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Reference data ──────────────────────────────────────────────────────
  const [departments, setDepartments] = useState<Department[]>([]);
  const [accessGroupOptions, setAccessGroupOptions] = useState<AccessGroupOption[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loadingCreds, setLoadingCreds] = useState(true);
  const [accessPoints, setAccessPoints] = useState<AccessGroupAccessPoint[]>([]);
  const [loadingAPs, setLoadingAPs] = useState(false);
  const [userVehicles, setUserVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);

  // ─── Profile edit ────────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState<Record<string, string | boolean>>({});
  const [saveLoading, setSaveLoading] = useState(false);

  // ─── Avatar ──────────────────────────────────────────────────────────────
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // ─── Delete ──────────────────────────────────────────────────────────────
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ─── Credentials ─────────────────────────────────────────────────────────
  const [showAddCred, setShowAddCred] = useState(false);
  const [deletingCredId, setDeletingCredId] = useState<string | null>(null);
  const [selectedCreds, setSelectedCreds] = useState<Set<string>>(new Set());
  const [bulkDeleteCredLoading, setBulkDeleteCredLoading] = useState(false);

  // ─── Access Group ────────────────────────────────────────────────────────
  const [selectedAccessGroup, setSelectedAccessGroup] = useState<string>('');
  const [savingAccessGroup, setSavingAccessGroup] = useState(false);

  // ─── Vehicle Assign ────────────────────────────────────────────────────
  const [showAssignVehicle, setShowAssignVehicle] = useState(false);
  const [unassigningVehicleId, setUnassigningVehicleId] = useState<string | null>(null);

  // ─── Breadcrumb ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (id && user?.full_name) setLabel(id, user.full_name);
    return () => { if (id) clearLabel(id); };
  }, [id, user?.full_name, setLabel, clearLabel]);

  // ─── Fetchers ────────────────────────────────────────────────────────────

  const fetchUser = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ user: UserType }>(`/api/v1/identity/users/${id}`);
      const u = data.user ?? null;
      setUser(u);
      setAvatarPreview(u?.avatar || null);
      setSelectedAccessGroup(u?.access_group_id || '');
      // Auto-fill edit form since page starts in edit mode
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
    } catch {
      setCredentials([]);
    } finally {
      setLoadingCreds(false);
    }
  }, [id]);

  const fetchUserVehicles = useCallback(async () => {
    if (!id) return;
    setLoadingVehicles(true);
    try {
      const data = await apiFetch<{ vehicles: Vehicle[] }>(`/api/v1/identity/users/${id}/vehicles`);
      setUserVehicles(data.vehicles || []);
    } catch {
      setUserVehicles([]);
    } finally {
      setLoadingVehicles(false);
    }
  }, [id]);

  const handleUnassignVehicle = useCallback(async (vehicleId: string) => {
    setUnassigningVehicleId(vehicleId);
    try {
      await apiFetch(`/api/v1/identity/vehicles/${vehicleId}`, {
        method: 'PUT',
        body: JSON.stringify({ user_id: '' }),
      });
      toast(t('toast.vehicleUnassigned'), 'success');
      fetchUserVehicles();
    } catch {
      toast(t('toast.vehicleUnassignFailed'), 'error');
    } finally {
      setUnassigningVehicleId(null);
    }
  }, [fetchUserVehicles]);

  const fetchAccessGroupAPs = useCallback(async (groupId: string) => {
    if (!groupId) { setAccessPoints([]); return; }
    setLoadingAPs(true);
    try {
      const data = await apiFetch<{ data?: AccessGroupAccessPoint[] }>(`/api/v1/access/access-groups/${groupId}/access-points`);
      setAccessPoints(data.data ?? []);
    } catch {
      setAccessPoints([]);
    } finally {
      setLoadingAPs(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
    fetchCredentials();
    fetchUserVehicles();
    apiFetch<{ departments: Department[] }>('/api/v1/identity/departments?limit=200')
      .then((d) => setDepartments(d.departments || []))
      .catch(() => {});
    apiFetch<{ data: AccessGroupOption[] }>('/api/v1/access/access-groups?limit=200')
      .then((d) => setAccessGroupOptions(d.data || []))
      .catch(() => {});
  }, [fetchUser, fetchCredentials, fetchUserVehicles]);

  // Fetch access points when selected access group changes
  useEffect(() => {
    if (selectedAccessGroup) fetchAccessGroupAPs(selectedAccessGroup);
    else setAccessPoints([]);
  }, [selectedAccessGroup, fetchAccessGroupAPs]);

  // ─── Edit handlers ───────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!id) return;
    setSaveLoading(true);
    try {
      const payload: Record<string, unknown> = { ...editForm };
      if (!payload.department_id) delete payload.department_id;
      if (!payload.birth_day) delete payload.birth_day;
      if (!payload.effective_date) delete payload.effective_date;
      if (!payload.expired_date) delete payload.expired_date;
      if (payload.sex === '') delete payload.sex;
      else payload.sex = payload.sex === 'true';

      await apiFetch(`/api/v1/identity/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (avatarFile) {
        const form = new FormData();
        form.append('avatar', avatarFile);
        await fetch(`/api/v1/identity/users/${id}/avatar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('dm3-token') ?? ''}` },
          body: form,
        });
      }

      await fetchUser();
      setAvatarFile(null);
      toast(t('toast.updated'), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.saveFailed'), 'error');
    } finally {
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
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  // ─── Credential handlers ─────────────────────────────────────────────────

  const handleAddCredential = async (type: string, value: string, validUntil: string) => {
    if (!id) return;
    const payload: Record<string, unknown> = { type, value, status: 'active' };
    if (validUntil && validUntil !== '3000-01-01') payload.valid_until = new Date(validUntil).toISOString();
    await apiFetch(`/api/v1/identity/users/${id}/credentials`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await fetchCredentials();
    toast(t('toast.credentialAdded'), 'success');
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
    } finally {
      setDeletingCredId(null);
    }
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
    } finally {
      setBulkDeleteCredLoading(false);
    }
  };

  const toggleCredSelect = (credId: string) => {
    setSelectedCreds((prev) => {
      const next = new Set(prev);
      if (next.has(credId)) next.delete(credId); else next.add(credId);
      return next;
    });
  };

  // ─── Access Group handler ────────────────────────────────────────────────

  const handleSaveAccessGroup = async () => {
    if (!id) return;
    setSavingAccessGroup(true);
    try {
      // If the user currently belongs to a different access group, remove them first
      if (user?.access_group_id && user.access_group_id !== selectedAccessGroup) {
        try {
          await apiFetch(`/api/v1/access/access-groups/${user.access_group_id}/users/${id}`, { method: 'DELETE' });
        } catch { /* may not exist, ignore */ }
      }
      // Assign to new access group
      if (selectedAccessGroup) {
        await apiFetch(`/api/v1/access/access-groups/${selectedAccessGroup}/users`, {
          method: 'POST',
          body: JSON.stringify([{ user_id: id }]),
        });
      }
      await fetchUser();
      toast(t('toast.accessGroupUpdated'), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.accessGroupFailed'), 'error');
    } finally {
      setSavingAccessGroup(false);
    }
  };

  const accessGroupChanged = selectedAccessGroup !== (user?.access_group_id || '');
  const currentAGName = useMemo(
    () => accessGroupOptions.find((ag) => ag.id === selectedAccessGroup)?.name ?? '',
    [accessGroupOptions, selectedAccessGroup],
  );

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditForm((prev) => ({ ...prev, [field]: e.target.value }));

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <User size={40} strokeWidth={1.2} />
        <p className="text-[14px]">{error ?? t('detail.userNotFound')}</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/manage/users')}>
          <ArrowLeft size={14} className="mr-1.5" /> {t('detail.backToList')}
        </Button>
      </div>
    );
  }

  const displayName = user.full_name || `${user.first_name} ${user.last_name}`;
  const initials = user.first_name && user.last_name
    ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    : displayName[0]?.toUpperCase() ?? '?';

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden" data-testid="user-detail-page">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="shrink-0">
        <div className="mb-3">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => navigate('/manage/users')}>
            <ArrowLeft size={14} className="mr-1" />
            {t('detail.backToList')}
          </Button>
        </div>

        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative">
            <button type="button" onClick={() => avatarInputRef.current?.click()} className="group relative cursor-pointer">
              <div className="h-14 w-14 overflow-hidden rounded-full border-2 border-border bg-muted flex items-center justify-center">
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" className="h-full w-full object-cover" />
                  : <span className="text-lg font-semibold text-muted-foreground">{initials}</span>}
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera size={16} className="text-white" />
              </div>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} data-testid="user-input-avatar" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[18px] font-semibold text-foreground truncate">{displayName}</h1>
              <Badge variant={statusVariant(user.status)}>{t(`status.${user.status}`, user.status)}</Badge>
              {user.is_master_card && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">{t('detail.masterBadge')}</Badge>}
            </div>
            <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
              <span className="font-mono">{user.user_code}</span>
              {user.position && <span>· {user.position}</span>}
              {user.department_name && <span>· {user.department_name}</span>}
              {user.email && <span>· {user.email}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => navigate('/manage/users')} disabled={saveLoading}>
              <X size={14} className="mr-1.5" /> {t('actions.cancel')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saveLoading} data-testid="user-button-save-form">
              <Save size={14} className="mr-1.5" />
              {saveLoading ? t('actions.saving') : t('actions.save')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteDialog(true)}
              data-testid="user-button-delete"
            >
              <Trash2 size={14} className="mr-1.5" /> {t('actions.delete')}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <Tabs defaultValue="user-info" className="flex h-full flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger value="user-info" data-testid="user-button-tab-user-info">
              <User size={14} className="mr-1.5" />
              {t('tab.userInfo')}
            </TabsTrigger>
            <TabsTrigger value="detail" data-testid="user-button-tab-detail">
              <Info size={14} className="mr-1.5" />
              {t('tab.detail')}
            </TabsTrigger>
            <TabsTrigger value="cards" data-testid="user-button-tab-card-list">
              <CreditCard size={14} className="mr-1.5" />
              {t('tab.cardList')}
              {credentials.length > 0 && (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{credentials.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="access-group" data-testid="user-button-tab-access-group">
              <DoorOpen size={14} className="mr-1.5" />
              {t('tab.accessGroup')}
            </TabsTrigger>
            <TabsTrigger value="vehicles" data-testid="user-button-tab-vehicle">
              <Car size={14} className="mr-1.5" />
              {t('tab.vehicles')}
              {userVehicles.length > 0 && (
                <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{userVehicles.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ╔══ Tab 1: User Information ════════════════════════════════════ */}
          <TabsContent value="user-info" className="mt-3 flex-1 overflow-auto pr-1">
            <div className="space-y-4">
              {/* Gender */}
              <div className="space-y-1">
                <Label>{t('modal.gender', 'Gender')}</Label>
                <div className="flex items-center gap-4">
                  {[
                    { value: 'true', label: t('modal.genderMale', 'Male') },
                    { value: 'false', label: t('modal.genderFemale', 'Female') },
                    { value: '', label: t('modal.genderNotSpecified', 'Not specified') },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5 text-[13px] cursor-pointer" data-testid={`user-radio-group-gender`}>
                      <input
                        type="radio"
                        name="sex"
                        checked={String(editForm.sex ?? '') === opt.value}
                        onChange={() => setEditForm((p) => ({ ...p, sex: opt.value }))}
                        className="accent-primary"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* First Name + Last Name */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('modal.firstName', 'First Name')} <span className="text-destructive">*</span></Label>
                  <Input value={String(editForm.first_name ?? '')} onChange={set('first_name')} placeholder="John" data-testid="user-input-first-name" />
                </div>
                <div className="space-y-1">
                  <Label>{t('modal.lastName', 'Last Name')} <span className="text-destructive">*</span></Label>
                  <Input value={String(editForm.last_name ?? '')} onChange={set('last_name')} placeholder="Doe" data-testid="user-input-last-name" />
                </div>
              </div>

              {/* Email + DOB */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('modal.email', 'Email')} <span className="text-destructive">*</span></Label>
                  <Input type="email" value={String(editForm.email ?? '')} onChange={set('email')} disabled data-testid="user-input-email" />
                </div>
                <div className="space-y-1">
                  <Label>{t('modal.dateOfBirth', 'Date of Birth')}</Label>
                  <Input type="date" value={String(editForm.birth_day ?? '')} onChange={set('birth_day')} data-testid="user-datetime-birth-day" />
                </div>
              </div>

              {/* Department + Position */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('modal.department', 'Department')}</Label>
                  <Select value={String(editForm.department_id ?? '')} onValueChange={(v) => setEditForm((p) => ({ ...p, department_id: v }))} data-testid="user-select-department-id">
                    <SelectOption value="">{t('modal.departmentNone', 'None')}</SelectOption>
                    {departments.map((d) => <SelectOption key={d.id} value={d.id}>{d.name}</SelectOption>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('modal.position', 'Position')}</Label>
                  <Input value={String(editForm.position ?? '')} onChange={set('position')} placeholder="Developer" data-testid="user-input-position-form" />
                </div>
              </div>

              {/* Effective + Expired */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('modal.effectiveDate', 'Effective Date')}</Label>
                  <Input type="date" value={String(editForm.effective_date ?? '')} onChange={set('effective_date')} />
                </div>
                <div className="space-y-1">
                  <Label>{t('modal.expiredDate', 'Expiry Date')}</Label>
                  <Input type="date" value={String(editForm.expired_date ?? '')} onChange={set('expired_date')} />
                </div>
              </div>

              {/* User Code + Master Card */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('modal.userCode', 'User Code')}</Label>
                  <p className="text-[13px] py-1 font-mono">{user.user_code || '—'}</p>
                </div>
                <div className="space-y-1">
                  <Label>{t('modal.masterCard')}</Label>
                  <div className="flex items-center gap-4 py-1">
                    {[{ value: true, label: t('modal.masterYes') }, { value: false, label: t('modal.masterNo') }].map((opt) => (
                      <label key={String(opt.value)} className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                        <input
                          type="radio"
                          name="is_master_card"
                          checked={editForm.is_master_card === opt.value}
                          onChange={() => setEditForm((p) => ({ ...p, is_master_card: opt.value }))}
                          className="accent-primary"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <Label>{t('modal.status', 'Status')}</Label>
                <Select value={String(editForm.status ?? 'active')} onValueChange={(v) => setEditForm((p) => ({ ...p, status: v }))} data-testid="user-input-status">
                  <SelectOption value="active">{t('status.active', 'Active')}</SelectOption>
                  <SelectOption value="inactive">{t('status.inactive', 'Inactive')}</SelectOption>
                  <SelectOption value="suspended">{t('status.suspended', 'Suspended')}</SelectOption>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* ╔══ Tab 2: Detail Information ══════════════════════════════════ */}
          <TabsContent value="detail" className="mt-3 flex-1 overflow-auto pr-1">
            <div className="space-y-4">
              {/* Address */}
              <div className="space-y-1">
                <Label>{t('modal.address', 'Address')}</Label>
                <Input value={String(editForm.address ?? '')} onChange={set('address')} placeholder="123 Main St…" data-testid="user-input-address" />
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <Label>{t('modal.phone', 'Phone')}</Label>
                <Input value={String(editForm.phone ?? '')} onChange={set('phone')} placeholder="+84…" data-testid="user-input-phone" />
              </div>

              {/* Created / Updated timestamps (read-only) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('modal.created')}</Label>
                  <p className="text-[13px] py-1 text-muted-foreground">
                    {user.created_on ? new Date(user.created_on).toLocaleString() : '—'}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>{t('modal.updated')}</Label>
                  <p className="text-[13px] py-1 text-muted-foreground">
                    {user.updated_on ? new Date(user.updated_on).toLocaleString() : '—'}
                  </p>
                </div>
              </div>

              {/* Account ID info */}
              {user.account_id && (
                <div className="space-y-1">
                  <Label>{t('modal.accountId')}</Label>
                  <p className="font-mono text-[12px] py-1 text-muted-foreground">{user.account_id}</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ╔══ Tab 3: Card List ═══════════════════════════════════════════ */}
          <TabsContent value="cards" className="mt-3 flex-1 overflow-auto pr-1">
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-[14px] font-medium">{t('credential.title')}</h3>
                  <p className="text-[12px] text-muted-foreground">
                    {t('credential.description')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedCreds.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
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
              </div>

              {/* Card grid */}
              {loadingCreds ? (
                <div className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  {t('credential.loading')}
                </div>
              ) : credentials.length === 0 ? (
                <Card className="flex flex-col items-center gap-2 py-12 text-muted-foreground/50">
                  <CreditCard size={36} strokeWidth={1.1} />
                  <p className="text-[13px]">{t('credential.empty')}</p>
                </Card>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {credentials.map((cred) => (
                    <CredentialCard
                      key={cred.id}
                      cred={cred}
                      selected={selectedCreds.has(cred.id)}
                      onSelect={() => toggleCredSelect(cred.id)}
                      onDelete={() => handleDeleteCredential(cred.id)}
                      deleting={deletingCredId === cred.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ╔══ Tab 4: Access Group ════════════════════════════════════════ */}
          <TabsContent value="access-group" className="mt-3 flex-1 overflow-auto pr-1">
            <div className="space-y-4">
              {/* Access group selector */}
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <Label>{t('accessGroup.title')}</Label>
                  <Select
                    value={selectedAccessGroup}
                    onValueChange={setSelectedAccessGroup}
                    data-testid="user-select-access-group-id"
                  >
                    <SelectOption value="">{t('accessGroup.none')}</SelectOption>
                    {accessGroupOptions.map((ag) => (
                      <SelectOption key={ag.id} value={ag.id}>{ag.name}</SelectOption>
                    ))}
                  </Select>
                </div>
                {accessGroupChanged && (
                  <Button
                    size="sm"
                    onClick={handleSaveAccessGroup}
                    disabled={savingAccessGroup}
                    data-testid="user-button-save-access-group"
                  >
                    <Save size={14} className="mr-1.5" />
                    {savingAccessGroup ? t('actions.saving') : t('actions.save')}
                  </Button>
                )}
                {selectedAccessGroup && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/access/access-groups/${selectedAccessGroup}`)}
                  >
                    {t('accessGroup.viewGroup')}
                  </Button>
                )}
              </div>

              {/* Assigned doors / access points list */}
              {selectedAccessGroup ? (
                <div className="space-y-2">
                  <h4 className="text-[13px] font-medium text-foreground">
                    {t('accessGroup.accessPoints')}
                    {currentAGName && <span className="ml-1 text-muted-foreground font-normal">— {currentAGName}</span>}
                  </h4>

                  {loadingAPs ? (
                    <div className="flex items-center gap-2 py-6 text-[13px] text-muted-foreground">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                      {t('accessGroup.loadingAPs')}
                    </div>
                  ) : accessPoints.length === 0 ? (
                    <Card className="flex flex-col items-center gap-2 py-8 text-muted-foreground/50">
                      <DoorOpen size={28} strokeWidth={1.2} />
                      <p className="text-[13px]">{t('accessGroup.noAPs')}</p>
                    </Card>
                  ) : (
                    <div className="rounded-md border border-border overflow-hidden">
                      {accessPoints.map((ap, i) => (
                        <div
                          key={ap.id}
                          className={`flex items-center gap-3 px-4 py-2.5 ${i < accessPoints.length - 1 ? 'border-b border-border/50' : ''}`}
                        >
                          <DoorOpen size={15} className="text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium">{ap.access_point?.name ?? ap.access_point_id}</div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              {ap.access_point?.zone && <span>{ap.access_point.zone.name}</span>}
                              {ap.access_point?.description && <span>{ap.access_point.description}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Card className="flex flex-col items-center gap-2 py-10 text-muted-foreground/50">
                  <ShieldCheck size={32} strokeWidth={1.1} />
                  <p className="text-[13px]">{t('accessGroup.selectHint')}</p>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ╔══ Tab 5: Vehicles ════════════════════════════════════════════ */}
          <TabsContent value="vehicles" className="mt-3 flex-1 overflow-auto pr-1">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[14px] font-medium">{t('vehicle.title')}</h3>
                  <p className="text-[12px] text-muted-foreground">{t('vehicle.description')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/manage/vehicles')}
                  >
                    {t('vehicle.manageAll')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowAssignVehicle(true)}
                    data-testid="user-button-add-vehicle"
                  >
                    <Plus size={14} className="mr-1.5" /> {t('vehicle.assign')}
                  </Button>
                </div>
              </div>

              {loadingVehicles ? (
                <div className="flex items-center gap-2 py-8 text-[13px] text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  {t('vehicle.loading')}
                </div>
              ) : userVehicles.length === 0 ? (
                <Card className="flex flex-col items-center gap-2 py-10 text-muted-foreground/50">
                  <Car size={32} strokeWidth={1.1} />
                  <p className="text-[13px]">{t('vehicle.empty')}</p>
                </Card>
              ) : (
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead className="bg-muted/40 border-b border-border">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{t('vehicle.col.plate')}</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{t('vehicle.col.type')}</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{t('vehicle.col.brandModel')}</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{t('vehicle.col.color')}</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{t('vehicle.col.status')}</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{t('vehicle.col.action')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userVehicles.map((v, i) => (
                        <tr key={v.id} className={`${i < userVehicles.length - 1 ? 'border-b border-border/50' : ''} hover:bg-muted/20 transition-colors`}>
                          <td className="px-4 py-2.5 font-mono font-semibold tracking-wider">{v.plate_number}</td>
                          <td className="px-4 py-2.5 capitalize">{v.vehicle_type}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{[v.brand, v.model].filter(Boolean).join(' ') || '—'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{v.color || '—'}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant={v.status === 'active' ? 'default' : v.status === 'blacklisted' ? 'destructive' : 'secondary'}>
                              {v.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleUnassignVehicle(v.id)}
                              disabled={unassigningVehicleId === v.id}
                              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 cursor-pointer"
                              title={t('vehicle.unassignTitle')}
                              data-testid={`user-button-unassign-vehicle-${v.id}`}
                            >
                              {unassigningVehicleId === v.id
                                ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-destructive/30 border-t-destructive" />
                                : <Unlink size={13} />}
                              {t('vehicle.unassign')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      <AddCredentialModal
        open={showAddCred}
        onOpenChange={setShowAddCred}
        onSubmit={handleAddCredential}
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
