import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, X } from 'lucide-react';
import { Button, PageHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockCompanies } from './mock-data';

function ComplianceCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-[12px] mr-3', ok ? 'text-success' : 'text-error')}>
      {ok ? <Check size={12} /> : <X size={12} />} {label}
    </span>
  );
}

function BadgeExpiry({ date, expiredLabel, daysLeftLabel }: { date?: string; expiredLabel: string; daysLeftLabel: (days: number) => string }) {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const days = Math.floor((d.getTime() - now.getTime()) / 86400000);
  if (days < 0) return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-error/20 text-error">{expiredLabel}</span>;
  if (days < 14) return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-warning/20 text-warning">{daysLeftLabel(days)}</span>;
  return <span className="text-[11px] text-muted-foreground">{date}</span>;
}

export function ContractorsPage() {
  const { t } = useTranslation('manage');
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
      <PageHeader title={t('contractors.title')} description={t('contractors.description')}>
        <Button className="bg-manage hover:bg-manage/90 text-white">
          {t('contractors.addCompany')}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label={t('contractors.stats.companies')} value={String(mockCompanies.length)} sub="active contracts" domain="manage" />
        <StatCard label={t('contractors.stats.workers')} value={String(allWorkers.length)} sub="registered" domain="manage" />
        <StatCard label={t('contractors.stats.checkedIn')} value={String(checkedIn)} sub="on site today" domain="manage" />
        <StatCard label={t('contractors.stats.expiring')} value={String(expiring)} sub="credentials" icon={<AlertTriangle size={14} />} domain="error" />
      </div>

      <div className="space-y-3">
        {mockCompanies.map(company => (
          <div key={company.id} className="bg-card border border-border rounded-lg overflow-hidden">
            <button type="button" onClick={() => setExpanded(expanded === company.id ? null : company.id)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-4">
                <span className="text-[14px] font-medium text-foreground">{company.name}</span>
                <span className="text-[12px] text-muted-foreground">{t('contractors.workers', { active: company.activeWorkers, total: company.totalWorkers })}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn('text-[12px] font-medium', company.compliance >= 90 ? 'text-success' : company.compliance >= 70 ? 'text-warning' : 'text-error')}>
                  {t('contractors.compliancePct', { pct: company.compliance })}
                </span>
                <span className="text-[12px] text-muted-foreground">{t('contractors.contract', { date: company.contractEnd })}</span>
                <span className="text-muted-foreground">{expanded === company.id ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded === company.id && (
              <div className="border-t border-border px-4 py-3">
                <Table className="w-full">
                  <TableHeader className="bg-muted/20">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[11px] uppercase text-muted-foreground py-1 px-2">{t('contractors.table.id')}</TableHead>
                      <TableHead className="text-[11px] uppercase text-muted-foreground py-1 px-2">{t('contractors.table.name')}</TableHead>
                      <TableHead className="text-[11px] uppercase text-muted-foreground py-1 px-2">{t('contractors.table.role')}</TableHead>
                      <TableHead className="text-[11px] uppercase text-muted-foreground py-1 px-2">{t('contractors.table.compliance')}</TableHead>
                      <TableHead className="text-[11px] uppercase text-muted-foreground py-1 px-2">{t('contractors.table.badge')}</TableHead>
                      <TableHead className="text-[11px] uppercase text-muted-foreground py-1 px-2">{t('contractors.table.checkin')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.workers.map(w => (
                      <TableRow key={w.id} className="text-[13px]">
                        <TableCell className="py-2 px-2 font-mono text-[11px] text-muted-foreground">{w.id}</TableCell>
                        <TableCell className="py-2 px-2 text-foreground">{w.name}</TableCell>
                        <TableCell className="py-2 px-2 text-muted-foreground">{w.role}</TableCell>
                        <TableCell className="py-2 px-2">
                          <ComplianceCheck ok={w.safetyTraining} label={t('contractors.compliance.safetyShort')} />
                          <ComplianceCheck ok={w.insurance} label={t('contractors.compliance.insuranceShort')} />
                          <ComplianceCheck ok={w.badge} label={t('contractors.compliance.badgeShort')} />
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          <BadgeExpiry
                            date={w.badgeExpiry}
                            expiredLabel={t('contractors.badge.expired')}
                            daysLeftLabel={(days) => t('contractors.badge.daysLeft', { days })}
                          />
                        </TableCell>
                        <TableCell className="py-2 px-2">
                          {w.checkedIn ? (
                            <span className="text-success text-[12px]">{t('contractors.checkedInTime', { time: w.checkInTime })}</span>
                          ) : (
                            <span className="text-muted-foreground text-[12px]">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
