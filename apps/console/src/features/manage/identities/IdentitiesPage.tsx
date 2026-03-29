import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { usePersons, useCreatePerson } from '@/lib/hooks';
import type { PersonDTO } from '@/lib/api';

interface Person {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  status: 'active' | 'inactive' | 'suspended';
  credentials: { card: boolean; face: boolean; mobile: boolean };
  cardUid?: string;
  accessGroups: string[];
  recentEvents: { time: string; door: string; result: 'granted' | 'denied' }[];
}

function mapPerson(p: PersonDTO): Person {
  return {
    id: p.id,
    name: `${p.first_name} ${p.last_name}`.trim(),
    email: p.email || '',
    phone: p.phone || '',
    department: p.department || '—',
    role: p.role || '—',
    status: (p.status as Person['status']) || 'active',
    credentials: { card: false, face: false, mobile: false }, // Will be populated by credentials API
    accessGroups: [],
    recentEvents: [],
  };
}

const PURPLE = '#8B5CF6';

function CredentialIcons({ c }: { c: Person['credentials'] }) {
  return (
    <span className="flex gap-1.5 text-[14px]">
      <span title="Card" className={c.card ? 'text-[#8B5CF6]' : 'text-[#334155]'}>💳</span>
      <span title="Face" className={c.face ? 'text-[#8B5CF6]' : 'text-[#334155]'}>👤</span>
      <span title="Mobile" className={c.mobile ? 'text-[#8B5CF6]' : 'text-[#334155]'}>📱</span>
    </span>
  );
}

const statusStyle: Record<string, string> = {
  active: 'text-[#22C55E]',
  inactive: 'text-[#64748B]',
  suspended: 'text-[#EF4444]',
};

export function IdentitiesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('manage');
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [selected, setSelected] = useState<Person | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    department: '',
    role: '',
    employee_id: '',
    status: 'active'
  });

  // Build search params
  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (deptFilter) params.department = deptFilter;

  const { data: personsData, isLoading, error } = usePersons(1, params);
  const createPersonMutation = useCreatePerson();

  const people: Person[] = (personsData?.data ?? []).map(mapPerson);

  // API already handles search and department filter; client-side filter only as fallback
  const filtered = people.filter((p) => {
    if (deptFilter && p.department !== deptFilter) return false;
    return true;
  });

  const active = people.filter((p) => p.status === 'active').length;

  const handleCreatePerson = async () => {
    try {
      await createPersonMutation.mutateAsync({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        department: formData.department || undefined,
        role: formData.role || undefined,
        employee_id: formData.employee_id || undefined,
        status: formData.status,
      });
      setShowForm(false);
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        department: '',
        role: '',
        employee_id: '',
        status: 'active'
      });
    } catch (error) {
      console.error('Failed to create person:', error);
      // TODO: Show error toast
    }
  };

  const isFormValid = formData.first_name.trim() && formData.last_name.trim();

  const columns: Column<Person>[] = [
    { key: 'id', header: t('identities.table.id'), width: '70px', sortable: true, render: (r) => <span className="font-mono text-[11px] text-[#64748B]">{r.id}</span> },
    { key: 'name', header: t('identities.table.name'), sortable: true, render: (r) => <span className="font-medium text-[#F8FAFC]">{r.name}</span> },
    { key: 'department', header: t('identities.table.department'), sortable: true, render: (r) => <span className="text-[#94A3B8]">{r.department}</span> },
    { key: 'role', header: t('identities.table.role'), sortable: true, render: (r) => <span className="text-[#94A3B8]">{r.role}</span> },
    {
      key: 'status', header: t('identities.table.status'), width: '100px',
      render: (r) => <span className={cn('text-[12px] font-medium capitalize', statusStyle[r.status])}>{r.status === 'active' ? t('identities.status.active') : r.status === 'inactive' ? t('identities.status.inactive') : t('identities.status.suspended')}</span>,
    },
    { key: 'credentials', header: t('identities.table.credentials'), width: '100px', render: (r) => <CredentialIcons c={r.credentials} /> },
  ];

  return (
    <div>
      <PageHeader title={t('identities.title')} description={t('identities.description')}>
        <button onClick={() => setShowForm(true)} className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium" style={{ backgroundColor: PURPLE }}>{t('identities.addPerson')}</button>
        <button className="px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#F8FAFC] text-[12px] font-medium">{t('identities.bulkImport')}</button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('identities.stats.total')} value={String(people.length)} sub="people" domain="manage" />
        <StatCard label={t('identities.stats.active')} value={String(active)} sub={`${people.length > 0 ? Math.round(active / people.length * 100) : 0}%`} domain="manage" />
        <StatCard label={t('identities.stats.cardEnrolled')} value={String(people.filter(p => p.credentials.card).length)} sub="card enrolled" domain="manage" />
        <StatCard label={t('identities.stats.faceEnrolled')} value={String(people.filter(p => p.credentials.face).length)} sub="face enrolled" domain="manage" />
      </div>

      <div className="flex gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('identities.searchPlaceholder')}
          className="flex-1 h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:outline-none"
          style={{ borderColor: search ? PURPLE : undefined }}
        />
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]"
        >
          <option value="">{t('identities.filter.allDepartments')}</option>
          {['Kỹ thuật', 'Kinh doanh', 'Hành chính', 'Ban giám đốc'].map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Loading & Error States */}
      {isLoading && <div className="text-center py-8 text-[#94A3B8]">{t('identities.loading')}</div>}
      {error && <div className="text-center py-8 text-[#EF4444]">{t('identities.error')}</div>}

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/manage/identities/${r.id}`)}
      />

      {/* Person Detail Panel */}
      {selected && (
        <div className="mt-4 bg-[#1E293B] border border-[#334155] rounded-lg p-5">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-[16px] font-semibold text-[#F8FAFC]">{selected.name}</h3>
              <p className="text-[12px] text-[#94A3B8]">{selected.department} · {selected.role}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-[#64748B] hover:text-[#F8FAFC]">✕</button>
          </div>
          <div className="grid grid-cols-3 gap-6 text-[13px]">
            <div>
              <h4 className="text-[11px] uppercase text-[#64748B] mb-2 font-medium">{t('identities.detail.info')}</h4>
              <p className="text-[#94A3B8]">Email: <span className="text-[#F8FAFC]">{selected.email}</span></p>
              <p className="text-[#94A3B8]">Phone: <span className="text-[#F8FAFC]">{selected.phone}</span></p>
              <p className="text-[#94A3B8]">ID: <span className="text-[#F8FAFC]">{selected.id}</span></p>
            </div>
            <div>
              <h4 className="text-[11px] uppercase text-[#64748B] mb-2 font-medium">{t('identities.detail.credentials')}</h4>
              <p className="text-[#94A3B8]">{t('identities.detail.card')}: <span className={selected.credentials.card ? 'text-[#22C55E]' : 'text-[#64748B]'}>{selected.credentials.card ? selected.cardUid : t('identities.detail.cardNotIssued')}</span></p>
              <p className="text-[#94A3B8]">{t('identities.detail.face')}: <span className={selected.credentials.face ? 'text-[#22C55E]' : 'text-[#64748B]'}>{selected.credentials.face ? t('identities.detail.faceEnrolled') : t('identities.detail.faceNotEnrolled')}</span></p>
              <p className="text-[#94A3B8]">{t('identities.detail.mobile')}: <span className={selected.credentials.mobile ? 'text-[#22C55E]' : 'text-[#64748B]'}>{selected.credentials.mobile ? t('identities.detail.mobileActivated') : t('identities.detail.mobileNotActivated')}</span></p>
            </div>
            <div>
              <h4 className="text-[11px] uppercase text-[#64748B] mb-2 font-medium">{t('identities.detail.accessGroups')}</h4>
              {selected.accessGroups.map(g => <span key={g} className="inline-block mr-1 mb-1 px-2 py-0.5 rounded text-[11px] font-medium border" style={{ color: PURPLE, borderColor: `${PURPLE}40` }}>{g}</span>)}
            </div>
          </div>
          <div className="mt-4">
            <h4 className="text-[11px] uppercase text-[#64748B] mb-2 font-medium">{t('identities.detail.recentEvents')}</h4>
            <div className="grid grid-cols-5 gap-1">
              {selected.recentEvents.map((e, i) => (
                <div key={i} className="text-[11px] px-2 py-1 bg-[#111827] rounded">
                  <span className="text-[#64748B] font-mono">{e.time}</span>{' '}
                  <span className="text-[#94A3B8]">{e.door}</span>{' '}
                  <span className={e.result === 'granted' ? 'text-[#22C55E]' : 'text-[#EF4444]'}>●</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-6 w-[480px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">{t('identities.form.addTitle')}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-[#94A3B8] mb-1 block">{t('identities.form.firstName')}</label>
                  <input
                    value={formData.first_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                    placeholder="Nguyễn"
                    className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-[#94A3B8] mb-1 block">{t('identities.form.lastName')}</label>
                  <input
                    value={formData.last_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                    placeholder="Văn A"
                    className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>
              <div>
                <label className="text-[12px] text-[#94A3B8] mb-1 block">{t('identities.form.email')}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@company.vn"
                  className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
              <div>
                <label className="text-[12px] text-[#94A3B8] mb-1 block">{t('identities.form.phone')}</label>
                <input
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="0901234567"
                  className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
              <div>
                <label className="text-[12px] text-[#94A3B8] mb-1 block">{t('identities.form.employeeId')}</label>
                <input
                  value={formData.employee_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, employee_id: e.target.value }))}
                  placeholder="EMP001"
                  className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>
              <div>
                <label className="text-[12px] text-[#94A3B8] mb-1 block">{t('identities.form.department')}</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]"
                >
                  <option value="">{t('identities.form.selectDepartment')}</option>
                  {['Kỹ thuật', 'Kinh doanh', 'Hành chính', 'Ban giám đốc'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[12px] text-[#94A3B8] mb-1 block">{t('identities.form.role')}</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]"
                >
                  <option value="">{t('identities.form.selectRole')}</option>
                  {['Nhân viên', 'Trưởng nhóm', 'Quản lý', 'Giám đốc'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCreatePerson}
                disabled={!isFormValid || createPersonMutation.isPending}
                className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium disabled:opacity-50"
                style={{ backgroundColor: PURPLE }}
              >
                {createPersonMutation.isPending ? t('identities.form.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
