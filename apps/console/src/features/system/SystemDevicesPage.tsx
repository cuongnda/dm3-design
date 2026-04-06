import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, Button, Select, SelectOption, DataTable, type Column } from '@dm3/ui';
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

  const columns = useMemo<Column<SystemDevice>[]>(() => [
    {
      key: 'device_id',
      header: tSystem('systemDevices.table.device'),
      render: (d) => <span className="font-mono">{d.device_id}</span>,
    },
    {
      key: 'name',
      header: tDevices('devices.table.name'),
      render: (d) => d.name || '—',
    },
    {
      key: 'company_name',
      header: tSystem('systemDevices.table.company'),
      render: (d) => d.company_name || '—',
    },
    {
      key: 'type',
      header: tSystem('systemDevices.table.type'),
      render: (d) => <span className="capitalize">{d.type}</span>,
    },
    {
      key: 'status',
      header: tSystem('systemDevices.table.status'),
      render: (d) => (
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${statusColors[d.status] || statusColors.offline}`}>
          {d.status}
        </span>
      ),
    },
    {
      key: 'location',
      header: tSystem('systemDevices.table.location'),
      render: (d) => d.location || '—',
    },
    {
      key: 'last_seen',
      header: tSystem('systemDevices.table.lastSeen'),
      render: (d) => d.last_seen ? new Date(d.last_seen).toLocaleString() : '—',
    },
  ], [tSystem, tDevices]);

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

      <DataTable
        data-testid="sysdevice-table-list"
        columns={columns}
        data={devices}
        rowKey={(d) => d.id}
        rowTestId={(d) => `sysdevice-row-${d.id}`}
        paginate={false}
      />
    </div>
  );
}
