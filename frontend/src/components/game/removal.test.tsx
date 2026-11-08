import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { JoinPolicy } from "../../lib/types";
import { KickDialog } from "./KickDialog";
import { StatusDialog, type Standing } from "./StatusDialog";
import { JoinRequests } from "./JoinRequests";
import { InviteCard } from "./InviteCard";
import { JoinScreen } from "./JoinScreen";
import { NoticeDialog } from "./NoticeDialog";

const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const dialog = (standing: Standing, policy: JoinPolicy = "open") =>
  text(
    renderToStaticMarkup(
      <StatusDialog
        standing={standing}
        code="ABC123"
        policy={policy}
        busy={false}
        onAsk={noop}
        onConfirm={noop}
        onNoThanks={noop}
        onOk={noop}
      />,
    ),
  );

describe("removed players and requests", () => {
  it("the host chooses between kick and ban", () => {
    const html = renderToStaticMarkup(<KickDialog name="Mia" busy={false} onKick={noop} onBan={noop} onClose={noop} />);
    expect(text(html)).toBe("Remove Mia? Kicked players can ask to join again. Banned players can't come back. Kick Ban Cancel");
  });

  it("kicked: ask to join again (not while the game is closed)", () => {
    expect(dialog({ status: "kicked", request: null })).toBe("You were removed The host removed you from the game. OK Ask to join again");
    expect(dialog({ status: "kicked", request: null }, "closed")).toBe(
      "You were removed The host removed you from the game, and it's closed to new players right now. OK",
    );
  });

  it("banned: no way back", () => {
    expect(dialog({ status: "banned", request: null })).toBe(
      "You were removed The host removed you from the game, and you can't join it again. OK",
    );
  });

  it("away too long: join again, ask, or nothing, depending on who can join", () => {
    expect(dialog({ status: "timed_out", request: null })).toBe("You left the game You were away for too long. OK Join again");
    expect(dialog({ status: "timed_out", request: null }, "ask")).toBe("You left the game You were away for too long. OK Ask to join again");
    expect(dialog({ status: "timed_out", request: null }, "closed")).toBe(
      "You left the game You were away for too long, and the game is closed to new players now. OK",
    );
  });

  it("waiting, accepted and declined", () => {
    expect(dialog({ status: "none", request: "pending" })).toBe(
      "Waiting for the host You asked to join game ABC123. You'll see the answer here as soon as the host decides. OK",
    );
    expect(dialog({ status: "kicked", request: "accepted" })).toBe(
      "You're accepted! The host said yes. Do you still want to join game ABC123? No thanks Join",
    );
    expect(dialog({ status: "none", request: "declined" })).toBe("The host said no Your request to join game ABC123 was declined. OK");
  });

  it("nothing to say when there's no reason and no request", () => {
    expect(dialog({ status: "none", request: null })).toBe("");
  });

  it("the host sees requests as one compact line", () => {
    const reqs = [
      { player_id: "a", name: "Mia", avatar: "owl", state: "pending" as const },
      { player_id: "b", name: "Leo", avatar: "cat", state: "pending" as const },
      { player_id: "c", name: "Ida", avatar: "fox", state: "accepted" as const },
    ];
    const html = renderToStaticMarkup(<JoinRequests requests={reqs} busy={false} onAnswer={noop} />);
    expect(text(html)).toBe("2 players want to join");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(">Accept<"); // collapsed
    expect(text(renderToStaticMarkup(<JoinRequests requests={reqs.slice(2)} busy={false} onAnswer={noop} />))).toBe("Waiting for Ida to join");
    expect(renderToStaticMarkup(<JoinRequests requests={[]} busy={false} onAnswer={noop} />)).toBe("");
  });

  it("a new host is told", () => {
    const html = renderToStaticMarkup(<NoticeDialog open title="You're the host now" text="You spin the wheel and decide who can join." onClose={noop} />);
    expect(text(html)).toBe("You're the host now You spin the wheel and decide who can join. OK");
  });
});

describe("who can join", () => {
  it("the host picks anyone, must ask or nobody", () => {
    const html = renderToStaticMarkup(<InviteCard variant="panel" code="ABC123" url="u" policy="ask" onPolicyChange={noop} />);
    expect(html).toMatch(/role="radiogroup" aria-labelledby="who-can-join"/);
    expect(text(html)).toContain("Ask to join with the code ABC123");
    expect(text(html)).toContain("Who can join Anyone Must ask Nobody");
    expect(html.match(/aria-checked="true"[^>]*>Must ask</g)).toHaveLength(1);
  });

  it("nobody: the code and QR code are hidden", () => {
    const panel = renderToStaticMarkup(<InviteCard variant="panel" code="ABC123" url="u" policy="closed" onPolicyChange={noop} />);
    expect(panel).toContain('data-testid="game-closed"');
    expect(panel).not.toContain("ABC123");
    expect(panel).not.toContain("Enlarge QR code");
    const tv = renderToStaticMarkup(<InviteCard code="ABC123" url="u" policy="closed" />);
    expect(text(tv)).toBe("Closed to new players");
  });

  it("the join screen follows the setting", () => {
    const closed = renderToStaticMarkup(<JoinScreen players={[]} policy="closed" busy={false} onJoin={noop} onWatch={noop} />);
    expect(closed).toContain('data-testid="game-closed"');
    expect(closed).not.toContain('aria-label="Your name"');
    const ask = renderToStaticMarkup(<JoinScreen players={[]} policy="ask" busy={false} onJoin={noop} onWatch={noop} />);
    expect(text(ask)).toContain("The host lets you in.");
    expect(ask).toMatch(/type="submit"[^>]*>Ask to join</);
  });
});
