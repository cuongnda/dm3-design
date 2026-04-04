import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, Button, Select, SelectOption } from '@dm3/ui';
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
  online: 'bg-success/10 text-success',
  active: 'bg-success/10 text-success',
  offline: 'bg-muted text-muted-foreground',
  provisioning: 'bg-secure/10 text-secure',
  disabled: 'bg-error/10 text-error',
  decommissioned: 'bg-error/10 text-error',
};

export function SystemDevicesPage() {
  const { t: tSystem } = useTranslation('system');
  const { t: tDevices } = useTranslation('devices');
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

  return (
    <div className="p-6">
      <PageHeader title={tSystem('systemDevices.title')} description={`${devices.length} devices across all companies`}>
        <Button data-testid="sysdevice-button-refresh" variant="outline" size="sm" onClick={loadData} className="gap-1">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <Select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="w-48 h-8 text-[12px]">
          <SelectOption value="">{tDevices('devices.filter.allCompanies')}</SelectOption>
          {companies.map((c) => <SelectOption key={c.id} value={c.id}>{c.name}</SelectOption>)}
        </Select>
        <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-36 h-8 text-[12px]">
          <SelectOption value="">{tSystem('systemDevices.filter.allStatus')}</SelectOption>
          <SelectOption value="online">{tSystem('systemDevices.status.online')}</SelectOption>
          <SelectOption value="offline">{tSystem('systemDevices.status.offline')}</SelectOption>
          <SelectOption value="provisioning">{tSystem('systemDevices.status.provisioning')}</SelectOption>
          <SelectOption value="disabled">{tSystem('systemDevices.status.disabled')}</SelectOption>
          <SelectOption value="decommissioned">{tSystem('systemDevices.status.decommissioned')}</SelectOption>
        </Select>
        <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-36 h-8 text-[12px]">
          <SelectOption value="">{tSystem('systemDevices.filter.allTypes')}</SelectOption>
          <SelectOption value="terminal">{tSystem('systemDevices.type.terminal')}</SelectOption>
          <SelectOption value="controller">{tSystem('systemDevices.type.controller')}</SelectOption>
          <SelectOption value="camera">{tSystem('systemDevices.type.camera')}</SelectOption>
          <SelectOption value="sensor">{tSystem('systemDevices.type.sensor')}</SelectOption>
        </Select>
      </div>

      <div className="border border-border rounded-lg overflow-hidden" data-testid="sysdevice-table-list">
        <table className="w-full">
          <thead>
            <tr className="bg-card text-[11px] text-muted-foreground uppercase tracking-wider">
              <th className="text-left py-2.5 px-4 font-medium">{tSystem('systemDevices.table.device')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{tDevices('devices.table.name')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{tSystem('systemDevices.table.company')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{tSystem('systemDevices.table.type')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{tSystem('systemDevices.table.status')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{tSystem('systemDevices.table.location')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{tSystem('systemDevices.table.lastSeen')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <div className="w-5 h-5 border-2 border-secure/30 border-t-secure rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[13px] text-muted-foreground">
                  No devices found
                </td>
              </tr>
            ) : (
              devices.map((d) => (
                <tr key={d.id} data-testid={`sysdevice-row-${d.id}`} className="border-t border-border hover:bg-muted/50">
                  <td className="py-2.5 px-4 text-[13px] text-foreground font-mono">{d.device_id}</td>
                  <td className="py-2.5 px-4 text-[13px] text-foreground">{d.name || '—'}</td>
                  <td className="py-2.5 px-4 text-[13px] text-muted-foreground">{d.company_name || '—'}</td>
                  <td className="py-2.5 px-4 text-[13px] text-muted-foreground capitalize">{d.type}</td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${statusColors[d.status] || statusColors.offline}`}>{d.status}</span>
                  </td>
                  <td className="py-2.5 px-4 text-[13px] text-muted-foreground">{d.location || '—'}</td>
                  <td className="py-2.5 px-4 text-[13px] text-muted-foreground">
                    {d.last_seen ? new Date(d.last_seen).toLocaleString() : '—'}
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
