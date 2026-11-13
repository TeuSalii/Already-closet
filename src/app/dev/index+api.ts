import { available, DEV_PAGES, devNav, escape, notFound } from "@/server/dev-page";

// http://localhost:8081/dev : the list of dev pages. Like them, development
// only and on this computer only.

export function GET(request: Request) {
  if (!available(request)) return notFound();
  const items = DEV_PAGES.map(
    ({ path, title, about }) => `<li><a href="${path}">${escape(title)}</a>: ${escape(about)}</li>`,
  ).join("\n");
  return new Response(
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Closet dev pages</title>
<style>body { font: 15px system-ui, sans-serif; margin: 32px auto; max-width: 860px; padding: 0 16px; color: #222; } li { margin: 8px 0; }</style>
</head>
<body>
${devNav("/dev")}
<h1>Closet dev pages</h1>
<p>Pages for the Mac while developing. They are never part of the app.</p>
<ul>
${items}
</ul>
</body>
</html>
`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
