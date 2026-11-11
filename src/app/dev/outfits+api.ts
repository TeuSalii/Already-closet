import { COLOR_INFO } from "@/shared/outfit/colors";
import { OCCASION_RULES, type OutfitRequest } from "@/shared/outfit/occasions";
import type { OutfitPiece } from "@/shared/outfit/pieces";
import { HARD_RULES } from "@/shared/outfit/rules";
import { WEIGHTS } from "@/shared/outfit/score";
import { suggestOutfits } from "@/shared/outfit/suggest";

import { CLOSETS, REQUESTS, TODAY } from "../../../tests/fixtures/closets";

// http://localhost:8081/dev/outfits : the sample closets and what the outfit
// pipeline suggests for each request, with scores, reasons and what was
// dropped. For the team to review by eye (docs/outfit-pipeline.md, Test 2).
// Like /dev/test: development only, on this computer only, never in the app.
// No AI and no key: everything here runs from the fixtures.

function available(request: Request): boolean {
  return process.env.NODE_ENV === "development" && request.headers.get("host")?.split(":")[0] === "localhost";
}

export function GET(request: Request) {
  if (!available(request)) return new Response("Not found", { status: 404 });
  return new Response(page(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const ruleText = Object.fromEntries(HARD_RULES.map((rule) => [rule.id, rule.says]));

function chip(piece: OutfitPiece): string {
  const swatches = piece.tags.colors
    .map((color) => `<span class="swatch" style="background:${COLOR_INFO[color].hex}" title="${color}"></span>`)
    .join("");
  return `<span class="chip" title="${escape(piece.id)}">${swatches}${escape(piece.tags.label)}</span>`;
}

function requestSection(pieces: OutfitPiece[], name: string, request: OutfitRequest): string {
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
      <div><b>${i + 1}.</b> ${outfit.map(chip).join(" ")} <span class="total">${score.total}</span></div>
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

function page(): string {
  const closets = Object.entries(CLOSETS)
    .map(
      ([name, closet]) => `<h2>${escape(name)} closet <small>${escape(closet.about)}</small></h2>
    <details><summary>The ${closet.pieces.length} pieces</summary><p>${closet.pieces.map(chip).join(" ")}</p></details>
    ${Object.entries(REQUESTS).map(([requestName, req]) => requestSection(closet.pieces, requestName, req)).join("")}`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Closet outfits</title>
<style>
  body { font: 15px system-ui, sans-serif; margin: 32px auto; max-width: 960px; padding: 0 16px; color: #222; }
  h2 { margin-top: 48px; border-bottom: 2px solid #222; }
  h3 { margin: 28px 0 4px; }
  small { color: #777; font-weight: normal; }
  .stats { color: #777; margin: 0 0 8px; font-size: 13px; }
  .outfit { margin: 10px 0; }
  .outfit ul { margin: 4px 0 0 20px; padding: 0; color: #555; font-size: 13px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #ddd; border-radius: 12px; padding: 2px 8px; margin: 2px 0; }
  .swatch { width: 12px; height: 12px; border-radius: 50%; border: 1px solid #0003; }
  .total { font-weight: bold; margin-left: 8px; }
  .none { color: #a33; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border-bottom: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
  details { margin: 6px 0; }
  summary { cursor: pointer; color: #555; }
</style>
</head>
<body>
<h1>Outfit suggestions</h1>
<p>The sample closets from <code>tests/fixtures/closets</code>, run through the outfit pipeline with no AI.
"Today" is ${TODAY}. Score weights: ${Object.entries(WEIGHTS).map(([rule, w]) => `${rule} ${w}`).join(", ")}.
Hover a rule id to see what it says. See <code>docs/outfit-pipeline.md</code>.</p>
${closets}
</body>
</html>`;
}
