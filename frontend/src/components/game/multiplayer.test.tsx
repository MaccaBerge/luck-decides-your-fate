import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Player } from "../../lib/types";
import { AVATARS, avatarEmoji } from "../../lib/avatars";
import { PlayerRow } from "./PlayerRow";
import { PlayerSetup } from "./PlayerSetup";
import { JoinCodeDialog } from "./JoinCodeDialog";
import { JoinScreen } from "./JoinScreen";

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
