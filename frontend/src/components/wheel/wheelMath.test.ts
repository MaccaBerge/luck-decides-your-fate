import { describe, expect, it } from "vitest";
import { computeFinalRotation, flapperAngle, INK, mod, pegCount, sliceAtPointer, textColorFor } from "./wheelMath";

describe("mod", () => {
  it("handles negatives", () => {
    expect(mod(-30, 360)).toBe(330);
    expect(mod(725, 360)).toBe(5);
    expect(mod(0, 360)).toBe(0);
  });
});

describe("sliceAtPointer", () => {
  it("rotation 0 puts slice 0 under the pointer", () => {
    expect(sliceAtPointer(0, 4)).toBe(0);
  });
  it("rotating clockwise by a little shows the last slice", () => {
    expect(sliceAtPointer(10, 4)).toBe(3);
  });
  it("rotating counter-clockwise by a slice shows slice 1", () => {
    expect(sliceAtPointer(-100, 4)).toBe(1);
  });
});

describe("computeFinalRotation", () => {
  const currents = [0, 17.3, 90, 359.9, 360, 721.5, 5000.25, -1, -45, -720.7, -3601.3];
  const offsets = [0.08, 0.5, 0.92];
  for (let n = 2; n <= 12; n++) {
    it(`lands on the winner for n=${n}`, () => {
      for (let w = 0; w < n; w++) {
        for (const off of offsets) {
          for (const cur of currents) {
            for (const extra of [5, 8]) {
              const final = computeFinalRotation(cur, w, n, off, extra);
              expect(sliceAtPointer(final, n)).toBe(w);
              expect(final).toBeGreaterThan(cur);
              expect(final - cur).toBeGreaterThanOrEqual(extra * 360);
              expect(final - cur).toBeLessThan((extra + 1) * 360);
            }
          }
        }
      }
    });
  }
  it("lands strictly inside the slice (offset respected)", () => {
    const n = 5;
    const s = 360 / n;
    const final = computeFinalRotation(123, 2, n, 0.37, 6);
    const local = mod(-final, 360);
    expect(local).toBeCloseTo((2 + 0.37) * s, 6);
  });
});

describe("pegCount", () => {
  it("puts a peg on every slice boundary", () => {
    for (let n = 1; n <= 100; n++) {
      expect(pegCount(n) % n).toBe(0);
      expect(pegCount(n)).toBeGreaterThanOrEqual(16);
    }
  });
});

describe("flapperAngle", () => {
  const spacing = 360 / 16;
  it("is exactly upright when the wheel has stopped", () => {
    expect(Math.abs(flapperAngle(spacing, 16, 0))).toBe(0);
  });
  it("hangs upright between pegs", () => {
    expect(Math.abs(flapperAngle(spacing / 2, 16, 1))).toBe(0);
  });
  it("is pushed clockwise further as a peg crosses the top, then snaps back", () => {
    const touching = flapperAngle(spacing - 1.5, 16, 1);
    const atTop = flapperAngle(spacing, 16, 1);
    const slipping = flapperAngle(spacing + 1.5, 16, 1);
    expect(touching).toBeLessThan(0);
    expect(atTop).toBeLessThan(touching);
    expect(slipping).toBeLessThan(atTop);
    expect(Math.abs(flapperAngle(spacing + 3, 16, 1))).toBe(0);
  });
  it("stays within its swing when pegs are denser than the contact window", () => {
    for (let r = 0; r < 10; r += 0.1) {
      const a = flapperAngle(r, 100, 1);
      expect(a).toBeLessThanOrEqual(0);
      expect(a).toBeGreaterThanOrEqual(-0.5);
    }
  });
});

describe("textColorFor", () => {
  const contrast = (a: string, b: string) => {
    const lum = (hex: string) => {
      const v = parseInt(hex.slice(1), 16);
      const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
      return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  it("gives readable labels on every default slice colour", () => {
    const palette = ["#D23C28", "#1A9E96", "#F2BE2E", "#3D4DB0", "#EC7A92", "#27804F", "#EE8A1D", "#3F97E4", "#B83F96", "#8FB83A", "#7650B8", "#8A5638"];
    for (const c of palette) expect(contrast(c, textColorFor(c))).toBeGreaterThanOrEqual(4.5);
  });
  it("uses ink on light colours and white on dark ones", () => {
    expect(textColorFor("#FFFFFF")).toBe(INK);
    expect(textColorFor("#000000")).toBe("#ffffff");
  });
});
