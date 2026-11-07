import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnalyticsMetric } from "../adminTypes";
import { dayLabel, durationLabel, MetricBody } from "./renderers";

const metric = (kind: string, data: unknown, error: string | null = null): AnalyticsMetric => ({
  id: "m",
  title: "Spins per day",
  description: "d",
  kind,
  data,
  error,
});

const render = (m: AnalyticsMetric) => renderToStaticMarkup(<MetricBody metric={m} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("analytics renderers", () => {
  it("number: shows the value and the hint", () => {
    const html = render(metric("number", { value: 1234, hint: "Of 2000" }));
    expect(text(html)).toBe("1,234 Of 2000");
    expect(text(render(metric("number", { value: 1.3, hint: null })))).toBe("1.3");
  });

  it("number: a duration is shown in minutes and seconds", () => {
    const html = render(metric("number", { value: 200, hint: "12 visits", format: "duration" }));
    expect(text(html)).toBe("3m 20s 12 visits");
    expect([0, 45, 60, 3599, 3600, 7325].map(durationLabel)).toEqual(["0s", "45s", "1m 0s", "59m 59s", "1h 0m", "2h 2m"]);
  });

  it("series: one bar per day, the total, UTC day labels and a summary", () => {
    const points = [
      { day: "2026-11-05", value: 0 },
      { day: "2026-11-06", value: 4 },
      { day: "2026-11-07", value: 2 },
    ];
    const html = render(metric("series", { points }));
    expect(html.match(/title="Nov \d: \d"/g)).toEqual(["title=\"Nov 5: 0\"", "title=\"Nov 6: 4\"", "title=\"Nov 7: 2\""]);
    expect(text(html)).toContain("6 in total");
    expect(text(html)).toContain("Nov 5 UTC Nov 7");
    expect(html).toContain('aria-label="Spins per day: 6 in total over 3 days, most on Nov 6 (4)"');
    expect(html).toContain("height:max(2px, 100%)");
    expect(html).toContain("height:max(2px, 50%)");
  });

  it("series: shows the hint next to the total", () => {
    const html = render(metric("series", { points: [{ day: "2026-11-07", value: 3 }], hint: "Since Nov 7, 2026" }));
    expect(text(html)).toContain("3 in total · Since Nov 7, 2026");
  });

  it("series: all zeros draws no bars and does not divide by zero", () => {
    const html = render(metric("series", { points: [{ day: "2026-11-07", value: 0 }] }));
    expect(html).not.toContain("NaN");
    expect(html).toContain('aria-label="Spins per day: 0 in total over 1 days"');
  });

  it("breakdown: a row per item with bars relative to the largest", () => {
    const html = render(metric("breakdown", { items: [{ label: "Fair", value: 8 }, { label: "Always", value: 2 }] }));
    expect(text(html)).toBe("Fair 8 Always 2");
    expect(html).toContain("width:max(4px, 100%)");
    expect(html).toContain("width:max(4px, 25%)");
  });

  it("table: header, rows, numbers right-aligned, scrolls inside its card", () => {
    const html = render(
      metric("table", { columns: ["Label", "Spins"], rows: [["One", 1200], ["Untitled", 0]] }),
    );
    expect(html).toContain("overflow-x-auto");
    expect(html.match(/<th[ >]/g)?.length).toBe(2);
    expect(text(html)).toBe("Label Spins One 1,200 Untitled 0");
    expect(html).toMatch(/<td class="[^"]*text-right[^"]*">1,200<\/td>/);
  });

  it("empty breakdown and table show an empty state", () => {
    expect(text(render(metric("table", { columns: ["A"], rows: [] })))).toBe("Nothing to show yet.");
    expect(text(render(metric("breakdown", { items: [] })))).toBe("Nothing to show yet.");
  });

  it("an unknown kind shows a fallback instead of crashing", () => {
    expect(text(render(metric("pie", { slices: [] })))).toBe("Can't show this statistic yet.");
  });

  it("a metric that failed shows a short error line", () => {
    expect(text(render(metric("number", null, "KeyError")))).toBe("Couldn't load this statistic (KeyError).");
  });

  it("formats days in UTC", () => {
    expect(dayLabel("2026-01-01")).toBe("Jan 1");
  });
});
