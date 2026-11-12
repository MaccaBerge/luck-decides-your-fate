import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import NotFoundPage from "./NotFoundPage";

const render = (endedByOperator?: boolean) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <NotFoundPage endedByOperator={endedByOperator} />
    </MemoryRouter>,
  ).replace(/&#x27;/g, "'");

describe("the page for a wheel that's gone", () => {
  it("says the developer ended it, when they did", () => {
    const html = render(true);
    expect(html).toContain("This game was ended");
    expect(html).toContain("The developer ended this game.");
  });

  it("otherwise says it doesn't exist", () => {
    expect(render()).toContain("This wheel doesn't exist");
    expect(render()).not.toContain("developer");
  });
});
