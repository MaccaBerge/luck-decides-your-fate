import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Entry } from "../../lib/types";
import { EntryPanel } from "./EntryPanel";
import { GameToolbar } from "./GameToolbar";
import { PasteNamesDialog } from "./PasteNamesDialog";
import { ResultDialog } from "./ResultDialog";
import { SavedListsDialog } from "./SavedListsDialog";

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
        recentSpins={[{ spin_id: 1, winner_name: "Anna", finished_at: "2026-01-01T12:00:00Z" }]}
        removeWinner={false}
        disabled={false}
        onAdd={async () => true}
        onOpenPaste={noop}
        onOpenSavedLists={noop}
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
      ">Saved lists<",
      'aria-label="Shuffle names"',
      'aria-label="Restore all names"',
      'role="switch"',
      'aria-label="Remove winner after spin"',
      'aria-label="Edit Anna"',
      'aria-label="Change color for Anna"',
      'aria-label="Hide Anna"',
      'aria-label="Remove Anna"',
      'aria-label="Show Jonas"',
      'data-testid="recent-spins"',
      ">Recent spins<",
    ])
      expect(html).toContain(l);
  });
  it("toolbar", () => {
    const html = renderToStaticMarkup(
      <GameToolbar soundEnabled dark={false} onToggleSound={noop} onToggleTheme={noop} onNewWheel={noop} onCopyLink={noop} newBusy={false} />,
    );
    for (const l of ["Toggle sound", "Toggle dark mode", "New wheel", "Copy link"]) expect(html).toContain(`aria-label="${l}"`);
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
    const saved = renderToStaticMarkup(
      <SavedListsDialog open names={["Anna"]} disabled={false} onClose={noop} onLoad={async () => true} />,
    );
    expect(saved).toMatch(/role="dialog"[^>]*aria-label="Saved lists"/);
    expect(saved).toContain('aria-label="List name"');
    expect(saved).toContain(">Save list<");
  });
});
