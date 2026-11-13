// Shared by the pages under /dev: who may see them, and the links between them.

// Development only, and only from a browser on this computer: a production
// build, or a browser on another device on the Wi-Fi, gets 404. A program can
// fake the host name, so every dev route that spends a key also needs the
// passcode.
export function available(request: Request): boolean {
  return process.env.NODE_ENV === "development" && request.headers.get("host")?.split(":")[0] === "localhost";
}

export const notFound = () => new Response("Not found", { status: 404 });

export const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export const DEV_PAGES = [
  { path: "/dev/test", title: "AI test", about: "A folder of test photos through the app's tagging call" },
  { path: "/dev/outfits", title: "Outfits", about: "The test photos and sample closets, and the outfits suggested for them" },
  { path: "/dev/pieces", title: "Outfit photo → pieces", about: "A photo of someone in an outfit: each piece tagged and drawn alone on white" },
] as const;

// The row of links at the top of every dev page.
export function devNav(current: string): string {
  const links = [{ path: "/dev", title: "All dev pages" }, ...DEV_PAGES].map(({ path, title }) =>
    path === current ? `<b>${escape(title)}</b>` : `<a href="${path}">${escape(title)}</a>`,
  );
  return `<nav style="display:flex;gap:16px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid #ddd;margin-bottom:16px">${links.join("")}</nav>`;
}
