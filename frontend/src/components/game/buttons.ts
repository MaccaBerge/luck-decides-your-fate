const base = "inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed";

const pressPrimary =
  "transition-[translate,box-shadow] duration-[80ms] shadow-[0_4px_0_var(--primary-shadow)] enabled:active:translate-y-[3px] enabled:active:shadow-[0_1px_0_var(--primary-shadow)] disabled:opacity-60 disabled:shadow-none";

/** The one chunky action a surface is asking for. */
export const primaryBtn = `${base} ${pressPrimary} h-11 rounded-full bg-primary px-5 font-display text-[15px] font-semibold text-white`;

/** The dark "Add name" button. */
export const darkBtn = `${base} h-11 shrink-0 rounded-xl bg-ink px-4 text-sm font-semibold text-surface shadow-[0_3px_0_var(--ink-shadow)] transition-[translate,box-shadow] duration-[80ms] enabled:active:translate-y-[2px] enabled:active:shadow-[0_1px_0_var(--ink-shadow)] disabled:opacity-60 disabled:shadow-none`;

/** Bordered white button, as in the page headers. */
export const secondaryBtn = `${base} h-11 rounded-xl border border-border-strong bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-muted disabled:text-ink-muted disabled:opacity-60`;

/** The small pill actions. */
export const pillBtn = `${base} h-10 rounded-full border border-border-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-surface-muted disabled:text-ink-muted disabled:opacity-60`;

/** Plain text, for the least important action. */
export const textBtn = `${base} h-11 rounded-xl px-4 text-sm font-medium text-ink-muted transition-colors hover:text-ink`;

/** A 44px square for an icon. */
export const iconBtn = `${base} size-11 shrink-0 rounded-xl text-ink-muted transition-colors hover:bg-surface-tint hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent`;

export const card = "rounded-3xl border border-border bg-surface";
