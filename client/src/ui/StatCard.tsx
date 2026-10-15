import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, icon, className = '' }: StatCardProps) {
  return (
    <div className={`flex flex-col gap-3 rounded-lg border bg-surface p-5 ${className}`}>
      <div className="flex items-center gap-2 type-label-s text-secondary [&>svg]:text-brand">
        {icon}
        {label}
      </div>
      <div className="type-amount-m text-primary">{value}</div>
    </div>
  );
}
