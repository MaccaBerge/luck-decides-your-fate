import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KickDialog } from "./KickDialog";
import { RemovedDialog, type Removal } from "./RemovedDialog";
import { JoinRequests } from "./JoinRequests";
import { InviteCard } from "./InviteCard";
import { JoinScreen } from "./JoinScreen";

const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const removed = (removal: Removal, locked = false) =>
  text(renderToStaticMarkup(<RemovedDialog removal={removal} locked={locked} busy={false} onAsk={noop} onRejoin={noop} onOk={noop} />));

describe("kicking and banning", () => {
  it("the host chooses between kick and ban", () => {
    const html = renderToStaticMarkup(<KickDialog name="Mia" busy={false} onKick={noop} onBan={noop} onClose={noop} />);
    expect(text(html)).toBe("Remove Mia? Kicked players can ask to join again. Banned players can't come back. Kick Ban Cancel");
    expect(html).toMatch(/bg-danger[^>]*>Ban</);
  });

  it("a kicked player can ask to join again", () => {
    expect(removed({ status: "kicked", request: null })).toBe(
      "You were removed The host removed you from the game. OK Ask to join again",
    );
    expect(removed({ status: "kicked", request: "pending" })).toBe(
      "Waiting for the host You asked to join again. You'll be back in as soon as the host says yes. OK",
    );
    expect(removed({ status: "kicked", request: "declined" })).toBe("The host said no You can't join this game again. OK");
  });

  it("a banned player gets the same dialog without asking", () => {
    expect(removed({ status: "banned", request: null })).toBe(
      "You were removed The host removed you from the game, and you can't join it again. OK",
    );
  });

  it("someone away too long can join again, unless the game is locked", () => {
    expect(removed({ status: "timed_out", request: null })).toBe("You left the game You were away for too long. OK Join again");
    expect(removed({ status: "timed_out", request: null }, true)).toBe(
      "You left the game You were away for too long, and the game is locked now. OK",
    );
  });

  it("the host sees requests to join again", () => {
    const html = renderToStaticMarkup(
      <JoinRequests requests={[{ player_id: "pl_a", name: "Mia", avatar: "owl" }]} busy={false} onAnswer={noop} />,
    );
    expect(text(html)).toBe("🦉 Mia wants to join again Decline Accept");
    expect(renderToStaticMarkup(<JoinRequests requests={[]} busy={false} onAnswer={noop} />)).toBe("");
  });
});

describe("locking", () => {
  it("the host's card has the lock switch", () => {
    const open = renderToStaticMarkup(<InviteCard variant="panel" code="ABC123" url="u" onLockedChange={noop} />);
    expect(open).toMatch(/role="switch"[^>]*aria-checked="false"[^>]*aria-label="Lock game"/);
    expect(text(open)).toContain("Lock game");
    const locked = renderToStaticMarkup(<InviteCard variant="panel" code="ABC123" url="u" locked onLockedChange={noop} />);
    expect(locked).toContain('aria-checked="true"');
    expect(text(locked)).toContain("Locked: nobody new can join");
  });

  it("the big-screen card says when it's locked, and has no switch", () => {
    const html = renderToStaticMarkup(<InviteCard code="ABC123" url="u" locked />);
    expect(text(html)).toBe("Locked: no new players ABC123");
    expect(html).not.toContain('role="switch"');
  });

  it("the join screen of a locked game has no form", () => {
    const html = renderToStaticMarkup(<JoinScreen players={[]} locked busy={false} onJoin={noop} onWatch={noop} />);
    expect(html).toContain('data-testid="game-locked"');
    expect(html).not.toContain('aria-label="Your name"');
    expect(html).toContain(">Just watch<");
  });
});
