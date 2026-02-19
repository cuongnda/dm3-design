import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { cn } from '@/lib/utils';
import { mockCompanies } from './mock-data';

const PURPLE = '#8B5CF6';

function ComplianceCheck({ ok, label }: { ok: boolean; label: string }) {
  return <span className={cn('text-[12px] mr-3', ok ? 'text-[#22C55E]' : 'text-[#EF4444]')}>{ok ? '✅' : '❌'} {label}</span>;
}

function BadgeExpiry({ date }: { date?: string }) {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const days = Math.floor((d.getTime() - now.getTime()) / 86400000);
  if (days < 0) return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#EF4444]/20 text-[#EF4444]">Hết hạn</span>;
  if (days < 14) return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#EAB308]/20 text-[#EAB308]">Còn {days} ngày</span>;
  return <span className="text-[11px] text-[#64748B]">{date}</span>;
}

export function ContractorsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const allWorkers = mockCompanies.flatMap(c => c.workers);
  const checkedIn = allWorkers.filter(w => w.checkedIn).length;
  const expiring = allWorkers.filter(w => {
    if (!w.badgeExpiry) return false;
    const days = Math.floor((new Date(w.badgeExpiry).getTime() - Date.now()) / 86400000);
    return days < 14;
  }).length;

  return (
    <div>
      <PageHeader title="Quản lý nhà thầu" description="Công ty, công nhân & tuân thủ">
        <button className="px-3 py-1.5 rounded-md text-white text-[12px] font-medium" style={{ backgroundColor: PURPLE }}>+ Thêm công ty</button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Công ty" value={String(mockCompanies.length)} sub="active contracts" domain="manage" />
        <StatCard label="Công nhân" value={String(allWorkers.length)} sub="registered" domain="manage" />
        <StatCard label="Đã check-in" value={String(checkedIn)} sub="on site today" domain="manage" />
        <StatCard label="Sắp hết hạn" value={String(expiring)} sub="credentials" icon="⚠️" domain="error" />
      </div>

      <div className="space-y-3">
        {mockCompanies.map(company => (
          <div key={company.id} className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-hidden">
            <button onClick={() => setExpanded(expanded === company.id ? null : company.id)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#1a2235] transition-colors">
              <div className="flex items-center gap-4">
                <span className="text-[14px] font-medium text-[#F8FAFC]">{company.name}</span>
                <span className="text-[12px] text-[#94A3B8]">{company.activeWorkers}/{company.totalWorkers} công nhân</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn('text-[12px] font-medium', company.compliance >= 90 ? 'text-[#22C55E]' : company.compliance >= 70 ? 'text-[#EAB308]' : 'text-[#EF4444]')}>
                  {company.compliance}% tuân thủ
                </span>
                <span className="text-[12px] text-[#64748B]">HĐ: {company.contractEnd}</span>
                <span className="text-[#64748B]">{expanded === company.id ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded === company.id && (
              <div className="border-t border-[#334155] px-4 py-3">
                <table className="w-full">
                  <thead>
                    <tr className="text-[11px] uppercase text-[#64748B]">
                      <th className="text-left py-1 px-2">ID</th>
                      <th className="text-left py-1 px-2">Họ tên</th>
                      <th className="text-left py-1 px-2">Vai trò</th>
                      <th className="text-left py-1 px-2">Tuân thủ</th>
                      <th className="text-left py-1 px-2">Thẻ</th>
                      <th className="text-left py-1 px-2">Check-in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {company.workers.map(w => (
                      <tr key={w.id} className="border-t border-[#111827] text-[13px]">
                        <td className="py-2 px-2 font-mono text-[11px] text-[#64748B]">{w.id}</td>
                        <td className="py-2 px-2 text-[#F8FAFC]">{w.name}</td>
                        <td className="py-2 px-2 text-[#94A3B8]">{w.role}</td>
                        <td className="py-2 px-2">
                          <ComplianceCheck ok={w.safetyTraining} label="AT" />
                          <ComplianceCheck ok={w.insurance} label="BH" />
                          <ComplianceCheck ok={w.badge} label="Thẻ" />
                        </td>
                        <td className="py-2 px-2"><BadgeExpiry date={w.badgeExpiry} /></td>
                        <td className="py-2 px-2">
                          {w.checkedIn ? (
                            <span className="text-[#22C55E] text-[12px]">✓ {w.checkInTime}</span>
                          ) : (
                            <span className="text-[#64748B] text-[12px]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
