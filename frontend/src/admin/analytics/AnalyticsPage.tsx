import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import * as adminApi from "../adminApi";
import { errorMessage, errorStatus } from "../adminApi";
import type { AnalyticsDays, AnalyticsMetric, AnalyticsReport } from "../adminTypes";
import { useAdminAuth } from "../auth";
import { btnSecondary, card, clockTime, ErrorText, page, SubPageHeader } from "../components/ui";
import { MetricBody, WIDE_KINDS } from "./renderers";

const RANGES: AnalyticsDays[] = [7, 30, 90];

function RangePicker({ value, onChange }: { value: AnalyticsDays; onChange: (d: AnalyticsDays) => void }) {
  return (
    <div role="radiogroup" aria-label="Range" className="grid grid-cols-3 gap-1 rounded-full bg-surface-tint p-1">
      {RANGES.map((d) => {
        const checked = value === d;
        return (
          <label
            key={d}
            className={`relative flex h-9 items-center justify-center rounded-full px-3.5 whitespace-nowrap has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
              checked
                ? "bg-surface text-sm font-semibold text-primary-strong shadow-[0_2px_6px_var(--segment-shadow)]"
                : "text-sm font-medium text-ink-muted hover:text-ink"
            }`}
          >
            <input
              type="radio"
              name="range"
              value={d}
              checked={checked}
              onChange={() => onChange(d)}
              className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-full opacity-0"
            />
            {d} days
          </label>
        );
      })}
    </div>
  );
}

function MetricCard({ metric }: { metric: AnalyticsMetric }) {
  return (
    <article
      data-testid={`metric-${metric.id}`}
      aria-label={metric.title}
      className={`${card} flex min-w-0 flex-col gap-4 max-sm:p-4 ${WIDE_KINDS.has(metric.kind) ? "col-span-full" : ""}`}
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-semibold text-ink">{metric.title}</h3>
        <p className="text-[13px] text-ink-muted">{metric.description}</p>
      </div>
      <div className="mt-auto">
        <MetricBody metric={metric} />
      </div>
    </article>
  );
}

export default function AnalyticsPage() {
  const { onUnauthorized, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [days, setDays] = useState<AnalyticsDays>(7);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const latest = useRef(0);

  const load = useCallback(
    async (d: AnalyticsDays) => {
      const id = ++latest.current; // a slower, older response must not replace a newer one
      setLoading(true);
      setError("");
      try {
        const r = await adminApi.getAnalytics(d);
        if (id === latest.current) setReport(r);
      } catch (err) {
        if (id !== latest.current) return;
        if (errorStatus(err) === 401) onUnauthorized();
        else setError(errorMessage(err));
      } finally {
        if (id === latest.current) setLoading(false);
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    void load(days);
  }, [days, load]);

  return (
    <div className={page}>
      <SubPageHeader onBack={() => navigate("/admin")} onLogout={logout} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[28px] leading-tight font-semibold">Analytics</h1>
          <p className="text-sm text-ink-muted" aria-live="polite">
            {report ? `Updated ${clockTime(report.generated_at)}` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RangePicker value={days} onChange={setDays} />
          <button
            type="button"
            aria-label="Refresh"
            className={`${btnSecondary} max-sm:w-11 max-sm:!px-0`}
            disabled={loading}
            onClick={() => void load(days)}
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
            <span className="max-sm:hidden">Refresh</span>
          </button>
        </div>
      </div>

      <ErrorText>{error && `Couldn't load the statistics: ${error}`}</ErrorText>

      {!report && loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-ink-muted" aria-label="Loading statistics" />
        </div>
      )}

      {report && report.sections.length === 0 && (
        <p className="py-10 text-center text-sm text-ink-muted">No statistics yet.</p>
      )}

      {report?.sections.map((section) => (
        <section
          key={section.id}
          data-testid={`analytics-section-${section.id}`}
          aria-labelledby={`analytics-${section.id}`}
          className={`flex flex-col gap-3 transition-opacity ${loading ? "opacity-60" : ""}`}
        >
          <h2 id={`analytics-${section.id}`} className="font-display text-[19px] font-semibold">
            {section.title}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {section.metrics.map((m) => (
              <MetricCard key={m.id} metric={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
