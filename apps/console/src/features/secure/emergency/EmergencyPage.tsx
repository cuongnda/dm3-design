import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockResponsePlans, mockEmergencyEvents, emergencyTypeConfig } from './mock-data';
import type { EmergencyType, EmergencyEvent } from './mock-data';

const typeKeys: EmergencyType[] = ['fire', 'lockdown', 'medical', 'intruder'];

const eventColumns: Column<EmergencyEvent>[] = [
  { key: 'time', header: 'Thời gian', width: '140px', sortable: true },
  {
    key: 'type', header: 'Loại', sortable: true,
    render: (r) => {
      const cfg = emergencyTypeConfig[r.type];
      return <span style={{ color: cfg.color }}>{cfg.icon} {cfg.label}</span>;
    },
  },
  { key: 'activatedBy', header: 'Kích hoạt bởi' },
  { key: 'duration', header: 'Thời gian XL', width: '100px' },
  {
    key: 'status', header: 'Trạng thái',
    render: (r) => (
      <span className={r.status === 'active' ? 'text-[#EF4444] font-medium' : 'text-[#22C55E]'}>
        {r.status === 'active' ? '⚠ Đang hoạt động' : '✓ Đã xử lý'}
      </span>
    ),
  },
  { key: 'description', header: 'Mô tả' },
];

function ConfirmDialog({ type, onConfirm, onCancel }: { type: EmergencyType; onConfirm: () => void; onCancel: () => void }) {
  const [count, setCount] = useState(3);
  const cfg = emergencyTypeConfig[type];

  useEffect(() => {
    if (count <= 0) { onConfirm(); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-8 max-w-md w-full text-center">
        <div className="text-[48px] mb-4">{cfg.icon}</div>
        <h2 className="text-[20px] font-bold text-[#F8FAFC] mb-2">Kích hoạt {cfg.label}?</h2>
        <p className="text-[14px] text-[#94A3B8] mb-6">Hệ thống sẽ kích hoạt trong...</p>
        <div className="text-[64px] font-bold mb-6" style={{ color: cfg.color }}>{count}</div>
        <button
          onClick={onCancel}
          className="px-6 py-3 bg-[#1E293B] border border-[#334155] rounded-lg text-[#F8FAFC] text-[14px] font-medium hover:bg-[#334155] transition-colors"
        >
          ✕ Hủy bỏ
        </button>
      </div>
    </div>
  );
}

export function EmergencyPage() {
  const [activeEmergency, setActiveEmergency] = useState<EmergencyType | null>(null);
  const [confirming, setConfirming] = useState<EmergencyType | null>(null);

  const handleActivate = useCallback(() => {
    if (confirming) {
      setActiveEmergency(confirming);
      setConfirming(null);
    }
  }, [confirming]);

  const handleDeactivate = () => setActiveEmergency(null);

  return (
    <div>
      {confirming && <ConfirmDialog type={confirming} onConfirm={handleActivate} onCancel={() => setConfirming(null)} />}

      <PageHeader title="Emergency Management" description="Quản lý tình huống khẩn cấp" />

      {/* Active emergency banner */}
      {activeEmergency && (
        <div className="mb-6 p-4 rounded-lg border-2 animate-pulse" style={{ backgroundColor: `${emergencyTypeConfig[activeEmergency].color}15`, borderColor: emergencyTypeConfig[activeEmergency].color }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[32px]">{emergencyTypeConfig[activeEmergency].icon}</span>
              <div>
                <div className="text-[18px] font-bold" style={{ color: emergencyTypeConfig[activeEmergency].color }}>
                  ⚠ TÌNH HUỐNG KHẨN CẤP: {emergencyTypeConfig[activeEmergency].label.toUpperCase()}
                </div>
                <div className="text-[13px] text-[#94A3B8]">Đang hoạt động — Tất cả nhân viên tuân thủ quy trình an toàn</div>
              </div>
            </div>
            <button
              onClick={handleDeactivate}
              className="px-4 py-2 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-lg text-[#22C55E] text-[13px] font-medium hover:bg-[#22C55E]/20 transition-colors"
            >
              ✓ All Clear — Hủy báo động
            </button>
          </div>
        </div>
      )}

      {/* Emergency buttons */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {typeKeys.map((type) => {
          const cfg = emergencyTypeConfig[type];
          const isActive = activeEmergency === type;
          return (
            <button
              key={type}
              onClick={() => !isActive && setConfirming(type)}
              disabled={isActive}
              className={cn(
                'p-6 rounded-xl border-2 text-center transition-all',
                isActive
                  ? 'animate-pulse'
                  : 'hover:scale-[1.02] active:scale-[0.98]'
              )}
              style={{
                backgroundColor: `${cfg.color}${isActive ? '25' : '10'}`,
                borderColor: `${cfg.color}${isActive ? '' : '40'}`,
              }}
            >
              <div className="text-[40px] mb-3">{cfg.icon}</div>
              <div className="text-[16px] font-bold" style={{ color: cfg.color }}>{cfg.label}</div>
              <div className="text-[12px] text-[#64748B] mt-1">{isActive ? 'ĐANG HOẠT ĐỘNG' : 'Nhấn để kích hoạt'}</div>
            </button>
          );
        })}
      </div>

      {/* Response plans */}
      <div className="mb-6">
        <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">Phương án ứng phó</h2>
        <div className="grid grid-cols-2 gap-4">
          {mockResponsePlans.map((plan) => {
            const cfg = emergencyTypeConfig[plan.type];
            return (
              <div key={plan.id} className="bg-[#111827] border border-[#1E293B] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[18px]">{cfg.icon}</span>
                  <span className="text-[14px] font-semibold text-[#F8FAFC]">{plan.name}</span>
                </div>
                <div className="space-y-1.5 mb-3">
                  {plan.steps.map((step, i) => (
                    <div key={i} className="flex gap-2 text-[12px]">
                      <span className="text-[#64748B] shrink-0">{i + 1}.</span>
                      <span className="text-[#94A3B8]">{step}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#1E293B] pt-2">
                  {plan.contacts.map((c, i) => (
                    <div key={i} className="text-[11px] text-[#64748B]">📞 {c}</div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event log */}
      <div>
        <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">Nhật ký sự kiện</h2>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-hidden">
          <DataTable columns={eventColumns} data={mockEmergencyEvents} rowKey={(r) => r.id} />
        </div>
      </div>
    </div>
  );
}
