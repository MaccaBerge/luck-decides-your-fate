const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed";

/** The one action a surface is asking for. */
export const primaryBtn = `${base} bg-brass px-5 py-2.5 text-on-brass hover:brightness-105 disabled:opacity-50`;

/** Everything else: plain text that picks up a tint on hover. */
export const quietBtn = `${base} px-3 py-2 text-sm text-ink hover:bg-ink/10 disabled:text-muted disabled:opacity-60 disabled:hover:bg-transparent`;
