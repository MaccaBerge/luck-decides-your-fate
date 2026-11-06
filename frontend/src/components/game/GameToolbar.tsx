import { Link as LinkIcon, Moon, Plus, Sun, Volume2, VolumeX } from "lucide-react";
import { secondaryBtn } from "./buttons";
import { WheelMark } from "./WheelMark";

interface Props {
  soundEnabled: boolean;
  dark: boolean;
  onToggleSound: () => void;
  onToggleTheme: () => void;
  onNewWheel: () => void;
  onCopyLink: () => void;
  newBusy: boolean;
}

const square = `${secondaryBtn} w-11 !px-0`;
const labelled = `${secondaryBtn} max-sm:px-3`;

export function GameToolbar(p: Props) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <WheelMark />
        <span className="font-display text-[19px] font-semibold text-ink">Luck Decides Your Fate</span>
      </div>
      <nav className="flex flex-wrap items-center gap-2" aria-label="Toolbar">
        <button type="button" aria-label="New wheel" onClick={p.onNewWheel} disabled={p.newBusy} className={labelled}>
          <Plus className="size-4" aria-hidden="true" />
          New wheel
        </button>
        <button type="button" aria-label="Copy link" onClick={p.onCopyLink} className={labelled}>
          <LinkIcon className="size-4" aria-hidden="true" />
          Copy link
        </button>
        <button
          type="button"
          aria-label="Toggle sound"
          aria-pressed={p.soundEnabled}
          onClick={p.onToggleSound}
          className={square}
        >
          {p.soundEnabled ? <Volume2 className="size-[18px]" aria-hidden="true" /> : <VolumeX className="size-[18px]" aria-hidden="true" />}
        </button>
        <button type="button" aria-label="Toggle dark mode" aria-pressed={p.dark} onClick={p.onToggleTheme} className={square}>
          {p.dark ? <Sun className="size-[18px]" aria-hidden="true" /> : <Moon className="size-[18px]" aria-hidden="true" />}
        </button>
      </nav>
    </header>
  );
}
