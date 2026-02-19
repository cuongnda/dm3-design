import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { cn } from '@/lib/utils';
import { sensors, energyData, alerts, summary } from './mock-data';

const typeIcons: Record<string, string> = {
  temperature: '🌡️', humidity: '💧', power: '⚡', water: '🚰', 'air-quality': '🌬️', light: '💡',
};

const statusColors: Record<string, string> = {
  normal: '#22C55E', warning: '#EAB308', critical: '#EF4444', offline: '#64748B',
};

export function IoTEnergyPage() {
  return (
    <div>
      <PageHeader title="IoT & Năng lượng" description="Giám sát cảm biến và tiêu thụ năng lượng">
        <button className="px-3 py-1.5 bg-[#F59E0B] text-[#0F172A] rounded-md text-[12px] font-medium">📊 Báo cáo năng lượng</button>
      </PageHeader>

      <div className="grid grid-cols-6 gap-3 mb-6">
        <StatCard label="Cảm biến" value={String(summary.totalSensors)} sub="Tổng cộng" icon="📡" domain="operate" />
        <StatCard label="Trực tuyến" value={String(summary.online)} sub="Hoạt động" icon="✅" domain="operate" />
        <StatCard label="Cảnh báo" value={String(summary.warnings)} sub="Cần chú ý" icon="⚠️" domain="operate" />
        <StatCard label="Nghiêm trọng" value={String(summary.critical)} sub="Khẩn cấp" icon="🚨" domain="error" />
        <StatCard label="Điện tháng này" value={summary.monthlyElectricity} sub="kWh" icon="⚡" domain="operate" />
        <StatCard label="Chi phí" value={summary.monthlyCost} sub="Tháng 2/2025" icon="💰" domain="operate" />
      </div>

      {/* Alerts */}
      {alerts.filter(a => !a.acknowledged).length > 0 && (
        <div className="bg-[#7F1D1D]/20 border border-[#EF4444]/30 rounded-lg p-4 mb-6">
          <h3 className="text-[14px] font-medium text-[#EF4444] mb-3">🚨 Cảnh báo chưa xử lý</h3>
          <div className="space-y-2">
            {alerts.filter(a => !a.acknowledged).map(a => (
              <div key={a.id} className="flex items-center justify-between bg-[#111827] rounded-md p-3">
                <div>
                  <span className={cn('text-[12px] font-medium', a.type === 'critical' ? 'text-[#EF4444]' : 'text-[#EAB308]')}>
                    {a.type === 'critical' ? '🔴' : '🟡'} {a.sensorName}
                  </span>
                  <div className="text-[11px] text-[#94A3B8]">{a.message}</div>
                </div>
                <span className="text-[11px] text-[#64748B]">{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Energy chart placeholder */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-4 mb-6">
        <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-3">Tiêu thụ năng lượng 6 tháng</h3>
        <div className="flex items-end gap-3 h-[200px]">
          {energyData.map(d => {
            const maxE = 50000;
            const h = (d.electricity / maxE) * 180;
            return (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-[#F59E0B] font-medium">{(d.electricity / 1000).toFixed(0)}k</span>
                <div className="w-full rounded-t" style={{ height: h, backgroundColor: '#F59E0B33', border: '1px solid #F59E0B66' }} />
                <span className="text-[11px] text-[#64748B]">{d.month}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sensor grid */}
      <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-3">Bảng cảm biến</h3>
      <div className="grid grid-cols-6 gap-2">
        {sensors.map(s => (
          <div key={s.id} className={cn(
            'bg-[#1E293B] border rounded-lg p-3',
            s.status === 'critical' ? 'border-[#EF4444]/50' :
            s.status === 'warning' ? 'border-[#EAB308]/50' :
            'border-[#334155]'
          )}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px]">{typeIcons[s.type]}</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColors[s.status] }} />
            </div>
            <div className="text-[16px] font-semibold text-[#F8FAFC]">{s.value}<span className="text-[11px] text-[#64748B] ml-1">{s.unit}</span></div>
            <div className="text-[10px] text-[#64748B] truncate">{s.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
