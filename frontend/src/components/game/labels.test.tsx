import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Entry } from "../../lib/types";
import { EntryPanel } from "./EntryPanel";
import { GameToolbar } from "./GameToolbar";
import { PasteNamesDialog } from "./PasteNamesDialog";
import { QrDialog } from "./QrDialog";
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
