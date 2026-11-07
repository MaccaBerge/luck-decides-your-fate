import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import App from "../App";

const render = (path: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe("/privacy", () => {
  const html = render("/privacy");
  const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'");

  it("is routed and has a way back", () => {
    expect(html).toContain(">Privacy</h1>");
    expect(html).toMatch(/href="\/"[^>]*>Back</);
  });

  it("states who can see wheels and how long they are kept", () => {
    expect(text).toContain("The site's operator can view, change and delete wheels and their settings.");
    expect(text).toContain("deleted after 7 days without activity");
    expect(text).toContain("remain in backups for up to about 14 days");
  });

  it("shows the contact address", () => {
    expect(html).toMatch(/href="mailto:luckdecidesyourfate@gmail.com"[^>]*>luckdecidesyourfate@gmail.com</);
  });

  // The limit was 200 words; the two multiplayer sentences the owner approved in November 2026
  // took it past that, so it's 230 now. Keep the page short.
  it("stays under 230 words and makes no claim about outcomes", () => {
    expect(text.trim().split(/\s+/).length).toBeLessThan(230);
    // "random key" (the multiplayer player key) is about identity, not about how spins turn out.
    expect(text.replace(/\brandom key\b/gi, "")).not.toMatch(/\b(fair|unbiased|random|rigged?)\b/i);
  });

  it("mentions what multiplayer stores", () => {
    expect(text).toContain("your browser also keeps a random key so the game recognises you when you come back");
    expect(text).toContain("the server also stores each player's chosen name and avatar");
  });
});

it("the not-found page links to the privacy page", () => {
  expect(render("/nope")).toMatch(/href="\/privacy"[^>]*>Privacy</);
});
