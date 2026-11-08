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
export type GameKind = "solo" | "multiplayer";
export interface Player {
  id: string;
  /** The player's slice on the wheel. */
  entry_id: string;
  name: string;
  /** A key from lib/avatars.ts. */
  avatar: string;
  /** "here": one of their pages is open and visible; "away": none is. */
  status: "here" | "away";
  is_host: boolean;
}
export type JoinPolicy = "open" | "ask" | "closed";
export interface JoinRequest {
  player_id: string;
  name: string;
  avatar: string;
  state: "pending" | "accepted";
}
/** What this browser is in a game: a player, removed (and why), or nothing; and its request to join. */
export interface MyStatus {
  status: "player" | "kicked" | "banned" | "timed_out" | "none";
  request: "pending" | "accepted" | "declined" | null;
}
export interface PublicGameState {
  id: string;
  game_type: "wheel";
  kind: GameKind;
  /** Multiplayer only. */
  join_code: string | null;
  /** Multiplayer only (empty for solo), in joining order. */
  players: Player[];
  /** Multiplayer: who can join. Anyone ("open"), the host accepts each one ("ask"), or nobody ("closed"). */
  join_policy: JoinPolicy;
  /** Multiplayer: people asking to join ("accepted": waiting for them to confirm). */
  join_requests: JoinRequest[];
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

export interface JoinResponse {
  /** The game needs the host's OK: this is a request (keep the key, confirm once accepted). */
  requested: boolean;
  player_id: string;
  /** The key this browser keeps to be recognised as this player. */
  player_token: string;
  state: PublicGameState;
}
