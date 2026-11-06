import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { secondaryBtn } from "./buttons";

interface Props {
  /** The wheel's link. Null keeps the dialog closed. */
  url: string | null;
  onClose: () => void;
  onError: () => void;
}

/** Always dark on white, in both themes: scanners need it. Generated here, so the link stays in the browser. */
const QR_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 4,
  width: 480,
  color: { dark: "#000000", light: "#FFFFFF" },
} as const;

export function QrDialog({ url, onClose, onError }: Props) {
  const [image, setImage] = useState<{ url: string; src: string } | null>(null);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    import("qrcode")
      .then((qr) => qr.toDataURL(url, QR_OPTIONS))
      .then((src) => {
        if (alive) setImage({ url, src });
      })
      .catch(() => {
        if (alive) onError();
      });
    return () => {
      alive = false;
    };
    // onError changes on every render of the page; only a new link needs a new code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <Modal open={url !== null} onClose={onClose} label="QR code" className="flex flex-col items-center gap-4 text-center">
      <p className="font-display text-[21px] font-semibold">Scan to join this wheel</p>
      <div className="aspect-square w-64 max-w-full overflow-hidden rounded-xl bg-white">
        {image?.url === url && <img src={image.src} alt="QR code for this wheel" className="size-full" />}
      </div>
      <button type="button" data-autofocus onClick={onClose} className={secondaryBtn}>
        Close
      </button>
    </Modal>
  );
}
