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

  it("is routed and links back to the wheel", () => {
    expect(html).toContain(">Privacy</h1>");
    expect(html).toMatch(/href="\/"[^>]*>Back to the wheel</);
  });

  it("states who can see wheels and how long they are kept", () => {
    expect(text).toContain("The site's operator can view, change and delete wheels and their settings.");
    expect(text).toContain("deleted after 7 days without activity");
  });

  it("shows the contact address", () => {
    expect(html).toMatch(/href="mailto:luckdecidesyourfate@gmail.com"[^>]*>luckdecidesyourfate@gmail.com</);
  });

  it("stays under 200 words and makes no claim about outcomes", () => {
    expect(text.trim().split(/\s+/).length).toBeLessThan(200);
    expect(text).not.toMatch(/\b(fair|unbiased|random|rigged?)\b/i);
  });
});

it("the not-found page links to the privacy page", () => {
  expect(render("/nope")).toMatch(/href="\/privacy"[^>]*>Privacy</);
});
