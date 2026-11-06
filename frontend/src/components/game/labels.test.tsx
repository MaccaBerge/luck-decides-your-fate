import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Entry } from "../../lib/types";
import { EntryPanel } from "./EntryPanel";
import { GameToolbar } from "./GameToolbar";
import { PasteNamesDialog } from "./PasteNamesDialog";
import { QrDialog } from "./QrDialog";
import { ResultDialog } from "./ResultDialog";

const noop = () => {};
const entries: Entry[] = [
  { id: "en_1", name: "Anna", color: "#EF4444", position: 0, is_active: true },
  { id: "en_2", name: "Jonas", color: "#F97316", position: 1, is_active: false },
];

describe("§11.8 accessible names", () => {
  it("entry panel", () => {
    const html = renderToStaticMarkup(
      <EntryPanel
        entries={entries}
        removeWinner={false}
        disabled={false}
        onAdd={async () => true}
        onOpenPaste={noop}
        onRename={noop}
        onColor={noop}
        onToggle={noop}
        onRemove={noop}
        onShuffle={noop}
        onRestore={noop}
        onRemoveWinnerChange={noop}
      />,
    );
    for (const l of [
      'aria-label="New name"',
      'aria-label="Add name"',
      ">Paste names<",
      'aria-label="Shuffle names"',
      'aria-label="Restore all names"',
      'role="switch"',
      'aria-label="Remove winner after spin"',
      'aria-label="Edit Anna"',
      'aria-label="Change color for Anna"',
      'aria-label="Hide Anna"',
      'aria-label="Remove Anna"',
      'aria-label="Show Jonas"',
    ])
      expect(html).toContain(l);
  });
  it("toolbar", () => {
    const html = renderToStaticMarkup(
      <GameToolbar soundEnabled dark={false} onToggleSound={noop} onToggleTheme={noop} onNewWheel={noop} onCopyLink={noop} onShowQr={noop} newBusy={false} />,
    );
    for (const l of ["Toggle sound", "Toggle dark mode", "New wheel", "Copy link", "Show QR code"]) expect(html).toContain(`aria-label="${l}"`);
  });
  it("dialogs", () => {
    const paste = renderToStaticMarkup(<PasteNamesDialog open onClose={noop} onSubmit={async () => true} />);
    expect(paste).toContain('role="dialog"');
    expect(paste).toContain('aria-label="Names, one per line"');
    expect(paste).toContain(">Add names<");
    const res = renderToStaticMarkup(
      <ResultDialog winner={{ name: "Anna" }} showRemove removing={false} onClose={noop} onRemove={noop} />,
    );
    expect(res).toMatch(/role="dialog"[^>]*aria-label="Result"/);
    expect(res).toContain('data-testid="winner-name"');
    expect(res).toContain(">Close<");
    expect(res).toContain("Remove from wheel");
    const qr = renderToStaticMarkup(<QrDialog url="https://example.test/g/abc" onClose={noop} onError={noop} />);
    expect(qr).toMatch(/role="dialog"[^>]*aria-label="QR code"/);
    expect(qr).toContain("Scan to join this wheel");
    expect(qr).toContain(">Close<");
  });
});
