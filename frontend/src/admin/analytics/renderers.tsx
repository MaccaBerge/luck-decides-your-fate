import type { ComponentType } from "react";
import type { AnalyticsMetric, BreakdownData, NumberData, SeriesData, TableData } from "../adminTypes";

/**
 * One component per metric `kind`. The page draws whatever the server returns, so a new
 * statistic of an existing kind needs no change here; only a brand-new kind does.
 */
export interface RendererProps<T> {
  data: T;
  title: string;
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** "2026-11-07" -> "Nov 7". Days are UTC, so they're formatted in UTC. */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? day
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function NumberStat({ data }: RendererProps<NumberData>) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-[28px] sm:text-[34px] leading-none font-semibold text-ink tabular-nums">{fmt(data.value)}</span>
      {data.hint && <span className="text-[13px] text-ink-muted">{data.hint}</span>}
    </div>
  );
}

export function SeriesChart({ data, title }: RendererProps<SeriesData>) {
  const points = data.points;
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const max = Math.max(0, ...points.map((p) => p.value));
  const peak = points.find((p) => p.value === max);
  const first = points[0];
  const last = points[points.length - 1];
  const summary =
    `${title}: ${fmt(total)} in total over ${points.length} days` +
    (peak && max > 0 ? `, most on ${dayLabel(peak.day)} (${fmt(max)})` : "");
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        <span className="font-display text-[26px] leading-none font-semibold text-ink tabular-nums">{fmt(total)}</span> in total
      </p>
      <div role="img" aria-label={summary} className="flex h-28 items-end border-b border-border-strong">
        {points.map((p) => (
          // The full-height column is the hover target; the bar inside it is the mark.
          <div
            key={p.day}
            title={`${dayLabel(p.day)}: ${fmt(p.value)}`}
            className={`group flex h-full min-w-0 flex-1 items-end ${points.length > 31 ? "px-px" : "px-[3px]"}`}
          >
            <div
              className="w-full rounded-t-[4px] bg-primary transition-colors group-hover:bg-primary-strong"
              style={{ height: max > 0 && p.value > 0 ? `max(2px, ${(p.value / max) * 100}%)` : 0 }}
            />
          </div>
        ))}
      </div>
      {first && last && (
        <div className="flex justify-between text-xs text-ink-muted tabular-nums">
          <span>{dayLabel(first.day)}</span>
          <span>UTC</span>
          <span>{dayLabel(last.day)}</span>
        </div>
      )}
    </div>
  );
}

export function BreakdownBars({ data }: RendererProps<BreakdownData>) {
  if (data.items.length === 0) return <Empty />;
  const max = Math.max(0, ...data.items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {data.items.map((item) => (
        <li key={item.label} className="flex flex-col gap-1" title={`${item.label}: ${fmt(item.value)}`}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">{item.label}</span>
            <span className="font-medium text-ink tabular-nums">{fmt(item.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-tint">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: max > 0 && item.value > 0 ? `max(4px, ${(item.value / max) * 100}%)` : 0 }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DataTable({ data }: RendererProps<TableData>) {
  if (data.rows.length === 0) return <Empty />;
  // Numeric columns (every cell a number) are right-aligned.
  const numeric = data.columns.map((_, i) => data.rows.every((r) => typeof r[i] === "number"));
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-strong text-left text-[13px] text-ink-muted">
            {data.columns.map((c, i) => (
              <th key={c} scope="col" className={`py-2 pr-4 font-medium last:pr-0 ${numeric[i] ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, r) => (
            <tr key={r} className="border-b border-divider last:border-0">
              {row.map((cell, i) => (
                <td key={i} className={`py-2.5 pr-4 text-ink last:pr-0 ${numeric[i] ? "text-right tabular-nums" : ""}`}>
                  {typeof cell === "number" ? fmt(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-ink-muted">Nothing to show yet.</p>;
}

export const RENDERERS: Record<string, ComponentType<RendererProps<any>>> = {
  number: NumberStat,
  series: SeriesChart,
  breakdown: BreakdownBars,
  table: DataTable,
};

/** Kinds that need the full width of the page. */
export const WIDE_KINDS = new Set(["series", "breakdown", "table"]);

export function MetricBody({ metric }: { metric: AnalyticsMetric }) {
  if (metric.error) {
    return <p className="text-sm text-danger">Couldn't load this statistic ({metric.error}).</p>;
  }
  const Renderer = RENDERERS[metric.kind];
  if (!Renderer || metric.data == null) {
    return <p className="text-sm text-ink-muted">Can't show this statistic yet.</p>;
  }
  return <Renderer data={metric.data} title={metric.title} />;
}
