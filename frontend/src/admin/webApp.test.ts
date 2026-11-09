import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addWebAppTags, WEB_APP_NAME } from "./webApp";

/** Just enough of a Document for addWebAppTags. */
function fakeDocument() {
  const head: { attrs: Record<string, string>; tag: string }[] = [];
  const doc = {
    head: {
      appendChild(el: { attrs: Record<string, string>; tag: string }) {
        head.push(el);
      },
    },
    createElement(tag: string) {
      const el = {
        tag,
        attrs: {} as Record<string, string>,
        setAttribute(k: string, v: string) {
          el.attrs[k] = v;
        },
        remove() {
          head.splice(head.indexOf(el), 1);
        },
      };
      return el;
    },
  };
  return { doc: doc as unknown as Document, head };
}

const publicDir = new URL("../../public/admin/", import.meta.url);

describe("the controller as a Home Screen web app", () => {
  it("adds the manifest, icon and iPhone tags, and removes them again", () => {
    const { doc, head } = fakeDocument();
    const remove = addWebAppTags(doc);
    const find = (key: string, value: string) => head.find((el) => el.attrs[key] === value)?.attrs;
    expect(find("rel", "manifest")?.href).toBe("/admin/manifest.webmanifest");
    expect(find("rel", "apple-touch-icon")?.href).toBe("/admin/apple-touch-icon.png");
    expect(find("name", "apple-mobile-web-app-capable")?.content).toBe("yes");
    expect(find("name", "apple-mobile-web-app-title")?.content).toBe("LDYF Controller");
    remove();
    expect(head).toEqual([]);
  });

  it("has a manifest that opens /admin full screen under the same name", () => {
    const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", publicDir), "utf8"));
    expect(manifest).toMatchObject({ name: WEB_APP_NAME, start_url: "/admin", scope: "/admin", display: "standalone" });
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/admin/")).toBe(true);
      expect(readFileSync(new URL(icon.src.replace("/admin/", ""), publicDir)).length).toBeGreaterThan(0);
    }
  });
});
