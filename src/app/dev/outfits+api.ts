import { readFileSync } from "node:fs";
import path from "node:path";

import { loadTestPhotoCloset, PHOTO_TYPES } from "@/server/test-photos";
import { COLOR_INFO } from "@/shared/outfit/colors";
import { OCCASION_RULES, type OutfitRequest } from "@/shared/outfit/occasions";
import type { OutfitPiece } from "@/shared/outfit/pieces";
import { HARD_RULES } from "@/shared/outfit/rules";
import { WEIGHTS } from "@/shared/outfit/score";
import { suggestOutfits } from "@/shared/outfit/suggest";

import { CLOSETS, REQUESTS, TODAY } from "../../../tests/fixtures/closets";

// http://localhost:8081/dev/outfits : what the outfit pipeline suggests for
// each request, with scores, reasons and what was dropped, for the team to
// review by eye (docs/outfit-pipeline.md, Test 2).
//
// First the test photos (src/server/test-photos.ts), shown as pictures. Then
// the made-up sample closets from tests/fixtures/closets, which have no
// pictures: only their tags and colour dots.
//
// Like /dev/test: development only, on this computer only, never in the app.
// No AI and no key. Photos are read from their folder on each request and
// never leave this computer.

function available(request: Request): boolean {
  return process.env.NODE_ENV === "development" && request.headers.get("host")?.split(":")[0] === "localhost";
}

const notFound = () => new Response("Not found", { status: 404 });

export function GET(request: Request) {
  if (!available(request)) return notFound();
  const photos = loadTestPhotoCloset();

  // ?photo=IT-01: one test photo. Only ids found in the folder are served,
  // so no other file on the computer can be asked for.
  const photoId = new URL(request.url).searchParams.get("photo");
  if (photoId !== null) {
    const file = "error" in photos ? undefined : photos.photoOf.get(photoId);
    if (!file) return notFound();
    const type = PHOTO_TYPES[path.extname(file).toLowerCase()];
    return new Response(readFileSync(file), { headers: { "Content-Type": type, "Cache-Control": "max-age=3600" } });
  }

  return new Response(page(photos), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const ruleText = Object.fromEntries(HARD_RULES.map((rule) => [rule.id, rule.says]));

const tagLine = (piece: OutfitPiece) =>
  `${piece.tags.type} · ${piece.tags.colors.join("/")} · ${piece.tags.pattern} · ${piece.tags.season} · ${piece.tags.formality}`;

function swatches(piece: OutfitPiece): string {
  return piece.tags.colors
    .map((color) => `<span class="swatch" style="background:${COLOR_INFO[color].hex}" title="${color}"></span>`)
    .join("");
}

function chip(piece: OutfitPiece): string {
  return `<span class="chip" title="${escape(`${piece.id}: ${tagLine(piece)}`)}">${swatches(piece)}${escape(piece.tags.label)}</span>`;
}

// A picture with the AI's label and tags under it.
function tile(piece: OutfitPiece, wish: boolean): string {
  return `<figure class="tile">
    <img src="/dev/outfits?photo=${encodeURIComponent(piece.id)}" loading="lazy" alt="${escape(piece.tags.label)}">
    <figcaption><b>${escape(piece.id)}</b>${wish ? ' <span class="wish">wish</span>' : ""} ${swatches(piece)}<br>
    ${escape(piece.tags.label)}<br><small>${escape(tagLine(piece))}</small></figcaption>
  </figure>`;
}

type Show = (piece: OutfitPiece) => string;

function requestSection(pieces: OutfitPiece[], name: string, request: OutfitRequest, show: Show): string {
  const result = suggestOutfits(pieces, request, { today: TODAY });
  const occasion = OCCASION_RULES[request.occasion];
  const head = `<h3>${escape(name)} <small>${escape(occasion.label)} · ${request.season} · ${request.time}</small></h3>
    <p class="stats">${result.checked} complete outfits checked, ${result.passed} passed, ${result.droppedEarly} half-built ones dropped early.</p>`;

  const suggestions =
    result.notEnough !== null
      ? `<p class="none">${escape(result.notEnough)}</p>`
      : result.suggestions
          .map(
            ({ pieces: outfit, score }, i) => `<div class="outfit">
      <div class="row"><span class="rank">${i + 1}.</span> ${outfit.map(show).join(" ")} <span class="total">${score.total}</span></div>
      <ul>${score.parts.map((p) => `<li><code>${p.rule}</code> ${p.points > 0 ? "+" : ""}${p.points} · ${escape(p.reason)}</li>`).join("")}</ul>
    </div>`,
          )
          .join("");

  const dropped = Object.entries(result.droppedBy).sort((a, b) => b[1].count - a[1].count);
  const droppedTable =
    dropped.length === 0
      ? ""
      : `<details><summary>Dropped complete outfits, by first rule broken</summary><table>
      <tr><th>Rule</th><th>Count</th><th>Example</th></tr>
      ${dropped.map(([rule, d]) => `<tr><td title="${escape(ruleText[rule] ?? "")}"><code>${rule}</code></td><td>${d.count}</td><td>${escape(d.example)}</td></tr>`).join("")}
    </table></details>`;

  return `<section>${head}${suggestions}${droppedTable}</section>`;
}

function photoSection(photos: ReturnType<typeof loadTestPhotoCloset>): string {
  if ("error" in photos) {
    return `<h2>Test photos</h2>
    <p class="none">${escape(photos.error)}</p>
    <p>To see outfits as pictures, add this line to <code>.env</code> and restart <code>npx expo start</code>:</p>
    <pre>OUTFIT_PHOTOS_DIR=/path/to/Research/Testing/Test</pre>
    <p>The folder is searched for <code>IT-01.jpg</code> to <code>IT-60.jpg</code> (or .jpeg, .png), and each photo is matched with its tags from <code>logs/ai-calls.jsonl</code>.</p>`;
  }
  const show = (piece: OutfitPiece) => tile(piece, photos.wishes.has(piece.id));
  const missing =
    photos.missingTags.length > 0
      ? `<p class="none">No tags in the log for ${photos.missingTags.join(", ")}: run them through /dev/test to include them.</p>`
      : "";
  return `<h2>Test photos <small>${photos.pieces.length} pieces, ${photos.wishes.size} of them wishes, tagged by the AI</small></h2>
    <p>One closet made of everyone's test photos ("home" and "wish" together), so there is enough to combine.
    The tags under each picture are the AI's, not checked by a person: a wrong tag can explain a strange outfit.</p>
    ${missing}
    <details><summary>All ${photos.pieces.length} pieces</summary><div class="row">${photos.pieces.map(show).join("")}</div></details>
    ${Object.entries(REQUESTS).map(([name, req]) => requestSection(photos.pieces, name, req, show)).join("")}`;
}

function page(photos: ReturnType<typeof loadTestPhotoCloset>): string {
  const closets = Object.entries(CLOSETS)
    .map(
      ([name, closet]) => `<h2>${escape(name)} closet <small>${escape(closet.about)}, made up, no pictures</small></h2>
    <details><summary>The ${closet.pieces.length} pieces</summary><p>${closet.pieces.map(chip).join(" ")}</p></details>
    ${Object.entries(REQUESTS).map(([requestName, req]) => requestSection(closet.pieces, requestName, req, chip)).join("")}`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Closet outfits</title>
<style>
  body { font: 15px system-ui, sans-serif; margin: 32px auto; max-width: 1100px; padding: 0 16px; color: #222; }
  h2 { margin-top: 48px; border-bottom: 2px solid #222; }
  h3 { margin: 28px 0 4px; }
  small { color: #777; font-weight: normal; }
  .stats { color: #777; margin: 0 0 8px; font-size: 13px; }
  .outfit { margin: 12px 0 20px; }
  .outfit ul { margin: 4px 0 0 20px; padding: 0; color: #555; font-size: 13px; }
  .row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; }
  .rank { font-weight: bold; padding-top: 4px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #ddd; border-radius: 12px; padding: 2px 8px; margin: 2px 0; }
  .tile { margin: 0; width: 160px; font-size: 12px; }
  .tile img { width: 160px; height: 200px; object-fit: contain; background: #f4f4f4; border-radius: 6px; display: block; }
  .tile figcaption { margin-top: 4px; line-height: 1.35; }
  .wish { background: #fde68a; border-radius: 4px; padding: 0 4px; }
  .swatch { display: inline-block; width: 11px; height: 11px; border-radius: 50%; border: 1px solid #0003; vertical-align: -1px; }
  .total { font-weight: bold; padding-top: 4px; }
  .none { color: #a33; }
  pre { background: #f4f4f4; padding: 8px; border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border-bottom: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
  details { margin: 6px 0; }
  summary { cursor: pointer; color: #555; }
</style>
</head>
<body>
<h1>Outfit suggestions</h1>
<p>What the outfit pipeline suggests, with no AI. "Today" is ${TODAY}.
Score weights: ${Object.entries(WEIGHTS).map(([rule, w]) => `${rule} ${w}`).join(", ")}.
Hover a rule id to see what it says. See <code>docs/outfit-pipeline.md</code>.</p>
${photoSection(photos)}
${closets}
</body>
</html>`;
}
