import { Link as LinkIcon, Moon, Plus, Sun, Volume2, VolumeX } from "lucide-react";

interface Props {
  soundEnabled: boolean;
  dark: boolean;
  onToggleSound: () => void;
  onToggleTheme: () => void;
  onNewWheel: () => void;
  onCopyLink: () => void;
  newBusy: boolean;
}

const round =
  "grid size-10 place-items-center rounded-full bg-white/80 text-slate-700 shadow-sm ring-1 ring-black/5 transition hover:bg-white hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-white/10 dark:hover:text-violet-300";
const pill =
  "inline-flex h-10 items-center gap-1.5 rounded-full bg-white/80 px-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-black/5 transition hover:bg-white hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-60 sm:px-4 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-white/10 dark:hover:text-violet-300";

export function GameToolbar(p: Props) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 pt-4 sm:pt-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[conic-gradient(#EF4444,#F59E0B,#22C55E,#06B6D4,#6366F1,#D946EF,#EF4444)] shadow-md"
        >
          <span className="size-3 rounded-full bg-white shadow" />
        </span>
        <span className="hidden truncate text-xl font-black tracking-tight text-slate-900 min-[440px]:block dark:text-white">
          Luck Decides Your Fate
        </span>
      </div>
      <nav className="flex items-center gap-1.5 sm:gap-2" aria-label="Toolbar">
        <button type="button" aria-label="New wheel" onClick={p.onNewWheel} disabled={p.newBusy} className={pill}>
          <Plus className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">New wheel</span>
        </button>
        <button type="button" aria-label="Copy link" onClick={p.onCopyLink} className={pill}>
          <LinkIcon className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Copy link</span>
        </button>
        <button
          type="button"
          aria-label="Toggle sound"
          aria-pressed={p.soundEnabled}
          onClick={p.onToggleSound}
          className={round}
        >
          {p.soundEnabled ? <Volume2 className="size-[18px]" aria-hidden="true" /> : <VolumeX className="size-[18px]" aria-hidden="true" />}
        </button>
        <button
          type="button"
          aria-label="Toggle dark mode"
          aria-pressed={p.dark}
          onClick={p.onToggleTheme}
          className={round}
        >
          {p.dark ? <Sun className="size-[18px]" aria-hidden="true" /> : <Moon className="size-[18px]" aria-hidden="true" />}
        </button>
      </nav>
    </header>
  );
}
