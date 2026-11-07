import { KeyRound, Link as LinkIcon, Maximize, Moon, Plus, QrCode, Sun, Users, Volume2, VolumeX } from "lucide-react";
import { secondaryBtn } from "./buttons";
import { WheelMark } from "./WheelMark";

interface Props {
  /** Solo wheels offer hosting and joining; a multiplayer game offers its invite link and QR code. */
  multiplayer: boolean;
  onHost: () => void;
  onJoinCode: () => void;
  soundEnabled: boolean;
  dark: boolean;
  onToggleSound: () => void;
  onToggleTheme: () => void;
  onNewWheel: () => void;
  onCopyLink: () => void;
  onShowQr: () => void;
  newBusy: boolean;
  onBigScreen: () => void;
}

const square = `${secondaryBtn} w-11 !px-0`;
/** Icon-only on phones, so the toolbar fits on one row. */
const labelled = `${secondaryBtn} max-sm:w-11 max-sm:!px-0`;

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
          <span className="max-sm:hidden">New wheel</span>
        </button>
        {p.multiplayer ? (
          <>
            <button type="button" aria-label="Copy link" onClick={p.onCopyLink} className={labelled}>
              <LinkIcon className="size-4" aria-hidden="true" />
              <span className="max-sm:hidden">Copy link</span>
            </button>
            <button type="button" aria-label="Show QR code" onClick={p.onShowQr} className={square}>
              <QrCode className="size-[18px]" aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <button type="button" aria-label="Host this wheel" onClick={p.onHost} className={labelled}>
              <Users className="size-4" aria-hidden="true" />
              <span className="max-sm:hidden">Host</span>
            </button>
            <button type="button" aria-label="Join a game" onClick={p.onJoinCode} className={square} title="Join a game">
              <KeyRound className="size-[18px]" aria-hidden="true" />
            </button>
          </>
        )}
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
        <button type="button" aria-label="Big screen" onClick={p.onBigScreen} className={square}>
          <Maximize className="size-[18px]" aria-hidden="true" />
        </button>
      </nav>
    </header>
  );
}
