import { useState } from 'react';
import { PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { keys, keyLogs, summary, type Key, type KeyLog } from './mock-data';

const statusCfg: Record<string, { color: string; label: string }> = {
  available: { color: '#22C55E', label: 'Sẵn sàng' },
  'checked-out': { color: '#F59E0B', label: 'Đã mượn' },
  overdue: { color: '#EF4444', label: 'Quá hạn' },
  lost: { color: '#64748B', label: 'Mất' },
};

const typeCfg: Record<string, { color: string; label: string }> = {
  master: { color: '#EF4444', label: 'Master' },
  room: { color: '#3B82F6', label: 'Phòng' },
  cabinet: { color: '#8B5CF6', label: 'Tủ' },
  gate: { color: '#F59E0B', label: 'Cổng' },
};

export function KeyManagementPage() {
  const [tab, setTab] = useState<'keys' | 'logs'>('keys');

  const keyCols: Column<Key>[] = [
    { key: 'id', header: 'Mã', width: '70px', render: r => <span className="font-mono text-[12px] text-[#F59E0B]">{r.id}</span> },
    { key: 'name', header: 'Tên chìa', sortable: true, render: r => <span className="font-medium text-[#F8FAFC]">{r.name}</span> },
    { key: 'type', header: 'Loại', width: '80px', render: r => {
      const t = typeCfg[r.type];
      return <span className="text-[11px] font-medium" style={{ color: t.color }}>{t.label}</span>;
    }},
    { key: 'location', header: 'Vị trí', width: '100px' },
    { key: 'status', header: 'Trạng thái', width: '100px', render: r => {
      const s = statusCfg[r.status];
      return <span className={cn('inline-flex items-center gap-1 text-[12px] font-medium')}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
        <span style={{ color: s.color }}>{s.label}</span>
      </span>;
    }},
    { key: 'checkedOutBy', header: 'Người mượn', render: r => <span className="text-[#94A3B8]">{r.checkedOutBy || '—'}</span> },
    { key: 'dueBack', header: 'Hạn trả', width: '80px', render: r => <span className="font-mono text-[12px] text-[#94A3B8]">{r.dueBack || '—'}</span> },
  ];

  const logCols: Column<KeyLog>[] = [
    { key: 'date', header: 'Ngày', width: '100px', sortable: true },
    { key: 'time', header: 'Giờ', width: '70px', render: r => <span className="font-mono text-[12px]">{r.time}</span> },
    { key: 'keyName', header: 'Chìa khóa', sortable: true, render: r => <span className="font-medium text-[#F8FAFC]">{r.keyName}</span> },
    { key: 'person', header: 'Người', sortable: true },
    { key: 'action', header: 'Hành động', width: '90px', render: r => (
      <span className={cn('text-[12px] font-medium', r.action === 'checkout' ? 'text-[#F59E0B]' : 'text-[#22C55E]')}>
        {r.action === 'checkout' ? '🔑 Mượn' : '↩ Trả'}
      </span>
    )},
    { key: 'notes', header: 'Ghi chú', render: r => <span className="text-[#64748B]">{r.notes || '—'}</span> },
  ];

  return (
    <div>
      <PageHeader title="Quản lý chìa khóa" description="Theo dõi mượn/trả chìa khóa tòa nhà">
        <button className="px-3 py-1.5 bg-[#F59E0B] text-[#0F172A] rounded-md text-[12px] font-medium">+ Cấp chìa</button>
      </PageHeader>

      <div className="grid grid-cols-5 gap-3 mb-6">
        <StatCard label="Tổng chìa" value={String(summary.total)} sub="Trong hệ thống" icon="🔑" domain="operate" />
        <StatCard label="Sẵn sàng" value={String(summary.available)} sub="Có thể mượn" icon="✅" domain="operate" />
        <StatCard label="Đã mượn" value={String(summary.checkedOut)} sub="Đang sử dụng" icon="📤" domain="operate" />
        <StatCard label="Quá hạn" value={String(summary.overdue)} sub="Cần thu hồi" icon="⏰" domain="error" />
        <StatCard label="Mất" value={String(summary.lost)} sub="Cần thay thế" icon="❌" domain="error" />
      </div>

      <div className="flex gap-2 mb-4">
        {(['keys', 'logs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn(
            'px-3 py-1.5 rounded-md text-[12px] font-medium border',
            tab === t ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#F59E0B]' : 'bg-[#1E293B] border-[#334155] text-[#94A3B8]'
          )}>
            {t === 'keys' ? '🔑 Danh sách chìa' : '📋 Nhật ký'}
          </button>
        ))}
      </div>

      {tab === 'keys' ? (
        <DataTable columns={keyCols} data={keys} rowKey={r => r.id} />
      ) : (
        <DataTable columns={logCols} data={keyLogs} rowKey={r => r.id} />
      )}
    </div>
  );
}
