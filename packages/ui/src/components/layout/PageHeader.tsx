import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, description, actions, children }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight text-[#F8FAFC]">{title}</h1>
        {description && <p className="text-[13px] text-[#94A3B8] mt-1">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {children}
      </div>
    </div>
  );
}
