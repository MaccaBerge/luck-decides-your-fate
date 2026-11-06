import { describe, expect, it } from "vitest";
import {
  computeFinalRotation,
  easeOutQuart,
  type FlapperState,
  INK,
  mod,
  pegClearance,
  pegCount,
  pegGrip,
  sliceAtPointer,
  stepFlapper,
  textColorFor,
} from "./wheelMath";

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
  it("puts a peg on every slice boundary while slices are wide enough", () => {
    for (let n = 1; n <= 48; n++) {
      expect(pegCount(n) % n).toBe(0);
      expect(pegCount(n)).toBeGreaterThanOrEqual(16);
    }
  });
  it("stays readable on very full wheels", () => {
    expect(pegCount(100)).toBe(48);
  });
});

describe("flapper", () => {
  /** A real spin at 60 fps, calling back after every frame. */
  function spin(n: number, each: (s: FlapperState, rotation: number, t: number, grip: number) => void) {
    const pegs = pegCount(n);
    const state: FlapperState = { angle: 0, velocity: 0 };
    const total = 2300;
    const duration = 6000;
    let previous = 0;
    for (let ms = 16; ms <= duration; ms += 16) {
      const t = ms / duration;
      const rotation = total * easeOutQuart(t);
      const grip = pegGrip((4 * Math.pow(1 - t, 3) * total) / duration);
      stepFlapper(state, previous, rotation, pegs, 16, grip);
      previous = rotation;
      each(state, rotation, t, grip);
    }
    return state;
  }

  for (const n of [2, 6, 8, 16, 40, 100]) {
    it(`never passes through a peg with ${n} names`, () => {
      const spacing = 360 / pegCount(n);
      let checked = 0;
      spin(n, (s, rotation, _t, grip) => {
        if (grip < 1) return;
        const past = mod(rotation, spacing);
        for (let m = -2; m <= 1; m++) {
          const needed = pegClearance(past + m * spacing, s.angle);
          if (needed === null) continue;
          checked++;
          expect(s.angle).toBeGreaterThanOrEqual(needed - 1e-9);
        }
      });
      expect(checked).toBeGreaterThan(0);
    });
  }

  it("is pushed the way the wheel turns, but never swings flat", () => {
    let most = 0;
    spin(8, (s) => {
      most = Math.max(most, s.angle);
    });
    expect(most).toBeGreaterThan(0.3);
    expect(most).toBeLessThanOrEqual(0.85);
  });

  it("lets go of a peg and swings back slowly, overshooting before it settles", () => {
    const s: FlapperState = { angle: 0.7, velocity: 0 };
    const angleAfter = (ms: number) => {
      for (let i = 0; i < ms / 4; i++) stepFlapper(s, 191.25, 191.25, 16, 4, 1);
      return s.angle;
    };
    expect(angleAfter(60)).toBeGreaterThan(0.45); // no snap: most of the swing is still to come
    let lowest = s.angle;
    for (let i = 0; i < 20; i++) lowest = Math.min(lowest, angleAfter(20));
    expect(lowest).toBeLessThan(0); // overshoots upright
    expect(Math.abs(angleAfter(1200))).toBeLessThan(0.02); // and settles
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
