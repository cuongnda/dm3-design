import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, HardDrive, TrendingUp, ArrowRight } from 'lucide-react';
import { fetchSystemStats, fetchCompanies, type SystemStatsDTO, type CompanyDTO } from '@/lib/api';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dm3/ui';

interface StatCardProps {
  title: string;
  total: number;
  icon: React.ElementType;
  colorCls: string;
  bgCls: string;
  details: { label: string; value: number; dotCls: string }[];
}

function StatCard({ title, total, icon: Icon, colorCls, bgCls, details, testId }: StatCardProps & { testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="bg-card border border-border/70 rounded-xl p-5 shadow-xs hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgCls}`}>
          <Icon size={20} className={colorCls} />
        </div>
        <span className="text-2xl font-bold text-foreground">{total}</span>
      </div>
      <h3 className="text-[13px] font-medium text-muted-foreground mb-3">{title}</h3>
      <div className="flex gap-4">
        {details.map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${d.dotCls}`} />
            <span className="text-[11px] text-muted-foreground">{d.value} {d.label}</span>
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
        <div className="w-6 h-6 border-2 border-ring/30 border-t-ring rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">System Dashboard</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Overview of all tenants and system health</p>
      </div>

      {/* Stat Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            testId="sys-card-companies"
            title="Companies"
            total={stats.companies.total}
            icon={Building2}
            colorCls="text-secure"
            bgCls="bg-secure/10"
            details={[
              { label: 'active', value: stats.companies.active, dotCls: 'bg-success' },
              { label: 'suspended', value: stats.companies.suspended, dotCls: 'bg-error' },
            ]}
          />
          <StatCard
            testId="sys-card-users"
            title="Users"
            total={stats.users.total}
            icon={Users}
            colorCls="text-manage"
            bgCls="bg-manage/10"
            details={[
              { label: 'active', value: stats.users.active, dotCls: 'bg-success' },
              { label: 'inactive', value: stats.users.inactive, dotCls: 'bg-muted-foreground' },
            ]}
          />
          <StatCard
            testId="sys-card-devices"
            title="Devices"
            total={stats.devices.total}
            icon={HardDrive}
            colorCls="text-operate"
            bgCls="bg-operate/10"
            details={[
              { label: 'online', value: stats.devices.online, dotCls: 'bg-success' },
              { label: 'offline', value: stats.devices.offline, dotCls: 'bg-error' },
            ]}
          />
          <StatCard
            testId="sys-card-recent"
            title="Last 7 Days"
            total={stats.recent.new_companies_7d + stats.recent.new_users_7d + stats.recent.new_devices_7d}
            icon={TrendingUp}
            colorCls="text-success"
            bgCls="bg-success/10"
            details={[
              { label: 'companies', value: stats.recent.new_companies_7d, dotCls: 'bg-secure' },
              { label: 'users', value: stats.recent.new_users_7d, dotCls: 'bg-manage' },
              { label: 'devices', value: stats.recent.new_devices_7d, dotCls: 'bg-operate' },
            ]}
          />
        </div>
      )}

      {/* Recent Companies */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-medium text-foreground">Recent Companies</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/system/companies')}
            className="gap-1 text-operate hover:text-operate/80"
          >
            View all <ArrowRight size={14} />
          </Button>
        </div>
        <Table data-testid="sys-table-recent-companies" className="w-full">
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Company</TableHead>
              <TableHead className="px-5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Code</TableHead>
              <TableHead className="px-5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Plan</TableHead>
              <TableHead className="px-5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Status</TableHead>
              <TableHead className="px-5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium text-right">Users</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="px-5 py-8 text-center text-[13px] text-muted-foreground">
                  No companies yet. Create your first company to get started.
                </TableCell>
              </TableRow>
            ) : (
              companies.map((c) => (
                <TableRow
                  data-testid={`sys-row-company-${c.id}`}
                  key={c.id}
                  onClick={() => navigate(`/system/companies/${c.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="px-5 py-3">
                    <span className="text-[13px] text-foreground font-medium">{c.name}</span>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <span className="text-[12px] text-muted-foreground font-mono">{c.code}</span>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <span className="text-[12px] text-muted-foreground capitalize">{c.plan}</span>
                  </TableCell>
                  <TableCell className="px-5 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        c.status === 'active'
                          ? 'bg-success/10 text-success'
                          : 'bg-error/10 text-error'
                      }`}
                    >
                      {c.status}
                    </span>
                  </TableCell>
                  <TableCell className="px-5 py-3 text-right">
                    <span className="text-[13px] text-muted-foreground">{c.user_count ?? 0}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
