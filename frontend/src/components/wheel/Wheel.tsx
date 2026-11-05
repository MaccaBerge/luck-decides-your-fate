import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Entry, SpinStarted } from "../../lib/types";
import { playTick, playWin } from "../../lib/sound";
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
}

interface Slice {
  id: string;
  name: string;
  color: string;
}

const FALLBACK_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#22C55E", "#14B8A6",
  "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6", "#D946EF", "#EC4899",
];

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
}: WheelProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [measured, setMeasured] = useState<number>(size ?? 0);
  const px = size ?? measured;
  const pxRef = useRef(px);
  pxRef.current = px;

  const rotationRef = useRef(0);
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
    const pointerH = Math.max(14, px * 0.07);
    const R = c - Math.max(6, px * 0.025);
    const dark = document.documentElement.classList.contains("dark");

    // Rim
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, R + Math.max(3, px * 0.014), 0, Math.PI * 2);
    ctx.fillStyle = dark ? "#1e1b2e" : "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = px * 0.04;
    ctx.shadowOffsetY = px * 0.01;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate((rotationRef.current * Math.PI) / 180);

    if (n === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = dark ? "#2a2640" : "#ede9fe";
      ctx.fill();
    } else {
      const s = (Math.PI * 2) / n;
      for (let i = 0; i < n; i++) {
        const a0 = i * s - Math.PI / 2;
        const a1 = (i + 1) * s - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, a0, a1);
        ctx.closePath();
        ctx.fillStyle = list[i].color;
        ctx.fill();
        if (n > 1) {
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.lineWidth = Math.max(1, px * 0.004);
          ctx.stroke();
        }
      }
      // Labels
      const fontSize = Math.max(10, Math.min(px * 0.06, (R * s * 0.55) / 1.1, px * 0.065));
      ctx.font = `700 ${fontSize}px ui-rounded, "Nunito", system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";
      const maxW = R * 0.68;
      for (let i = 0; i < n; i++) {
        const mid = (i + 0.5) * s - Math.PI / 2;
        let label = list[i].name;
        if (ctx.measureText(label).width > maxW) {
          while (label.length > 1 && ctx.measureText(label + "…").width > maxW) label = label.slice(0, -1);
          label = label.trimEnd() + "…";
        }
        ctx.save();
        ctx.rotate(mid);
        const fg = textColorFor(list[i].color);
        ctx.fillStyle = fg;
        if (fg === "#ffffff") {
          ctx.shadowColor = "rgba(0,0,0,0.35)";
          ctx.shadowBlur = 3;
          ctx.shadowOffsetY = 1;
        }
        ctx.fillText(label, R - fontSize * 0.7, 0);
        ctx.restore();
      }
    }
    ctx.restore();

    // Hub
    const hubR = Math.max(10, px * 0.075);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, hubR, 0, Math.PI * 2);
    ctx.fillStyle = dark ? "#1e1b2e" : "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = px * 0.02;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(c, c, hubR * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "#8b5cf6";
    ctx.fill();

    if (n === 0) {
      ctx.fillStyle = dark ? "#a5a1c2" : "#7c6fae";
      ctx.font = `600 ${Math.max(12, px * 0.045)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Add some names", c, c + hubR + px * 0.08);
    }

    // Pointer (12 o'clock, fixed)
    const pw = pointerH * 0.75;
    const top = Math.max(1, px * 0.004);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c - pw / 2, top);
    ctx.lineTo(c + pw / 2, top);
    ctx.lineTo(c, top + pointerH);
    ctx.closePath();
    ctx.fillStyle = dark ? "#f8fafc" : "#1f1b2e";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fill();
    ctx.restore();
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
        color: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
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

  useEffect(() => {
    const mo = new MutationObserver(() => {
      if (!rafRef.current) draw();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
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
