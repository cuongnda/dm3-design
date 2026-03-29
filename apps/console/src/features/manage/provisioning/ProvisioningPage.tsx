import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockTemplates, mockRequests, mockAudit, type RoleTemplate, type ProvisioningRequest, type AuditEntry } from './mock-data';

const PURPLE = '#8B5CF6';

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
    { key: 'name', header: 'Template', render: (r) => <span className="font-medium text-[#F8FAFC]">{r.name}</span> },
    { key: 'doors', header: t('provisioning.template.doors'), render: (r) => <span className="text-[#94A3B8]">{t('provisioning.template.doorsCount', { count: r.doors.length })}</span> },
    { key: 'zones', header: t('provisioning.template.zones'), render: (r) => <span className="text-[#94A3B8]">{r.zones.join(', ')}</span> },
    { key: 'schedule', header: t('provisioning.template.schedule'), render: (r) => <span className="text-[#94A3B8] font-mono text-[11px]">{r.schedule}</span> },
    { key: 'assignedCount', header: t('provisioning.template.people'), width: '70px', render: (r) => <span style={{ color: PURPLE }} className="font-medium">{r.assignedCount}</span> },
    { key: 'actions', header: '', width: '60px', render: (r) => <button onClick={(e) => { e.stopPropagation(); setEditTemplate(r); }} className="px-2 py-1 text-[#64748B] hover:text-[#F8FAFC] text-[12px]">{t('provisioning.template.edit')}</button> },
  ];

  const requestColumns: Column<ProvisioningRequest>[] = [
    { key: 'id', header: 'ID', width: '50px', render: (r) => <span className="font-mono text-[11px] text-[#64748B]">{r.id}</span> },
    { key: 'person', header: t('provisioning.request.person'), render: (r) => <span className="text-[#F8FAFC]">{r.person}</span> },
    { key: 'template', header: t('provisioning.request.template'), render: (r) => <span className="px-2 py-0.5 rounded text-[11px] font-medium border" style={{ color: PURPLE, borderColor: `${PURPLE}40` }}>{r.template}</span> },
    { key: 'reason', header: t('provisioning.request.reason'), render: (r) => <span className="text-[#94A3B8]">{r.reason}</span> },
    { key: 'requester', header: t('provisioning.request.requester'), render: (r) => <span className="text-[#94A3B8]">{r.requester}</span> },
    { key: 'requestedAt', header: t('provisioning.request.time'), width: '130px', render: (r) => <span className="font-mono text-[11px] text-[#64748B]">{r.requestedAt}</span> },
    { key: 'status', header: t('provisioning.request.status'), width: '90px', render: (r) => (
      <span className={cn('text-[12px] font-medium', r.status === 'pending' ? 'text-[#EAB308]' : r.status === 'approved' ? 'text-[#22C55E]' : 'text-[#EF4444]')}>
        {r.status === 'pending' ? t('provisioning.request.pending') : r.status === 'approved' ? t('provisioning.request.approved') : t('provisioning.request.rejected')}
      </span>
    )},
    ...(true ? [{
      key: 'actions' as string, header: '', width: '120px',
      render: (r: ProvisioningRequest) => r.status === 'pending' ? (
        <div className="flex gap-1">
          <button className="px-2 py-1 rounded text-[11px] font-medium bg-[#22C55E] text-white">{t('provisioning.request.approve')}</button>
          <button className="px-2 py-1 rounded text-[11px] font-medium bg-[#EF4444] text-white">{t('provisioning.request.reject')}</button>
        </div>
      ) : null,
    }] : []),
  ];

  const auditColumns: Column<AuditEntry>[] = [
    { key: 'at', header: t('provisioning.history.time'), width: '140px', render: (r) => <span className="font-mono text-[11px] text-[#64748B]">{r.at}</span> },
    { key: 'action', header: t('provisioning.history.action'), render: (r) => <span className={cn('text-[12px] font-medium', r.action === t('provisioning.request.rejected') ? 'text-[#EF4444]' : r.action === 'Thu hồi quyền' ? 'text-[#EAB308]' : 'text-[#22C55E]')}>{r.action}</span> },
    { key: 'person', header: t('provisioning.history.person'), render: (r) => <span className="text-[#F8FAFC]">{r.person}</span> },
    { key: 'template', header: t('provisioning.history.template'), render: (r) => <span className="text-[#94A3B8]">{r.template}</span> },
    { key: 'by', header: t('provisioning.history.by'), render: (r) => <span className="text-[#94A3B8]">{r.by}</span> },
  ];

  return (
    <div>
      <PageHeader title={t('provisioning.title')} description={t('provisioning.description')}>
        <button className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium" style={{ backgroundColor: PURPLE }}>{t('provisioning.addTemplate')}</button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('provisioning.stats.templates')} value={String(mockTemplates.length)} sub="role templates" domain="manage" />
        <StatCard label={t('provisioning.stats.pending')} value={String(pendingCount)} sub="pending requests" icon="⏳" domain="manage" />
        <StatCard label={t('provisioning.stats.assigned')} value={String(mockTemplates.reduce((s, t) => s + t.assignedCount, 0))} sub="active assignments" domain="manage" />
        <StatCard label={t('provisioning.stats.todayActions')} value={String(mockAudit.length)} sub="audit entries" domain="manage" />
      </div>

      <div className="flex border-b border-[#1E293B] mb-4">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={cn(
            'px-4 py-2 text-[13px] font-medium border-b-2 transition-colors',
            activeTab === tab.key ? 'text-[#F8FAFC]' : 'text-[#94A3B8] border-transparent hover:text-[#F8FAFC]'
          )} style={activeTab === tab.key ? { borderColor: PURPLE } : undefined}>
            {tab.label}
            {tab.key === 'requests' && pendingCount > 0 && <span className="ml-1.5 text-[11px] px-1.5 rounded-full text-[#8B5CF6] bg-[#8B5CF6]/20">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'templates' && (
        <>
          <DataTable columns={templateColumns} data={mockTemplates} rowKey={r => r.id} onRowClick={r => setEditTemplate(r)} rowClassName={r => editTemplate?.id === r.id ? 'bg-[#8B5CF6]/10' : ''} />
          {editTemplate && (
            <div className="mt-4 bg-[#1E293B] border border-[#334155] rounded-lg p-5">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-[16px] font-semibold text-[#F8FAFC]">{t('provisioning.template.editTitle', { name: editTemplate.name })}</h3>
                <button onClick={() => setEditTemplate(null)} className="text-[#64748B] hover:text-[#F8FAFC]">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] uppercase text-[#64748B] mb-2 block font-medium">{t('provisioning.template.doorsMultiselect')}</label>
                  <div className="space-y-1">
                    {['Main Entrance', 'Office Wing', 'Meeting Zone', 'Server Room', 'Lab Access', 'Loading Dock', 'Storage', 'Rooftop', 'Turnstile 1', 'Turnstile 2'].map(d => (
                      <label key={d} className="flex items-center gap-2 text-[12px] text-[#94A3B8]">
                        <input type="checkbox" defaultChecked={editTemplate.doors.includes(d)} className="accent-[#8B5CF6]" /> {d}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] uppercase text-[#64748B] mb-2 block font-medium">{t('provisioning.template.accessSchedule')}</label>
                  <input defaultValue={editTemplate.schedule} className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] focus:outline-none focus:border-[#8B5CF6]" />
                  <label className="text-[11px] uppercase text-[#64748B] mb-2 mt-4 block font-medium">{t('provisioning.template.zonesLabel')}</label>
                  <div className="flex flex-wrap gap-1">
                    {['Office', 'Lobby', 'Server', 'Meeting', 'Service', 'All'].map(z => (
                      <label key={z} className="flex items-center gap-1 text-[12px] text-[#94A3B8] mr-2">
                        <input type="checkbox" defaultChecked={editTemplate.zones.includes(z)} className="accent-[#8B5CF6]" /> {z}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setEditTemplate(null)} className="px-3 py-1.5 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]">{t('common.cancel')}</button>
                <button onClick={() => setEditTemplate(null)} className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium" style={{ backgroundColor: PURPLE }}>{t('common.save')}</button>
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
