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

const base =
  "inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-sm font-semibold transition-colors hover:bg-ink/10 disabled:opacity-60";
const control = `${base} text-ink sm:px-3`;
const toggle = `${base} text-muted hover:text-ink`;

export function GameToolbar(p: Props) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-4 sm:pt-5">
      <h1 className="max-w-[8.5em] font-display text-[1.45rem] leading-[1.05] font-normal tracking-[0.012em] text-ink min-[520px]:max-w-none sm:text-[2rem]">
        Luck Decides Your Fate
      </h1>
      <nav className="flex shrink-0 items-center sm:gap-1" aria-label="Toolbar">
        <button type="button" aria-label="New wheel" onClick={p.onNewWheel} disabled={p.newBusy} className={control}>
          <Plus className="size-[18px] sm:hidden" aria-hidden="true" />
          <span className="hidden sm:inline">New wheel</span>
        </button>
        <button type="button" aria-label="Copy link" onClick={p.onCopyLink} className={control}>
          <LinkIcon className="size-[18px] sm:hidden" aria-hidden="true" />
          <span className="hidden sm:inline">Copy link</span>
        </button>
        <button
          type="button"
          aria-label="Toggle sound"
          aria-pressed={p.soundEnabled}
          onClick={p.onToggleSound}
          className={toggle}
        >
          {p.soundEnabled ? <Volume2 className="size-[18px]" aria-hidden="true" /> : <VolumeX className="size-[18px]" aria-hidden="true" />}
        </button>
        <button
          type="button"
          aria-label="Toggle dark mode"
          aria-pressed={p.dark}
          onClick={p.onToggleTheme}
          className={toggle}
        >
          {p.dark ? <Sun className="size-[18px]" aria-hidden="true" /> : <Moon className="size-[18px]" aria-hidden="true" />}
        </button>
      </nav>
    </header>
  );
}
