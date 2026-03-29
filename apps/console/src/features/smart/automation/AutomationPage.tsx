import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { rules, executionLogs, summary, type AutomationRule, type ExecutionLog } from './mock-data';

export function AutomationPage() {
  const { t } = useTranslation('smart');
  const [tab, setTab] = useState<'rules' | 'logs'>('rules');
  const [ruleStates, setRuleStates] = useState<Record<string, boolean>>(
    Object.fromEntries(rules.map(r => [r.id, r.enabled]))
  );

  const toggleRule = (id: string) => {
    setRuleStates(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const resultCfg: Record<string, { color: string; label: string }> = {
    success: { color: '#22C55E', label: t('automation.result.success') },
    failed: { color: '#EF4444', label: t('automation.result.failed') },
    skipped: { color: '#64748B', label: t('automation.result.skipped') },
  };

  const logCols: Column<ExecutionLog>[] = [
    { key: 'timestamp', header: 'Thời gian', width: '130px', sortable: true, render: r => <span className="font-mono text-[12px] text-[#94A3B8]">{r.timestamp}</span> },
    { key: 'ruleName', header: 'Quy tắc', sortable: true, render: r => <span className="font-medium text-[#F8FAFC]">{r.ruleName}</span> },
    { key: 'trigger', header: 'Kích hoạt', render: r => <span className="text-[12px] text-[#94A3B8]">{r.trigger}</span> },
    { key: 'duration', header: 'Thời gian', width: '80px' },
    { key: 'result', header: 'Kết quả', width: '100px', render: r => {
      const c = resultCfg[r.result];
      return <span className="text-[12px] font-medium" style={{ color: c.color }}>{c.label}</span>;
    }},
    { key: 'details', header: 'Chi tiết', render: r => <span className="text-[12px] text-[#64748B]">{r.details}</span> },
  ];

  return (
    <div>
      <PageHeader title={t('automation.title')} description={t('automation.description')}>
        <button className="px-3 py-1.5 bg-[#06B6D4] text-[#0F172A] rounded-md text-[12px] font-medium">+ {t('automation.createRule')}</button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Tổng quy tắc" value={String(summary.totalRules)} sub="Đã thiết lập" icon="⚡" domain="smart" />
        <StatCard label="Đang bật" value={String(summary.activeRules)} sub="Hoạt động" icon="✅" domain="smart" />
        <StatCard label="Lần chạy" value={String(summary.totalExecutions)} sub="Hôm nay" icon="🔄" domain="smart" />
        <StatCard label="Tỷ lệ thành công" value={`${summary.successRate}%`} sub="Trung bình" icon="📊" domain="smart" />
      </div>

      <div className="flex gap-2 mb-4">
        {(['rules', 'logs'] as const).map(tabKey => (
          <button key={tabKey} onClick={() => setTab(tabKey)} className={cn(
            'px-3 py-1.5 rounded-md text-[12px] font-medium border',
            tab === tabKey ? 'bg-[#06B6D4]/20 border-[#06B6D4]/50 text-[#06B6D4]' : 'bg-[#1E293B] border-[#334155] text-[#94A3B8]'
          )}>
            {tabKey === 'rules' ? `⚡ ${t('automation.tab.rules')}` : `📋 ${t('automation.tab.log')}`}
          </button>
        ))}
      </div>

      {tab === 'rules' ? (
        <div className="space-y-3">
          {rules.map((rule: AutomationRule) => (
            <div key={rule.id} className={cn(
              'bg-[#1E293B] border rounded-lg p-4 transition-colors',
              ruleStates[rule.id] ? 'border-[#334155]' : 'border-[#334155] opacity-60'
            )}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] text-[#06B6D4]">{rule.id}</span>
                    <span className="text-[14px] font-medium text-[#F8FAFC]">{rule.name}</span>
                  </div>
                  <p className="text-[12px] text-[#64748B] mb-3">{rule.description}</p>
                  <div className="flex gap-6">
                    <div>
                      <div className="text-[10px] uppercase text-[#475569] mb-1">Kích hoạt</div>
                      <div className="text-[12px] text-[#94A3B8]">🎯 {rule.trigger}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-[#475569] mb-1">Điều kiện</div>
                      <div className="text-[12px] text-[#94A3B8]">🔍 {rule.condition}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-[#475569] mb-1">Hành động</div>
                      <div className="text-[12px] text-[#94A3B8]">⚡ {rule.action}</div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button onClick={() => toggleRule(rule.id)} className={cn(
                    'w-10 h-5 rounded-full transition-colors relative',
                    ruleStates[rule.id] ? 'bg-[#06B6D4]' : 'bg-[#334155]'
                  )}>
                    <span className={cn(
                      'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                      ruleStates[rule.id] ? 'left-5' : 'left-0.5'
                    )} />
                  </button>
                  <span className="text-[10px] text-[#64748B]">Chạy {rule.runCount} lần</span>
                  {rule.lastRun && <span className="text-[10px] text-[#475569]">Lần cuối: {rule.lastRun}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DataTable columns={logCols} data={executionLogs} rowKey={r => r.id} />
      )}
    </div>
  );
}
