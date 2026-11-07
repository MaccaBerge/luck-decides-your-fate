import { flushSync } from "react-dom";

interface ViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
}
type WithViewTransitions = Document & { startViewTransition?: (update: () => void) => ViewTransition };

/** Never wait longer than this for a transition: fullscreen must follow soon after the click. */
const MAX_WAIT_MS = 700;

/**
 * Run a layout change as a View Transition: elements with the same `view-transition-name`
 * before and after move and resize smoothly; everything else cross-fades. Without browser
 * support, or with reduced motion, the change is simply instant.
 *
 * Resolves when the animation has finished (or was skipped), at most MAX_WAIT_MS after the start.
 */
export function withViewTransition(update: () => void): Promise<void> {
  const doc = typeof document !== "undefined" ? (document as WithViewTransitions) : null;
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc?.startViewTransition || reduce) {
    update();
    return Promise.resolve();
  }
  // The new layout must be in the DOM when the callback returns, so React renders it right away.
  const t = doc.startViewTransition(() => flushSync(update));
  // A skipped transition (hidden tab, window resized meanwhile) still applies the update; it just
  // isn't animated. Don't report that as an error.
  t?.ready?.catch(() => {});
  const finished = (t?.finished ?? Promise.resolve()).then(
    () => {},
    () => {},
  );
  return Promise.race([finished, new Promise<void>((resolve) => setTimeout(resolve, MAX_WAIT_MS))]);
}

/** Run `fn` once a window resize (such as entering or leaving fullscreen) has settled. */
export function afterResize(fn: () => void) {
  setTimeout(fn, 80);
}
