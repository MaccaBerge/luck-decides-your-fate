import type { ApiErrorBody, JoinPolicy, JoinResponse, MyStatus, PublicGameState, SpinStarted } from "./types";
import { getMe } from "./players";

export class ApiError extends Error {
  status: number;
  code: string;
  /** Seconds from the Retry-After header, when the server sent one. */
  retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/** Generic JSON request helper (relative URL, same-origin cookies). 204 → undefined. */
export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  let res: Response;
  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", "Could not reach the server");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    const retryAfter = Number(res.headers.get("Retry-After"));
    throw new ApiError(
      res.status,
      err?.code ?? "http_error",
      err?.message ?? `Request failed (${res.status})`,
      retryAfter > 0 ? retryAfter : undefined,
    );
  }
  return data as T;
}

const g = (id: string) => `/api/games/${encodeURIComponent(id)}`;

/** In a multiplayer game, this browser's player key; the server ignores it on solo wheels. */
function as(id: string): Record<string, string> | undefined {
  const me = getMe(id);
  return me ? { "X-Player-Token": me.token } : undefined;
}

export const createGame = () => request<PublicGameState>("POST", "/api/games");
export const getGame = (id: string) => request<PublicGameState>("GET", g(id));
export const addEntries = (id: string, names: string[]) =>
  request<PublicGameState>("POST", `${g(id)}/entries`, { names }, as(id));
export const updateEntry = (
  id: string,
  entryId: string,
  patch: { name?: string; color?: string; is_active?: boolean },
) => request<PublicGameState>("PATCH", `${g(id)}/entries/${encodeURIComponent(entryId)}`, patch, as(id));
export const deleteEntry = (id: string, entryId: string) =>
  request<PublicGameState>("DELETE", `${g(id)}/entries/${encodeURIComponent(entryId)}`, undefined, as(id));
export const shuffleEntries = (id: string) => request<PublicGameState>("POST", `${g(id)}/shuffle`, undefined, as(id));
export const restoreEntries = (id: string) => request<PublicGameState>("POST", `${g(id)}/restore`, undefined, as(id));
export const updateSettings = (id: string, s: { remove_winner?: boolean; join_policy?: JoinPolicy }) =>
  request<PublicGameState>("PATCH", `${g(id)}/settings`, s, as(id));
export const spin = (id: string) => request<SpinStarted>("POST", `${g(id)}/spin`, undefined, as(id));

// Multiplayer
export const hostGame = (id: string, name: string, avatar: string) =>
  request<JoinResponse>("POST", `${g(id)}/host`, { name, avatar }, as(id));
/** Sends this browser's old key, if any: a kicked or banned browser can't simply join again. */
export const joinGame = (id: string, name: string, avatar: string) =>
  request<JoinResponse>("POST", `${g(id)}/players`, { name, avatar }, as(id));
/** Leaving as the last player ends the game (`ended`, and no state). */
export const leaveGame = (id: string) =>
  request<{ ended: boolean; state: PublicGameState | null }>("DELETE", `${g(id)}/players/me`, undefined, as(id));
/** The host kicks a player (they can ask to join again) or bans them. */
export const removePlayer = (id: string, playerId: string, ban = false) =>
  request<PublicGameState>(
    "DELETE",
    `${g(id)}/players/${encodeURIComponent(playerId)}${ban ? "?ban=true" : ""}`,
    undefined,
    as(id),
  );
export const myStatus = (id: string) => request<MyStatus>("GET", `${g(id)}/players/me`, undefined, as(id));
/** Come back after being removed: straight back into an open game after timing out; otherwise ask. */
export const rejoin = (id: string) =>
  request<{ rejoined: boolean; request: "pending" | null; state: PublicGameState }>("POST", `${g(id)}/rejoin`, undefined, as(id));
/** Accepted by the host, and still want in. */
export const confirmJoin = (id: string) =>
  request<PublicGameState>("POST", `${g(id)}/join-requests/me/confirm`, undefined, as(id));
/** Withdraw a request ("No thanks"), or acknowledge a "no". */
export const cancelJoinRequest = (id: string) =>
  request<PublicGameState>("DELETE", `${g(id)}/join-requests/me`, undefined, as(id));
/** The host invites a kicked or banned player back, or lifts a ban. */
export const removedPlayerAction = (id: string, playerId: string, action: "invite" | "unban") =>
  request<PublicGameState>("POST", `${g(id)}/removed/${encodeURIComponent(playerId)}/${action}`, undefined, as(id));
export const answerJoinRequest = (id: string, playerId: string, accept: boolean) =>
  request<PublicGameState>(
    "POST",
    `${g(id)}/join-requests/${encodeURIComponent(playerId)}/${accept ? "accept" : "decline"}`,
    undefined,
    as(id),
  );
export const socketTicket = (id: string) =>
  request<{ ticket: string }>("POST", `${g(id)}/socket-ticket`, undefined, as(id));
export const findGameByCode = (code: string) =>
  request<{ game_id: string; players: number }>("GET", `/api/join/${encodeURIComponent(code.trim().toUpperCase())}`);
