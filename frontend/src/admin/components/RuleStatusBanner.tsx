import { AlertTriangle, Scale, Target } from "lucide-react";
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
      ? "border-brass bg-brass text-on-brass"
      : warn
        ? "border-danger text-ink"
        : "border-line text-ink";
  const Icon = status.state === "active" ? Target : warn ? AlertTriangle : Scale;
  return (
    <div
      role={warn ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm font-medium ${tone}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span data-testid="rule-status">{ruleStatusText(status, mode)}</span>
    </div>
  );
}
