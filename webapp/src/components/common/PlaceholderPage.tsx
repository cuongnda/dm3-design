import { PageHeader } from '@/components/layout/PageHeader';
import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  domain?: string;
  domainColor?: string;
}

export function PlaceholderPage({ title, domain, domainColor }: PlaceholderPageProps) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Construction size={48} className="text-[#334155] mb-4" />
        <h2 className="text-[16px] font-medium text-[#94A3B8] mb-2">Coming Soon</h2>
        <p className="text-[13px] text-[#64748B] max-w-md">
          {domain && (
            <span style={{ color: domainColor }} className="font-medium">{domain} / </span>
          )}
          The <span className="text-[#F8FAFC]">{title}</span> module is under development.
        </p>
      </div>
    </div>
  );
}
