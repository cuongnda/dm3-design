import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Package, Plus, Search, CheckCircle2, XCircle } from 'lucide-react';
import { fetchFirmwares, type FirmwareDTO } from '@/lib/api';
import { ALL_DEVICE_MODELS } from '@/lib/device-models';
import { Button, DataTable, Input, Select, SelectOption, Badge, TablePaginationFooter } from '@dm3/ui';
import { cn } from '@/lib/utils';

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
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (deviceTypeFilter) params.device_type = deviceTypeFilter;
    if (statusFilter) params.is_active = statusFilter;

    fetchFirmwares(params)
      .then((r) => setFirmwares(r.firmwares))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, deviceTypeFilter, statusFilter]);

  const totalPages = Math.ceil(firmwares.length / pageSize);
  const paged = firmwares.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden p-6">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">{t('firmware.title')}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {firmwares.length} {t('firmware.description')}
          </p>
        </div>
        <Button
          data-testid="fw-button-upload"
          onClick={() => navigate('/system/firmware/upload')}
          className="gap-2"
        >
          <Plus size={15} />
          {t('firmware.upload')}
        </Button>
      </div>

      {/* Filters */}
      <div className="shrink-0 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="fw-input-search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('firmware.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select
          data-testid="fw-select-device-type"
          value={deviceTypeFilter}
          onChange={(e) => { setDeviceTypeFilter(e.target.value); setPage(1); }}
          className="w-48"
        >
          <SelectOption value="">{t('firmware.allDeviceTypes')}</SelectOption>
          {ALL_DEVICE_MODELS.map((m) => (
            <SelectOption key={m.value} value={m.value}>
              {m.label}
            </SelectOption>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="w-36"
        >
          <SelectOption value="">{t('firmware.allStatuses')}</SelectOption>
          <SelectOption value="true">{t('firmware.statusActive')}</SelectOption>
          <SelectOption value="false">{t('firmware.statusInactive')}</SelectOption>
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
            data-testid="fw-table-list"
            rowTestId={(fw) => `fw-row-${fw.id}`}
            columns={[
              {
                key: 'version',
                header: t('firmware.table.version'),
                sortable: true,
                render: (fw) => (
                  <div className="flex items-center gap-2">
                    <span className={cn('font-medium font-mono', !fw.is_active && 'text-muted-foreground line-through')}>
                      {fw.version}
                    </span>
                    {fw.is_active ? (
                      <Badge variant="outline" className="text-[10px] border-success/30 bg-success/10 text-success gap-1">
                        <CheckCircle2 size={10} /> {t('firmware.statusActive')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground gap-1">
                        <XCircle size={10} /> {t('firmware.statusInactive')}
                      </Badge>
                    )}
                  </div>
                ),
              },
              {
                key: 'device_type',
                header: t('firmware.table.deviceType'),
                sortable: true,
                render: (fw) => {
                  const model = ALL_DEVICE_MODELS.find(m => m.value === fw.device_type);
                  return <span className="font-mono text-[12px]">{model?.label ?? fw.device_type}</span>;
                },
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
                key: 'created_at',
                header: t('firmware.table.uploadedAt'),
                sortable: true,
                render: (fw) => new Date(fw.created_at).toLocaleDateString(),
              },
            ]}
            data={paged}
            rowKey={(fw) => fw.id}
            onRowClick={(fw) => navigate(`/system/firmware/${fw.id}`)}
            emptyIcon={<Package size={32} strokeWidth={1.2} />}
            emptyTitle={(search || deviceTypeFilter || statusFilter) ? 'No firmware matches these filters' : 'No firmware uploaded yet'}
            emptyDescription={(search || deviceTypeFilter || statusFilter)
              ? 'Try a different keyword, device type, or status — or clear the filters to see every build.'
              : 'Upload a signed firmware image to push over-the-air updates to devices. Each image is tied to a device type and can be activated after signature verification.'}
            emptyAction={(search || deviceTypeFilter || statusFilter)
              ? { label: 'Clear filters', variant: 'outline', onClick: () => { setSearch(''); setDeviceTypeFilter(''); setStatusFilter(''); setPage(1); }, 'data-testid': 'fw-button-clear-filters-empty' }
              : { label: t('firmware.upload'), icon: <Plus size={14} />, onClick: () => navigate('/system/firmware/upload'), 'data-testid': 'fw-button-upload-empty' }}
          />
        </div>
        <TablePaginationFooter
          page={page}
          pageSize={pageSize}
          total={firmwares.length}
          totalPages={totalPages}
          onPageChange={setPage}
          loading={loading}
        />
      </div>
    </div>
  );
}
