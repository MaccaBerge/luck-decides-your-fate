import { flushSync } from "react-dom";

interface ViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
}
type WithViewTransitions = Document & { startViewTransition?: (update: () => void) => ViewTransition };

/**
 * Run a layout change as a View Transition: elements with the same `view-transition-name`
 * before and after move and resize smoothly; everything else cross-fades. Without browser
 * support, or with reduced motion, the change is simply instant.
 */
export function withViewTransition(update: () => void) {
  const doc = typeof document !== "undefined" ? (document as WithViewTransitions) : null;
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc?.startViewTransition || reduce) {
    update();
    return;
  }
  // The new layout must be in the DOM when the callback returns, so React renders it right away.
  const t = doc.startViewTransition(() => flushSync(update));
  // A skipped transition (hidden tab, window resized meanwhile) still applies the update; it just
  // isn't animated. Don't report that as an error.
  t?.ready?.catch(() => {});
  t?.finished?.catch(() => {});
}

/** Run `fn` once a window resize (such as entering or leaving fullscreen) has settled. */
export function afterResize(fn: () => void) {
  setTimeout(fn, 80);
}
