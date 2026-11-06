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

/** Rim pegs for `n` slices: always a multiple of n, so pegs sit on every slice boundary. */
export function pegCount(n: number): number {
  if (n <= 0) return 16;
  return n * Math.ceil(16 / n);
}

// Where a rim peg meets the flapper, in degrees of wheel travel around 12 o'clock.
const PEG_CONTACT_DEG = 2.4; // the peg touches the flapper's edge this far before the top
const PEG_RELEASE_DEG = 1.8; // and slips past its tip this far after it

/**
 * Flapper angle in radians, negative = tip pushed clockwise. Pegs move left to right across the
 * top: each one catches the flapper, pushes it aside, then slips past so it snaps back upright.
 * Amplitude follows wheel speed, so the flapper is exactly upright when the wheel stops and
 * always points at the winning slice.
 */
export function flapperAngle(rotation: number, pegs: number, degPerMs: number, maxRad = 0.5): number {
  const spacing = 360 / pegs;
  const fit = Math.min(1, spacing / (PEG_CONTACT_DEG + PEG_RELEASE_DEG)); // dense pegs: always touching
  const contact = PEG_CONTACT_DEG * fit;
  const span = contact + PEG_RELEASE_DEG * fit;
  const travel = mod(rotation + contact, spacing);
  if (travel >= span) return 0;
  return -maxRad * Math.min(1, Math.max(0, degPerMs) / 0.04) * (travel / span);
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
