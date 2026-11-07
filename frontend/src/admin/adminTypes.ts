import type { Mode, PublicGameState, SpinStarted } from "../lib/types";

export type LinkStatus = "created" | "connected" | "disconnected";
export type RuleState = "fair_mode" | "active" | "no_match" | "all_excluded";

export interface LinkSummary {
  id: string;
  path: string;
  label: string | null;
  mode: Mode;
  target_names: string[];
  status: LinkStatus;
  player_count: number;
  entry_count: number;
  created_at: string;
  first_opened_at: string | null;
  last_activity_at: string;
}

export interface RuleStatus {
  state: RuleState;
  matched_target: string | null;
  matched_entry_ids: string[];
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

export interface AdminGameState {
  game: PublicGameState;
  link: LinkSummary;
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
}

export type AdminLinkEvent =
  | { type: "admin_state"; state: AdminGameState }
  | { type: "spin_started"; spin: SpinStarted; rule_applied: boolean }
  | { type: "spin_finished"; spin_id: number; winner_entry_id: string; winner_name: string }
  | { type: "game_deleted" };

export type DashboardEvent = { type: "dashboard"; dashboard: Dashboard };
