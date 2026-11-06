const COLORS = ["#D23C28", "#F2BE2E", "#1A9E96", "#3D4DB0", "#EC7A92", "#27804F"];

/** A small drawing of the wheel, for places where there is no game yet. */
export function WheelMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <circle cx="24" cy="24" r="24" fill="#2F1E14" />
      {COLORS.map((color, i) => (
        <path key={color} d="M24 24 L24 4 A20 20 0 0 1 41.32 14 Z" fill={color} transform={`rotate(${i * 60} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="6" fill="#2F1E14" />
      <circle cx="24" cy="24" r="4.5" fill="#E3A81F" />
    </svg>
  );
}
