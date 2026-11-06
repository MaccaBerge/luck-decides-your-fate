import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Entry, SpinStarted } from "../../lib/types";
import { playTick, playWin } from "../../lib/sound";
import { SLICE_COLORS } from "../../lib/palette";
import { computeFinalRotation, easeOutQuart, mod, sliceAtPointer, textColorFor } from "./wheelMath";

export interface WheelProps {
  /** Full list; draws active ones in position order when idle. */
  entries: Entry[];
  /** A new spin_id starts an animation; the same spin_id twice is a no-op. */
  spin: SpinStarted | null;
  onSpinComplete?: (spin: SpinStarted) => void;
  /** Tick on each slice crossing + win sound. */
  soundEnabled?: boolean;
  /** px; default fills the container width (square). */
  size?: number;
  /** Default "Wheel with {n} names". */
  ariaLabel?: string;
  /** Draw the centre dot. Off where a Spin button sits on top of the wheel. */
  showHub?: boolean;
}

interface Slice {
  id: string;
  name: string;
  color: string;
}

const LABEL_FONT = '"Fredoka Variable", system-ui, sans-serif';

/** Theme colours the canvas can't get from Tailwind. */
function readTokens() {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    ring: token("--bg"),
    surface: token("--surface"),
    tint: token("--surface-tint"),
    ink: token("--ink"),
    primary: token("--primary"),
  };
}

interface FittedLabel {
  text: string;
  size: number;
}

/**
 * Largest size at which a name stays clear of the hub and of its neighbours (slices narrow toward
 * the centre, so a longer label needs a smaller font), truncating only at the smallest size.
 * Cached: this runs for every slice on every animation frame.
 */
function fitLabel(
  ctx: CanvasRenderingContext2D,
  cache: Map<string, FittedLabel>,
  name: string,
  px: number,
  n: number,
  R: number,
  inset: number,
): FittedLabel {
  const key = `${px}|${n}|${name}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = (Math.PI * 2) / n;
  const base = Math.max(10, Math.min(px * 0.05, R * s * 0.5));
  const floor = Math.min(base, Math.max(10, base * 0.65));
  // Room for a label of this size: from the rim in to where the slice gets narrower than the text.
  const room = (size: number) => R - inset - Math.max(R * 0.3, (size * 1.05) / s);
  const width = (text: string, size: number) => {
    ctx.font = `600 ${size}px ${LABEL_FONT}`;
    return ctx.measureText(text).width;
  };
  let size = base;
  while (size > floor && width(name, size) > room(size)) size = Math.max(floor, size - 1);
  let text = name;
  if (width(text, size) > room(size)) {
    while (text.length > 1 && width(text + "…", size) > room(size)) text = text.slice(0, -1);
    text = text.trimEnd() + "…";
  }
  const fitted = { text, size };
  cache.set(key, fitted);
  return fitted;
}

function activeSlices(entries: Entry[]): Slice[] {
  return entries
    .filter((e) => e.is_active)
    .sort((a, b) => a.position - b.position)
    .map((e) => ({ id: e.id, name: e.name, color: e.color }));
}

interface Anim {
  spin: SpinStarted;
  slices: Slice[];
  from: number;
  to: number;
  start: number;
  duration: number;
}

export default function Wheel({
  entries,
  spin,
  onSpinComplete,
  soundEnabled = false,
  size,
  ariaLabel,
  showHub = true,
}: WheelProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [measured, setMeasured] = useState<number>(size ?? 0);
  const px = size ?? measured;
  const pxRef = useRef(px);
  pxRef.current = px;

  // Starts slightly turned, so a new wheel doesn't rest with a slice boundary under the pointer.
  const rotationRef = useRef(11.25);
  const tokensRef = useRef<ReturnType<typeof readTokens> | null>(null);
  const showHubRef = useRef(showHub);
  showHubRef.current = showHub;
  const labelCacheRef = useRef(new Map<string, FittedLabel>());
  const animRef = useRef<Anim | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenSpinRef = useRef<number | null>(null);
  const completedSpinRef = useRef<number | null>(null);
  const firstSpinCheckRef = useRef(true);
  const knownRef = useRef<Map<string, Slice>>(new Map());
  const lastTickSliceRef = useRef<number>(-1);
  const [, force] = useState(0);

  // Latest props for use inside rAF callbacks.
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const onCompleteRef = useRef(onSpinComplete);
  onCompleteRef.current = onSpinComplete;

  // Remember every entry we've seen so a spin snapshot can be drawn even if entries change.
  for (const e of entries) knownRef.current.set(e.id, { id: e.id, name: e.name, color: e.color });

  const idleSlices = activeSlices(entries);
  const slices = animRef.current ? animRef.current.slices : idleSlices;
  const slicesRef = useRef(slices);
  slicesRef.current = slices;

  // Container width (square) when no explicit size.
  useLayoutEffect(() => {
    if (size !== undefined) return;
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setMeasured(Math.floor(el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const px = pxRef.current;
    if (!canvas || px <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(px * dpr);
    if (canvas.width !== W || canvas.height !== W) {
      canvas.width = W;
      canvas.height = W;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, px, px);

    const list = slicesRef.current;
    const n = list.length;
    const c = px / 2;
    const u = px / 208; // one unit of the design's 200-unit wheel, with room for the pointer
    const R = 90 * u;
    const rotation = (rotationRef.current * Math.PI) / 180;
    const tokens = (tokensRef.current ??= readTokens());

    // Soft ring outside the slices
    ctx.beginPath();
    ctx.arc(c, c, 98 * u, 0, Math.PI * 2);
    ctx.fillStyle = tokens.ring;
    ctx.fill();

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(rotation);

    if (n === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = tokens.tint;
      ctx.fill();
    } else {
      const s = (Math.PI * 2) / n;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, i * s - Math.PI / 2, (i + 1) * s - Math.PI / 2);
        ctx.closePath();
        ctx.fillStyle = list[i].color;
        ctx.fill();
      }
      if (n > 1) {
        ctx.strokeStyle = tokens.surface;
        ctx.lineWidth = Math.max(1, Math.min(2.5 * u, R * s * 0.06));
        ctx.lineCap = "round";
        for (let i = 0; i < n; i++) {
          const a = i * s - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
          ctx.stroke();
        }
      }
      const inset = R * 0.06;
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";
      for (let i = 0; i < n; i++) {
        const { text, size } = fitLabel(ctx, labelCacheRef.current, list[i].name, px, n, R, inset);
        ctx.font = `600 ${size}px ${LABEL_FONT}`;
        ctx.save();
        ctx.rotate((i + 0.5) * s - Math.PI / 2);
        ctx.fillStyle = textColorFor(list[i].color);
        ctx.fillText(text, R - inset, 0);
        ctx.restore();
      }
    }
    ctx.restore();

    // Centre: a dot, or a plain backing for the Spin button, which goes translucent while disabled.
    ctx.beginPath();
    ctx.arc(c, c, 18 * u, 0, Math.PI * 2);
    ctx.fillStyle = showHubRef.current ? tokens.primary : tokens.surface;
    ctx.fill();
    if (showHubRef.current) {
      ctx.strokeStyle = tokens.surface;
      ctx.lineWidth = 4 * u;
      ctx.stroke();
    }

    // Pointer, fixed at 12 o'clock: its tip marks the winning slice.
    ctx.beginPath();
    ctx.moveTo(c - 8 * u, c - 101 * u);
    ctx.quadraticCurveTo(c, c - 103.5 * u, c + 8 * u, c - 101 * u);
    ctx.lineTo(c, c - 86 * u);
    ctx.closePath();
    ctx.fillStyle = tokens.ink;
    ctx.strokeStyle = tokens.surface;
    ctx.lineWidth = 1.5 * u;
    ctx.lineJoin = "round";
    ctx.fill();
    ctx.stroke();
  }, []);

  const finish = useCallback(
    (a: Anim) => {
      if (animRef.current !== a) return;
      rotationRef.current = mod(a.to, 360);
      animRef.current = null;
      rafRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      draw();
      if (completedSpinRef.current !== a.spin.spin_id) {
        completedSpinRef.current = a.spin.spin_id;
        if (soundRef.current) playWin();
        onCompleteRef.current?.(a.spin);
      }
      force((x) => x + 1);
    },
    [draw],
  );

  const frame = useCallback(() => {
    const a = animRef.current;
    if (!a) return;
    const t = Math.min(1, (performance.now() - a.start) / a.duration);
    rotationRef.current = a.from + (a.to - a.from) * easeOutQuart(t);
    const idx = sliceAtPointer(rotationRef.current, a.slices.length);
    if (idx !== lastTickSliceRef.current) {
      lastTickSliceRef.current = idx;
      if (soundRef.current && t < 1) playTick();
    }
    draw();
    if (t >= 1) {
      finish(a);
      return;
    }
    rafRef.current = requestAnimationFrame(frame);
  }, [draw, finish]);

  // Start (or jump to) a spin when a new spin_id arrives.
  useEffect(() => {
    const isFirst = firstSpinCheckRef.current;
    firstSpinCheckRef.current = false;
    if (!spin || seenSpinRef.current === spin.spin_id) return;
    seenSpinRef.current = spin.spin_id;

    const snapshot: Slice[] = spin.wheel_entry_ids.map((id, i) => {
      const known = knownRef.current.get(id);
      if (known) return known;
      return {
        id,
        name: id === spin.winner_entry_id ? spin.winner_name : "",
        color: SLICE_COLORS[i % SLICE_COLORS.length],
      };
    });
    const n = snapshot.length;
    if (n === 0) return;
    const from = rotationRef.current;
    const to = computeFinalRotation(from, spin.winner_index, n, spin.landing_offset, spin.extra_rotations);

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    slicesRef.current = snapshot;

    // How far into the spin are we (by the server's started_at)? Small values are just
    // network latency / clock skew, so a fresh spin animates the full duration.
    const started = Date.parse(spin.started_at);
    const elapsed = Number.isFinite(started) ? Date.now() - started : 0;
    const remaining = Math.max(0, Math.min(spin.duration_ms, spin.duration_ms - elapsed));
    const LATE_MS = 1500;
    const late = isFirst || elapsed > LATE_MS;

    if (late) {
      // Late join (mounted mid-spin, or a stale spin received after mount): jump to the
      // final position and complete when the remaining time elapses (§11.5: no replay).
      const a: Anim = { spin, slices: snapshot, from: to, to, start: performance.now(), duration: 0 };
      animRef.current = a;
      rotationRef.current = to;
      draw();
      force((x) => x + 1);
      timerRef.current = setTimeout(() => finish(a), remaining);
      return;
    }

    // Normal spin: full duration.
    animRef.current = {
      spin,
      slices: snapshot,
      from,
      to,
      start: performance.now(),
      duration: Math.max(1, spin.duration_ms),
    };
    lastTickSliceRef.current = sliceAtPointer(from, n);
    force((x) => x + 1);
    rafRef.current = requestAnimationFrame(frame);
    // Fallback: rAF is throttled/paused in background or headless tabs. Make sure the
    // spin still completes on time (finish() is idempotent per spin_id).
    const anim = animRef.current;
    timerRef.current = setTimeout(() => {
      if (animRef.current !== anim) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      finish(anim);
    }, anim.duration + 50);
  }, [spin, frame, finish, draw]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // Redraw when idle content, size or theme changes.
  const sig = slices.map((s) => `${s.id}|${s.name}|${s.color}`).join(",");
  useEffect(() => {
    if (!rafRef.current) draw();
  }, [sig, px, draw]);

  // The ring, separators and pointer follow the theme.
  useEffect(() => {
    const mo = new MutationObserver(() => {
      tokensRef.current = null;
      if (!rafRef.current) draw();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [draw]);

  // Canvas text doesn't reflow, so redraw once the label font has arrived.
  useEffect(() => {
    let alive = true;
    void document.fonts?.load(`700 16px ${LABEL_FONT}`).then(() => {
      if (!alive) return;
      labelCacheRef.current.clear();
      if (!rafRef.current) draw();
    });
    return () => {
      alive = false;
    };
  }, [draw]);

  const n = slices.length;
  const label = ariaLabel ?? `Wheel with ${n} ${n === 1 ? "name" : "names"}`;

  return (
    <div
      ref={wrapRef}
      className="relative w-full"
      style={size !== undefined ? { width: size, height: size } : { aspectRatio: "1 / 1" }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="block select-none"
        style={{ width: px || "100%", height: px || "100%" }}
      />
    </div>
  );
}
