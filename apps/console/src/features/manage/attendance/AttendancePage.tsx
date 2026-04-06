import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { PageHeader, Select, SelectOption } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockAttendance, summary, type AttendanceRecord } from './mock-data';

const shiftColors: Record<string, { text: string; border: string }> = {
  'Hành chính': { text: 'text-[#8B5CF6]', border: 'border-[#8B5CF6]/30' },
  'Sáng': { text: 'text-[#06B6D4]', border: 'border-[#06B6D4]/30' },
  'Chiều': { text: 'text-[#F59E0B]', border: 'border-[#F59E0B]/30' },
};

export function AttendancePage() {
  const { t } = useTranslation('manage');
  const [deptFilter, setDeptFilter] = useState('');

  const statusConfig: Record<string, { color: string; label: string }> = {
    'on-time': { color: '#22C55E', label: t('attendance.stats.onTime') },
    late: { color: '#EAB308', label: t('attendance.stats.late') },
    absent: { color: '#EF4444', label: t('attendance.stats.absent') },
    'on-leave': { color: '#3B82F6', label: t('attendance.stats.leave') },
  };

  const donutData = [
    { name: t('attendance.stats.onTime'), value: summary.onTime, color: '#22C55E' },
    { name: t('attendance.stats.late'), value: summary.late, color: '#EAB308' },
    { name: t('attendance.stats.absent'), value: summary.absent, color: '#EF4444' },
    { name: t('attendance.stats.leave'), value: summary.onLeave, color: '#3B82F6' },
  ];

  const filtered = deptFilter ? mockAttendance.filter(a => a.department === deptFilter) : mockAttendance;

  const columns: Column<AttendanceRecord>[] = [
    { key: 'name', header: t('attendance.table.name'), sortable: true, render: (r) => <span className="font-medium text-[#F8FAFC]">{r.name}</span> },
    { key: 'department', header: t('attendance.table.department'), sortable: true, render: (r) => <span className="text-[#94A3B8]">{r.department}</span> },
    { key: 'shift', header: t('attendance.table.shift'), width: '90px', render: (r) => {
      const s = shiftColors[r.shift];
      return <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium border', s.text, s.border)}>{r.shift}</span>;
    }},
    { key: 'clockIn', header: t('attendance.table.checkIn'), width: '80px', render: (r) => <span className="font-mono text-[12px] text-[#94A3B8]">{r.clockIn || '—'}</span> },
    { key: 'clockOut', header: t('attendance.table.checkOut'), width: '80px', render: (r) => <span className="font-mono text-[12px] text-[#94A3B8]">{r.clockOut || '—'}</span> },
    { key: 'hours', header: t('attendance.table.hours'), width: '70px', render: (r) => <span className="text-[#F8FAFC]">{r.hours || '—'}</span> },
    { key: 'status', header: t('attendance.table.status'), width: '100px', render: (r) => {
      const c = statusConfig[r.status];
      return <span className="text-[12px] font-medium" style={{ color: c.color }}>{c.label}</span>;
    }},
  ];

  return (
    <div>
      <PageHeader title={t('attendance.title')} description={t('attendance.description')}>
        <button className="px-3 py-1.5 bg-[#1E293B] border border-[#334155] rounded-md text-[#F8FAFC] text-[12px] font-medium">{t('attendance.monthlyReport')}</button>
      </PageHeader>

      {/* Summary with donut */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-4 flex items-center justify-center">
          <ResponsiveContainer width={100} height={100}>
            <PieChart>
              <Pie data={donutData} cx="50%" cy="50%" innerRadius={28} outerRadius={42} dataKey="value" strokeWidth={0}>
                {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        {[
          { label: t('attendance.stats.onTime'), value: summary.onTime, pct: Math.round(summary.onTime / summary.total * 100), color: '#22C55E' },
          { label: t('attendance.stats.late'), value: summary.late, pct: Math.round(summary.late / summary.total * 100), color: '#EAB308' },
          { label: t('attendance.stats.absent'), value: summary.absent, pct: Math.round(summary.absent / summary.total * 100), color: '#EF4444' },
          { label: t('attendance.stats.leave'), value: summary.onLeave, pct: Math.round(summary.onLeave / summary.total * 100), color: '#3B82F6' },
        ].map(s => (
          <div key={s.label} className="bg-[#1E293B] border border-[#334155] rounded-lg p-4">
            <div className="text-[12px] text-[#94A3B8] mb-1">{s.label}</div>
            <div className="text-[24px] font-semibold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[12px] text-[#64748B]">{s.pct}%</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <Select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="w-44">
          <SelectOption value="">{t('attendance.filter.allDepartments')}</SelectOption>
          {['Kỹ thuật', 'Kinh doanh', 'Hành chính', 'Ban giám đốc'].map(d => <SelectOption key={d} value={d}>{d}</SelectOption>)}
        </Select>
      </div>

      <DataTable columns={columns} data={filtered} rowKey={r => r.id} rowClassName={r => r.status === 'absent' ? 'bg-[#7F1D1D]/10' : r.status === 'late' ? 'bg-[#713F12]/10' : ''} />
    </div>
  );
}
