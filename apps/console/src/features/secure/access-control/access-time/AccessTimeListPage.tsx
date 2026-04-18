import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Clock, Settings, Play, Pause, Trash2 } from 'lucide-react';
import { PageHeader, DataTable, type Column, Button, Card, Badge, Input, Select, SelectOption } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useAccessTimeTemplates, useAccessTimeStats, useDeleteAccessTimeTemplate, useUpdateAccessTimeTemplate } from '@/lib/hooks';
import type { AccessTimeTemplateDTO } from '@/lib/api';

export function AccessTimeListPage() {
  const { t } = useTranslation('secure');
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('');

  const params: Record<string, string> = {};
  if (activeFilter) params.active = activeFilter;

  const { data: templatesData, isLoading } = useAccessTimeTemplates(1, params);
  const { data: stats } = useAccessTimeStats();
  const deleteMutation = useDeleteAccessTimeTemplate();
  const updateMutation = useUpdateAccessTimeTemplate();

  const templates = templatesData?.templates ?? [];

  const filtered = templates.filter(tmpl =>
    tmpl.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tmpl.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleActive = (template: AccessTimeTemplateDTO) => {
    updateMutation.mutate({ id: template.id, data: { is_active: !template.is_active } });
  };

  const handleDelete = (template: AccessTimeTemplateDTO) => {
    if (window.confirm(`Delete "${template.name}"?`)) {
      deleteMutation.mutate(template.id);
    }
  };

  const columns: Column<AccessTimeTemplateDTO>[] = [
    {
      key: 'name',
      header: t('accessTime.templateName'),
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className={cn("w-2.5 h-2.5 rounded-full", row.is_active ? "bg-green-500" : "bg-gray-400")} />
          <div>
            <p className="font-medium">{row.name}</p>
            {row.description && <p className="text-xs text-muted-foreground">{row.description}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'timezone',
      header: t('accessTime.timezone'),
      render: (row) => <span className="text-sm text-muted-foreground">{row.timezone}</span>,
    },
    {
      key: 'is_active',
      header: t('accessTime.status'),
      render: (row) => (
        <Badge variant={row.is_active ? 'default' : 'secondary'}>
          {row.is_active ? t('accessTime.active') : t('accessTime.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('common:table.actions'),
      render: (row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); handleToggleActive(row); }}>
            {row.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); navigate(`/secure/access-control/access-time/${row.id}`); }}>
            <Settings className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(row); }}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={t('accessTime.title')}>
        <Button size="sm" onClick={() => navigate('/secure/access-control/access-time/new')}>
          <Plus className="w-4 h-4 mr-1" /> {t('accessTime.newTemplate')}
        </Button>
      </PageHeader>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card className="p-3"><div className="text-2xl font-bold">{stats.templates_active}</div><div className="text-xs text-muted-foreground">{t('accessTime.stats.active')}</div></Card>
          <Card className="p-3"><div className="text-2xl font-bold">{stats.templates_total}</div><div className="text-xs text-muted-foreground">{t('accessTime.stats.total')}</div></Card>
          <Card className="p-3"><div className="text-2xl font-bold">{stats.templates_total - stats.templates_active}</div><div className="text-xs text-muted-foreground">{t('accessTime.stats.inactive')}</div></Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('accessTime.search')} className="flex-1 h-8 text-[13px]" />
        <Select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className="w-40 h-8 text-[12px]">
          <SelectOption value="">{t('accessTime.filter.all')}</SelectOption>
          <SelectOption value="true">{t('accessTime.filter.active')}</SelectOption>
          <SelectOption value="false">{t('accessTime.filter.inactive')}</SelectOption>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/secure/access-control/access-time/${r.id}`)}
        />
      )}
    </div>
  );
}