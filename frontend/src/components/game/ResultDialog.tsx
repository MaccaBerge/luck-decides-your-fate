import { PartyPopper, UserMinus } from "lucide-react";
import { Modal } from "./Modal";

interface Props {
  winner: { name: string; color: string } | null;
  showRemove: boolean;
  removing: boolean;
  onClose: () => void;
  onRemove: () => void;
}

export function ResultDialog({ winner, showRemove, removing, onClose, onRemove }: Props) {
  return (
    <Modal open={winner !== null} onClose={onClose} label="Result" className="text-center">
      {winner && (
        <>
          <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300">
            <PartyPopper className="size-7" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold tracking-widest text-slate-500 uppercase dark:text-slate-400">
            We have a winner!
          </p>
          <p
            data-testid="winner-name"
            className="mt-2 text-4xl font-black break-words sm:text-5xl"
            style={{ color: winner.color }}
          >
            {winner.name}
          </p>
          <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              className="rounded-full bg-slate-100 px-6 py-2.5 font-bold text-slate-700 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              Close
            </button>
            {showRemove && (
              <button
                type="button"
                onClick={onRemove}
                disabled={removing}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-6 py-2.5 font-bold text-white shadow-md shadow-violet-500/30 hover:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-60"
              >
                <UserMinus className="size-4" aria-hidden="true" />
                Remove from wheel
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
