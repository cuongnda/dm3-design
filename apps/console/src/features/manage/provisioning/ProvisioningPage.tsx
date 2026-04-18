import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { PageHeader, DataTable, type Column, StatCard, Button, Input, Label } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockTemplates, mockRequests, mockAudit, type RoleTemplate, type ProvisioningRequest, type AuditEntry } from './mock-data';

export function ProvisioningPage() {
  const { t } = useTranslation('manage');
  const [activeTab, setActiveTab] = useState<'templates' | 'requests' | 'history'>('templates');
  const [editTemplate, setEditTemplate] = useState<RoleTemplate | null>(null);
  const pendingCount = mockRequests.filter(r => r.status === 'pending').length;

  const tabs = [
    { key: 'templates' as const, label: t('provisioning.tab.templates') },
    { key: 'requests' as const, label: t('provisioning.tab.requests') },
    { key: 'history' as const, label: t('provisioning.tab.history') },
  ];

  const templateColumns: Column<RoleTemplate>[] = [
    { key: 'name', header: 'Template', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    { key: 'doors', header: t('provisioning.template.doors'), render: (r) => <span className="text-muted-foreground">{t('provisioning.template.doorsCount', { count: r.doors.length })}</span> },
    { key: 'zones', header: t('provisioning.template.zones'), render: (r) => <span className="text-muted-foreground">{r.zones.join(', ')}</span> },
    { key: 'schedule', header: t('provisioning.template.schedule'), render: (r) => <span className="text-muted-foreground font-mono text-[11px]">{r.schedule}</span> },
    { key: 'assignedCount', header: t('provisioning.template.people'), width: '70px', render: (r) => <span className="font-medium text-manage">{r.assignedCount}</span> },
    { key: 'actions', header: t('common:table.actions'), width: '60px', render: (r) => <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setEditTemplate(r); }}>{t('provisioning.template.edit')}</Button> },
  ];

  const requestColumns: Column<ProvisioningRequest>[] = [
    { key: 'id', header: 'ID', width: '50px', render: (r) => <span className="font-mono text-[11px] text-muted-foreground">{r.id}</span> },
    { key: 'person', header: t('provisioning.request.person'), render: (r) => <span className="text-foreground">{r.person}</span> },
    { key: 'template', header: t('provisioning.request.template'), render: (r) => <span className="px-2 py-0.5 rounded text-[11px] font-medium border text-manage border-manage/30">{r.template}</span> },
    { key: 'reason', header: t('provisioning.request.reason'), render: (r) => <span className="text-muted-foreground">{r.reason}</span> },
    { key: 'requester', header: t('provisioning.request.requester'), render: (r) => <span className="text-muted-foreground">{r.requester}</span> },
    { key: 'requestedAt', header: t('provisioning.request.time'), width: '130px', render: (r) => <span className="font-mono text-[11px] text-muted-foreground">{r.requestedAt}</span> },
    { key: 'status', header: t('provisioning.request.status'), width: '90px', render: (r) => (
      <span className={cn('text-[12px] font-medium', r.status === 'pending' ? 'text-warning' : r.status === 'approved' ? 'text-success' : 'text-error')}>
        {r.status === 'pending' ? t('provisioning.request.pending') : r.status === 'approved' ? t('provisioning.request.approved') : t('provisioning.request.rejected')}
      </span>
    )},
    ...(true ? [{
      key: 'actions' as string, header: t('common:table.actions'), width: '120px',
      render: (r: ProvisioningRequest) => r.status === 'pending' ? (
        <div className="flex gap-1">
          <Button size="xs" className="bg-success hover:bg-success/90">{t('provisioning.request.approve')}</Button>
          <Button size="xs" variant="destructive">{t('provisioning.request.reject')}</Button>
        </div>
      ) : null,
    }] : []),
  ];

  const auditColumns: Column<AuditEntry>[] = [
    { key: 'at', header: t('provisioning.history.time'), width: '140px', render: (r) => <span className="font-mono text-[11px] text-muted-foreground">{r.at}</span> },
    { key: 'action', header: t('provisioning.history.action'), render: (r) => <span className={cn('text-[12px] font-medium', r.action === t('provisioning.request.rejected') ? 'text-error' : r.action === 'Thu hồi quyền' ? 'text-warning' : 'text-success')}>{r.action}</span> },
    { key: 'person', header: t('provisioning.history.person'), render: (r) => <span className="text-foreground">{r.person}</span> },
    { key: 'template', header: t('provisioning.history.template'), render: (r) => <span className="text-muted-foreground">{r.template}</span> },
    { key: 'by', header: t('provisioning.history.by'), render: (r) => <span className="text-muted-foreground">{r.by}</span> },
  ];

  return (
    <div>
      <PageHeader title={t('provisioning.title')} description={t('provisioning.description')}>
        <Button size="sm" className="bg-manage hover:bg-manage/90">{t('provisioning.addTemplate')}</Button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('provisioning.stats.templates')} value={String(mockTemplates.length)} sub="role templates" domain="manage" />
        <StatCard label={t('provisioning.stats.pending')} value={String(pendingCount)} sub="pending requests" icon="⏳" domain="manage" />
        <StatCard label={t('provisioning.stats.assigned')} value={String(mockTemplates.reduce((s, t) => s + t.assignedCount, 0))} sub="active assignments" domain="manage" />
        <StatCard label={t('provisioning.stats.todayActions')} value={String(mockAudit.length)} sub="audit entries" domain="manage" />
      </div>

      <div className="flex border-b border-border mb-4">
        {tabs.map(tab => (
          <button type="button" key={tab.key} onClick={() => setActiveTab(tab.key)} className={cn(
            'px-4 py-2 text-[13px] font-medium border-b-2 transition-colors',
            activeTab === tab.key ? 'text-foreground border-manage' : 'text-muted-foreground border-transparent hover:text-foreground'
          )}>
            {tab.label}
            {tab.key === 'requests' && pendingCount > 0 && <span className="ml-1.5 text-[11px] px-1.5 rounded-full text-manage bg-manage/20">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'templates' && (
        <>
          <DataTable columns={templateColumns} data={mockTemplates} rowKey={r => r.id} onRowClick={r => setEditTemplate(r)} rowClassName={r => editTemplate?.id === r.id ? 'bg-manage/10' : ''} />
          {editTemplate && (
            <div className="mt-4 bg-card border border-border rounded-lg p-5">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-[16px] font-semibold text-foreground">{t('provisioning.template.editTitle', { name: editTemplate.name })}</h3>
                <Button variant="ghost" size="icon-xs" onClick={() => setEditTemplate(null)}><X size={14} /></Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[11px] uppercase font-medium mb-2 block">{t('provisioning.template.doorsMultiselect')}</Label>
                  <div className="space-y-1">
                    {['Main Entrance', 'Office Wing', 'Meeting Zone', 'Server Room', 'Lab Access', 'Loading Dock', 'Storage', 'Rooftop', 'Turnstile 1', 'Turnstile 2'].map(d => (
                      <label key={d} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <input type="checkbox" defaultChecked={editTemplate.doors.includes(d)} className="accent-manage" /> {d}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] uppercase font-medium mb-2 block">{t('provisioning.template.accessSchedule')}</Label>
                  <Input defaultValue={editTemplate.schedule} className="h-8" />
                  <Label className="text-[11px] uppercase font-medium mb-2 mt-4 block">{t('provisioning.template.zonesLabel')}</Label>
                  <div className="flex flex-wrap gap-1">
                    {['Office', 'Lobby', 'Server', 'Meeting', 'Service', 'All'].map(z => (
                      <label key={z} className="flex items-center gap-1 text-[12px] text-muted-foreground mr-2">
                        <input type="checkbox" defaultChecked={editTemplate.zones.includes(z)} className="accent-manage" /> {z}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setEditTemplate(null)}>{t('common.cancel')}</Button>
                <Button className="bg-manage hover:bg-manage/90" onClick={() => setEditTemplate(null)}>{t('common.save')}</Button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'requests' && <DataTable columns={requestColumns} data={mockRequests} rowKey={r => r.id} />}
      {activeTab === 'history' && <DataTable columns={auditColumns} data={mockAudit} rowKey={r => r.id} />}
    </div>
  );
}
