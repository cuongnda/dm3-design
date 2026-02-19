import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { fetchSystemDevices, fetchCompanies, type CompanyDTO } from '@/lib/api';
import { RefreshCw } from 'lucide-react';

interface SystemDevice {
  id: string;
  tenant_id: string;
  device_id: string;
  name: string;
  type: string;
  status: string;
  firmware_version: string;
  site_id: string;
  location: string;
  last_seen: string | null;
  created_at: string;
  company_name: string;
}

const statusColors: Record<string, string> = {
  online: 'bg-[#22C55E]/10 text-[#22C55E]',
  active: 'bg-[#22C55E]/10 text-[#22C55E]',
  offline: 'bg-[#64748B]/10 text-[#64748B]',
  provisioning: 'bg-[#3B82F6]/10 text-[#3B82F6]',
  disabled: 'bg-[#EF4444]/10 text-[#EF4444]',
  decommissioned: 'bg-[#EF4444]/10 text-[#EF4444]',
};

export function SystemDevicesPage() {
  const [devices, setDevices] = useState<SystemDevice[]>([]);
  const [companies, setCompanies] = useState<CompanyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterCompany) params.company_id = filterCompany;
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.type = filterType;
      const [devs, comps] = await Promise.all([
        fetchSystemDevices(params),
        companies.length ? Promise.resolve(companies) : fetchCompanies(),
      ]);
      setDevices(devs);
      if (!companies.length) setCompanies(comps);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [filterCompany, filterStatus, filterType]);

  const inputCls = 'h-8 px-2 bg-[#111827] border border-[#1E293B] rounded text-[12px] text-[#F8FAFC] focus:border-[#3B82F6] focus:outline-none';

  return (
    <div className="p-6">
      <PageHeader title="Global Devices" description={`${devices.length} devices across all companies`}>
        <button onClick={loadData} className="flex items-center gap-1 px-3 py-1.5 bg-[#1E293B] hover:bg-[#334155] text-[#94A3B8] rounded-md text-[12px] border border-[#334155] transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </PageHeader>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className={`${inputCls} w-48`}>
          <option value="">All Companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`${inputCls} w-36`}>
          <option value="">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="provisioning">Provisioning</option>
          <option value="disabled">Disabled</option>
          <option value="decommissioned">Decommissioned</option>
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={`${inputCls} w-36`}>
          <option value="">All Types</option>
          <option value="terminal">Terminal</option>
          <option value="controller">Controller</option>
          <option value="camera">Camera</option>
          <option value="sensor">Sensor</option>
        </select>
      </div>

      <div className="border border-[#1E293B] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#111827] text-[11px] text-[#64748B] uppercase tracking-wider">
              <th className="text-left py-2.5 px-4 font-medium">Device ID</th>
              <th className="text-left py-2.5 px-4 font-medium">Name</th>
              <th className="text-left py-2.5 px-4 font-medium">Company</th>
              <th className="text-left py-2.5 px-4 font-medium">Type</th>
              <th className="text-left py-2.5 px-4 font-medium">Status</th>
              <th className="text-left py-2.5 px-4 font-medium">Location</th>
              <th className="text-left py-2.5 px-4 font-medium">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <div className="w-5 h-5 border-2 border-[#3B82F6]/30 border-t-[#3B82F6] rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[13px] text-[#64748B]">No devices found</td>
              </tr>
            ) : (
              devices.map((d) => (
                <tr key={d.id} className="border-t border-[#1E293B] hover:bg-[#111827]/50">
                  <td className="py-2.5 px-4 text-[13px] text-[#F8FAFC] font-mono">{d.device_id}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#F8FAFC]">{d.name || '—'}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#94A3B8]">{d.company_name || '—'}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#94A3B8] capitalize">{d.type}</td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${statusColors[d.status] || statusColors.offline}`}>{d.status}</span>
                  </td>
                  <td className="py-2.5 px-4 text-[13px] text-[#64748B]">{d.location || '—'}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#64748B]">{d.last_seen ? new Date(d.last_seen).toLocaleString() : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
