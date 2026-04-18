import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Shield, Edit, Trash2, Plus, Users, UserCircle, Clock, DoorOpen,
} from 'lucide-react';
import {
  Button, Input, Label,
  Badge, AppModal,
  DataTable, type Column,
  TablePaginationFooter, Checkbox,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useBreadcrumbStore } from '@dm3/ui';
import type { AccessGroup, AccessGroupAccessPoint, AccessGroupFormData, AccessTime } from './types';
import type { User } from '@/features/user-management/types';
import { buildZonePathMap, ZonePathLabel, type ZoneRef } from '../shared/zone-path';
import { WeekdayStrip } from '../access-times/components/WeekdayStrip';
import type { AccessTimeSlot as AccessTimeSlotFull } from '../access-times/types';

interface GroupUser {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  position?: string;
  status: string;
  effective_from?: string;
  effective_to?: string;
}

// ---------------------------------------------------------------------------
// Add Access Point Modal
// ---------------------------------------------------------------------------

interface AvailableAP {
  id: string;
  name: string;
  description?: string;
  zone_id?: string | null;
}

interface AddAccessPointModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  linkedAPIds: string[];
  onSubmit: (accessPointIds: string[]) => Promise<boolean>;
}

function AddAccessPointModal({ open, onOpenChange, linkedAPIds, onSubmit }: AddAccessPointModalProps) {
  const { t } = useTranslation('accessGroups');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [allAPs, setAllAPs] = useState<AvailableAP[]>([]);
  const [zones, setZones] = useState<ZoneRef[]>([]);
  const [loadingAPs, setLoadingAPs] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      apiFetch<{ data?: AvailableAP[] }>('/api/v1/access/access-points?limit=200'),
      apiFetch<{ data?: ZoneRef[] }>('/api/v1/access/zones?limit=500'),
    ])
      .then(([apsRes, zonesRes]) => {
        if (cancelled) return;
        setAllAPs(apsRes.data ?? []);
        setZones(zonesRes.data ?? []);
        setLoadingAPs(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAllAPs([]);
        setZones([]);
        setLoadingAPs(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  const zonePathById = useMemo(() => buildZonePathMap(zones), [zones]);

  const availableAPs = useMemo(
    () => allAPs.filter((ap) => !linkedAPIds.includes(ap.id)),
    [allAPs, linkedAPIds],
  );

  const filteredAPs = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return availableAPs;
    return availableAPs.filter((ap) => {
      const zonePath = ap.zone_id ? (zonePathById.get(ap.zone_id) ?? '') : '';
      return (
        ap.name.toLowerCase().includes(q) ||
        (ap.description ?? '').toLowerCase().includes(q) ||
        zonePath.toLowerCase().includes(q)
      );
    });
  }, [availableAPs, search, zonePathById]);

  const totalPages = Math.max(1, Math.ceil(filteredAPs.length / PAGE_SIZE));
  const pagedAPs = filteredAPs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allFilteredSelected = filteredAPs.length > 0 && filteredAPs.every((ap) => selected.has(ap.id));
  const someFilteredSelected = filteredAPs.some((ap) => selected.has(ap.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredAPs.forEach((ap) => next.delete(ap.id));
      } else {
        filteredAPs.forEach((ap) => next.add(ap.id));
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
      setError('');
      setSearch('');
      setPage(1);
      setAllAPs([]);
      setZones([]);
      setLoadingAPs(true);
    }
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (selected.size === 0) {
      setError(t('selectAccessPointRequired', 'Please select at least one access point'));
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit([...selected]);
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={handleOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Shield size={16} />
          {t('addAccessPoint', 'Add Access Point')}
        </span>
      }
      size="lg"
      showCancelButton
      cancelLabel={t('cancel', 'Cancel')}
      errorMessage={error || undefined}
      primaryAction={{
        label: submitting
          ? t('adding', 'Adding...')
          : selected.size > 0
            ? t('addNAccessPoints', { defaultValue: 'Add ({{count}})', count: selected.size })
            : t('add', 'Add'),
        onClick: handleSubmit,
        disabled: submitting || selected.size === 0,
        loading: submitting,
      }}
    >
      <div className="space-y-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchAccessPoints', 'Search access points…')}
          className="h-8 text-[13px]"
          disabled={submitting}
          data-testid="access-input-searchAP"
        />

        <div className="rounded-md border border-border overflow-hidden">
          {loadingAPs ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              Loading…
            </div>
          ) : availableAPs.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              {allAPs.length === 0
                ? t('noAccessPointsInSystem', 'No access points found in the system.')
                : t('allAccessPointsAssigned', 'All access points are already assigned to this group.')}
            </div>
          ) : filteredAPs.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              {t('noAPsMatch', 'No access points match your search.')}
            </div>
          ) : (
            <>
              <table className="w-full text-[13px]">
                <thead className="bg-muted/60 border-b border-border">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left">
                      <Checkbox
                        checked={allFilteredSelected}
                        indeterminate={someFilteredSelected && !allFilteredSelected}
                        onCheckedChange={toggleAll}
                        disabled={submitting}
                      />
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('columns.accessPointName', 'Access Point')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('columns.zone', 'Zone')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('columns.description', 'Description')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAPs.map((ap) => {
                    const zonePath = ap.zone_id ? zonePathById.get(ap.zone_id) : undefined;
                    return (
                      <tr
                        key={ap.id}
                        onClick={() => !submitting && toggleOne(ap.id)}
                        className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <td className="w-10 px-3 py-2">
                          <Checkbox
                            checked={selected.has(ap.id)}
                            onCheckedChange={() => toggleOne(ap.id)}
                            disabled={submitting}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">{ap.name}</td>
                        <td className="px-3 py-2">
                          {zonePath ? (
                            <ZonePathLabel path={zonePath} />
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{ap.description ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <TablePaginationFooter
                page={page}
                pageSize={PAGE_SIZE}
                total={filteredAPs.length}
                totalPages={totalPages}
                onPageChange={setPage}
                loading={loadingAPs}
                className="border-t border-border"
              />
            </>
          )}
        </div>

        {selected.size > 0 && (
          <p className="text-[12px] text-muted-foreground">
            {t('accessPointsSelected', { defaultValue: '{{count}} access point(s) selected', count: selected.size })}
          </p>
        )}
      </div>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// Add User Modal
// ---------------------------------------------------------------------------

interface AvailableUser {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  position: string;
  department_name: string;
  status: string;
}

interface AddUserModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  linkedUserIds: string[];
  onSubmit: (userIds: string[]) => Promise<boolean>;
}

function AddUserModal({ open, onOpenChange, linkedUserIds, onSubmit }: AddUserModalProps) {
  const { t } = useTranslation('accessGroups');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [allUsers, setAllUsers] = useState<AvailableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch<{ users?: AvailableUser[] }>('/api/v1/identity/users?limit=100&status=active')
      .then((res) => { if (!cancelled) { setAllUsers(res.users ?? []); setLoadingUsers(false); } })
      .catch(() => { if (!cancelled) { setAllUsers([]); setLoadingUsers(false); } });
    return () => { cancelled = true; };
  }, [open]);

  const availableUsers = useMemo(
    () => allUsers.filter((u) => !linkedUserIds.includes(u.id)),
    [allUsers, linkedUserIds],
  );

  const departments = useMemo(
    () => [...new Set(availableUsers.map((u) => u.department_name).filter(Boolean))].sort(),
    [availableUsers],
  );

  const filteredUsers = useMemo(() => {
    let result = availableUsers;
    if (deptFilter) {
      result = result.filter((u) => u.department_name === deptFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.position?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [availableUsers, search, deptFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selected.has(u.id));
  const someFilteredSelected = filteredUsers.some((u) => selected.has(u.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredUsers.forEach((u) => next.delete(u.id));
      } else {
        filteredUsers.forEach((u) => next.add(u.id));
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
      setError('');
      setSearch('');
      setDeptFilter('');
      setPage(1);
      setAllUsers([]);
      setLoadingUsers(true);
    }
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (selected.size === 0) {
      setError(t('selectUserRequired', 'Please select at least one user'));
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit([...selected]);
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
          {t('addUser', 'Add User')}
        </span>
      }
      size="lg"
      showCancelButton
      cancelLabel={t('cancel', 'Cancel')}
      errorMessage={error || undefined}
      primaryAction={{
        label: submitting
          ? t('adding')
          : selected.size > 0
            ? t('addNUsers', { count: selected.size })
            : t('add'),
        onClick: handleSubmit,
        disabled: submitting || selected.size === 0,
        loading: submitting,
      }}
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchUsers', 'Search users…')}
            className="h-8 text-[13px] flex-1"
            disabled={submitting}
          />
          {departments.length > 0 && (
            <select
              value={deptFilter}
              onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
              className="h-8 px-2 text-[13px] border border-border rounded-md bg-input text-foreground min-w-[140px] appearance-none cursor-pointer"
              disabled={submitting}
              data-testid="access-select-deptFilter"
            >
              <option value="">{t('allDepartments', 'All departments')}</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
        </div>

        <div className="rounded-md border border-border overflow-hidden">
          {loadingUsers ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              Loading…
            </div>
          ) : availableUsers.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              {allUsers.length === 0
                ? t('noUsersInSystem', 'No users found in the system.')
                : t('allUsersInGroup', 'All users are already in this group.')}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              {t('noUsersMatchSearch', 'No users match your search.')}
            </div>
          ) : (
            <>
              <table className="w-full text-[13px]">
                <thead className="bg-muted/60 border-b border-border">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left">
                      <Checkbox
                        checked={allFilteredSelected}
                        indeterminate={someFilteredSelected && !allFilteredSelected}
                        onCheckedChange={toggleAll}
                        disabled={submitting}
                      />
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('userColumns.name', 'Name')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('userColumns.department', 'Department')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('userColumns.position', 'Position')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('userColumns.status', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => !submitting && toggleOne(u.id)}
                      className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <td className="w-10 px-3 py-2">
                        <Checkbox
                          checked={selected.has(u.id)}
                          onCheckedChange={() => toggleOne(u.id)}
                          disabled={submitting}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{u.full_name}</div>
                        {u.email && <div className="text-[11px] text-muted-foreground">{u.email}</div>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{u.department_name || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{u.position || '—'}</td>
                      <td className="px-3 py-2">
                        <Badge variant={u.status === 'active' ? 'default' : 'secondary'} className="text-[11px]">
                          {u.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePaginationFooter
                page={page}
                pageSize={PAGE_SIZE}
                total={filteredUsers.length}
                totalPages={totalPages}
                onPageChange={setPage}
                loading={loadingUsers}
                className="border-t border-border"
              />
            </>
          )}
        </div>

        {selected.size > 0 && (
          <p className="text-[12px] text-muted-foreground">
            {t('usersSelected', { count: selected.size })}
          </p>
        )}
      </div>
    </AppModal>
  );
}

// ---------------------------------------------------------------------------
// AccessGroupDetailPage
// ---------------------------------------------------------------------------

export function AccessGroupDetailPage() {
  const { t } = useTranslation('accessGroups');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setLabel = useBreadcrumbStore((s) => s.setLabel);
  const clearLabel = useBreadcrumbStore((s) => s.clearLabel);

  const [group, setGroup] = useState<AccessGroup | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessPoints, setAccessPoints] = useState<AccessGroupAccessPoint[]>([]);
  const [loadingAPs, setLoadingAPs] = useState(false);
  const [accessTimes, setAccessTimes] = useState<AccessTime[]>([]);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<AccessGroupFormData>({ name: '', is_default: false });
  const [editError, setEditError] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const [users, setUsers] = useState<GroupUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [showAddAPModal, setShowAddAPModal] = useState(false);
  const [removingAPId, setRemovingAPId] = useState<string | null>(null);

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const fetchGroup = useCallback(async () => {
    if (!id) return;
    setLoadingGroup(true);
    try {
      const data = await apiFetch<AccessGroup>(`/api/v1/access/access-groups/${id}`);
      setGroup(data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load access group');
    } finally {
      setLoadingGroup(false);
    }
  }, [id]);

  // Set breadcrumb label to group name instead of UUID
  useEffect(() => {
    if (id && group?.name) setLabel(id, group.name);
    return () => { if (id) clearLabel(id); };
  }, [id, group?.name, setLabel, clearLabel]);

  const fetchAccessPoints = useCallback(async () => {
    if (!id) return;
    setLoadingAPs(true);
    try {
      const data = await apiFetch<{ data?: AccessGroupAccessPoint[] }>(`/api/v1/access/access-groups/${id}/access-points`);
      setAccessPoints(data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load access points');
    } finally {
      setLoadingAPs(false);
    }
  }, [id]);

  const fetchUsers = useCallback(async () => {
    if (!id) return;
    setLoadingUsers(true);
    try {
      const data = await apiFetch<{ data?: User[] }>(`/api/v1/access/access-groups/${id}/users`);
      setUsers(data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  }, [id]);

  const fetchAccessTimes = useCallback(async () => {
    try {
      const data = await apiFetch<{ data?: AccessTime[] }>('/api/v1/access/access-times?limit=100&include_slots=true');
      setAccessTimes(data.data ?? []);
    } catch {
      // access times are optional; errors are non-fatal
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await Promise.all([fetchGroup(), fetchAccessPoints(), fetchUsers(), fetchAccessTimes()]);
    };
    if (!cancelled) run();
    return () => { cancelled = true; };
  }, [fetchGroup, fetchAccessPoints, fetchUsers, fetchAccessTimes]);

  const openEditModal = () => {
    if (!group) return;
    setEditForm({
      name: group.name,
      description: group.description,
      is_default: group.is_default,
      access_time_id: group.access_time_id,
    });
    setEditError('');
    setShowEditModal(true);
  };

  const handleEditSubmit = async () => {
    if (!id) return;
    if (!editForm.name.trim()) {
      setEditError(t('validation.nameRequired', 'Name is required'));
      return;
    }
    setSubmittingEdit(true);
    try {
      await apiFetch(`/api/v1/access/access-groups/${id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      });
      await fetchGroup();
      setShowEditModal(false);
      toast(t('toast.updated'), 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update access group';
      setEditError(message);
      toast(message, 'error');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleAddAccessPoints = useCallback(async (accessPointIds: string[]): Promise<boolean> => {
    if (!id || accessPointIds.length === 0) return false;
    try {
      for (const apId of accessPointIds) {
        await apiFetch(`/api/v1/access/access-groups/${id}/access-points`, {
          method: 'POST',
          body: JSON.stringify({ access_point_id: apId }),
        });
      }
      setError(null);
      await fetchAccessPoints();
      await fetchGroup();
      toast(t('toast.apAdded', { count: accessPointIds.length }), 'success');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add access point(s)';
      setError(message);
      toast(message, 'error');
      await fetchAccessPoints();
      await fetchGroup();
      return false;
    }
  }, [id, fetchAccessPoints, fetchGroup, t]);

  const handleRemoveAccessPoint = useCallback(async (accessPointId: string) => {
    if (!id) return;
    setRemovingAPId(accessPointId);
    try {
      await apiFetch(`/api/v1/access/access-groups/${id}/access-points/${accessPointId}`, {
        method: 'DELETE',
      });
      setError(null);
      await fetchAccessPoints();
      await fetchGroup();
      toast(t('toast.apRemoved'), 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove access point';
      setError(message);
      toast(message, 'error');
    } finally {
      setRemovingAPId(null);
    }
  }, [id, fetchAccessPoints, fetchGroup, t]);

  const handleAssignUsers = useCallback(async (userIds: string[]): Promise<boolean> => {
    if (!id) return false;
    try {
      await apiFetch(`/api/v1/access/access-groups/${id}/users`, {
        method: 'POST',
        body: JSON.stringify(userIds.map((uid) => ({ user_id: uid }))),
      });
      setError(null);
      await fetchUsers();
      await fetchGroup();
      toast(t('toast.userAssigned', { count: userIds.length }), 'success');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign users';
      setError(message);
      toast(message, 'error');
      return false;
    }
  }, [id, fetchUsers, fetchGroup, t]);

  const handleRemoveUser = useCallback(async (userId: string) => {
    if (!id) return;
    setRemovingUserId(userId);
    try {
      await apiFetch(`/api/v1/access/access-groups/${id}/users/${userId}`, { method: 'DELETE' });
      setError(null);
      await fetchUsers();
      await fetchGroup();
      toast(t('toast.userRemoved'), 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove user';
      setError(message);
      toast(message, 'error');
    } finally {
      setRemovingUserId(null);
    }
  }, [id, fetchUsers, fetchGroup, t]);

  const userColumns = useMemo((): Column<GroupUser>[] => [
    {
      key: 'name',
      header: t('userColumns.name', 'Name'),
      render: (u) => (
        <div className="flex items-center gap-2">
          <UserCircle size={14} className="text-muted-foreground shrink-0" />
          <span className="text-[13px] font-medium">
            {[u.first_name, u.last_name].filter(Boolean).join(' ')}
          </span>
        </div>
      ),
    },
    {
      key: 'email',
      header: t('userColumns.email', 'Email'),
      render: (u) => (
        <span className="text-[13px] text-muted-foreground">{u.email ?? '—'}</span>
      ),
    },
    {
      key: 'position',
      header: t('userColumns.position', 'Position'),
      render: (u) => (
        <span className="text-[13px] text-muted-foreground">{u.position ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: t('userColumns.status', 'Status'),
      render: (u) => (
        <Badge variant={u.status === 'active' ? 'default' : 'secondary'} className="text-[11px]">
          {u.status}
        </Badge>
      ),
    },
    {
      key: 'effective_from',
      header: t('userColumns.effectiveFrom', 'From'),
      width: '110px',
      render: (u) => (
        <span className="text-[12px] text-muted-foreground">
          {u.effective_from ? new Date(u.effective_from).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'effective_to',
      header: t('userColumns.effectiveTo', 'Until'),
      width: '110px',
      render: (u) => (
        <span className="text-[12px] text-muted-foreground">
          {u.effective_to ? new Date(u.effective_to).toLocaleDateString() : t('permanent', 'Permanent')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('common:table.actions'),
      width: '80px',
      render: (u) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[12px] text-destructive hover:text-destructive"
          onClick={() => handleRemoveUser(u.id)}
          disabled={removingUserId === u.id}
          data-testid="access-button-removeUser"
        >
          <Trash2 size={13} className="mr-1" />
          {removingUserId === u.id ? t('removing') : t('remove')}
        </Button>
      ),
    },
  ], [t, handleRemoveUser, removingUserId]);

  const apColumns = useMemo((): Column<AccessGroupAccessPoint>[] => [
    {
      key: 'access_point_id',
      header: t('columns.accessPointName', 'Access Point'),
      render: (ap) => (
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-primary shrink-0" />
          <span className="text-[13px] font-medium">
            {ap.access_point?.name ?? ap.access_point_id}
          </span>
        </div>
      ),
    },
    {
      key: 'description',
      header: t('columns.description', 'Description'),
      render: (ap) => (
        <span className="text-[13px] text-muted-foreground">
          {ap.access_point?.description ?? '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('common:table.actions'),
      width: '80px',
      render: (ap) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[12px] text-destructive hover:text-destructive"
          onClick={() => handleRemoveAccessPoint(ap.access_point_id)}
          disabled={removingAPId === ap.access_point_id}
          data-testid="access-button-removeAP"
        >
          <Trash2 size={13} className="mr-1" />
          {removingAPId === ap.access_point_id ? t('removing', 'Removing…') : t('remove', 'Remove')}
        </Button>
      ),
    },
  ], [t, handleRemoveAccessPoint, removingAPId]);

  if (loadingGroup) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Shield size={32} className="text-muted-foreground/40" />
        <p className="text-[13px] text-muted-foreground">Access group not found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/access/access-groups')}>
          <ArrowLeft size={14} className="mr-1.5" />Back to Access Groups
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
      {/* Error banner */}
      {error && (
        <div className="text-red-500 text-sm p-2 mb-2 bg-red-50 rounded shrink-0">{error}</div>
      )}

      {/* Header */}
      <div className="shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/access/access-groups')}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-3 px-0 h-auto"
        >
          <ArrowLeft size={13} />
          {t('backToList', 'Access Groups')}
        </Button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={20} className="text-primary shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[18px] font-semibold text-foreground">{group.name}</h1>
                {group.is_default && <Badge variant="secondary">{t('badge.default', 'Default')}</Badge>}
              </div>
              {group.description && (
                <p className="text-[12px] text-muted-foreground mt-0.5">{group.description}</p>
              )}
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                  <Shield size={11} />
                  {group.access_point_count ?? 0} access points
                </span>
                <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                  <Users size={11} />
                  {group.user_count ?? 0} users
                </span>
                <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                  <Clock size={11} />
                  {group.access_time?.name ?? t('noRestriction', '24/7 Unrestricted')}
                </span>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={openEditModal} data-testid="access-button-edit">
            <Edit size={14} className="mr-1.5" />{t('edit', 'Edit')}
          </Button>
        </div>
      </div>

      {/* Who / Where / When regions */}
      <div className="flex-1 min-h-0 overflow-auto pr-0.5">
        <div className="flex flex-col gap-4">
          {/* WHO — users in this group */}
          <section
            data-testid="access-section-who"
            className="rounded-xl border border-border bg-card shadow-sm flex flex-col"
          >
            <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-secure/10 text-secure">
                  <Users size={14} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[14px] font-semibold text-foreground">
                      {t('detail.who', 'Who')}
                    </h2>
                    <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                      {users.length}
                    </Badge>
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {t('detail.whoSubtitle', 'Users assigned to this group.')}
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => setShowAddUserModal(true)} data-testid="access-button-addUser">
                <Plus size={14} className="mr-1.5" />
                {t('addUser', 'Add User')}
              </Button>
            </header>
            <div className="max-h-[320px] overflow-auto">
              {loadingUsers ? (
                <div className="flex justify-center py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                  <Users size={28} className="text-muted-foreground/40" />
                  <p className="text-[13px] font-medium text-foreground">
                    {t('detail.whoEmpty', 'No users in this group yet.')}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {t('noUsersHint', 'Click "Add User" to assign users to this group.')}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" onClick={() => setShowAddUserModal(true)}>
                      <Plus size={14} className="mr-1.5" />
                      {t('addUser', 'Add User')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate('/manage/users')}>
                      <Users size={14} className="mr-1.5" />
                      {t('members.goToUsers', 'Go to User Management')}
                    </Button>
                  </div>
                </div>
              ) : (
                <DataTable
                  embedded
                  stickyHeader
                  paginate={false}
                  columns={userColumns}
                  data={users}
                  rowKey={(u) => u.id}
                  onRowDoubleClick={(u) => navigate(`/manage/users/${u.id}`)}
                />
              )}
            </div>
          </section>

          {/* WHERE — access points bound to this group */}
          <section
            data-testid="access-section-where"
            className="rounded-xl border border-border bg-card shadow-sm flex flex-col"
          >
            <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-manage/10 text-manage">
                  <DoorOpen size={14} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[14px] font-semibold text-foreground">
                      {t('detail.where', 'Where')}
                    </h2>
                    <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                      {accessPoints.length}
                    </Badge>
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {t('detail.whereSubtitle', 'Access points members of this group can enter.')}
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => setShowAddAPModal(true)} data-testid="access-button-addAccessPoint">
                <Plus size={14} className="mr-1.5" />
                {t('addAccessPoint', 'Add Access Point')}
              </Button>
            </header>
            <div className="max-h-[320px] overflow-auto">
              {loadingAPs ? (
                <div className="flex justify-center py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                </div>
              ) : accessPoints.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                  <DoorOpen size={28} className="text-muted-foreground/40" />
                  <p className="text-[13px] font-medium text-foreground">
                    {t('detail.whereEmpty', 'No access points assigned to this group yet.')}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {t('noAccessPointsHint', 'Click "Add Access Point" to assign one.')}
                  </p>
                  <div className="pt-1">
                    <Button size="sm" onClick={() => setShowAddAPModal(true)}>
                      <Plus size={14} className="mr-1.5" />
                      {t('addAccessPoint', 'Add Access Point')}
                    </Button>
                  </div>
                </div>
              ) : (
                <DataTable
                  embedded
                  stickyHeader
                  paginate={false}
                  columns={apColumns}
                  data={accessPoints}
                  rowKey={(ap) => ap.id}
                  onRowDoubleClick={(ap) => navigate(`/access/access-points/${ap.access_point_id}`)}
                />
              )}
            </div>
          </section>

          {/* WHEN — access time schedule */}
          <section
            data-testid="access-section-when"
            className="rounded-xl border border-border bg-card shadow-sm"
          >
            <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-operate/10 text-operate">
                  <Clock size={14} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[14px] font-semibold text-foreground">
                      {t('detail.when', 'When')}
                    </h2>
                    {group.access_time?.name && (
                      <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                        {group.access_time.name}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {t('detail.whenSubtitle', 'Schedule that restricts when this group grants access.')}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={openEditModal} data-testid="access-button-editSchedule">
                <Edit size={14} className="mr-1.5" />
                {t('edit', 'Edit')}
              </Button>
            </header>
            <div className="px-4 py-4">
              {(() => {
                const at = group.access_time_id
                  ? accessTimes.find((a) => a.id === group.access_time_id) ?? group.access_time
                  : null;
                if (!at) {
                  return (
                    <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-muted/20 px-3 py-3">
                      <Clock size={18} className="text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-[13px] font-medium text-foreground">
                          {t('detail.whenUnrestricted', '24/7 unrestricted access')}
                        </p>
                        <p className="text-[12px] text-muted-foreground">
                          {t('detail.whenUnrestrictedHint', 'Members can enter at any time. Assign an access time to restrict hours.')}
                        </p>
                      </div>
                    </div>
                  );
                }
                const slots = (at.slots ?? []) as unknown as AccessTimeSlotFull[];
                return (
                  <div className="flex flex-col gap-3">
                    <WeekdayStrip slots={slots} size="md" />
                    {slots.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground">
                        {t('detail.whenNoSlots', 'This access time has no active slots — nobody can enter.')}
                      </p>
                    ) : (
                      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3">
                        {slots
                          .filter((s) => s.is_active)
                          .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
                          .map((s) => {
                            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                            return (
                              <li
                                key={s.id}
                                className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-[12px]"
                              >
                                <span className="font-medium text-foreground">
                                  {dayNames[s.day_of_week] ?? `Day ${s.day_of_week}`}
                                </span>
                                <span className="text-muted-foreground">
                                  {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                                </span>
                              </li>
                            );
                          })}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </div>
          </section>
        </div>
      </div>

      {/* Edit Group Modal */}
      <AppModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        title={
          <span className="flex items-center gap-2">
            <Edit size={16} className="text-primary" />
            {t('editGroup', 'Edit Access Group')}
          </span>
        }
        size="sm"
        showCancelButton
        cancelLabel={t('cancel', 'Cancel')}
        primaryAction={{
          label: submittingEdit ? t('saving', 'Saving...') : t('save', 'Save'),
          onClick: handleEditSubmit,
          disabled: submittingEdit,
          loading: submittingEdit,
        }}
      >
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="edit-group-name">{t('form.name', 'Name')} <span className="text-destructive">*</span></Label>
            <Input
              id="edit-group-name"
              value={editForm.name}
              onChange={(e) => { setEditForm(prev => ({ ...prev, name: e.target.value })); setEditError(''); }}
              placeholder={t('form.namePlaceholder', 'Group name')}
            />
            {editError && <p className="text-[12px] text-destructive mt-1">{editError}</p>}
          </div>
          <div>
            <Label htmlFor="edit-group-description">{t('form.description', 'Description')}</Label>
            <Input
              id="edit-group-description"
              data-testid="access-input-editDescription"
              value={editForm.description ?? ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value || undefined }))}
              placeholder={t('form.descriptionPlaceholder', 'Optional description')}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="edit_is_default"
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={!!editForm.is_default}
              onChange={(e) => setEditForm(prev => ({ ...prev, is_default: e.target.checked }))}
            />
            <label htmlFor="edit_is_default" className="text-[13px] text-foreground cursor-pointer select-none">
              {t('form.isDefault', 'Set as default group')}
            </label>
          </div>
          <div>
            <Label htmlFor="edit-access-time">{t('form.accessTime', 'Access Time')}</Label>
            <select
              id="edit-access-time"
              value={editForm.access_time_id ?? ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, access_time_id: e.target.value || undefined }))}
              className="w-full h-9 px-3 py-1 text-[13px] border border-border rounded-md bg-input text-foreground disabled:opacity-50 appearance-none cursor-pointer"
              disabled={submittingEdit}
            >
              <option value="">{t('form.noRestriction', 'No time restriction (24/7)')}</option>
              {accessTimes.map((at) => (
                <option key={at.id} value={at.id}>
                  {at.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </AppModal>

      {/* Add Access Point Modal */}
      <AddAccessPointModal
        open={showAddAPModal}
        onOpenChange={setShowAddAPModal}
        linkedAPIds={accessPoints.map((ap) => ap.access_point_id)}
        onSubmit={handleAddAccessPoints}
      />

      {/* Add User Modal */}
      <AddUserModal
        open={showAddUserModal}
        onOpenChange={setShowAddUserModal}
        linkedUserIds={users.map((u) => u.id)}
        onSubmit={handleAssignUsers}
      />
    </div>
  );
}
