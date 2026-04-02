import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader, DataTable, type Column, StatCard, Button, Input, Label, Select, SelectOption } from '@dm3/ui';
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

function CredentialIcons({ c }: { c: Person['credentials'] }) {
  return (
    <span className="flex gap-1.5 text-[14px]">
      <span title="Card" className={c.card ? 'text-manage' : 'text-muted-foreground/30'}>💳</span>
      <span title="Face" className={c.face ? 'text-manage' : 'text-muted-foreground/30'}>👤</span>
      <span title="Mobile" className={c.mobile ? 'text-manage' : 'text-muted-foreground/30'}>📱</span>
    </span>
  );
}

const statusStyle: Record<string, string> = {
  active: 'text-success',
  inactive: 'text-muted-foreground',
  suspended: 'text-error',
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
    { key: 'id', header: t('identities.table.id'), width: '70px', sortable: true, render: (r) => <span className="font-mono text-[11px] text-muted-foreground">{r.id}</span> },
    { key: 'name', header: t('identities.table.name'), sortable: true, render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    { key: 'department', header: t('identities.table.department'), sortable: true, render: (r) => <span className="text-muted-foreground">{r.department}</span> },
    { key: 'role', header: t('identities.table.role'), sortable: true, render: (r) => <span className="text-muted-foreground">{r.role}</span> },
    {
      key: 'status', header: t('identities.table.status'), width: '100px',
      render: (r) => <span className={cn('text-[12px] font-medium capitalize', statusStyle[r.status])}>{r.status === 'active' ? t('identities.status.active') : r.status === 'inactive' ? t('identities.status.inactive') : t('identities.status.suspended')}</span>,
    },
    { key: 'credentials', header: t('identities.table.credentials'), width: '100px', render: (r) => <CredentialIcons c={r.credentials} /> },
  ];

  return (
    <div>
      <PageHeader title={t('identities.title')} description={t('identities.description')}>
        <Button size="sm" onClick={() => setShowForm(true)} className="bg-manage hover:bg-manage/90">{t('identities.addPerson')}</Button>
        <Button size="sm" variant="outline">{t('identities.bulkImport')}</Button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('identities.stats.total')} value={String(people.length)} sub="people" domain="manage" />
        <StatCard label={t('identities.stats.active')} value={String(active)} sub={`${people.length > 0 ? Math.round(active / people.length * 100) : 0}%`} domain="manage" />
        <StatCard label={t('identities.stats.cardEnrolled')} value={String(people.filter(p => p.credentials.card).length)} sub="card enrolled" domain="manage" />
        <StatCard label={t('identities.stats.faceEnrolled')} value={String(people.filter(p => p.credentials.face).length)} sub="face enrolled" domain="manage" />
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('identities.searchPlaceholder')}
          className="flex-1 h-8 text-[13px]"
        />
        <Select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="w-48 h-8 text-[12px]"
        >
          <SelectOption value="">{t('identities.filter.allDepartments')}</SelectOption>
          {['Kỹ thuật', 'Kinh doanh', 'Hành chính', 'Ban giám đốc'].map(d => <SelectOption key={d} value={d}>{d}</SelectOption>)}
        </Select>
      </div>

      {/* Loading & Error States */}
      {isLoading && <div className="text-center py-8 text-muted-foreground">{t('identities.loading')}</div>}
      {error && <div className="text-center py-8 text-error">{t('identities.error')}</div>}

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/manage/identities/${r.id}`)}
      />

      {/* Person Detail Panel */}
      {selected && (
        <div className="mt-4 bg-card border border-border rounded-lg p-5">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-[16px] font-semibold text-foreground">{selected.name}</h3>
              <p className="text-[12px] text-muted-foreground">{selected.department} · {selected.role}</p>
            </div>
            <Button variant="ghost" size="icon-xs" onClick={() => setSelected(null)}>✕</Button>
          </div>
          <div className="grid grid-cols-3 gap-6 text-[13px]">
            <div>
              <h4 className="text-[11px] uppercase text-muted-foreground mb-2 font-medium">{t('identities.detail.info')}</h4>
              <p className="text-muted-foreground">Email: <span className="text-foreground">{selected.email}</span></p>
              <p className="text-muted-foreground">Phone: <span className="text-foreground">{selected.phone}</span></p>
              <p className="text-muted-foreground">ID: <span className="text-foreground">{selected.id}</span></p>
            </div>
            <div>
              <h4 className="text-[11px] uppercase text-muted-foreground mb-2 font-medium">{t('identities.detail.credentials')}</h4>
              <p className="text-muted-foreground">{t('identities.detail.card')}: <span className={selected.credentials.card ? 'text-success' : 'text-muted-foreground'}>{selected.credentials.card ? selected.cardUid : t('identities.detail.cardNotIssued')}</span></p>
              <p className="text-muted-foreground">{t('identities.detail.face')}: <span className={selected.credentials.face ? 'text-success' : 'text-muted-foreground'}>{selected.credentials.face ? t('identities.detail.faceEnrolled') : t('identities.detail.faceNotEnrolled')}</span></p>
              <p className="text-muted-foreground">{t('identities.detail.mobile')}: <span className={selected.credentials.mobile ? 'text-success' : 'text-muted-foreground'}>{selected.credentials.mobile ? t('identities.detail.mobileActivated') : t('identities.detail.mobileNotActivated')}</span></p>
            </div>
            <div>
              <h4 className="text-[11px] uppercase text-muted-foreground mb-2 font-medium">{t('identities.detail.accessGroups')}</h4>
              {selected.accessGroups.map(g => <span key={g} className="inline-block mr-1 mb-1 px-2 py-0.5 rounded text-[11px] font-medium border text-manage border-manage/30">{g}</span>)}
            </div>
          </div>
          <div className="mt-4">
            <h4 className="text-[11px] uppercase text-muted-foreground mb-2 font-medium">{t('identities.detail.recentEvents')}</h4>
            <div className="grid grid-cols-5 gap-1">
              {selected.recentEvents.map((e, i) => (
                <div key={i} className="text-[11px] px-2 py-1 bg-muted rounded">
                  <span className="text-muted-foreground font-mono">{e.time}</span>{' '}
                  <span className="text-muted-foreground">{e.door}</span>{' '}
                  <span className={e.result === 'granted' ? 'text-success' : 'text-error'}>●</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-lg p-6 w-[480px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-foreground mb-4">{t('identities.form.addTitle')}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[12px]">{t('identities.form.firstName')}</Label>
                  <Input
                    value={formData.first_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                    placeholder="Nguyễn"
                    className="mt-1 h-8 text-[13px]"
                  />
                </div>
                <div>
                  <Label className="text-[12px]">{t('identities.form.lastName')}</Label>
                  <Input
                    value={formData.last_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                    placeholder="Văn A"
                    className="mt-1 h-8 text-[13px]"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[12px]">{t('identities.form.email')}</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@company.vn"
                  className="mt-1 h-8 text-[13px]"
                />
              </div>
              <div>
                <Label className="text-[12px]">{t('identities.form.phone')}</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="0901234567"
                  className="mt-1 h-8 text-[13px]"
                />
              </div>
              <div>
                <Label className="text-[12px]">{t('identities.form.employeeId')}</Label>
                <Input
                  value={formData.employee_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, employee_id: e.target.value }))}
                  placeholder="EMP001"
                  className="mt-1 h-8 text-[13px]"
                />
              </div>
              <div>
                <Label className="text-[12px]">{t('identities.form.department')}</Label>
                <Select
                  value={formData.department}
                  onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                  className="mt-1 h-8 text-[12px]"
                >
                  <SelectOption value="">{t('identities.form.selectDepartment')}</SelectOption>
                  {['Kỹ thuật', 'Kinh doanh', 'Hành chính', 'Ban giám đốc'].map(d => <SelectOption key={d} value={d}>{d}</SelectOption>)}
                </Select>
              </div>
              <div>
                <Label className="text-[12px]">{t('identities.form.role')}</Label>
                <Select
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                  className="mt-1 h-8 text-[12px]"
                >
                  <SelectOption value="">{t('identities.form.selectRole')}</SelectOption>
                  {['Nhân viên', 'Trưởng nhóm', 'Quản lý', 'Giám đốc'].map(r => <SelectOption key={r} value={r}>{r}</SelectOption>)}
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleCreatePerson}
                disabled={!isFormValid || createPersonMutation.isPending}
                className="bg-manage hover:bg-manage/90"
              >
                {createPersonMutation.isPending ? t('identities.form.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
