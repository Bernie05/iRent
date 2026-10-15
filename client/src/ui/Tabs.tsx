interface TabItem<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  label: string;
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Underline tab list (e.g. admin section navigation on desktop). */
export function Tabs<T extends string>({ label, items, value, onChange, className = '' }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 border-b ${className}`}>
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.value)}
            className={`type-label-s min-h-touch border-b-2 px-3 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              selected ? 'border-brand text-brand' : 'border-transparent text-secondary hover:border-strong hover:text-primary'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

interface FilterChipProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  className?: string;
}

/** Filter chip (e.g. Rent table All/Unpaid/Partial/Overdue). */
export function FilterChip({ label, active = false, onClick, className = '' }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`type-label-s min-h-touch rounded-full border px-4 transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
        active ? 'border-brand bg-brand-subtle text-brand' : 'border-default bg-surface text-secondary hover:border-strong hover:text-primary'
      } ${className}`}
    >
      {label}
    </button>
  );
}
