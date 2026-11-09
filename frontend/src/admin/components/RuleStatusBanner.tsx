import { AlertTriangle, ListOrdered, Pause, Scale, Star } from "lucide-react";
import type { LinkSummary, RuleStatus } from "../adminTypes";

type RuleLink = Pick<LinkSummary, "mode" | "chance" | "max_streak">;

/** What the next spin will do, in one sentence. */
export function ruleStatusText(rs: RuleStatus, link: RuleLink): string {
  if (rs.decider === "script" && rs.script_step) return `Script: ${rs.script_step.name} wins the next spin`;
  switch (rs.state) {
    case "fair_mode":
      return "Fair — no rigging";
    case "active":
      if (link.mode === "never") return `Rigged: ${rs.matched_target ?? ""} will NEVER win`;
      if (link.chance !== null && link.chance < 100) return `Rigged: ${rs.matched_target ?? ""} wins ${link.chance}% of spins`;
      return `Rigged: ${rs.matched_target ?? ""} will ALWAYS win`;
    case "streak_paused":
      return `Paused: ${rs.matched_target ?? ""} has won ${rs.streak} in a row — spins are fair until someone else wins`;
    case "no_match":
      return "None of your target names are on the wheel yet — spins are fair";
    case "all_excluded":
      return "Every name on the wheel is excluded — spins are fair";
  }
}

/** A second line when the script's next step is waiting for its name to be on the wheel. */
export function scriptWaitingText(rs: RuleStatus): string | null {
  if (!rs.script_step || rs.script_step.entry_ids.length > 0) return null;
  return `The script's next step, ${rs.script_step.name}, waits until that name is on the wheel.`;
}

export default function RuleStatusBanner({ status, link }: { status: RuleStatus; link: RuleLink }) {
  const rigged = status.decider !== "fair";
  const warn = status.state === "no_match" || status.state === "all_excluded";
  const tone = rigged
    ? "bg-primary-soft text-primary-soft-ink"
    : warn
      ? "bg-warn-soft text-warn-ink"
      : "bg-surface-tint text-ink";
  const Icon =
    status.decider === "script"
      ? ListOrdered
      : rigged
        ? Star
        : status.state === "streak_paused"
          ? Pause
          : warn
            ? AlertTriangle
            : Scale;
  const waiting = scriptWaitingText(status);
  return (
    <div role={warn ? "alert" : "status"} className={`flex items-start gap-3 rounded-2xl px-4 py-3.5 text-sm leading-snug ${tone}`}>
      <Icon className={`mt-px size-5 shrink-0 ${rigged ? "text-primary-strong" : ""}`} aria-hidden />
      <span className="flex flex-col gap-1">
        <span data-testid="rule-status">{ruleStatusText(status, link)}</span>
        {waiting && <span className="text-[13px] opacity-80">{waiting}</span>}
      </span>
    </div>
  );
}
