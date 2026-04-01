import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Search, Shield, Building2 } from 'lucide-react';
import { fetchUserAccounts, type UserAccountDTO } from '@/lib/api-users';
import { Button, Input } from '@dm3/ui';

const statusColors: Record<string, string> = {
  active: 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20',
  inactive: 'bg-[#64748B]/10 text-[#64748B] border-[#64748B]/20',
};

const roleColors: Record<string, string> = {
  system_admin: 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20',
  primary_manager: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',
  manager: 'bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/20',
  operator: 'bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/20',
  viewer: 'bg-[#64748B]/10 text-[#64748B] border-[#64748B]/20',
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
        setUsers(res.data);
        setTotal(res.total);
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
          <h1 className="text-[20px] font-semibold text-[#F8FAFC]">User Accounts</h1>
          <p className="text-[13px] text-[#64748B]">{total} user accounts</p>
        </div>
        <button
          data-testid="user-button-create"
          onClick={() => navigate('/system/users/new')}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-md text-[13px] font-medium transition-colors"
        >
          <Plus size={15} />
          Create User Account
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
          <Input
            data-testid="user-input-search"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => {setSearch(e.target.value); setPage(1);}}
            className="pl-10"
          />
        </div>
        <select
          data-testid="user-select-status"
          value={statusFilter}
          onChange={(e) => {setStatusFilter(e.target.value); setPage(1);}}
          className="h-9 px-3 bg-[#0B1120] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] focus:border-[#F97316] focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          data-testid="user-select-role"
          value={roleFilter}
          onChange={(e) => {setRoleFilter(e.target.value); setPage(1);}}
          className="h-9 px-3 bg-[#0B1120] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] focus:border-[#F97316] focus:outline-none"
        >
          <option value="">All Roles</option>
          <option value="system_admin">System Admin</option>
          <option value="primary_manager">Primary Manager</option>
          <option value="manager">Manager</option>
          <option value="operator">Operator</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>

      {/* Table */}
      <div className="border border-[#1E293B] rounded-lg overflow-hidden bg-[#111827]">
        <table data-testid="user-table-list" className="w-full">
          <thead>
            <tr className="bg-[#0F172A] text-[11px] text-[#64748B] uppercase tracking-wider">
              <th className="text-left py-3 px-4 font-medium">User</th>
              <th className="text-left py-3 px-4 font-medium">Role</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-left py-3 px-4 font-medium">Companies</th>
              <th className="text-left py-3 px-4 font-medium">Last Login</th>
              <th className="text-left py-3 px-4 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <div className="w-6 h-6 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <Users size={32} className="mx-auto text-[#334155] mb-2" />
                  <p className="text-[13px] text-[#64748B]">
                    {search ? 'No users match your search' : 'No users yet'}
                  </p>
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  data-testid={`user-row-${user.id}`}
                  key={user.id}
                  onClick={() => navigate(`/system/users/${user.id}`)}
                  className="border-t border-[#1E293B] hover:bg-[#1E293B]/50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {user.role === 'system_admin' ? (
                        <Shield size={16} className="text-[#EF4444]" />
                      ) : (
                        <Users size={16} className="text-[#64748B]" />
                      )}
                      <div>
                        <div className="text-[13px] text-[#F8FAFC] font-medium">{user.name}</div>
                        <div className="text-[12px] text-[#94A3B8]">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span data-testid={`user-badge-role-${user.id}`} className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${roleColors[user.role] || roleColors.viewer}`}>
                      {user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span data-testid={`user-badge-status-${user.id}`} className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${statusColors[user.status] || statusColors.active}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {user.companies.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.companies.slice(0, 2).map((company, idx) => (
                          <div key={company.company_id} className="flex items-center gap-1 text-[12px] text-[#94A3B8]">
                            <Building2 size={12} className="text-[#64748B]" />
                            <span>{company.company_code}</span>
                          </div>
                        ))}
                        {user.companies.length > 2 && (
                          <span className="text-[11px] text-[#64748B]">+{user.companies.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[12px] text-[#64748B]">No companies</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-[12px] text-[#94A3B8]">
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="py-3 px-4 text-[12px] text-[#64748B]">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px] text-[#64748B]">
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