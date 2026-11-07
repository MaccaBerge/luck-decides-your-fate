import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Player } from "../../lib/types";
import { AVATARS, avatarEmoji } from "../../lib/avatars";
import { PlayerRow } from "./PlayerRow";
import { PlayerSetup } from "./PlayerSetup";
import { JoinCodeDialog } from "./JoinCodeDialog";
import { JoinScreen } from "./JoinScreen";
import { HostDialog } from "./HostDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { EntryPanel } from "./EntryPanel";
import { InviteCard } from "./InviteCard";

const noop = () => {};
const players: Player[] = [
  { id: "pl_h", entry_id: "e1", name: "Hanna", avatar: "fox", status: "here", is_host: true },
  { id: "pl_a", entry_id: "e2", name: "Anna", avatar: "robot", status: "away", is_host: false },
  { id: "pl_j", entry_id: "e3", name: "Jonas", avatar: "nope", status: "here", is_host: false },
];
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("PlayerRow", () => {
  const row = (meId: string | null, isHost: boolean) =>
    renderToStaticMarkup(
      <PlayerRow players={players} meId={meId} isHost={isHost} busy={false} onLeave={noop} onJoin={noop} onRemove={noop} />,
    );

  it("shows everyone with their avatar, host crown and away status", () => {
    const html = row("pl_a", false);
    expect(html).toContain('data-testid="player-row"');
    expect(text(html)).toContain("3 players , 2 here");
    expect(html).toContain('aria-label="Fox"');
    expect(html).toContain("🦊");
    expect(html).toContain("🙂"); // an unknown avatar key still shows something
    expect(html.match(/data-testid="host-badge"/g)).toHaveLength(1);
    expect(text(html)).toContain("Anna (you)");
    expect(text(html)).toContain(", away");
    expect(html).toContain(">Leave<");
    expect(html).not.toContain("Remove ");
  });

  it("lets the host remove others, not themselves", () => {
    const html = row("pl_h", true);
    expect(html).toContain('aria-label="Remove Anna"');
    expect(html).toContain('aria-label="Remove Jonas"');
    expect(html).not.toContain('aria-label="Remove Hanna"');
  });

  it("offers to join someone who's only watching", () => {
    const html = row(null, false);
    expect(html).toContain(">Join<");
    expect(html).not.toContain(">Leave<");
  });
});

describe("PlayerSetup", () => {
  it("asks for a name and offers every avatar as a radio", () => {
    const html = renderToStaticMarkup(<PlayerSetup submitLabel="Join" busy={false} onSubmit={noop} />);
    expect(html).toContain('aria-label="Your name"');
    expect(html).toContain('maxLength="40"');
    expect(html.match(/role="radio"/g)).toHaveLength(AVATARS.length);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    for (const a of AVATARS) expect(html).toContain(`aria-label="${a.label}"`);
    expect(html).toMatch(/type="submit"[^>]*disabled/); // no name yet
  });

  it("has 16 distinct avatars", () => {
    expect(new Set(AVATARS.map((a) => a.key)).size).toBe(16);
    expect(avatarEmoji("wizard")).toBe("🧙");
  });
});

describe("join screens", () => {
  it("the code dialog takes a code", () => {
    const html = renderToStaticMarkup(<JoinCodeDialog open busy={false} error="No game with that code." onClose={noop} onJoin={noop} />);
    expect(html).toMatch(/role="dialog"[^>]*aria-label="Join a game"/);
    expect(html).toContain('aria-label="Game code"');
    expect(html).toContain('role="alert"');
  });

  it("the join screen names the host and offers to just watch", () => {
    const html = renderToStaticMarkup(<JoinScreen players={players} busy={false} onJoin={noop} onWatch={noop} />);
    expect(text(html)).toContain("Hanna is hosting.");
    expect(text(html)).toContain("3 players have joined");
    expect(html).toContain(">Just watch<");
  });
});

describe("HostDialog", () => {
  const dialog = (names: string[]) =>
    renderToStaticMarkup(<HostDialog open busy={false} names={names} onClose={noop} onHost={noop} />);

  it("asks whether to keep the names or start fresh", () => {
    const html = dialog(["Anna", "Jonas", "Mia", "Leo"]);
    expect(html).toMatch(/role="radiogroup"[^>]*aria-label="Names to start with"/);
    expect(text(html)).toContain("This wheel has 4 names. What should the game start with?");
    expect(text(html)).toContain("Keep names from current wheel Create new wheel");
    expect(html.match(/aria-checked="false"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/type="submit"[^>]*disabled/);
  });

  it("keeps the explanation behind an info button", () => {
    const html = dialog(["Anna"]);
    expect(html).toMatch(/aria-label="About playing together"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-label="About playing together"/);
    expect(html).not.toContain("Friends join on their own devices");
  });

  it("asks nothing on an empty wheel", () => {
    const html = dialog([]);
    expect(html).not.toContain("Names to start with");
    expect(html).toContain("Host this wheel");
  });

  it("words one name in the singular", () => {
    expect(text(dialog(["Anna"]))).toContain("This wheel has 1 name. What should the game start with?");
  });
});

describe("InviteCard", () => {
  it("shows the code and player count, in the side column or floating in big-screen mode", () => {
    const panel = renderToStaticMarkup(<InviteCard variant="panel" code="ACP7KY" url="http://x/j/ACP7KY" />);
    expect(panel).toContain('data-testid="host-invite-card"');
    expect(panel).not.toContain("fixed");
    expect(text(panel)).toBe("Join with the code ACP7KY"); // no player count on the host's card
    const floating = renderToStaticMarkup(<InviteCard code="ACP7KY" url="http://x/j/ACP7KY" />);
    expect(panel).toContain('aria-label="Copy code"');
    expect(panel).toContain('aria-label="Enlarge QR code"');
    expect(floating).toContain('data-testid="invite-card"');
    expect(floating).not.toContain("Copy code");
    expect(floating).not.toContain("Enlarge QR code");
    expect(floating).toContain("fixed");
    expect(text(floating)).toBe("Join with the code ACP7KY"); // no player count here either
  });
});

describe("leaving", () => {
  it("asks before leaving", () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog open title="Leave the game?" message="You're the only player, so the game ends." confirmLabel="Leave" onConfirm={noop} onClose={noop} />,
    );
    expect(html).toMatch(/role="dialog"[^>]*aria-label="Leave the game\?"/);
    expect(text(html)).toContain("Leave the game? You're the only player, so the game ends. Cancel Leave");
    const red = renderToStaticMarkup(<ConfirmDialog open danger title="Leave the game?" confirmLabel="Leave" onConfirm={noop} onClose={noop} />);
    expect(red).toContain("bg-danger");
    expect(html).not.toContain("bg-danger");
  });

  it("the host can't delete their own name, but can delete other players'", () => {
    const entries = [
      { id: "e1", name: "Hanna", color: "#C9B8FF", position: 0, is_active: true },
      { id: "e2", name: "Mia", color: "#FFC9A8", position: 1, is_active: true },
    ];
    const html = renderToStaticMarkup(
      <EntryPanel
        entries={entries}
        recentSpins={[]}
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
        undeletableIds={new Set(["e1"])}
      />,
    );
    expect(html).not.toContain('aria-label="Remove Hanna"');
    expect(html).toContain('aria-label="Remove Mia"');
    expect(html).toContain('aria-label="Edit Hanna"'); // renaming your own name still works
  });
});
