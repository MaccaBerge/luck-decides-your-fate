import { SLICE_COLORS } from "../../lib/palette";

const SLICES = [
  "M18 18 L18 3 A15 15 0 0 1 32.3 13.4 Z",
  "M18 18 L32.3 13.4 A15 15 0 0 1 26.8 30.1 Z",
  "M18 18 L26.8 30.1 A15 15 0 0 1 4.6 24.5 Z",
  "M18 18 L4.6 24.5 A15 15 0 0 1 18 3 Z",
];

/** The logo: a small drawing of the wheel. */
export function WheelMark({ className = "size-[34px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true" className={`shrink-0 ${className}`}>
      <circle cx="18" cy="18" r="17" fill="#FFFFFF" stroke="var(--border)" />
      {SLICES.map((d, i) => (
        <path key={d} d={d} fill={SLICE_COLORS[i]} />
      ))}
      <circle cx="18" cy="18" r="3.5" fill="#1C1830" />
    </svg>
  );
}
