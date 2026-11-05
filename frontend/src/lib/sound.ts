import { readPref } from "./storage";

// Tiny Web Audio synth: no files.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

/** Call from a user gesture so later sounds are allowed. */
export function unlockAudio() {
  audio();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

let lastTick = 0;
export function playTick() {
  const now = performance.now();
  if (now - lastTick < 25) return;
  lastTick = now;
  tone(1800, 0, 0.03, "square", 0.04);
}

export function playWin() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(f, i * 0.09, 0.35, "triangle", 0.12));
  tone(1046.5, 0.4, 0.6, "sine", 0.08);
}

const SOUND_KEY = "ldyf:sound";
const LEGACY_SOUND_KEY = "soundEnabled";
export function loadSoundPref(): boolean {
  return readPref(SOUND_KEY, LEGACY_SOUND_KEY) !== "false";
}
export function saveSoundPref(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, String(on));
  } catch {
    /* ignore */
  }
}
