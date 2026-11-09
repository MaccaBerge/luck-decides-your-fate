import type { Mode, PublicGameState, SpinStarted } from "../lib/types";

export type LinkStatus = "created" | "connected" | "disconnected";
/** streak_paused: the "always" target has won `max_streak` spins in a row, so spins are fair
 * until someone else wins. */
export type RuleState = "fair_mode" | "active" | "no_match" | "all_excluded" | "streak_paused";
/** What decides the next spin. */
export type Decider = "script" | "rule" | "fair";

export interface LinkSummary {
  id: string;
  path: string;
  label: string | null;
  mode: Mode;
  target_names: string[];
  /** "always": the target wins this % of spins (null: every spin). */
  chance: number | null;
  /** Streak breaker: pause "always" after this many wins in a row (null: off). */
  max_streak: number | null;
  /** Upcoming winners, first one next. */
  script: string[];
  status: LinkStatus;
  player_count: number;
  entry_count: number;
  created_at: string;
  first_opened_at: string | null;
  last_activity_at: string;
}

export interface RuleTarget {
  /** The target exactly as stored in `target_names`. */
  name: string;
  /** Active entries the server matched to it (possibly none). */
  entry_ids: string[];
}
export interface RuleStatus {
  state: RuleState;
  matched_target: string | null;
  matched_entry_ids: string[];
  /** Every target in priority order. */
  targets: RuleTarget[];
  /** The script's next step, and the active entries it matches (none: it waits for that name). */
  script_step: RuleTarget | null;
  /** Spins in a row the "always" target has won. */
  streak: number;
  decider: Decider;
}

export interface AdminSpinRecord {
  spin_id: number;
  winner_entry_id: string;
  winner_name: string;
  mode: Mode;
  rule_applied: boolean;
  started_at: string;
  finished_at: string | null;
}

/** Which rule decides a game: a link's own, an ordinary wheel's own, the standing rule (friends
 * on it), or none (fair). */
export type RuleSource = "link" | "own" | "standing" | "none";

export interface Control {
  source: RuleSource;
  /** The friends on the wheel (display names). */
  friends: string[];
  /** At least two different friends: a friends' wheel. */
  matched: boolean;
}

/** An ordinary solo wheel in the controller's lists. */
export interface WheelSummary {
  id: string;
  path: string;
  names: string[];
  entry_count: number;
  open_now: boolean;
  created_at: string;
  last_activity_at: string;
  control: Control;
  /** The rule in effect. */
  mode: Mode;
  chance: number | null;
  script: string[];
}

export interface StandingRule {
  mode: Mode;
  target_names: string[];
  chance: number | null;
  max_streak: number | null;
}

export interface FriendsSettings {
  /** Each friend: the names they go by, display name first. */
  friends: string[][];
  standing: StandingRule;
}

export interface AdminGameState {
  game: PublicGameState;
  /** For an ordinary wheel: label null, and the rule fields are the rule in effect. */
  link: LinkSummary;
  control: Control;
  rule_status: RuleStatus;
  spin_history: AdminSpinRecord[];
}

export interface BackupStatus {
  enabled: boolean;
  last_success_at: string | null;
  last_error: string | null;
}

export interface Dashboard {
  live_games: number;
  backup: BackupStatus;
  links: LinkSummary[];
  /** Ordinary solo wheels, most recently used first: friends' wheels apart. */
  wheels: { matched: WheelSummary[]; others: WheelSummary[] };
}

export type AdminLinkEvent =
  | { type: "admin_state"; state: AdminGameState }
  | { type: "spin_started"; spin: SpinStarted; rule_applied: boolean }
  | { type: "spin_finished"; spin_id: number; winner_entry_id: string; winner_name: string }
  | { type: "game_deleted" };

export type DashboardEvent = { type: "dashboard"; dashboard: Dashboard };

// ---------- analytics (GET /api/admin/analytics) ----------
export type AnalyticsDays = 7 | 30 | 90;

export interface NumberData {
  value: number;
  hint: string | null;
  /** "duration": `value` is seconds, shown as e.g. "3m 20s". */
  format?: "duration" | null;
}
export interface SeriesData {
  points: { day: string; value: number }[];
  hint?: string | null;
}
export interface BreakdownData {
  items: { label: string; value: number }[];
}
export interface TableData {
  columns: string[];
  rows: (string | number)[][];
}

/** `kind` is a string, not a union: the server may send a kind this build can't draw yet. */
export interface AnalyticsMetric {
  id: string;
  title: string;
  description: string;
  kind: string;
  data: unknown;
  error: string | null;
}

export interface AnalyticsSection {
  id: string;
  title: string;
  metrics: AnalyticsMetric[];
}

export interface AnalyticsReport {
  generated_at: string;
  days: AnalyticsDays;
  sections: AnalyticsSection[];
}

/** A device logged in to the controller (GET /api/admin/sessions). */
export interface AdminSession {
  id: string;
  device: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  /** The device you're using now. */
  current: boolean;
}
