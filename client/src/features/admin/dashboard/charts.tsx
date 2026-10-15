/**
 * Dashboard charts (design pass): plain HTML/CSS bars and one SVG sparkline, no chart library.
 * Monochrome tokens (--color-chart-1/2), 2px gaps, bars at most 24px wide with 4px rounded data-ends, hairline
 * grid, a tooltip per column group on hover or focus, and "Show as table" on every chart (dataviz rules).
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

export interface Series {
  label: string;
  /** A CSS colour, normally a chart token. */
  color: string;
}

/** Thin trend line for a KPI tile. Decorative: the tile states the value in text. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-8" aria-hidden="true" />;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / span) * 28}`).join(' ');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true" focusable="false">
      <polygon points={`0,32 ${pts} 100,32`} style={{ fill: 'var(--color-chart-1)', opacity: 0.08 }} />
      <polyline
        points={pts}
        fill="none"
        vectorEffect="non-scaling-stroke"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ stroke: 'var(--color-chart-1)' }}
      />
    </svg>
  );
}

/** A clean axis maximum: 1, 2, 2.5 or 5 × 10^n at or above the largest value. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const base = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 2.5, 5, 10].find((m) => m * base >= value) ?? 10) * base;
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 type-caption text-secondary">
      {series.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** "Show as table": the chart's data as a real table (the keyboard and screen-reader path). */
export function DataTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: string[][] }) {
  const { t } = useTranslation();
  return (
    <details>
      <summary className="inline-flex min-h-touch cursor-pointer items-center rounded-md type-label-xs text-secondary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        {t('admin:dashboard.showTable')}
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse tabular-nums type-body-s">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c} scope="col" className={`border-b py-1.5 type-label-xs text-secondary ${i ? 'text-right' : 'text-left'}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                {r.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="border-b py-1.5 text-left font-normal text-primary">
                      {cell}
                    </th>
                  ) : (
                    <td key={i} className="border-b py-1.5 text-right text-primary">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

interface ColumnChartProps {
  title: string;
  series: Series[];
  /** One group per month; `values[i]` belongs to `series[i]`. */
  data: { label: string; longLabel: string; values: number[] }[];
  format: (n: number) => string;
  /** Axis ticks (compact); defaults to `format`. */
  formatTick?: (n: number) => string;
  /** Fixed axis maximum (e.g. total beds). */
  max?: number;
}

/** Grouped columns over time from one baseline, 3 hairline gridlines, a tooltip per group (hover or focus). */
export function ColumnChart({ title, series, data, format, formatTick = format, max }: ColumnChartProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const top = max ?? niceMax(Math.max(0, ...data.flatMap((d) => d.values)));
  const ticks = [top, top / 2, 0];
  return (
    <figure className="flex flex-col gap-3" aria-labelledby={titleId}>
      <figcaption id={titleId} className="type-label-s text-center text-primary">
        {title}
      </figcaption>
      <Legend series={series} />
      <div className="flex gap-2 pt-2">
        <div className="flex h-44 flex-col justify-between text-right type-caption tabular-nums text-tertiary" aria-hidden="true">
          {ticks.map((tk) => (
            <span key={tk} className="-my-2 leading-4">
              {formatTick(tk)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-44" aria-hidden="true">
            {ticks.map((tk, i) => (
              <div key={tk} className="absolute inset-x-0 border-t" style={{ top: `${(i / 2) * 100}%` }} />
            ))}
          </div>
          <ul className="relative flex h-44 items-end">
            {data.map((d) => (
              <li
                key={d.longLabel}
                tabIndex={0}
                aria-label={`${d.longLabel}: ${series.map((s, i) => `${s.label} ${format(d.values[i] ?? 0)}`).join(', ')}`}
                className="group relative flex h-full flex-1 items-end justify-center gap-0.5 rounded-sm px-0.5 outline-none hover:bg-muted focus-visible:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              >
                {d.values.map((v, i) => (
                  <span
                    key={series[i].label}
                    className="block w-full max-w-6 rounded-t"
                    style={{ height: `${Math.min(100, (v / top) * 100)}%`, minHeight: v > 0 ? 2 : 0, background: series[i].color }}
                  />
                ))}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max max-w-[14rem] -translate-x-1/2 rounded-md border bg-surface px-3 py-2 text-left shadow-elevation-2 group-hover:block group-focus-visible:block"
                >
                  <span className="block type-label-xs text-secondary">{d.longLabel}</span>
                  {series.map((s, i) => (
                    <span key={s.label} className="flex items-center gap-2 type-caption text-secondary">
                      <span className="h-0.5 w-3" style={{ background: s.color }} />
                      <span className="type-label-xs tabular-nums text-primary">{format(d.values[i] ?? 0)}</span>
                      {s.label}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex" aria-hidden="true">
            {data.map((d, i) => (
              <span key={d.longLabel} className={`flex-1 text-center type-caption text-tertiary ${data.length > 8 && i % 2 ? 'max-sm:invisible' : ''}`}>
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <DataTable caption={title} columns={[t('admin:dashboard.month'), ...series.map((s) => s.label)]} rows={data.map((d) => [d.longLabel, ...d.values.map(format)])} />
    </figure>
  );
}

/** Horizontal bars, label above and value at the end (one series, so no legend; the labels carry identity). */
export function BarList({ title, rows }: { title: string; rows: { label: string; value: number; display: string; detail?: string }[] }) {
  const titleId = useId();
  const top = Math.max(0, ...rows.map((r) => r.value)) || 1;
  return (
    <figure aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">
        {title}
      </figcaption>
      <ul className="flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-label-s text-primary">
                {r.label}
                {r.detail && <span className="type-caption text-tertiary"> · {r.detail}</span>}
              </span>
              <span className="type-label-s tabular-nums text-primary">{r.display}</span>
            </div>
            <div className="h-3 w-full rounded-full" style={{ background: 'var(--color-chart-track)' }} aria-hidden="true">
              <div className="h-full rounded-full" style={{ width: `${(r.value / top) * 100}%`, minWidth: r.value > 0 ? 4 : 0, background: 'var(--color-chart-1)' }} />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
