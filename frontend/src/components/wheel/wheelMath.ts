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

/** Pick black or white text for a "#RRGGBB" background. */
export function textColorFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const v = parseInt(m[1], 16);
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  // Prefer white (with shadow) unless the background is quite light.
  return L > 0.42 ? "#1f1f1f" : "#ffffff";
}
