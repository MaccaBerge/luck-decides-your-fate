/**
 * The controller as a Home Screen web app ("LDYF Controller").
 *
 * The manifest and icon tags are added here, by the lazy-loaded admin code, never in index.html:
 * every visitor gets index.html, and a link to an admin manifest there would reveal the
 * controller. The files live in public/admin/, so they're only ever served under /admin.
 */
export const WEB_APP_NAME = "LDYF Controller";

const TAGS: { tag: "link" | "meta"; attrs: Record<string, string> }[] = [
  { tag: "link", attrs: { rel: "manifest", href: "/admin/manifest.webmanifest" } },
  { tag: "link", attrs: { rel: "apple-touch-icon", href: "/admin/apple-touch-icon.png" } },
  // iPhone: open full screen from the Home Screen (no Safari bars), under this name.
  { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" } },
  { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" } },
  { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: WEB_APP_NAME } },
  { tag: "meta", attrs: { name: "apple-mobile-web-app-status-bar-style", content: "default" } },
];

/** Add the web app tags to <head>. Returns a function that removes them again. */
export function addWebAppTags(doc: Document = document): () => void {
  const added = TAGS.map(({ tag, attrs }) => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.setAttribute("data-admin-web-app", "");
    doc.head.appendChild(el);
    return el;
  });
  return () => added.forEach((el) => el.remove());
}
