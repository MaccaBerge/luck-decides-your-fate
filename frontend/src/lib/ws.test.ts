import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSocket } from "./ws";

class FakeSocket {
  static instances: FakeSocket[] = [];
  static CONNECTING = 0;
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  close() {}
}

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
