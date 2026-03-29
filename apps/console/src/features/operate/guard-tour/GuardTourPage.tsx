import { PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { routes, checkpoints, tourLogs, summary, type TourLog, type PatrolRoute } from './mock-data';

const routeStatusCfg: Record<string, { color: string; label: string }> = {
  active: { color: '#22C55E', label: 'Đang hoạt động' },
  'in-progress': { color: '#F59E0B', label: 'Đang tuần tra' },
  completed: { color: '#3B82F6', label: 'Hoàn thành' },
  missed: { color: '#EF4444', label: 'Bỏ lỡ' },
};

const logStatusCfg: Record<string, { color: string; label: string }> = {
  completed: { color: '#22C55E', label: 'Hoàn thành' },
  'in-progress': { color: '#F59E0B', label: 'Đang thực hiện' },
  incomplete: { color: '#EF4444', label: 'Chưa hoàn thành' },
};

export function GuardTourPage() {
  const logCols: Column<TourLog>[] = [
    { key: 'date', header: 'Ngày', width: '100px', sortable: true },
    { key: 'routeName', header: 'Tuyến', sortable: true, render: r => <span className="font-medium text-[#F8FAFC]">{r.routeName}</span> },
    { key: 'guardName', header: 'Bảo vệ', sortable: true },
    { key: 'startTime', header: 'Bắt đầu', width: '80px', render: r => <span className="font-mono text-[12px]">{r.startTime}</span> },
    { key: 'endTime', header: 'Kết thúc', width: '80px', render: r => <span className="font-mono text-[12px]">{r.endTime || '—'}</span> },
    { key: 'checkpointsScanned', header: 'Điểm quét', width: '90px', render: r => (
      <span className={cn('text-[12px] font-medium', r.checkpointsScanned === r.checkpointsTotal ? 'text-[#22C55E]' : 'text-[#F59E0B]')}>
        {r.checkpointsScanned}/{r.checkpointsTotal}
      </span>
    )},
    { key: 'status', header: 'Trạng thái', width: '120px', render: r => {
      const s = logStatusCfg[r.status];
      return <span className="text-[12px] font-medium" style={{ color: s.color }}>{s.label}</span>;
    }},
  ];

  return (
    <div>
      <PageHeader title="Tuần tra bảo vệ" description="Theo dõi tuyến tuần tra và điểm kiểm soát">
        <button className="px-3 py-1.5 bg-[#F59E0B] text-[#0F172A] rounded-md text-[12px] font-medium">📊 Báo cáo</button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Tuyến tuần tra" value={String(summary.totalRoutes)} sub="Đã thiết lập" icon="🗺️" domain="operate" />
        <StatCard label="Đang hoạt động" value={String(summary.activeNow)} sub="Hiện tại" icon="🚶" domain="operate" />
        <StatCard label="Bỏ lỡ hôm nay" value={String(summary.missedToday)} sub="Cần kiểm tra" icon="⚠️" domain="error" />
        <StatCard label="Điểm kiểm soát" value={String(summary.totalCheckpoints)} sub="Tổng cộng" icon="📍" domain="operate" />
      </div>

      {/* Route cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {routes.map((route: PatrolRoute) => {
          const st = routeStatusCfg[route.status];
          return (
            <div key={route.id} className="bg-[#1E293B] border border-[#334155] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-[#64748B]">{route.id}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: st.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.color }} />
                  {st.label}
                </span>
              </div>
              <div className="text-[13px] font-medium text-[#F8FAFC] mb-1">{route.name}</div>
              <div className="text-[11px] text-[#64748B] mb-2">{route.assignedGuard}</div>
              <div className="flex justify-between text-[11px] text-[#94A3B8]">
                <span>{route.checkpoints} điểm</span>
                <span>{route.frequency}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Checkpoint status */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-4 mb-6">
        <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-3">Trạng thái điểm kiểm soát</h3>
        <div className="grid grid-cols-6 gap-2">
          {checkpoints.map(cp => (
            <div key={cp.id} className={cn(
              'p-2 rounded border text-center',
              cp.status === 'scanned' ? 'bg-[#22C55E]/10 border-[#22C55E]/30' :
              cp.status === 'missed' ? 'bg-[#EF4444]/10 border-[#EF4444]/30' :
              'bg-[#111827] border-[#334155]'
            )}>
              <div className="text-[11px] font-medium text-[#F8FAFC]">{cp.name}</div>
              <div className="text-[10px] text-[#64748B]">{cp.scannedAt || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-3">Nhật ký tuần tra</h3>
      <DataTable columns={logCols} data={tourLogs} rowKey={r => r.id} />
    </div>
  );
}
