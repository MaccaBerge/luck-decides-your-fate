import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "./api";

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status, headers }));

describe("request errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("exposes Retry-After on a 429", async () => {
    respond(429, { error: { code: "too_many_attempts", message: "Later" } }, { "Retry-After": "42" });
    const err = (await request("POST", "/x").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: "too_many_attempts", message: "Later", retryAfter: 42 });
  });

  it("leaves retryAfter undefined without the header", async () => {
    respond(401, { error: { code: "invalid_password", message: "Wrong" } });
    const err = (await request("POST", "/x").catch((e) => e)) as ApiError;
    expect(err.retryAfter).toBeUndefined();
  });
});
