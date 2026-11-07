import { afterEach, describe, expect, it } from "vitest";
import { announceOpenWheel, isWheelOpenElsewhere } from "./openWheels";

describe("open wheels across tabs", () => {
  const stops: (() => void)[] = [];
  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
  });

  it("is false when no tab has the wheel open", async () => {
    expect(await isWheelOpenElsewhere("aaaaaaaa", 50)).toBe(false);
  });

  it("is true when another tab has the wheel open", async () => {
    stops.push(announceOpenWheel("aaaaaaaa"));
    expect(await isWheelOpenElsewhere("aaaaaaaa", 500)).toBe(true);
  });

  it("ignores tabs showing a different wheel", async () => {
    stops.push(announceOpenWheel("bbbbbbbb"));
    expect(await isWheelOpenElsewhere("aaaaaaaa", 50)).toBe(false);
  });

  it("stops answering once the tab leaves the wheel", async () => {
    announceOpenWheel("aaaaaaaa")();
    expect(await isWheelOpenElsewhere("aaaaaaaa", 50)).toBe(false);
  });
});
