import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Shield, Edit, Trash2, Plus, Users, UserCircle,
} from 'lucide-react';
import {
  Button, Input, Label,
  Badge, AppModal,
  DataTable, type Column,
  Tabs, TabsContent, TabsList, TabsTrigger,
  TablePaginationFooter, Checkbox,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import type { AccessGroup, AccessGroupAccessPoint, AccessGroupFormData } from './types';

interface GroupUser {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  position?: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Add Access Point Modal
// ---------------------------------------------------------------------------

interface AvailableAP {
  id: string;
  name: string;
  description?: string;
}

interface AvailableAccessTime {
  id: string;
  name: string;
  description?: string;
}

interface AddAccessPointModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  linkedAPIds: string[];
  onSubmit: (accessPointId: string, accessTimeId?: string) => Promise<boolean>;
}

function AddAccessPointModal({ open, onOpenChange, linkedAPIds, onSubmit }: AddAccessPointModalProps) {
  const { t } = useTranslation('accessGroups');
  const [selectedId, setSelectedId] = useState('');
  const [selectedAccessTimeId, setSelectedAccessTimeId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [allAPs, setAllAPs] = useState<AvailableAP[]>([]);
  const [allAccessTimes, setAllAccessTimes] = useState<AvailableAccessTime[]>([]);
  const [loadingAPs, setLoadingAPs] = useState(false);
  const [loadingAccessTimes, setLoadingAccessTimes] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!open) return;
    setLoadingAPs(true);
    setLoadingAccessTimes(true);

    Promise.all([
      apiFetch<{ data?: AvailableAP[] }>('/api/v1/access/access-points?limit=200')
        .then((res) => setAllAPs(res.data ?? []))
        .catch(() => setAllAPs([])),
      apiFetch<{ data?: AvailableAccessTime[] }>('/api/v1/access/access-times?limit=100')
        .then((res) => setAllAccessTimes(res.data ?? []))
        .catch(() => setAllAccessTimes([])),
    ]).finally(() => {
      setLoadingAPs(false);
      setLoadingAccessTimes(false);
    });
  }, [open]);

  const availableAPs = useMemo(
    () => allAPs.filter((ap) => !linkedAPIds.includes(ap.id)),
    [allAPs, linkedAPIds],
  );

  const filteredAPs = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? availableAPs.filter((ap) => ap.name.toLowerCase().includes(q) || ap.description?.toLowerCase().includes(q))
      : availableAPs;
  }, [availableAPs, search]);

  useEffect(() => { setPage(1); }, [search, availableAPs.length]);

  const totalPages = Math.max(1, Math.ceil(filteredAPs.length / PAGE_SIZE));
  const pagedAPs = filteredAPs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setSelectedId('');
      setSelectedAccessTimeId('');
      setError('');
      setSearch('');
      setPage(1);
    }
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!selectedId) {
      setError(t('selectAccessPointRequired', 'Please select an access point'));
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit(selectedId, selectedAccessTimeId || undefined);
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
      size="md"
      showCancelButton
      cancelLabel={t('cancel', 'Cancel')}
      errorMessage={error || undefined}
      primaryAction={{
        label: submitting ? t('adding', 'Adding...') : t('add', 'Add'),
        onClick: handleSubmit,
        disabled: submitting || !selectedId,
        loading: submitting,
      }}
    >
      <div className="space-y-4">
        {/* Search */}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchAccessPoints', 'Search access points…')}
          className="h-8 text-[13px]"
          disabled={submitting}
        />

        {/* Access Time Selection */}
        <div>
          <Label className="text-[12px] mb-1.5 block">
            {t('accessTime', 'Access Time')} <span className="text-muted-foreground text-[11px]">{t('optional', '(optional)')}</span>
          </Label>
          {loadingAccessTimes ? (
            <div className="h-8 flex items-center justify-center text-[13px] text-muted-foreground">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary mr-2" />
              Loading access times…
            </div>
          ) : (
            <select
              value={selectedAccessTimeId}
              onChange={(e) => setSelectedAccessTimeId(e.target.value)}
              disabled={submitting}
              className="w-full h-8 px-3 py-1 text-[13px] border border-border rounded-md bg-input text-foreground disabled:opacity-50 appearance-none cursor-pointer"
            >
              <option value="">{t('noAccessTimeSelected', 'No specific access time')}</option>
              {allAccessTimes.map((at) => (
                <option key={at.id} value={at.id}>
                  {at.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Access Point table */}
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
                    <th className="w-8 px-3 py-2" />
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('columns.accessPointName', 'Access Point')}</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('columns.description', 'Description')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAPs.map((ap) => {
                    const isSelected = selectedId === ap.id;
                    return (
                      <tr
                        key={ap.id}
                        onClick={() => !submitting && setSelectedId(isSelected ? '' : ap.id)}
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
                        <td className="px-3 py-2 font-medium text-foreground">{ap.name}</td>
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
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!open) return;
    setLoadingUsers(true);
    apiFetch<{ users?: AvailableUser[] }>('/api/v1/identity/users?limit=100&status=active')
      .then((res) => setAllUsers(res.users ?? []))
      .catch(() => setAllUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [open]);

  const availableUsers = useMemo(
    () => allUsers.filter((u) => !linkedUserIds.includes(u.id)),
    [allUsers, linkedUserIds],
  );

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? availableUsers.filter(
          (u) =>
            u.full_name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.position?.toLowerCase().includes(q),
        )
      : availableUsers;
  }, [availableUsers, search]);

  useEffect(() => { setPage(1); }, [search, availableUsers.length]);

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
      setPage(1);
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
      size="md"
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
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchUsers', 'Search users…')}
          className="h-8 text-[13px]"
          disabled={submitting}
        />

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
                        checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                        onCheckedChange={toggleAll}
                        disabled={submitting}
                      />
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">{t('userColumns.name', 'Name')}</th>
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

  const [group, setGroup] = useState<AccessGroup | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [accessPoints, setAccessPoints] = useState<AccessGroupAccessPoint[]>([]);
  const [loadingAPs, setLoadingAPs] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<AccessGroupFormData>({ name: '', is_default: false });
  const [editError, setEditError] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const [users, setUsers] = useState<GroupUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [activeTab, setActiveTab] = useState<'access-points' | 'users'>('access-points');

  const [showAddAPModal, setShowAddAPModal] = useState(false);
  const [removingAPId, setRemovingAPId] = useState<string | null>(null);

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const fetchGroup = useCallback(async () => {
    if (!id) return;
    setLoadingGroup(true);
    try {
      const data = await apiFetch(`/api/v1/access/access-groups/${id}`);
      setGroup(data.access_group ?? data);
    } catch (err) {
      console.error('Failed to fetch access group:', err);
    } finally {
      setLoadingGroup(false);
    }
  }, [id]);

  const fetchAccessPoints = useCallback(async () => {
    if (!id) return;
    setLoadingAPs(true);
    try {
      const data = await apiFetch(`/api/v1/access/access-groups/${id}/access-points`);
      setAccessPoints(data.access_points ?? data.data ?? data.items ?? []);
    } catch (err) {
      console.error('Failed to fetch access points:', err);
    } finally {
      setLoadingAPs(false);
    }
  }, [id]);

  const fetchUsers = useCallback(async () => {
    if (!id) return;
    setLoadingUsers(true);
    try {
      const data = await apiFetch(`/api/v1/access/access-groups/${id}/users`);
      setUsers(data.data ?? []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGroup();
    fetchAccessPoints();
    fetchUsers();
  }, [fetchGroup, fetchAccessPoints, fetchUsers]);

  const openEditModal = () => {
    if (!group) return;
    setEditForm({ name: group.name, is_default: group.is_default });
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
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update access group');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleAddAccessPoint = useCallback(async (accessPointId: string, accessTimeId?: string): Promise<boolean> => {
    if (!id) return false;
    try {
      const body: Record<string, string> = { access_point_id: accessPointId };
      if (accessTimeId) {
        body.access_time_id = accessTimeId;
      }
      await apiFetch(`/api/v1/access/access-groups/${id}/access-points`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await fetchAccessPoints();
      await fetchGroup();
      return true;
    } catch (err) {
      console.error('Failed to add access point:', err);
      return false;
    }
  }, [id, fetchAccessPoints, fetchGroup]);

  const handleRemoveAccessPoint = useCallback(async (accessPointId: string) => {
    if (!id) return;
    setRemovingAPId(accessPointId);
    try {
      await apiFetch(`/api/v1/access/access-groups/${id}/access-points/${accessPointId}`, {
        method: 'DELETE',
      });
      await fetchAccessPoints();
      await fetchGroup();
    } catch (err) {
      console.error('Failed to remove access point:', err);
    } finally {
      setRemovingAPId(null);
    }
  }, [id, fetchAccessPoints, fetchGroup]);

  const handleAssignUsers = useCallback(async (userIds: string[]): Promise<boolean> => {
    if (!id) return false;
    try {
      await apiFetch(`/api/v1/access/access-groups/${id}/users`, {
        method: 'POST',
        body: JSON.stringify({ user_ids: userIds }),
      });
      await fetchUsers();
      await fetchGroup();
      return true;
    } catch (err) {
      console.error('Failed to assign users:', err);
      return false;
    }
  }, [id, fetchUsers, fetchGroup]);

  const handleRemoveUser = useCallback(async (userId: string) => {
    if (!id) return;
    setRemovingUserId(userId);
    try {
      await apiFetch(`/api/v1/access/access-groups/${id}/users/${userId}`, { method: 'DELETE' });
      await fetchUsers();
      await fetchGroup();
    } catch (err) {
      console.error('Failed to remove user:', err);
    } finally {
      setRemovingUserId(null);
    }
  }, [id, fetchUsers, fetchGroup]);

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
      key: 'actions',
      header: '',
      width: '80px',
      render: (u) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[12px] text-destructive hover:text-destructive"
          onClick={() => handleRemoveUser(u.id)}
          disabled={removingUserId === u.id}
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
      key: 'access_time',
      header: t('columns.accessTime', 'Access Time'),
      width: '150px',
      render: (ap) => (
        <span className="text-[13px] text-muted-foreground">
          {ap.access_time?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '80px',
      render: (ap) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[12px] text-destructive hover:text-destructive"
          onClick={() => handleRemoveAccessPoint(ap.access_point_id)}
          disabled={removingAPId === ap.access_point_id}
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
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                  <Shield size={11} />
                  {group.access_point_count ?? 0} access points
                </span>
                <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                  <Users size={11} />
                  {group.user_count ?? 0} users
                </span>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={openEditModal}>
            <Edit size={14} className="mr-1.5" />{t('edit', 'Edit')}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
          <TabsList variant="line">
            <TabsTrigger value="access-points" className="text-[12px] px-3 whitespace-nowrap">
              <Shield size={13} className="mr-1.5" />
              {t('tabs.accessPoints', 'Access Points')} ({accessPoints.length})
            </TabsTrigger>
            <TabsTrigger value="users" className="text-[12px] px-3 whitespace-nowrap">
              <Users size={13} className="mr-1.5" />
              {t('tabs.users', 'Users')} ({users.length})
            </TabsTrigger>
          </TabsList>

          {activeTab === 'access-points' && (
            <Button size="sm" onClick={() => setShowAddAPModal(true)}>
              <Plus size={14} className="mr-1.5" />
              {t('addAccessPoint', 'Add Access Point')}
            </Button>
          )}
          {activeTab === 'users' && (
            <Button size="sm" onClick={() => setShowAddUserModal(true)}>
              <Plus size={14} className="mr-1.5" />
              {t('addUser', 'Add User')}
            </Button>
          )}
        </div>

        {/* Access Points Tab */}
        <TabsContent value="access-points" className="min-h-0 flex-1 overflow-auto">
          {loadingAPs ? (
            <div className="flex justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
          ) : accessPoints.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Shield size={36} className="mb-3 text-muted-foreground/40" />
              <p className="text-[13px] font-medium text-foreground">
                {t('noAccessPoints', 'No access points assigned to this group yet.')}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t('noAccessPointsHint', 'Click "Add Access Point" to assign one.')}
              </p>
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
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="min-h-0 flex-1 overflow-auto">
          {loadingUsers ? (
            <div className="flex justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users size={36} className="mb-3 text-muted-foreground/40" />
              <p className="text-[13px] font-medium text-foreground">
                {t('noUsers', 'No users in this group yet.')}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t('noUsersHint', 'Assign users via User Management.')}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/manage/users')}>
                <Users size={14} className="mr-1.5" />
                {t('members.goToUsers', 'Go to User Management')}
              </Button>
            </div>
          ) : (
            <DataTable
              embedded
              stickyHeader
              paginate={false}
              columns={userColumns}
              data={users}
              rowKey={(u) => u.id}
              onRowDoubleClick={(u) => navigate(`/manage/identities/${u.id}`)}
            />
          )}
        </TabsContent>
      </Tabs>

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
        </div>
      </AppModal>

      {/* Add Access Point Modal */}
      <AddAccessPointModal
        open={showAddAPModal}
        onOpenChange={setShowAddAPModal}
        linkedAPIds={accessPoints.map((ap) => ap.access_point_id)}
        onSubmit={handleAddAccessPoint}
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
