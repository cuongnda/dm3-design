import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Users } from 'lucide-react';
import { PageHeader, Card, Button, Input, DataTable, type Column, Badge, Select, SelectOption } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useAccessTimeTemplates, useAssignAccessTime } from '@/lib/hooks';
import { fetchPersons, type PersonDTO } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export function AccessTimeAssignmentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [effectiveTo, setEffectiveTo] = useState('');

  const { data: templatesData } = useAccessTimeTemplates();
  const templates = templatesData?.templates?.filter(t => t.is_active) ?? [];

  const params: Record<string, string> = {};
  if (searchQuery) params.search = searchQuery;
  const { data: personsData, isLoading } = useQuery({
    queryKey: ['persons-for-assign', searchQuery],
    queryFn: () => fetchPersons(1, 100, params),
  });
  const persons = personsData?.data ?? [];

  const assignMutation = useAssignAccessTime();

  const toggleUser = (id: string) => {
    setSelectedUsers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedUsers.length === persons.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(persons.map(p => p.id));
    }
  };

  const handleAssign = () => {
    if (!selectedTemplate || selectedUsers.length === 0) return;
    assignMutation.mutate({
      user_ids: selectedUsers,
      template_id: selectedTemplate,
      effective_from: effectiveFrom,
      effective_to: effectiveTo || undefined,
    }, {
      onSuccess: () => {
        setSelectedUsers([]);
        alert(`Assigned to ${selectedUsers.length} users`);
      },
    });
  };

  const columns: Column<PersonDTO>[] = [
    {
      key: 'select',
      header: '',
      width: '40px',
      render: (row) => (
        <input type="checkbox" checked={selectedUsers.includes(row.id)} onChange={() => toggleUser(row.id)} />
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium">{row.first_name} {row.last_name}</p>
          <p className="text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (row) => <span className="text-sm">{row.department || '—'}</span>,
    },
    {
      key: 'employee_id',
      header: 'Employee ID',
      render: (row) => <span className="text-sm text-muted-foreground">{row.employee_id || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge variant={row.status === 'active' ? 'default' : 'secondary'}>{row.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Assign Access Time">
        <Button size="sm" variant="outline" onClick={() => navigate('/secure/access-control/access-time')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </PageHeader>

      {/* Assignment panel */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Assignment Settings</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground">Template *</label>
            <Select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)} className="h-8 text-[12px]">
              <SelectOption value="">Select template...</SelectOption>
              {templates.map(tpl => <SelectOption key={tpl.id} value={tpl.id}>{tpl.name}</SelectOption>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">From *</label>
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="h-8 text-[12px] w-40" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">To (optional)</label>
            <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} className="h-8 text-[12px] w-40" />
          </div>
          <Button size="sm" onClick={handleAssign} disabled={!selectedTemplate || selectedUsers.length === 0 || assignMutation.isPending}>
            <Users className="w-4 h-4 mr-1" />
            {assignMutation.isPending ? 'Assigning...' : `Assign (${selectedUsers.length})`}
          </Button>
        </div>
      </Card>

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search users..." className="flex-1 h-8 text-[13px]" />
        <Button size="sm" variant="outline" onClick={toggleAll}>
          {selectedUsers.length === persons.length ? 'Deselect All' : 'Select All'}
        </Button>
        <span className="text-xs text-muted-foreground">{selectedUsers.length} selected</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <DataTable columns={columns} data={persons} rowKey={(r) => r.id} />
      )}
    </div>
  );
}