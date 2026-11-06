export const mod = (a: number, m: number) => ((a % m) + m) % m;

/** Index of the slice under the 12 o'clock pointer for a wheel rotated `rotation` degrees clockwise. */
export function sliceAtPointer(rotation: number, n: number): number {
  if (n <= 0) return -1;
  const s = 360 / n;
  // Guard against floating-point drift landing exactly at 360.
  return Math.min(n - 1, Math.floor(mod(-rotation, 360) / s));
}

/** Final rotation (always > current) so that the pointer lands inside `winnerIndex` at `landingOffset`. */
export function computeFinalRotation(
  current: number,
  winnerIndex: number,
  n: number,
  landingOffset: number,
  extraRotations: number,
): number {
  const s = 360 / n;
  const a = (winnerIndex + landingOffset) * s; // target wheel-local angle
  return current + extraRotations * 360 + mod(-a - current, 360);
}

/** Ease-out quartic. */
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

/** Rim pegs for `n` slices: a multiple of n, so pegs mark slice boundaries, up to a readable limit. */
export function pegCount(n: number): number {
  if (n <= 0) return 16;
  if (n > 48) return 48;
  return n * Math.ceil(16 / n);
}

// Flapper and peg geometry, as fractions of the wheel's canvas size.
export const PEG_RING = 0.425; // pegs' distance from the centre: just inside the rim
export const PEG_RADIUS = 0.0065;
export const FLAPPER_PIVOT_Y = 0.026; // above the rim, clear of the pegs
export const FLAPPER_WIDTH = 0.036;
export const FLAPPER_LENGTH = 0.056; // the tip reaches just past the pegs, so they can slip by
export const FLAPPER_SHOULDER = 0.0126; // how far the flat base sits behind the pivot

const SPRING_RAD_PER_MS = 0.014; // natural frequency: about 2.2 swings a second
const SPRING_DAMPING = 0.28; // low enough to wobble before settling
const MAX_PUSH_RAD_PER_MS = 0.009;
const BOUNCE = 0.3;
const MIN_ANGLE = -0.45;
const MAX_ANGLE = 0.85; // just past the widest a peg ever needs, so it never swings flat

export interface FlapperState {
  /** Radians, positive = tip pushed clockwise (the way the wheel turns). */
  angle: number;
  /** Radians per millisecond. */
  velocity: number;
}

/**
 * The angle the flapper must be at to clear a peg `pegDeg` degrees clockwise of 12 o'clock, or null
 * when the peg is out of reach or has already passed to the flapper's far side.
 */
export function pegClearance(pegDeg: number, angle: number): number | null {
  const rad = (pegDeg * Math.PI) / 180;
  const x = PEG_RING * Math.sin(rad);
  const y = 0.5 - FLAPPER_PIVOT_Y - PEG_RING * Math.cos(rad);
  const dist = Math.hypot(x, y);
  if (dist - PEG_RADIUS >= FLAPPER_LENGTH) return null;
  const pegAngle = Math.atan2(x, y);
  if (pegAngle > angle) return null;
  const halfWidth =
    ((FLAPPER_WIDTH / 2) * Math.max(0, FLAPPER_LENGTH - dist)) / (FLAPPER_LENGTH + FLAPPER_SHOULDER);
  return pegAngle + Math.asin(Math.min(1, (PEG_RADIUS + halfWidth) / dist));
}

/** How firmly pegs hold the flapper: they let go as the wheel stops, so it can return upright. */
export const pegGrip = (degPerMs: number) => Math.min(1, Math.max(0, degPerMs) / 0.02);

/**
 * Advance the flapper by one animation frame: a damped spring pulls it upright while pegs push it
 * aside. Runs in small steps because a fast wheel moves several pegs past in a single frame.
 */
export function stepFlapper(
  state: FlapperState,
  fromRotation: number,
  toRotation: number,
  pegs: number,
  dtMs: number,
  grip: number,
): void {
  const steps = Math.min(96, Math.max(1, Math.ceil(Math.abs(toRotation - fromRotation)), Math.ceil(dtMs / 4)));
  const dt = dtMs / steps;
  const spacing = 360 / pegs;
  for (let i = 1; i <= steps; i++) {
    const rotation = fromRotation + ((toRotation - fromRotation) * i) / steps;
    const accel =
      -SPRING_RAD_PER_MS * SPRING_RAD_PER_MS * state.angle - 2 * SPRING_DAMPING * SPRING_RAD_PER_MS * state.velocity;
    state.velocity += accel * dt;
    state.angle += state.velocity * dt;
    if (state.angle > MAX_ANGLE || state.angle < MIN_ANGLE) {
      state.angle = Math.min(MAX_ANGLE, Math.max(MIN_ANGLE, state.angle));
      state.velocity = 0;
    }
    const past = mod(rotation, spacing);
    for (let m = -2; m <= 1; m++) {
      const needed = pegClearance(past + m * spacing, state.angle);
      if (needed === null) continue;
      const target = needed * grip;
      if (state.angle < target) {
        const push = Math.min(MAX_PUSH_RAD_PER_MS, (target - state.angle) / Math.max(dt, 1));
        state.velocity = Math.max(state.velocity * -BOUNCE, push);
        state.angle = target;
      }
    }
  }
}

export const INK = "#13261F";

function luminance(hex: string): number {
  const v = parseInt(hex.replace("#", ""), 16);
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
}

/** Whichever of ink or white has the higher contrast on a "#RRGGBB" background. */
export function textColorFor(hex: string): string {
  if (!/^#?[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const L = luminance(hex);
  return 1.05 / (L + 0.05) >= (L + 0.05) / (luminance(INK) + 0.05) ? "#ffffff" : INK;
}
