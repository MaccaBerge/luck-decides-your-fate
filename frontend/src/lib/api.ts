import type { ApiErrorBody, PublicGameState, SpinStarted } from "./types";

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
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
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

export const createGame = () => request<PublicGameState>("POST", "/api/games");
export const getGame = (id: string) => request<PublicGameState>("GET", g(id));
export const addEntries = (id: string, names: string[]) =>
  request<PublicGameState>("POST", `${g(id)}/entries`, { names });
export const updateEntry = (
  id: string,
  entryId: string,
  patch: { name?: string; color?: string; is_active?: boolean },
) => request<PublicGameState>("PATCH", `${g(id)}/entries/${encodeURIComponent(entryId)}`, patch);
export const deleteEntry = (id: string, entryId: string) =>
  request<PublicGameState>("DELETE", `${g(id)}/entries/${encodeURIComponent(entryId)}`);
export const shuffleEntries = (id: string) => request<PublicGameState>("POST", `${g(id)}/shuffle`);
export const restoreEntries = (id: string) => request<PublicGameState>("POST", `${g(id)}/restore`);
export const updateSettings = (id: string, s: { remove_winner: boolean }) =>
  request<PublicGameState>("PATCH", `${g(id)}/settings`, s);
export const spin = (id: string) => request<SpinStarted>("POST", `${g(id)}/spin`);
