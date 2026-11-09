import { ApiError, request } from "../lib/api";
import type { Mode } from "../lib/types";
import type {
  AdminGameState,
  AdminSession,
  AnalyticsDays,
  AnalyticsReport,
  Dashboard,
  FriendsSettings,
  StandingRule,
} from "./adminTypes";

export interface CreateLinkBody {
  label: string | null;
  mode: Mode;
  target_names: string[];
}

export interface UpdateLinkBody {
  label?: string | null;
  mode?: Mode;
  target_names?: string[];
  /** null: every spin. */
  chance?: number | null;
  /** null: off. */
  max_streak?: number | null;
  script?: string[];
  /** Ordinary wheels only: false hands the wheel back to the standing rule. */
  own_rule?: false;
}

export const login = (password: string) =>
  request<{ ok: boolean }>("POST", "/api/admin/login", { password });

export const logout = () => request<void>("POST", "/api/admin/logout");

export const me = () => request<{ authenticated: boolean }>("GET", "/api/admin/me");

export const getSessions = () => request<{ sessions: AdminSession[] }>("GET", "/api/admin/sessions");

export const signOutDevice = (id: string) =>
  request<void>("DELETE", `/api/admin/sessions/${encodeURIComponent(id)}`);

export const signOutOthers = () => request<void>("POST", "/api/admin/sessions/sign-out-others");

export const getDashboard = () => request<Dashboard>("GET", "/api/admin/dashboard");

export const getAnalytics = (days: AnalyticsDays) =>
  request<AnalyticsReport>("GET", `/api/admin/analytics?days=${days}`);

export const createLink = (body: CreateLinkBody) =>
  request<AdminGameState>("POST", "/api/admin/links", body);

export const getLink = (gameId: string) =>
  request<AdminGameState>("GET", `/api/admin/links/${encodeURIComponent(gameId)}`);

export const updateLink = (gameId: string, patch: UpdateLinkBody) =>
  request<AdminGameState>("PATCH", `/api/admin/links/${encodeURIComponent(gameId)}`, patch);

/** The panic button: every link and wheel back to fair, scripts cleared, standing rule fair. */
export const allFair = () => request<{ changed: number }>("POST", "/api/admin/all-fair");

const w = (gameId: string) => `/api/admin/wheels/${encodeURIComponent(gameId)}`;
export const getWheel = (gameId: string) => request<AdminGameState>("GET", w(gameId));
/** Changing the rule gives the wheel its own; `own_rule: false` hands it back to the standing rule. */
export const updateWheel = (gameId: string, patch: UpdateLinkBody) =>
  request<AdminGameState>("PATCH", w(gameId), patch);

/** Delete an ordinary wheel, even in use: anyone on it is told the developer ended it. */
export const deleteWheel = (gameId: string) => request<void>("DELETE", w(gameId));

export const getFriends = () => request<FriendsSettings>("GET", "/api/admin/friends");
export const putFriends = (friends: string[][]) => request<FriendsSettings>("PUT", "/api/admin/friends", { friends });
export const updateStanding = (patch: Partial<StandingRule>) =>
  request<FriendsSettings>("PATCH", "/api/admin/standing-rule", patch);

export const deleteLink = (gameId: string) =>
  request<void>("DELETE", `/api/admin/links/${encodeURIComponent(gameId)}`);

/** Fetch a database backup and hand it to the browser as a file download. */
export async function downloadBackup(): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/admin/backup", { credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "network_error", "Could not reach the server");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new ApiError(
      res.status,
      body?.error?.code ?? "http_error",
      body?.error?.message ?? `Request failed (${res.status})`,
    );
  }
  const filename =
    res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "backup.db";
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Parse a textarea (one name per line) into a clean target list. */
export function parseNames(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function errorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status: unknown }).status;
    return typeof s === "number" ? s : undefined;
  }
  return undefined;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong";
}
