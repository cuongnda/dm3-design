import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Shield, Plus, Trash2, DoorOpen, Users, Edit,
} from 'lucide-react';
import {
  Button, Input, Label, Badge, AppModal,
  DataTable, type Column,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Select, SelectOption, Checkbox, TablePaginationFooter,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import type { AccessPoint, AccessPointDoor } from './types';

// ---------------------------------------------------------------------------
// Types local to this page
// ---------------------------------------------------------------------------

interface AccessGroup {
  id: string;
  name: string;
  description?: string;
  member_count?: number;
}

// ---------------------------------------------------------------------------
// Add Door Modal
// ---------------------------------------------------------------------------

const DOOR_ROLES = [
  { value: 'reader_in', label: 'Reader In' },
  { value: 'reader_out', label: 'Reader Out' },
  { value: 'controller', label: 'Controller' },
  { value: 'camera', label: 'Camera' },
] as const;

interface AvailableDoor {
  id: string;
  name: string;
  type?: string;
  status?: string;
}

interface AddDoorModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  linkedDoorIds: string[];
  onSubmit: (door_ids: string[], role: string) => Promise<boolean>;
}

function AddDoorModal({ open, onOpenChange, linkedDoorIds, onSubmit }: AddDoorModalProps) {
  const { t } = useTranslation('accessPoints');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [role, setRole] = useState('reader_in');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [allDoors, setAllDoors] = useState<AvailableDoor[]>([]);
  const [loadingDoors, setLoadingDoors] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!open) return;
    setLoadingDoors(true);
    apiFetch<{ data?: AvailableDoor[] }>('/api/v1/doors?limit=200')
      .then((res) => setAllDoors(res.data ?? []))
      .catch(() => setAllDoors([]))
      .finally(() => setLoadingDoors(false));
  }, [open]);

  const availableDoors = useMemo(
    () => allDoors.filter((d) => !linkedDoorIds.includes(d.id)),
    [allDoors, linkedDoorIds],
  );

  const filteredDoors = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? availableDoors.filter((d) => d.name.toLowerCase().includes(q) || d.type?.toLowerCase().includes(q))
      : availableDoors;
  }, [availableDoors, search]);

  // Reset to page 1 when search or available doors change
  useEffect(() => { setPage(1); }, [search, availableDoors.length]);

  const totalPages = Math.max(1, Math.ceil(filteredDoors.length / PAGE_SIZE));
  const pagedDoors = filteredDoors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const allFilteredSelected = filteredDoors.length > 0 && filteredDoors.every((d) => selected.has(d.id));
  const someFilteredSelected = filteredDoors.some((d) => selected.has(d.id));
  const allPageSelected = pagedDoors.length > 0 && pagedDoors.every((d) => selected.has(d.id));
  const somePageSelected = pagedDoors.some((d) => selected.has(d.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredDoors.forEach((d) => next.delete(d.id));
      } else {
        filteredDoors.forEach((d) => next.add(d.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setSelected(new Set());
      setRole('reader_in');
      setError('');
      setSearch('');
      setPage(1);
    }
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (selected.size === 0) {
      setError(t('selectDoorRequired'));
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit([...selected], role);
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={handleOpenChange}
      title={
        <span className="flex items-center gap-2">
          <DoorOpen size={16} />
          {t('addDoor', 'Add Door')}
        </span>
      }
      size="md"
      showCancelButton
      cancelLabel={t('cancel', 'Cancel')}
      errorMessage={error || undefined}
      primaryAction={{
        label: submitting
          ? t('adding')
          : selected.size > 0
            ? t('addNDoors', { count: selected.size })
            : t('add'),
        onClick: handleSubmit,
        disabled: submitting || selected.size === 0,
        loading: submitting,
      }}
    >
      <div className="space-y-3">
        {/* Role selector */}
        <div className="flex items-center gap-3">
          <Label className="shrink-0">{t('role')}</Label>
          <Select
            value={role}
            onValueChange={setRole}
            disabled={submitting}
            className="w-44"
          >
            {DOOR_ROLES.map((r) => (
              <SelectOption key={r.value} value={r.value}>{r.label}</SelectOption>
            ))}
          </Select>
        </div>

        {/* Search */}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchDoors')}
          className="h-8 text-[13px]"
          disabled={submitting}
        />

        {/* Door table */}
        <div className="rounded-md border border-border overflow-hidden">
          {loadingDoors ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              Loading…
            </div>
          ) : availableDoors.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              {allDoors.length === 0
                ? t('noDoorsInSystem')
                : t('allDoorsAssigned')}
            </div>
          ) : filteredDoors.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              {t('noDoorsMatch')}
            </div>
          ) : (
            <>
              <table className="w-full text-[13px]">
                <thead className="bg-muted/60 border-b border-border">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left">
                      <Checkbox
                        checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                        onCheckedChange={toggleAll}
                        disabled={submitting}
                      />
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('doorName')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('doorType')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDoors.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => !submitting && toggleOne(d.id)}
                      className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <td className="w-10 px-3 py-2">
                        <Checkbox
                          checked={selected.has(d.id)}
                          onCheckedChange={() => toggleOne(d.id)}
                          disabled={submitting}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground">{d.name}</td>
                      <td className="px-3 py-2">
                        {d.type ? (
                          <Badge variant="outline" className="text-[11px]">{d.type}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <DoorStatusBadge status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePaginationFooter
                page={page}
                pageSize={PAGE_SIZE}
                total={filteredDoors.length}
                totalPages={totalPages}
                onPageChange={setPage}
                loading={loadingDoors}
                className="border-t border-border"
              />
            </>
          )}
        </div>

        {selected.size > 0 && (
          <p className="text-[12px] text-muted-foreground">
            {t('doorsSelected', { count: selected.size })}
          </p>
        )}
      </div>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// Add Access Group Modal
// ---------------------------------------------------------------------------

interface AvailableGroup {
  id: string;
  name: string;
  user_count?: number;
}

interface AddAccessGroupModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  linkedGroupIds: string[];
  onSubmit: (groupId: string) => Promise<boolean>;
}

function AddAccessGroupModal({ open, onOpenChange, linkedGroupIds, onSubmit }: AddAccessGroupModalProps) {
  const { t } = useTranslation('accessPoints');
  const [selectedId, setSelectedId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [allGroups, setAllGroups] = useState<AvailableGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!open) return;
    setLoadingGroups(true);
    apiFetch<{ data?: AvailableGroup[] }>('/api/v1/access-groups?limit=200')
      .then((res) => setAllGroups(res.data ?? []))
      .catch(() => setAllGroups([]))
      .finally(() => setLoadingGroups(false));
  }, [open]);

  const availableGroups = useMemo(
    () => allGroups.filter((g) => !linkedGroupIds.includes(g.id)),
    [allGroups, linkedGroupIds],
  );

  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase();
    return q ? availableGroups.filter((g) => g.name.toLowerCase().includes(q)) : availableGroups;
  }, [availableGroups, search]);

  useEffect(() => { setPage(1); }, [search, availableGroups.length]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const pagedGroups = filteredGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setSelectedId('');
      setError('');
      setSearch('');
      setPage(1);
    }
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!selectedId) {
      setError(t('selectGroupRequired'));
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit(selectedId);
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={handleOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Users size={16} />
          {t('addGroup')}
        </span>
      }
      size="md"
      showCancelButton
      cancelLabel={t('cancel')}
      errorMessage={error || undefined}
      primaryAction={{
        label: submitting ? t('adding') : t('add'),
        onClick: handleSubmit,
        disabled: submitting || !selectedId,
        loading: submitting,
      }}
    >
      <div className="space-y-3">
        {/* Search */}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchGroups')}
          className="h-8 text-[13px]"
          disabled={submitting}
        />

        {/* Group table */}
        <div className="rounded-md border border-border overflow-hidden">
          {loadingGroups ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              Loading…
            </div>
          ) : availableGroups.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              {allGroups.length === 0
                ? t('noGroupsInSystem')
                : t('allGroupsAssigned')}
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              {t('noGroupsMatch')}
            </div>
          ) : (
            <>
              <table className="w-full text-[13px]">
                <thead className="bg-muted/60 border-b border-border">
                  <tr>
                    <th className="w-8 px-3 py-2" />
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('groupName')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('members')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedGroups.map((g) => {
                    const isSelected = selectedId === g.id;
                    return (
                      <tr
                        key={g.id}
                        onClick={() => !submitting && setSelectedId(isSelected ? '' : g.id)}
                        className={`border-b border-border last:border-0 cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/10' : 'hover:bg-muted/40'
                        }`}
                      >
                        <td className="w-8 px-3 py-2">
                          <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                            isSelected
                              ? 'border-primary bg-primary'
                              : 'border-muted-foreground/40'
                          }`}>
                            {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">{g.name}</td>
                        <td className="px-3 py-2">
                          {g.user_count != null ? (
                            <Badge variant="secondary" className="text-[11px]">{g.user_count}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <TablePaginationFooter
                page={page}
                pageSize={PAGE_SIZE}
                total={filteredGroups.length}
                totalPages={totalPages}
                onPageChange={setPage}
                loading={loadingGroups}
                className="border-t border-border"
              />
            </>
          )}
        </div>
      </div>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// Door status badge helper
// ---------------------------------------------------------------------------

function DoorStatusBadge({ status }: { status?: string }) {
  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    online: 'default',
    offline: 'secondary',
    alarm: 'destructive',
    warning: 'outline',
  };
  const v = status ? (variantMap[status] ?? 'outline') : 'outline';
  return <Badge variant={v}>{status ?? '—'}</Badge>;
}

function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
  if (role === 'reader_in' || role === 'reader_out') return 'default';
  if (role === 'controller') return 'secondary';
  return 'outline';
}

function roleLabel(role: string): string {
  return DOOR_ROLES.find((r) => r.value === role)?.label ?? role;
}

// ---------------------------------------------------------------------------
// AccessPointDetailPage
// ---------------------------------------------------------------------------

export function AccessPointDetailPage() {
  const { t } = useTranslation('accessPoints');
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // AP details
  const [ap, setAP] = useState<AccessPoint | null>(null);
  const [apLoading, setAPLoading] = useState(true);

  // Doors tab
  const [doors, setDoors] = useState<AccessPointDoor[]>([]);
  const [doorsLoading, setDoorsLoading] = useState(false);
  const [showAddDoorModal, setShowAddDoorModal] = useState(false);
  const [removingDoorId, setRemovingDoorId] = useState<string | null>(null);

  // Access Groups tab
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [removingGroupId, setRemovingGroupId] = useState<string | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState<'doors' | 'groups'>('doors');

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '', zone_id: '', access_time_id: '' });
  const [editNameError, setEditNameError] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);
  const [accessTimes, setAccessTimes] = useState<{ id: string; name: string }[]>([]);

  // ── Fetch AP details ────────────────────────────────────────────────────

  const fetchAP = useCallback(async () => {
    if (!id) return;
    setAPLoading(true);
    try {
      const data = await apiFetch<AccessPoint | { access_point: AccessPoint }>(
        `/api/v1/access-points/${id}`,
      );
      // handle both flat and wrapped responses
      setAP('access_point' in (data as object) ? (data as { access_point: AccessPoint }).access_point : (data as AccessPoint));
    } catch (err) {
      console.error('Failed to fetch access point:', err);
    } finally {
      setAPLoading(false);
    }
  }, [id]);

  // ── Fetch doors ─────────────────────────────────────────────────────────

  const fetchDoors = useCallback(async () => {
    if (!id) return;
    setDoorsLoading(true);
    try {
      const data = await apiFetch<{ doors?: AccessPointDoor[]; data?: AccessPointDoor[] }>(
        `/api/v1/access-points/${id}/doors`,
      );
      setDoors(data.doors ?? data.data ?? (data as unknown as AccessPointDoor[]));
    } catch (err) {
      console.error('Failed to fetch doors:', err);
    } finally {
      setDoorsLoading(false);
    }
  }, [id]);

  const handleAddDoor = useCallback(
    async (door_ids: string[], role: string): Promise<boolean> => {
      if (!id) return false;
      try {
        await Promise.all(
          door_ids.map((door_id) =>
            apiFetch(`/api/v1/access-points/${id}/doors`, {
              method: 'POST',
              body: JSON.stringify({ door_id, role }),
            }),
          ),
        );
        await fetchDoors();
        await fetchAP();
        return true;
      } catch (err) {
        console.error('Failed to add door:', err);
        return false;
      }
    },
    [id, fetchDoors, fetchAP],
  );

  const handleRemoveDoor = useCallback(
    async (doorId: string) => {
      if (!id) return;
      setRemovingDoorId(doorId);
      try {
        await apiFetch(`/api/v1/access-points/${id}/doors/${doorId}`, {
          method: 'DELETE',
        });
        await fetchDoors();
        await fetchAP();
      } catch (err) {
        console.error('Failed to remove door:', err);
      } finally {
        setRemovingDoorId(null);
      }
    },
    [id, fetchDoors, fetchAP],
  );

  // ── Fetch access groups ─────────────────────────────────────────────────

  const fetchGroups = useCallback(async () => {
    if (!id) return;
    setGroupsLoading(true);
    try {
      const data = await apiFetch<{ access_groups?: AccessGroup[]; data?: AccessGroup[] }>(
        `/api/v1/access-points/${id}/access-groups`,
      );
      setGroups(
        data.access_groups ?? data.data ?? (data as unknown as AccessGroup[]),
      );
    } catch (err) {
      console.error('Failed to fetch access groups:', err);
    } finally {
      setGroupsLoading(false);
    }
  }, [id]);

  const handleAddGroup = useCallback(
    async (groupId: string): Promise<boolean> => {
      if (!id) return false;
      try {
        await apiFetch(`/api/v1/access-points/${id}/access-groups`, {
          method: 'POST',
          body: JSON.stringify({ access_group_id: groupId }),
        });
        await fetchGroups();
        return true;
      } catch (err) {
        console.error('Failed to add access group:', err);
        return false;
      }
    },
    [id, fetchGroups],
  );

  const handleRemoveGroup = useCallback(
    async (groupId: string) => {
      if (!id) return;
      setRemovingGroupId(groupId);
      try {
        await apiFetch(`/api/v1/access-points/${id}/access-groups/${groupId}`, {
          method: 'DELETE',
        });
        await fetchGroups();
      } catch (err) {
        console.error('Failed to remove access group:', err);
      } finally {
        setRemovingGroupId(null);
      }
    },
    [id, fetchGroups],
  );

  // ── Initial load ────────────────────────────────────────────────────────

  useEffect(() => {
    fetchAP();
    fetchDoors();
    fetchGroups();
  }, [fetchAP, fetchDoors, fetchGroups]);

  // ── Edit handlers ───────────────────────────────────────────────────────

  const openEditModal = useCallback(() => {
    if (!ap) return;
    setEditForm({
      name: ap.name,
      description: ap.description ?? '',
      zone_id: ap.zone_id ?? '',
      access_time_id: ap.access_time_id ?? '',
    });
    setEditNameError('');
    // load zones + access times lazily
    Promise.all([
      apiFetch<{ data?: { id: string; name: string }[] }>('/api/v1/zones?limit=200'),
      apiFetch<{ data?: { id: string; name: string }[] }>('/api/v1/access-times?limit=200'),
    ]).then(([zRes, atRes]) => {
      setZones(zRes.data ?? []);
      setAccessTimes(atRes.data ?? []);
    }).catch(() => {});
    setShowEditModal(true);
  }, [ap]);

  const handleEditSubmit = useCallback(async () => {
    if (!id || !ap) return;
    if (!editForm.name.trim()) {
      setEditNameError(t('validation.nameRequired', 'Name is required'));
      return;
    }
    setSubmittingEdit(true);
    try {
      const payload: Record<string, string | undefined> = {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        zone_id: editForm.zone_id || undefined,
        access_time_id: editForm.access_time_id || undefined,
      };
      await apiFetch(`/api/v1/access-points/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await fetchAP();
      setShowEditModal(false);
    } catch (err) {
      console.error('Failed to update access point:', err);
    } finally {
      setSubmittingEdit(false);
    }
  }, [id, ap, editForm, fetchAP, t]);

  // ── Column definitions ──────────────────────────────────────────────────

  const doorColumns = useMemo((): Column<AccessPointDoor>[] => [
    {
      key: 'door_name',
      header: t('doorName', 'Door Name'),
      render: (d) => (
        <span className="text-[13px] font-medium">{d.door?.name ?? d.door_id}</span>
      ),
    },
    {
      key: 'door_type',
      header: t('doorType', 'Type'),
      render: (d) =>
        d.door?.type ? (
          <Badge variant="outline">{d.door.type}</Badge>
        ) : (
          <span className="text-[12px] text-muted-foreground">—</span>
        ),
    },
    {
      key: 'role',
      header: t('role', 'Role'),
      render: (d) => (
        <Badge variant={roleBadgeVariant(d.role)}>{roleLabel(d.role)}</Badge>
      ),
    },
    {
      key: 'door_status',
      header: t('status', 'Status'),
      render: (d) => <DoorStatusBadge status={d.door?.status} />,
    },
    {
      key: 'actions',
      header: '',
      width: '80px',
      render: (d) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[12px] text-destructive hover:text-destructive"
          onClick={() => handleRemoveDoor(d.door_id)}
          disabled={removingDoorId === d.door_id}
        >
          <Trash2 size={13} className="mr-1" />
          {removingDoorId === d.door_id ? t('removing', 'Removing…') : t('remove', 'Remove')}
        </Button>
      ),
    },
  ], [t, handleRemoveDoor, removingDoorId]);

  const groupColumns = useMemo((): Column<AccessGroup>[] => [
    {
      key: 'name',
      header: t('groupName', 'Group Name'),
      render: (g) => (
        <div className="flex items-center gap-2">
          <Users size={14} className="text-primary shrink-0" />
          <div>
            <div className="text-[13px] font-medium">{g.name}</div>
            {g.description && (
              <div className="text-[11px] text-muted-foreground">{g.description}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'member_count',
      header: t('members', 'Members'),
      width: '80px',
      render: (g) =>
        g.member_count != null ? (
          <Badge variant="secondary">{g.member_count}</Badge>
        ) : (
          <span className="text-[12px] text-muted-foreground">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: '80px',
      render: (g) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[12px] text-destructive hover:text-destructive"
          onClick={() => handleRemoveGroup(g.id)}
          disabled={removingGroupId === g.id}
        >
          <Trash2 size={13} className="mr-1" />
          {removingGroupId === g.id ? t('removing', 'Removing…') : t('remove', 'Remove')}
        </Button>
      ),
    },
  ], [t, handleRemoveGroup, removingGroupId]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (apLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!ap) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Shield size={36} className="opacity-40" />
        <p className="text-[14px]">{t('notFound', 'Access point not found')}</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/access/access-points')}>
          <ArrowLeft size={14} className="mr-1.5" />
          {t('backToList', 'Back to Access Points')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
      {/* Page header */}
      <div className="flex shrink-0 items-start justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="mt-0.5 shrink-0"
            onClick={() => navigate('/access/access-points')}
          >
            <ArrowLeft size={14} className="mr-1.5" />
            {t('backToList', 'Access Points')}
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              <h1 className="text-[18px] font-semibold text-foreground">{ap.name}</h1>
            </div>
            {ap.description && (
              <p className="mt-0.5 text-[13px] text-muted-foreground">{ap.description}</p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={openEditModal}
        >
          <Edit size={14} className="mr-1.5" />
          {t('edit', 'Edit')}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'doors' | 'groups')}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      >
        {/* Card header: tabs + action button */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
          <TabsList variant="line">
            <TabsTrigger value="doors" className="text-[12px] px-3 whitespace-nowrap">
              <DoorOpen size={13} className="mr-1.5" />
              {t('doorsTab', 'Doors')} ({doors.length})
            </TabsTrigger>
            <TabsTrigger value="groups" className="text-[12px] px-3 whitespace-nowrap">
              <Users size={13} className="mr-1.5" />
              {t('groupsTab', 'Access Groups')} ({groups.length})
            </TabsTrigger>
          </TabsList>

          {activeTab === 'doors' && (
            <Button size="sm" onClick={() => setShowAddDoorModal(true)}>
              <Plus size={14} className="mr-1.5" />
              {t('addDoor', 'Add Door')}
            </Button>
          )}
          {activeTab === 'groups' && (
            <Button size="sm" onClick={() => setShowAddGroupModal(true)}>
              <Plus size={14} className="mr-1.5" />
              {t('addGroup', 'Add Group')}
            </Button>
          )}
        </div>

        {/* Doors tab content */}
        <TabsContent value="doors" className="min-h-0 flex-1 overflow-auto">
          {doorsLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
          ) : doors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <DoorOpen size={36} className="mb-3 text-muted-foreground/40" />
              <p className="text-[13px] font-medium text-foreground">
                {t('noDoorsTitle', 'No doors linked')}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t('noDoorsHint', 'Click "Add Door" to link a door to this access point.')}
              </p>
            </div>
          ) : (
            <DataTable
              embedded
              stickyHeader
              paginate={false}
              columns={doorColumns}
              data={doors}
              rowKey={(d) => d.id}
            />
          )}
        </TabsContent>

        {/* Access Groups tab content */}
        <TabsContent value="groups" className="min-h-0 flex-1 overflow-auto">
          {groupsLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users size={36} className="mb-3 text-muted-foreground/40" />
              <p className="text-[13px] font-medium text-foreground">
                {t('noGroupsTitle', 'No access groups linked')}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t('noGroupsHint', 'Click "Add Group" to grant an access group entry via this point.')}
              </p>
            </div>
          ) : (
            <DataTable
              embedded
              stickyHeader
              paginate={false}
              columns={groupColumns}
              data={groups}
              rowKey={(g) => g.id}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Add Door Modal */}
      <AddDoorModal
        open={showAddDoorModal}
        onOpenChange={setShowAddDoorModal}
        linkedDoorIds={doors.map((d) => d.door_id)}
        onSubmit={handleAddDoor}
      />

      {/* Add Access Group Modal */}
      <AddAccessGroupModal
        open={showAddGroupModal}
        onOpenChange={setShowAddGroupModal}
        linkedGroupIds={groups.map((g) => g.id)}
        onSubmit={handleAddGroup}
      />

      {/* Edit Access Point Modal */}
      <AppModal
        open={showEditModal}
        onOpenChange={(v) => { if (!v) setShowEditModal(false); }}
        title={
          <span className="flex items-center gap-2">
            <Edit size={16} className="text-primary" />
            {t('editTitle', 'Edit Access Point')}
          </span>
        }
        size="sm"
        showCancelButton
        cancelLabel={t('cancel', 'Cancel')}
        primaryAction={{
          label: submittingEdit ? t('saving', 'Saving…') : t('save', 'Save'),
          onClick: handleEditSubmit,
          disabled: submittingEdit,
        }}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-ap-name">{t('name', 'Name')} *</Label>
            <Input
              id="edit-ap-name"
              value={editForm.name}
              onChange={(e) => { setEditForm((p) => ({ ...p, name: e.target.value })); setEditNameError(''); }}
              placeholder={t('namePlaceholder', 'e.g. Main Entrance')}
              className={editNameError ? 'border-destructive' : ''}
              disabled={submittingEdit}
            />
            {editNameError && <p className="mt-1 text-[11px] text-destructive">{editNameError}</p>}
          </div>
          <div>
            <Label htmlFor="edit-ap-desc">{t('description', 'Description')}</Label>
            <Input
              id="edit-ap-desc"
              value={editForm.description}
              onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
              placeholder={t('descriptionPlaceholder', 'Optional description')}
              disabled={submittingEdit}
            />
          </div>
          <div>
            <Label>{t('zone', 'Zone')}</Label>
            <Select
              value={editForm.zone_id}
              onValueChange={(v) => setEditForm((p) => ({ ...p, zone_id: v }))}
              placeholder={t('noZone', '— No zone —')}
              disabled={submittingEdit}
            >
              <SelectOption value="">{t('noZone', '— No zone —')}</SelectOption>
              {zones.map((z) => (
                <SelectOption key={z.id} value={z.id}>{z.name}</SelectOption>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('accessTime', 'Access Time')}</Label>
            <Select
              value={editForm.access_time_id}
              onValueChange={(v) => setEditForm((p) => ({ ...p, access_time_id: v }))}
              placeholder={t('noRestriction', 'No restriction (24/7)')}
              disabled={submittingEdit}
            >
              <SelectOption value="">{t('noRestriction', 'No restriction (24/7)')}</SelectOption>
              {accessTimes.map((at) => (
                <SelectOption key={at.id} value={at.id}>{at.name}</SelectOption>
              ))}
            </Select>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
