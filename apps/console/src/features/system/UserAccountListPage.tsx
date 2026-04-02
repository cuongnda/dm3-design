import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Search, Shield, Building2 } from 'lucide-react';
import { fetchUserAccounts, type UserAccountDTO } from '@/lib/api-users';
import { Button, Input, Select, SelectOption, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dm3/ui';

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

  const loadUsers = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (roleFilter) params.role = roleFilter;
    
    fetchUserAccounts(page, 20, params)
      .then((res) => {
        setUsers(Array.isArray(res.data) ? res.data : []);
        setTotal(typeof res.total === 'number' ? res.total : 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, statusFilter, roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">User Accounts</h1>
          <p className="text-[13px] text-muted-foreground">{total} user accounts</p>
        </div>
        <Button
          data-testid="user-button-create"
          onClick={() => navigate('/system/accounts/new')}
          className="gap-2 bg-operate hover:bg-operate/90 text-white"
        >
          <Plus size={15} />
          Create User Account
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="user-input-search"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => {setSearch(e.target.value); setPage(1);}}
            className="pl-10"
          />
        </div>
        <Select
          data-testid="user-select-status"
          value={statusFilter}
          onChange={(e) => {setStatusFilter(e.target.value); setPage(1);}}
          className="w-40 text-[13px]"
        >
          <SelectOption value="">All Statuses</SelectOption>
          <SelectOption value="active">Active</SelectOption>
          <SelectOption value="inactive">Inactive</SelectOption>
        </Select>
        <Select
          data-testid="user-select-role"
          value={roleFilter}
          onChange={(e) => {setRoleFilter(e.target.value); setPage(1);}}
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
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table data-testid="user-table-list" className="w-full">
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">User</TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Role</TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Status</TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Companies</TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Last Login</TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <div className="w-6 h-6 border-2 border-ring/30 border-t-ring rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <Users size={32} className="mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-[13px] text-muted-foreground">
                    {search ? 'No users match your search' : 'No users yet'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow
                  data-testid={`user-row-${user.id}`}
                  key={user.id}
                  onClick={() => navigate(`/system/accounts/${user.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {user.role === 'system_admin' ? (
                        <Shield size={16} className="text-error" />
                      ) : (
                        <Users size={16} className="text-muted-foreground" />
                      )}
                      <div>
                        <div className="text-[13px] text-foreground font-medium">{user.name}</div>
                        <div className="text-[12px] text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <span data-testid={`user-badge-role-${user.id}`} className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${roleColors[user.role] || roleColors.viewer}`}>
                      {user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <span data-testid={`user-badge-status-${user.id}`} className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${statusColors[user.status] || statusColors.active}`}>
                      {user.status}
                    </span>
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    {user.companies && user.companies.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.companies.slice(0, 2).map((company) => (
                          <div key={company.company_id} className="flex items-center gap-1 text-[12px] text-muted-foreground">
                            <Building2 size={12} className="text-muted-foreground" />
                            <span>{company.company_code}</span>
                          </div>
                        ))}
                        {user.companies.length > 2 && (
                          <span className="text-[11px] text-muted-foreground">+{user.companies.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">No companies</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-[12px] text-muted-foreground">
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-[12px] text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px] text-muted-foreground">
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-1">
            <Button
              data-testid="user-button-prev"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              data-testid="user-button-next"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}