import { textColorFor } from "../wheel/wheelMath";
import { Modal } from "./Modal";

interface Props {
  winner: { name: string; color: string } | null;
  showRemove: boolean;
  removing: boolean;
  onClose: () => void;
  onRemove: () => void;
}

/** Long names step down in size so the reveal stays one confident block of type. */
function nameSize(name: string): string {
  if (name.length <= 8) return "text-[clamp(3.25rem,15vw,6rem)]";
  if (name.length <= 16) return "text-[clamp(2.5rem,10vw,4rem)]";
  return "text-[clamp(1.75rem,7vw,2.75rem)]";
}

export function ResultDialog({ winner, showRemove, removing, onClose, onRemove }: Props) {
  const fg = winner ? textColorFor(winner.color) : undefined;
  return (
    <Modal
      open={winner !== null}
      onClose={onClose}
      label="Result"
      className="max-w-xl px-6 pt-8 pb-6 text-center sm:px-10 sm:pt-10"
      style={winner ? { backgroundColor: winner.color, color: fg } : undefined}
    >
      {winner && (
        <>
          <p className="text-base font-semibold">The wheel chose</p>
          <p
            data-testid="winner-name"
            className={`mt-2 font-display leading-[1.1] font-normal [overflow-wrap:anywhere] ${nameSize(winner.name)}`}
          >
            {winner.name}
          </p>
          <div className="mt-8 flex flex-col-reverse justify-center gap-2 sm:flex-row">
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              style={{ backgroundColor: fg, color: winner.color, outlineColor: fg }}
              className="rounded-lg px-7 py-2.5 font-bold transition-opacity hover:opacity-90"
            >
              Close
            </button>
            {showRemove && (
              <button
                type="button"
                onClick={onRemove}
                disabled={removing}
                style={{ outlineColor: fg }}
                className="rounded-lg border-2 border-current px-6 py-2.5 font-bold transition-opacity hover:opacity-80 disabled:opacity-60"
              >
                Remove from wheel
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
