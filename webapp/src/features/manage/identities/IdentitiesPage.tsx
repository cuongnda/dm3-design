import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { cn } from '@/lib/utils';
import { mockPeople, type Person } from './mock-data';

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
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [selected, setSelected] = useState<Person | null>(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = mockPeople.filter((p) => {
    if (deptFilter && p.department !== deptFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const active = mockPeople.filter((p) => p.status === 'active').length;

  const columns: Column<Person>[] = [
    { key: 'id', header: 'ID', width: '70px', sortable: true, render: (r) => <span className="font-mono text-[11px] text-[#64748B]">{r.id}</span> },
    { key: 'name', header: 'Họ tên', sortable: true, render: (r) => <span className="font-medium text-[#F8FAFC]">{r.name}</span> },
    { key: 'department', header: 'Phòng ban', sortable: true, render: (r) => <span className="text-[#94A3B8]">{r.department}</span> },
    { key: 'role', header: 'Chức vụ', sortable: true, render: (r) => <span className="text-[#94A3B8]">{r.role}</span> },
    {
      key: 'status', header: 'Trạng thái', width: '100px',
      render: (r) => <span className={cn('text-[12px] font-medium capitalize', statusStyle[r.status])}>{r.status === 'active' ? 'Hoạt động' : r.status === 'inactive' ? 'Ngưng' : 'Khóa'}</span>,
    },
    { key: 'credentials', header: 'Credentials', width: '100px', render: (r) => <CredentialIcons c={r.credentials} /> },
  ];

  return (
    <div>
      <PageHeader title="Quản lý nhân sự" description="Danh bạ nhân viên & quản lý credentials">
        <button onClick={() => setShowForm(true)} className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium" style={{ backgroundColor: PURPLE }}>+ Thêm người</button>
        <button className="px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#F8FAFC] text-[12px] font-medium">📥 Nhập hàng loạt</button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Tổng nhân sự" value={String(mockPeople.length)} sub="people" domain="manage" />
        <StatCard label="Đang hoạt động" value={String(active)} sub={`${Math.round(active / mockPeople.length * 100)}%`} domain="manage" />
        <StatCard label="Có thẻ" value={String(mockPeople.filter(p => p.credentials.card).length)} sub="card enrolled" domain="manage" />
        <StatCard label="Có khuôn mặt" value={String(mockPeople.filter(p => p.credentials.face).length)} sub="face enrolled" domain="manage" />
      </div>

      <div className="flex gap-2 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Tìm kiếm..." className="flex-1 h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:outline-none" style={{ borderColor: search ? PURPLE : undefined }} />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]">
          <option value="">Tất cả phòng ban</option>
          {['Kỹ thuật', 'Kinh doanh', 'Hành chính', 'Ban giám đốc'].map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <DataTable columns={columns} data={filtered} rowKey={(r) => r.id} onRowClick={(r) => setSelected(selected?.id === r.id ? null : r)} rowClassName={(r) => selected?.id === r.id ? 'bg-[#8B5CF6]/10' : ''} />

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
              <h4 className="text-[11px] uppercase text-[#64748B] mb-2 font-medium">Thông tin</h4>
              <p className="text-[#94A3B8]">Email: <span className="text-[#F8FAFC]">{selected.email}</span></p>
              <p className="text-[#94A3B8]">Phone: <span className="text-[#F8FAFC]">{selected.phone}</span></p>
              <p className="text-[#94A3B8]">ID: <span className="text-[#F8FAFC]">{selected.id}</span></p>
            </div>
            <div>
              <h4 className="text-[11px] uppercase text-[#64748B] mb-2 font-medium">Credentials</h4>
              <p className="text-[#94A3B8]">💳 Thẻ: <span className={selected.credentials.card ? 'text-[#22C55E]' : 'text-[#64748B]'}>{selected.credentials.card ? selected.cardUid : 'Chưa cấp'}</span></p>
              <p className="text-[#94A3B8]">👤 Khuôn mặt: <span className={selected.credentials.face ? 'text-[#22C55E]' : 'text-[#64748B]'}>{selected.credentials.face ? 'Đã đăng ký' : 'Chưa đăng ký'}</span></p>
              <p className="text-[#94A3B8]">📱 Mobile: <span className={selected.credentials.mobile ? 'text-[#22C55E]' : 'text-[#64748B]'}>{selected.credentials.mobile ? 'Đã kích hoạt' : 'Chưa kích hoạt'}</span></p>
            </div>
            <div>
              <h4 className="text-[11px] uppercase text-[#64748B] mb-2 font-medium">Nhóm truy cập</h4>
              {selected.accessGroups.map(g => <span key={g} className="inline-block mr-1 mb-1 px-2 py-0.5 rounded text-[11px] font-medium border" style={{ color: PURPLE, borderColor: `${PURPLE}40` }}>{g}</span>)}
            </div>
          </div>
          <div className="mt-4">
            <h4 className="text-[11px] uppercase text-[#64748B] mb-2 font-medium">10 sự kiện gần nhất</h4>
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
            <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">Thêm nhân viên mới</h3>
            <div className="space-y-3">
              {[
                { label: 'Họ tên', placeholder: 'Nguyễn Văn A' },
                { label: 'Email', placeholder: 'email@company.vn' },
                { label: 'Số điện thoại', placeholder: '0901234567' },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-[12px] text-[#94A3B8] mb-1 block">{f.label}</label>
                  <input placeholder={f.placeholder} className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:outline-none focus:border-[#8B5CF6]" />
                </div>
              ))}
              <div>
                <label className="text-[12px] text-[#94A3B8] mb-1 block">Phòng ban</label>
                <select className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]">
                  {['Kỹ thuật', 'Kinh doanh', 'Hành chính', 'Ban giám đốc'].map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[12px] text-[#94A3B8] mb-1 block">Chức vụ</label>
                <select className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]">
                  {['Nhân viên', 'Trưởng nhóm', 'Quản lý', 'Giám đốc'].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]">Hủy</button>
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium" style={{ backgroundColor: PURPLE }}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
