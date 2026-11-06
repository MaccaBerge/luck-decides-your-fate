import { AlertTriangle, Scale, Star } from "lucide-react";
import type { Mode } from "../../lib/types";
import type { RuleStatus } from "../adminTypes";

export function ruleStatusText(rs: RuleStatus, mode: Mode): string {
  switch (rs.state) {
    case "fair_mode":
      return "Fair — no rigging";
    case "active":
      return `Rigged: ${rs.matched_target ?? ""} will ${mode === "never" ? "NEVER" : "ALWAYS"} win`;
    case "no_match":
      return "None of your target names are on the wheel yet — spins are fair";
    case "all_excluded":
      return "Every name on the wheel is excluded — spins are fair";
  }
}

export default function RuleStatusBanner({ status, mode }: { status: RuleStatus; mode: Mode }) {
  const warn = status.state === "no_match" || status.state === "all_excluded";
  const tone =
    status.state === "active"
      ? "bg-primary-soft text-primary-soft-ink"
      : warn
        ? "bg-warn-soft text-warn-ink"
        : "bg-surface-tint text-ink";
  const Icon = status.state === "active" ? Star : warn ? AlertTriangle : Scale;
  return (
    <div role={warn ? "alert" : "status"} className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm leading-snug ${tone}`}>
      <Icon className={`size-5 shrink-0 ${status.state === "active" ? "text-primary-strong" : ""}`} aria-hidden />
      <span data-testid="rule-status">{ruleStatusText(status, mode)}</span>
    </div>
  );
}
