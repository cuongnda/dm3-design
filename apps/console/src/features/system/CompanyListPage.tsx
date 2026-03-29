import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Search } from 'lucide-react';
import { fetchCompanies, type CompanyDTO } from '@/lib/api';

const planColors: Record<string, string> = {
  trial: 'bg-[#F59E0B]/10 text-[#F59E0B]',
  starter: 'bg-[#3B82F6]/10 text-[#3B82F6]',
  professional: 'bg-[#8B5CF6]/10 text-[#8B5CF6]',
  enterprise: 'bg-[#F97316]/10 text-[#F97316]',
};

const statusColors: Record<string, string> = {
  active: 'bg-[#22C55E]/10 text-[#22C55E]',
  suspended: 'bg-[#EF4444]/10 text-[#EF4444]',
  trial: 'bg-[#F59E0B]/10 text-[#F59E0B]',
};

export function CompanyListPage() {
  const [companies, setCompanies] = useState<CompanyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchCompanies()
      .then(setCompanies)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [companies, search]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-[#F8FAFC]">Companies</h1>
          <p className="text-[13px] text-[#64748B] mt-0.5">
            {companies.length} registered {companies.length === 1 ? 'company' : 'companies'}
          </p>
        </div>
        <button
          onClick={() => navigate('/system/companies/new')}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-md text-[13px] font-medium transition-colors"
        >
          <Plus size={15} />
          Create Company
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or code..."
          className="w-full h-9 pl-9 pr-3 bg-[#111827] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] placeholder:text-[#64748B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]/20"
        />
      </div>

      {/* Table */}
      <div className="border border-[#1E293B] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#111827] text-[11px] text-[#64748B] uppercase tracking-wider">
              <th className="text-left py-2.5 px-4 font-medium">Company</th>
              <th className="text-left py-2.5 px-4 font-medium">Code</th>
              <th className="text-left py-2.5 px-4 font-medium">Plan</th>
              <th className="text-left py-2.5 px-4 font-medium">Status</th>
              <th className="text-right py-2.5 px-4 font-medium">Users</th>
              <th className="text-right py-2.5 px-4 font-medium">Devices</th>
              <th className="text-left py-2.5 px-4 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[13px] text-[#64748B]">
                  <div className="w-5 h-5 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <Building2 size={32} className="mx-auto text-[#334155] mb-2" />
                  <p className="text-[13px] text-[#64748B]">
                    {search ? 'No companies match your search' : 'No companies yet'}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/system/companies/${c.id}`)}
                  className="border-t border-[#1E293B] hover:bg-[#1E293B]/50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-4 text-[13px] text-[#F8FAFC] font-medium">{c.name}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#94A3B8] font-mono">{c.code}</td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${planColors[c.plan] || planColors.trial}`}>
                      {c.plan}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${statusColors[c.status] || statusColors.active}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[13px] text-[#94A3B8] text-right">{c.user_count ?? 0}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#94A3B8] text-right">{c.device_count ?? 0}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#64748B]">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
