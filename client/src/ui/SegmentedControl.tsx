import type { ReactNode } from 'react';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Icon-only option: the icon shows and the label becomes the accessible name (and tooltip). */
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Theme (Light/Dark) and Language (EN/FIL) switcher, and any small exclusive choice. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, className = '' }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex gap-0.5 rounded-full border border-strong bg-muted p-0.5 ${className}`}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.icon ? opt.label : undefined}
            title={opt.icon ? opt.label : undefined}
            onClick={() => onChange(opt.value)}
            className={`type-label-s inline-flex min-h-touch min-w-touch items-center justify-center rounded-full transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              opt.icon ? 'px-2.5' : 'px-3.5'
            } ${selected ? 'bg-primary text-on-brand shadow-elevation-1' : 'text-secondary hover:bg-surface hover:text-primary'}`}
          >
            {opt.icon ?? opt.label}
          </button>
        );
      })}
    </div>
  );
}
