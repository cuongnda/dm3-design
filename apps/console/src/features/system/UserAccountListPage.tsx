import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Search, Shield, Building2 } from 'lucide-react';
import { fetchUserAccounts, type UserAccountDTO } from '@/lib/api-users';
import { Button, Input, Select, SelectOption, DataTable, type Column, TablePaginationFooter } from '@dm3/ui';

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success border-success/20',
  inactive: 'bg-muted text-muted-foreground border-border',
};

const roleColors: Record<string, string> = {
  system_admin: 'bg-error/10 text-error border-error/20',
  primary_manager: 'bg-warning/10 text-warning border-warning/20',
  manager: 'bg-manage/10 text-manage border-manage/20',
  operator: 'bg-secure/10 text-secure border-secure/20',
  viewer: 'bg-muted text-muted-foreground border-border',
};

export function UserAccountListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const [users, setUsers] = useState<UserAccountDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const loadUsers = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (roleFilter) params.role = roleFilter;

    fetchUserAccounts(page, pageSize, params)
      .then((res: any) => {
        setUsers(Array.isArray(res.data) ? res.data : []);
        // API returns { data, total, page, limit } (httputil.Paginated format)
        const t = res.pagination?.total ?? res.total ?? 0;
        setTotal(typeof t === 'number' ? t : 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, statusFilter, roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const totalPages = Math.ceil(total / pageSize);

  const columns: Column<UserAccountDTO>[] = [
    {
      key: 'name',
      header: 'User',
      sortable: true,
      render: (user) => (
        <div className="flex items-center gap-2">
          {user.role === 'system_admin' ? (
            <Shield size={16} className="text-error shrink-0" />
          ) : (
            <Users size={16} className="text-muted-foreground shrink-0" />
          )}
          <div>
            <div className="text-[13px] text-foreground font-medium">{user.name}</div>
            <div className="text-[12px] text-muted-foreground">{user.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: '140px',
      sortable: true,
      render: (user) => (
        <span data-testid={`user-badge-role-${user.id}`}
          className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${roleColors[user.role] || roleColors.viewer}`}>
          {user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '90px',
      sortable: true,
      render: (user) => (
        <span data-testid={`user-badge-status-${user.id}`}
          className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${statusColors[user.status] || statusColors.active}`}>
          {user.status}
        </span>
      ),
    },
    {
      key: 'companies',
      header: 'Companies',
      render: (user) =>
        user.companies && user.companies.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {user.companies.slice(0, 2).map((company) => (
              <div key={company.company_id} className="flex items-center gap-1 text-[12px] text-muted-foreground">
                <Building2 size={12} /> <span>{company.company_code}</span>
              </div>
            ))}
            {user.companies.length > 2 && (
              <span className="text-[11px] text-muted-foreground">+{user.companies.length - 2}</span>
            )}
          </div>
        ) : (
          <span className="text-[12px] text-muted-foreground">—</span>
        ),
    },
    {
      key: 'last_login',
      header: 'Last Login',
      width: '110px',
      render: (user) => (
        <span className="text-[12px] text-muted-foreground">
          {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      width: '110px',
      sortable: true,
      render: (user) => (
        <span className="text-[12px] text-muted-foreground">
          {new Date(user.created_at).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden p-6">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">User Accounts</h1>
          <p className="text-[13px] text-muted-foreground">{total} user accounts</p>
        </div>
        <Button
          data-testid="user-button-create"
          onClick={() => navigate('/system/accounts/new')}
          className="gap-2"
        >
          <Plus size={15} />
          Create User Account
        </Button>
      </div>

      {/* Filters */}
      <div className="shrink-0 flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="user-input-search"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <Select
          data-testid="user-select-status"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="w-40 text-[13px]"
        >
          <SelectOption value="">All Statuses</SelectOption>
          <SelectOption value="active">Active</SelectOption>
          <SelectOption value="inactive">Inactive</SelectOption>
        </Select>
        <Select
          data-testid="user-select-role"
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="w-48 text-[13px]"
        >
          <SelectOption value="">All Roles</SelectOption>
          <SelectOption value="system_admin">System Admin</SelectOption>
          <SelectOption value="primary_manager">Primary Manager</SelectOption>
          <SelectOption value="manager">Manager</SelectOption>
          <SelectOption value="operator">Operator</SelectOption>
          <SelectOption value="viewer">Viewer</SelectOption>
        </Select>
      </div>

      {/* Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        <div className="min-h-0 flex-1 overflow-auto">
          <DataTable
            embedded
            stickyHeader
            paginate={false}
            loading={loading}
            data-testid="user-table-list"
            columns={columns}
            data={users}
            rowKey={(u) => u.id}
            rowTestId={(u) => `user-row-${u.id}`}
            onRowClick={(u) => navigate(`/system/accounts/${u.id}`)}
            emptyMessage={search ? 'No users match your search' : 'No users yet'}
            emptyIcon={<Users size={32} strokeWidth={1.2} />}
          />
        </div>
        <TablePaginationFooter
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          loading={loading}
        />
      </div>
    </div>
  );
}
