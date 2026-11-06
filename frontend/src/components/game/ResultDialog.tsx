import { Modal } from "./Modal";
import { primaryBtn, secondaryBtn } from "./buttons";

interface Props {
  winner: { name: string } | null;
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
          <p className="text-sm font-medium text-ink-muted">The wheel chose</p>
          <p data-testid="winner-name" className="mt-1 font-display text-[40px] leading-tight font-semibold [overflow-wrap:anywhere]">
            {winner.name}
          </p>
          <div className="mt-6 flex flex-col-reverse justify-center gap-3 sm:flex-row">
            <button type="button" data-autofocus onClick={onClose} className={`${secondaryBtn} !rounded-full px-6`}>
              Close
            </button>
            {showRemove && (
              <button type="button" onClick={onRemove} disabled={removing} className={primaryBtn}>
                Remove from wheel
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
