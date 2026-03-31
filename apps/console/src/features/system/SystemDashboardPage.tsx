import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, HardDrive, TrendingUp, ArrowRight } from 'lucide-react';
import { fetchSystemStats, fetchCompanies, type SystemStatsDTO, type CompanyDTO } from '@/lib/api';

interface StatCardProps {
  title: string;
  total: number;
  icon: React.ElementType;
  color: string;
  details: { label: string; value: number; color: string }[];
}

function StatCard({ title, total, icon: Icon, color, details, testId }: StatCardProps & { testId?: string }) {
  return (
    <div data-testid={testId} className="bg-[#1E293B]/60 border border-[#334155] rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center`} style={{ backgroundColor: `${color}20` }}>
          <Icon size={20} style={{ color }} />
        </div>
        <span className="text-2xl font-bold text-[#F8FAFC]">{total}</span>
      </div>
      <h3 className="text-[13px] font-medium text-[#94A3B8] mb-3">{title}</h3>
      <div className="flex gap-4">
        {details.map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-[11px] text-[#64748B]">{d.value} {d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SystemDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SystemStatsDTO | null>(null);
  const [companies, setCompanies] = useState<CompanyDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchSystemStats(), fetchCompanies()])
      .then(([s, c]) => {
        setStats(s);
        setCompanies(c.slice(0, 5)); // latest 5
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#F8FAFC]">System Dashboard</h1>
        <p className="text-[13px] text-[#64748B] mt-1">Overview of all tenants and system health</p>
      </div>

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            testId="sys-card-companies"
            title="Companies"
            total={stats.companies.total}
            icon={Building2}
            color="#3B82F6"
            details={[
              { label: 'active', value: stats.companies.active, color: '#10B981' },
              { label: 'suspended', value: stats.companies.suspended, color: '#EF4444' },
            ]}
          />
          <StatCard
            testId="sys-card-users"
            title="Users"
            total={stats.users.total}
            icon={Users}
            color="#8B5CF6"
            details={[
              { label: 'active', value: stats.users.active, color: '#10B981' },
              { label: 'inactive', value: stats.users.inactive, color: '#64748B' },
            ]}
          />
          <StatCard
            testId="sys-card-devices"
            title="Devices"
            total={stats.devices.total}
            icon={HardDrive}
            color="#F59E0B"
            details={[
              { label: 'online', value: stats.devices.online, color: '#10B981' },
              { label: 'offline', value: stats.devices.offline, color: '#EF4444' },
            ]}
          />
          <StatCard
            testId="sys-card-recent"
            title="Last 7 Days"
            total={stats.recent.new_companies_7d + stats.recent.new_users_7d + stats.recent.new_devices_7d}
            icon={TrendingUp}
            color="#10B981"
            details={[
              { label: 'companies', value: stats.recent.new_companies_7d, color: '#3B82F6' },
              { label: 'users', value: stats.recent.new_users_7d, color: '#8B5CF6' },
              { label: 'devices', value: stats.recent.new_devices_7d, color: '#F59E0B' },
            ]}
          />
        </div>
      )}

      {/* Recent Companies */}
      <div className="bg-[#1E293B]/60 border border-[#334155] rounded-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#334155]">
          <h2 className="text-[14px] font-medium text-[#F8FAFC]">Recent Companies</h2>
          <button
            onClick={() => navigate('/system/companies')}
            className="flex items-center gap-1 text-[12px] text-[#F97316] hover:text-[#FB923C] transition-colors"
          >
            View all <ArrowRight size={14} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table data-testid="sys-table-recent-companies" className="w-full">
            <thead>
              <tr className="text-[11px] text-[#64748B] uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">Company</th>
                <th className="text-left px-5 py-3 font-medium">Code</th>
                <th className="text-left px-5 py-3 font-medium">Plan</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium">Users</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-[#64748B]">
                    No companies yet. Create your first company to get started.
                  </td>
                </tr>
              ) : (
                companies.map((c) => (
                  <tr
                    data-testid={`sys-row-company-${c.id}`}
                    key={c.id}
                    onClick={() => navigate(`/system/companies/${c.id}`)}
                    className="border-t border-[#334155]/50 hover:bg-[#334155]/30 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3">
                      <span className="text-[13px] text-[#F8FAFC] font-medium">{c.name}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[12px] text-[#94A3B8] font-mono">{c.code}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[12px] text-[#94A3B8] capitalize">{c.plan}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        c.status === 'active'
                          ? 'bg-[#10B981]/10 text-[#10B981]'
                          : 'bg-[#EF4444]/10 text-[#EF4444]'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-[13px] text-[#94A3B8]">{c.user_count ?? 0}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
