import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Clock, Users, Settings, Play, Pause, Trash2 } from 'lucide-react';
import { PageHeader, DataTable, type Column, Button, Card, Badge, Input, Select, SelectOption } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useAccessTimeTemplates, useAccessTimeStats, useDeleteAccessTimeTemplate, useUpdateAccessTimeTemplate } from '@/lib/hooks';
import type { AccessTimeTemplateDTO } from '@/lib/api';

export function AccessTimeListPage() {
  const { t } = useTranslation();
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

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleActive = (template: AccessTimeTemplateDTO) => {
    updateMutation.mutate({ id: template.id, data: { is_active: !template.is_active } });
  };

  const handleDelete = (template: AccessTimeTemplateDTO) => {
    if (window.confirm(`Delete "${template.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(template.id);
    }
  };

  const columns: Column<AccessTimeTemplateDTO>[] = [
    {
      key: 'name',
      header: 'Template Name',
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
      header: 'Timezone',
      render: (row) => <span className="text-sm text-muted-foreground">{row.timezone}</span>,
    },
    {
      key: 'user_count',
      header: 'Users',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm">{row.user_count ?? 0}</span>
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.is_active ? 'default' : 'secondary'}>
          {row.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
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
      <PageHeader title="Access Time Management">
        <Button size="sm" variant="outline" onClick={() => navigate('/secure/access-control/access-time/assign')}>
          Assign Users
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate('/secure/access-control/access-time/validate')}>
          Validate
        </Button>
        <Button size="sm" onClick={() => navigate('/secure/access-control/access-time/new')}>
          <Plus className="w-4 h-4 mr-1" /> New Template
        </Button>
      </PageHeader>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-3"><div className="text-2xl font-bold">{stats.templates_active}</div><div className="text-xs text-muted-foreground">Active</div></Card>
          <Card className="p-3"><div className="text-2xl font-bold">{stats.templates_total}</div><div className="text-xs text-muted-foreground">Total</div></Card>
          <Card className="p-3"><div className="text-2xl font-bold">{stats.users_assigned}</div><div className="text-xs text-muted-foreground">Users</div></Card>
          <Card className="p-3"><div className="text-2xl font-bold">{stats.validations_today}</div><div className="text-xs text-muted-foreground">Today</div></Card>
          <Card className="p-3"><div className="text-2xl font-bold text-green-600">{stats.validations_allowed}</div><div className="text-xs text-muted-foreground">Allowed</div></Card>
          <Card className="p-3"><div className="text-2xl font-bold text-red-600">{stats.validations_denied}</div><div className="text-xs text-muted-foreground">Denied</div></Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search templates..." className="flex-1 h-8 text-[13px]" />
        <Select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)} className="w-40 h-8 text-[12px]">
          <SelectOption value="">All</SelectOption>
          <SelectOption value="true">Active</SelectOption>
          <SelectOption value="false">Inactive</SelectOption>
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