export type Mode = "fair" | "always" | "never";

export interface Entry {
  id: string;
  name: string;
  color: string;
  position: number;
  is_active: boolean;
}
export interface GameSettings {
  remove_winner: boolean;
}
export interface SpinStarted {
  spin_id: number;
  winner_entry_id: string;
  winner_name: string;
  wheel_entry_ids: string[];
  winner_index: number;
  landing_offset: number;
  extra_rotations: number;
  duration_ms: number;
  started_at: string;
}
export interface LastResult {
  spin_id: number;
  winner_entry_id: string;
  winner_name: string;
  finished_at: string;
}
export interface RecentSpin {
  spin_id: number;
  winner_name: string;
  finished_at: string;
}
export interface PublicGameState {
  id: string;
  game_type: "wheel";
  entries: Entry[];
  settings: GameSettings;
  current_spin: SpinStarted | null;
  last_result: LastResult | null;
  recent_spins: RecentSpin[];
}
export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type PlayerEvent =
  | { type: "state"; state: PublicGameState }
  | { type: "spin_started"; spin: SpinStarted }
  | { type: "spin_finished"; spin_id: number; winner_entry_id: string; winner_name: string }
  | { type: "game_deleted" };
