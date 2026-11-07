import { ApiError, request } from "../lib/api";
import type { Mode } from "../lib/types";
import type { AdminGameState, AnalyticsDays, AnalyticsReport, Dashboard } from "./adminTypes";

export interface CreateLinkBody {
  label: string | null;
  mode: Mode;
  target_names: string[];
}

export interface UpdateLinkBody {
  label?: string | null;
  mode?: Mode;
  target_names?: string[];
}

export const login = (password: string) =>
  request<{ ok: boolean }>("POST", "/api/admin/login", { password });

export const logout = () => request<void>("POST", "/api/admin/logout");

export const me = () => request<{ authenticated: boolean }>("GET", "/api/admin/me");

export const getDashboard = () => request<Dashboard>("GET", "/api/admin/dashboard");

export const getAnalytics = (days: AnalyticsDays) =>
  request<AnalyticsReport>("GET", `/api/admin/analytics?days=${days}`);

export const createLink = (body: CreateLinkBody) =>
  request<AdminGameState>("POST", "/api/admin/links", body);

export const getLink = (gameId: string) =>
  request<AdminGameState>("GET", `/api/admin/links/${encodeURIComponent(gameId)}`);

export const updateLink = (gameId: string, patch: UpdateLinkBody) =>
  request<AdminGameState>("PATCH", `/api/admin/links/${encodeURIComponent(gameId)}`, patch);

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
