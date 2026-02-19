import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { DataTable, type Column } from '@/components/common/DataTable';
import { cn } from '@/lib/utils';
import { workOrders, summary, type WorkOrder } from './mock-data';

const priorityCfg: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: '#EF4444', bg: 'bg-[#EF4444]/20', label: 'Khẩn cấp' },
  high: { color: '#F59E0B', bg: 'bg-[#F59E0B]/20', label: 'Cao' },
  medium: { color: '#3B82F6', bg: 'bg-[#3B82F6]/20', label: 'Trung bình' },
  low: { color: '#22C55E', bg: 'bg-[#22C55E]/20', label: 'Thấp' },
};

const statusCfg: Record<string, { color: string; label: string }> = {
  open: { color: '#3B82F6', label: 'Mở' },
  'in-progress': { color: '#F59E0B', label: 'Đang xử lý' },
  completed: { color: '#22C55E', label: 'Hoàn thành' },
  cancelled: { color: '#64748B', label: 'Đã hủy' },
};

export function MaintenancePage() {
  const [statusFilter, setStatusFilter] = useState('');
  const filtered = statusFilter ? workOrders.filter(w => w.status === statusFilter) : workOrders;

  const columns: Column<WorkOrder>[] = [
    { key: 'id', header: 'Mã', width: '80px', render: r => <span className="font-mono text-[12px] text-[#F59E0B]">{r.id}</span> },
    { key: 'title', header: 'Tiêu đề', sortable: true, render: r => <span className="font-medium text-[#F8FAFC]">{r.title}</span> },
    { key: 'location', header: 'Vị trí', sortable: true, render: r => <span className="text-[#94A3B8]">{r.location}</span> },
    { key: 'category', header: 'Loại', width: '90px' },
    { key: 'priority', header: 'Ưu tiên', width: '100px', sortable: true, render: r => {
      const p = priorityCfg[r.priority];
      return <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium', p.bg)} style={{ color: p.color }}>{p.label}</span>;
    }},
    { key: 'status', header: 'Trạng thái', width: '110px', render: r => {
      const s = statusCfg[r.status];
      return <span className="text-[12px] font-medium" style={{ color: s.color }}>{s.label}</span>;
    }},
    { key: 'assignee', header: 'Phụ trách', sortable: true },
    { key: 'createdAt', header: 'Ngày tạo', width: '100px', sortable: true },
  ];

  return (
    <div>
      <PageHeader title="Bảo trì" description="Quản lý yêu cầu sửa chữa và bảo trì tòa nhà">
        <button className="px-3 py-1.5 bg-[#F59E0B] text-[#0F172A] rounded-md text-[12px] font-medium">+ Tạo yêu cầu</button>
      </PageHeader>

      <div className="grid grid-cols-5 gap-3 mb-6">
        <StatCard label="Tổng yêu cầu" value={String(summary.total)} sub="Tất cả" icon="🔧" domain="operate" />
        <StatCard label="Đang mở" value={String(summary.open)} sub="Chờ xử lý" icon="📋" domain="operate" />
        <StatCard label="Đang xử lý" value={String(summary.inProgress)} sub="Thực hiện" icon="⚙️" domain="operate" />
        <StatCard label="Hoàn thành" value={String(summary.completed)} sub="Đã xong" icon="✅" domain="operate" />
        <StatCard label="Khẩn cấp" value={String(summary.critical)} sub="Cần ưu tiên" icon="🚨" domain="error" />
      </div>

      <div className="flex gap-2 mb-4">
        {['', 'open', 'in-progress', 'completed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={cn(
            'px-3 py-1.5 rounded-md text-[12px] font-medium border',
            statusFilter === s ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#F59E0B]' : 'bg-[#1E293B] border-[#334155] text-[#94A3B8]'
          )}>
            {s === '' ? 'Tất cả' : statusCfg[s].label}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} rowKey={r => r.id} />
    </div>
  );
}
