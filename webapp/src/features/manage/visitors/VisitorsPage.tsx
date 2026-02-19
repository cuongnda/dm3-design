import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatCard } from '@/components/common/StatCard';
import { cn } from '@/lib/utils';
import { mockVisitors, type Visitor } from './mock-data';

const PURPLE = '#8B5CF6';

const tabs = [
  { label: 'Đang chờ', status: 'waiting' as const, count: mockVisitors.filter(v => v.status === 'waiting').length },
  { label: 'Đã check-in', status: 'checked-in' as const, count: mockVisitors.filter(v => v.status === 'checked-in').length },
  { label: 'Đã check-out', status: 'checked-out' as const, count: mockVisitors.filter(v => v.status === 'checked-out').length },
];

const statusColors: Record<string, string> = {
  waiting: 'text-[#EAB308]',
  'checked-in': 'text-[#22C55E]',
  'checked-out': 'text-[#64748B]',
};
const statusLabels: Record<string, string> = {
  waiting: 'Đang chờ',
  'checked-in': 'Đã vào',
  'checked-out': 'Đã ra',
};

export function VisitorsPage() {
  const [activeTab, setActiveTab] = useState<Visitor['status']>('waiting');
  const [showForm, setShowForm] = useState(false);

  const filtered = mockVisitors.filter(v => v.status === activeTab);
  const preRegToday = mockVisitors.filter(v => v.preRegistered).length;

  const columns: Column<Visitor>[] = [
    { key: 'id', header: 'ID', width: '70px', render: (r) => <span className="font-mono text-[11px] text-[#64748B]">{r.id}</span> },
    { key: 'name', header: 'Khách', sortable: true, render: (r) => (
      <div>
        <span className="font-medium text-[#F8FAFC]">{r.name}</span>
        <span className="block text-[11px] text-[#64748B]">{r.company}</span>
      </div>
    )},
    { key: 'host', header: 'Người tiếp', sortable: true, render: (r) => <span className="text-[#94A3B8]">{r.host}</span> },
    { key: 'purpose', header: 'Mục đích', render: (r) => <span className="text-[#94A3B8]">{r.purpose}</span> },
    { key: 'expectedTime', header: 'Giờ hẹn', width: '80px', render: (r) => <span className="font-mono text-[12px] text-[#94A3B8]">{r.expectedTime}</span> },
    { key: 'status', header: 'Trạng thái', width: '100px', render: (r) => (
      <span className={cn('text-[12px] font-medium', statusColors[r.status])}>
        {statusLabels[r.status]}
      </span>
    )},
    { key: 'preRegistered', header: '', width: '40px', render: (r) => r.preRegistered ? <span title="Đã đăng ký trước" className="text-[14px]">📋</span> : null },
    ...(activeTab === 'waiting' ? [{
      key: 'actions' as string, header: '', width: '80px',
      render: () => <button className="px-2 py-1 rounded text-[11px] font-medium text-white" style={{ backgroundColor: PURPLE }}>Check-in</button>,
    }] : []),
  ];

  return (
    <div>
      <PageHeader title="Quản lý khách" description="Đăng ký, check-in/out khách thăm">
        <button onClick={() => setShowForm(true)} className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium" style={{ backgroundColor: PURPLE }}>+ Đăng ký trước</button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Khách hôm nay" value={String(mockVisitors.length)} sub="total visitors" domain="manage" />
        <StatCard label="Đang trong tòa nhà" value={String(tabs[1].count)} sub="checked in" domain="manage" />
        <StatCard label="Đăng ký trước" value={String(preRegToday)} sub="pre-registered" domain="manage" />
        <StatCard label="Đang chờ" value={String(tabs[0].count)} sub="in queue" icon="⏳" domain="manage" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1E293B] mb-4">
        {tabs.map(t => (
          <button key={t.status} onClick={() => setActiveTab(t.status)} className={cn(
            'px-4 py-2 text-[13px] font-medium border-b-2 transition-colors',
            activeTab === t.status ? 'text-[#F8FAFC]' : 'text-[#94A3B8] border-transparent hover:text-[#F8FAFC]'
          )} style={activeTab === t.status ? { borderColor: PURPLE } : undefined}>
            {t.label}
            <span className={cn('ml-1.5 text-[11px] px-1.5 rounded-full', activeTab === t.status ? 'text-[#8B5CF6] bg-[#8B5CF6]/20' : 'bg-[#334155] text-[#94A3B8]')}>{t.count}</span>
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} rowKey={(r) => r.id} />

      {/* QR Code placeholder */}
      {activeTab === 'waiting' && (
        <div className="mt-4 flex items-center gap-4 p-4 bg-[#1E293B] border border-[#334155] rounded-lg">
          <div className="w-24 h-24 bg-[#111827] border border-[#334155] rounded-lg flex items-center justify-center text-[32px] text-[#64748B]">📱</div>
          <div>
            <p className="text-[13px] font-medium text-[#F8FAFC]">QR Check-in</p>
            <p className="text-[12px] text-[#94A3B8]">Quét mã QR để check-in nhanh tại kiosk</p>
          </div>
        </div>
      )}

      {/* Pre-registration form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-6 w-[480px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-[#F8FAFC] mb-4">Đăng ký khách trước</h3>
            <div className="space-y-3">
              {[{ l: 'Tên khách', p: 'Họ tên' }, { l: 'Công ty', p: 'Tên công ty' }].map(f => (
                <div key={f.l}><label className="text-[12px] text-[#94A3B8] mb-1 block">{f.l}</label><input placeholder={f.p} className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:outline-none focus:border-[#8B5CF6]" /></div>
              ))}
              <div>
                <label className="text-[12px] text-[#94A3B8] mb-1 block">Người tiếp</label>
                <select className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]">
                  {['Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Minh Đức'].map(h => <option key={h}>{h}</option>)}
                </select>
              </div>
              <div><label className="text-[12px] text-[#94A3B8] mb-1 block">Mục đích</label><input placeholder="Họp dự án..." className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:outline-none focus:border-[#8B5CF6]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[12px] text-[#94A3B8] mb-1 block">Ngày</label><input type="date" className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]" /></div>
                <div><label className="text-[12px] text-[#94A3B8] mb-1 block">Giờ</label><input type="time" className="w-full h-8 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]" /></div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 bg-[#111827] border border-[#334155] rounded-md text-[#94A3B8] text-[12px]">Hủy</button>
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium" style={{ backgroundColor: PURPLE }}>Đăng ký</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
