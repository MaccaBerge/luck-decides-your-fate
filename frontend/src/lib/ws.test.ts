import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectGameSocket, HIDDEN_CLOSE_MS, openSocket } from "./ws";

class FakeSocket {
  static instances: FakeSocket[] = [];
  static CONNECTING = 0;
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  closedWith: number | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  close(code: number) {
    this.closedWith = code;
  }
}

/** A stand-in for `document` whose visibility the test controls. */
class FakeDocument extends EventTarget {
  visibilityState: "visible" | "hidden" = "visible";
  set(state: "visible" | "hidden") {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

const urls = () => FakeSocket.instances.map((s) => s.url.replace("ws://example.test", ""));

describe("openSocket reconnects", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("location", { protocol: "http:", host: "example.test" });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([1012, 1001, 1006])("reconnects after close code %i", (code) => {
    const onClose = vi.fn();
    const dispose = openSocket("/ws/games/x", () => {}, onClose);
    FakeSocket.instances[0].onclose?.({ code });
    expect(onClose).toHaveBeenCalledWith(code);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    dispose();
  });

  it.each([4401, 4404])("stops after close code %i", (code) => {
    const dispose = openSocket("/ws/games/x", () => {});
    FakeSocket.instances[0].onclose?.({ code });
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.instances).toHaveLength(1);
    dispose();
  });
});

describe("the wheel socket pauses while the tab is hidden", () => {
  let doc: FakeDocument;
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    doc = new FakeDocument();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("location", { protocol: "http:", host: "example.test" });
    vi.stubGlobal("document", doc);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const open = (onClose = vi.fn()) => {
    const dispose = connectGameSocket("abc", () => {}, onClose);
    FakeSocket.instances[0].onopen?.();
    return dispose;
  };

  it("first connects without the resume flag", () => {
    const dispose = open();
    expect(urls()).toEqual(["/ws/games/abc"]);
    dispose();
  });

  it("keeps the socket when the tab is hidden for less than 15 seconds", () => {
    const dispose = open();
    doc.set("hidden");
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS - 1);
    doc.set("visible");
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0].closedWith).toBeNull();
    dispose();
  });

  it("closes quietly after 15 seconds hidden, and reconnects with ?resume=1 when visible", () => {
    const onClose = vi.fn();
    const onEvent = vi.fn();
    const dispose = connectGameSocket("abc", onEvent, onClose);
    const first = FakeSocket.instances[0];
    first.onopen?.();
    doc.set("hidden");
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS);
    expect(first.closedWith).toBe(1000);
    expect(first.onclose).toBeNull(); // no error handling, no backoff reconnect
    vi.advanceTimersByTime(10 * 60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();

    doc.set("visible");
    expect(urls()).toEqual(["/ws/games/abc", "/ws/games/abc?resume=1"]);
    FakeSocket.instances[1].onmessage?.({ data: JSON.stringify({ type: "state" }) });
    expect(onEvent).toHaveBeenCalledWith({ type: "state" });
    dispose();
  });

  it("uses ?resume=1 for an automatic reconnect after a server close", () => {
    const onClose = vi.fn();
    const dispose = open(onClose);
    FakeSocket.instances[0].onclose?.({ code: 1012 });
    expect(onClose).toHaveBeenCalledWith(1012);
    vi.advanceTimersByTime(1000);
    expect(urls()).toEqual(["/ws/games/abc", "/ws/games/abc?resume=1"]);
    dispose();
  });

  it("retries without the flag while no connection has opened yet", () => {
    const dispose = connectGameSocket("abc", () => {});
    FakeSocket.instances[0].onclose?.({ code: 1006 });
    vi.advanceTimersByTime(1000);
    expect(urls()).toEqual(["/ws/games/abc", "/ws/games/abc"]);
    dispose();
  });

  it("cancels a pending reconnect while hidden and connects once on return", () => {
    const dispose = open();
    doc.set("hidden");
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS - 500);
    FakeSocket.instances[0].onclose?.({ code: 1012 }); // reconnect due in 1 s, pause in 0.5 s
    vi.advanceTimersByTime(10 * 60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    doc.set("visible");
    vi.advanceTimersByTime(60_000);
    expect(urls()).toEqual(["/ws/games/abc", "/ws/games/abc?resume=1"]);
    dispose();
  });

  it("starts the timer when the page loads in a hidden tab", () => {
    doc.visibilityState = "hidden";
    const dispose = open();
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS);
    expect(FakeSocket.instances[0].closedWith).toBe(1000);
    doc.set("visible");
    expect(urls()).toEqual(["/ws/games/abc", "/ws/games/abc?resume=1"]);
    dispose();
  });

  it("doesn't come back after the game is gone", () => {
    const dispose = open();
    FakeSocket.instances[0].onclose?.({ code: 4404 });
    doc.set("hidden");
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS);
    doc.set("visible");
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    dispose();
  });

  it("stops listening after dispose", () => {
    const dispose = open();
    dispose();
    doc.set("hidden");
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS);
    doc.set("visible");
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("leaves other sockets alone when the tab is hidden", () => {
    const dispose = openSocket("/ws/admin", () => {});
    FakeSocket.instances[0].onopen?.();
    doc.set("hidden");
    vi.advanceTimersByTime(10 * 60_000);
    expect(FakeSocket.instances[0].closedWith).toBeNull();
    FakeSocket.instances[0].onclose?.({ code: 1012 });
    vi.advanceTimersByTime(1000);
    expect(urls()).toEqual(["/ws/admin", "/ws/admin"]);
    dispose();
  });
});
