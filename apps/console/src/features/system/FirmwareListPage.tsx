import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Package, Plus, Search } from 'lucide-react';
import { fetchFirmwares, fetchFirmwareDeviceTypes, type FirmwareDTO } from '@/lib/api';
import { Button, DataTable, Input, Select, SelectOption } from '@dm3/ui';

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success',
  inactive: 'bg-error/10 text-error',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FirmwareListPage() {
  const { t } = useTranslation('system');
  const navigate = useNavigate();
  const [firmwares, setFirmwares] = useState<FirmwareDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [deviceTypes, setDeviceTypes] = useState<string[]>([]);

  useEffect(() => {
    fetchFirmwareDeviceTypes()
      .then((r) => setDeviceTypes(r.device_types))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (deviceTypeFilter) params.device_type = deviceTypeFilter;
    if (statusFilter === 'active') params.is_active = 'true';

    fetchFirmwares(params)
      .then((r) => setFirmwares(r.firmwares))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, deviceTypeFilter, statusFilter]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">{t('firmware.title')}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {firmwares.length} {t('firmware.description')}
          </p>
        </div>
        <Button
          data-testid="fw-button-upload"
          onClick={() => navigate('/system/firmware/upload')}
          className="gap-2 bg-operate hover:bg-operate/90 text-white"
        >
          <Plus size={15} />
          {t('firmware.upload')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="fw-input-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('firmware.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select
          data-testid="fw-select-device-type"
          value={deviceTypeFilter}
          onChange={(e) => setDeviceTypeFilter(e.target.value)}
          className="w-48"
        >
          <SelectOption value="">{t('firmware.allDeviceTypes')}</SelectOption>
          {deviceTypes.map((dt) => (
            <SelectOption key={dt} value={dt}>
              {dt}
            </SelectOption>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-36"
        >
          <SelectOption value="">{t('firmware.allStatuses')}</SelectOption>
          <SelectOption value="active">{t('firmware.statusActive')}</SelectOption>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-lg border border-border bg-card py-12 text-center">
          <div className="w-5 h-5 border-2 border-ring/30 border-t-ring rounded-full animate-spin mx-auto" />
        </div>
      ) : firmwares.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-12 text-center">
          <Package size={32} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-[13px] text-muted-foreground">
            {search || deviceTypeFilter ? t('firmware.noResults') : t('firmware.empty')}
          </p>
        </div>
      ) : (
        <DataTable
          data-testid="fw-table-list"
          rowTestId={(fw) => `fw-row-${fw.id}`}
          columns={[
            {
              key: 'version',
              header: t('firmware.table.version'),
              sortable: true,
              render: (fw) => <span className="font-medium font-mono">{fw.version}</span>,
            },
            {
              key: 'device_type',
              header: t('firmware.table.deviceType'),
              sortable: true,
              render: (fw) => <span className="font-mono text-[12px]">{fw.device_type}</span>,
            },
            {
              key: 'description',
              header: t('firmware.table.description'),
              render: (fw) => (
                <span className="text-muted-foreground truncate max-w-[200px] inline-block">
                  {fw.description || '—'}
                </span>
              ),
            },
            {
              key: 'file_size',
              header: t('firmware.table.size'),
              sortable: true,
              render: (fw) => <span className="tabular-nums">{formatSize(fw.file_size)}</span>,
            },
            {
              key: 'is_active',
              header: t('firmware.table.status'),
              sortable: true,
              render: (fw) => (
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                    fw.is_active ? statusColors.active : statusColors.inactive
                  }`}
                >
                  {fw.is_active ? t('firmware.statusActive') : t('firmware.statusInactive')}
                </span>
              ),
            },
            {
              key: 'created_at',
              header: t('firmware.table.uploadedAt'),
              sortable: true,
              render: (fw) => new Date(fw.created_at).toLocaleDateString(),
            },
          ]}
          data={firmwares}
          rowKey={(fw) => fw.id}
          onRowClick={(fw) => navigate(`/system/firmware/${fw.id}`)}
          pageSize={15}
        />
      )}
    </div>
  );
}
