import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, it } from "vitest";

import type { GarmentTags } from "@/shared/garment";
import type { OutfitRequest } from "@/shared/outfit/occasions";
import { category, type Outfit, type OutfitPiece } from "@/shared/outfit/pieces";
import { checkOutfit } from "@/shared/outfit/rules";
import { scoreOutfit } from "@/shared/outfit/score";

// Test 3 in docs/outfit-pipeline.md: the rules against outfits people really
// wore. Reads data/fashionpedia/outfits.json (from extract.py), runs the
// app's own hard rules and scores on it, and writes
// data/fashionpedia/report.md.
//
// Two numbers per colour rule:
// - real: how many real outfits the rule throws away. High means too strict.
// - shuffled: the same outfits with each piece's colours (and pattern) taken
//   from a random other piece of the same category. A rule that catches bad
//   combinations should throw away many more of these than of the real ones.
//
// Run: npm run fashionpedia (it extracts first). Not part of `npm test`: it
// needs the downloaded data.

const ROOT = path.resolve(__dirname, "../..");
const OUTFITS = path.join(ROOT, "data/fashionpedia/outfits.json");
const REPORT = path.join(ROOT, "data/fashionpedia/report.md");

// Rules Fashionpedia gives enough to judge. Not judged: H8 (leather is
// rarely labelled), H9 (no metal), H10 (no formality), H11 and H16 (no
// season), H14 (no flannel label).
const JUDGED = ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H12", "H13", "H15"];
const COLOUR_RULES = ["H6", "H7", "H12"];
const SOFT = ["S1", "S2", "S3", "S4", "S7", "S8", "S9"];
const SHUFFLES = 10;

type Extracted = {
  image: string;
  imageId: number;
  pieces: (Pick<GarmentTags, "type" | "colors" | "pattern" | "material"> & { id: string; neckline?: GarmentTags["neckline"] })[];
};

// Fashionpedia says nothing about formality, season or style: fixed values,
// and the rules that use them are not judged.
const REQUEST: OutfitRequest = { occasion: "casual", season: "transitional", time: "day" };

function toOutfit(extracted: Extracted): Outfit {
  return extracted.pieces.map(({ id, type, colors, pattern, material, neckline }) => ({
    id,
    tags: {
      label: `${colors[0]} ${type}`,
      type,
      colors,
      pattern,
      material,
      season: "all-year",
      formality: "casual",
      style: "classic",
      confidence: "high",
      ...(neckline && { neckline }),
    },
  }));
}

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The same outfit, each piece wearing the colours and pattern of a random
// other piece of its category: same shapes, random colours.
function shuffle(outfits: Outfit[], seed: number): Outfit[] {
  const random = seeded(seed);
  const pool = new Map<string, OutfitPiece[]>();
  for (const piece of outfits.flat()) pool.set(category(piece), [...(pool.get(category(piece)) ?? []), piece]);
  return outfits.map((outfit) =>
    outfit.map((piece) => {
      const others = pool.get(category(piece)) ?? [piece];
      const donor = others[Math.floor(random() * others.length)];
      // Shoes take the donor's type too: "sneakers" only means white shoes here.
      const type = category(piece) === "shoes" ? donor.tags.type : piece.tags.type;
      return { ...piece, tags: { ...piece.tags, type, colors: donor.tags.colors, pattern: donor.tags.pattern } };
    }),
  );
}

const percent = (count: number, total: number) => `${((100 * count) / total).toFixed(1)}%`;

it("checks the rules against real outfits", () => {
  if (!existsSync(OUTFITS)) {
    console.log("No data/fashionpedia/outfits.json: download the data and run extract.py first (see the doc).");
    return;
  }
  const extracted = JSON.parse(readFileSync(OUTFITS, "utf8")) as Extracted[];
  const real = extracted.map(toOutfit);
  const shuffled = Array.from({ length: SHUFFLES }, (_, i) => shuffle(real, i + 1)).flat();

  const brokenBy = (outfits: Outfit[]) => {
    const counts: Record<string, number> = {};
    const examples: Record<string, string[]> = {};
    let any = 0;
    outfits.forEach((outfit, i) => {
      const broken = checkOutfit(outfit, REQUEST).filter((v) => JUDGED.includes(v.rule));
      if (broken.length > 0) any += 1;
      for (const v of broken) {
        counts[v.rule] = (counts[v.rule] ?? 0) + 1;
        if (outfits === real && (examples[v.rule] ??= []).length < 5) {
          examples[v.rule].push(`${extracted[i].image} (${v.reason})`);
        }
      }
    });
    return { counts, examples, any };
  };

  const realBroken = brokenBy(real);
  const shuffledBroken = brokenBy(shuffled);
  const colourDrop = (outfits: Outfit[]) =>
    outfits.filter((o) => checkOutfit(o, REQUEST).some((v) => COLOUR_RULES.includes(v.rule))).length;

  const softAverage = (outfits: Outfit[]) => {
    const sums: Record<string, { total: number; hits: number }> = {};
    for (const outfit of outfits) {
      for (const part of scoreOutfit(outfit, REQUEST).parts) {
        const s = (sums[part.rule] ??= { total: 0, hits: 0 });
        s.total += part.points;
        if (part.points > 0) s.hits += 1;
      }
    }
    return sums;
  };
  // Fashionpedia is mostly womenswear. Outfits without a dress or skirt are
  // closer to the closets the app is tested with: the same table for them.
  const noDress = (outfit: Outfit) => outfit.every((piece) => !["dress", "skirt"].includes(piece.tags.type));
  const segmentReal = real.filter(noDress);
  const segmentShuffled = shuffled.filter((_, i) => noDress(real[i % real.length]));
  const segmentRealBroken = brokenBy(segmentReal);
  const segmentShuffledBroken = brokenBy(segmentShuffled);

  const softReal = softAverage(real);
  const softShuffled = softAverage(shuffled);

  const lines = [
    "# Fashionpedia check (Test 3)",
    "",
    `${real.length} real outfits from Fashionpedia's validation photos, against ${shuffled.length} shuffled ones`,
    `(${SHUFFLES} shuffles: the same outfits, each piece with the colours and pattern of a random other piece of its category).`,
    "",
    `Real outfits dropped by at least one judged rule: **${percent(realBroken.any, real.length)}**`,
    `(shuffled: ${percent(shuffledBroken.any, shuffled.length)}).`,
    `Dropped by a colour rule (${COLOUR_RULES.join(", ")}): real ${percent(colourDrop(real), real.length)},`,
    `shuffled ${percent(colourDrop(shuffled), shuffled.length)}.`,
    "",
    "## Hard rules",
    "",
    "| Rule | Real outfits dropped | Shuffled dropped | Ratio |",
    "| --- | --- | --- | --- |",
    ...JUDGED.map((rule) => {
      const r = realBroken.counts[rule] ?? 0;
      const s = shuffledBroken.counts[rule] ?? 0;
      const ratio = r === 0 ? "–" : ((s / shuffled.length) / (r / real.length)).toFixed(1);
      return `| ${rule} | ${r} (${percent(r, real.length)}) | ${percent(s, shuffled.length)} | ${ratio} |`;
    }),
    "",
    "Ratio: how much more often the rule fires on shuffled outfits than on real ones. Above 1, the rule",
    "prefers real outfits; near 1, it can't tell them apart; for layering rules (same shapes in both) it stays 1.",
    "",
    `## Outfits without a dress or skirt (${segmentReal.length})`,
    "",
    `Dropped by at least one judged rule: real ${percent(segmentRealBroken.any, segmentReal.length)},`,
    `shuffled ${percent(segmentShuffledBroken.any, segmentShuffled.length)}. Colour rules: real`,
    `${percent(colourDrop(segmentReal), segmentReal.length)}, shuffled ${percent(colourDrop(segmentShuffled), segmentShuffled.length)}.`,
    "",
    "| Rule | Real outfits dropped | Shuffled dropped |",
    "| --- | --- | --- |",
    ...JUDGED.map((rule) => {
      const r = segmentRealBroken.counts[rule] ?? 0;
      const s = segmentShuffledBroken.counts[rule] ?? 0;
      return `| ${rule} | ${r} (${percent(r, segmentReal.length)}) | ${percent(s, segmentShuffled.length)} |`;
    }),
    "",
    "## Soft rules: average points, and share of outfits where the rule gives points",
    "",
    "| Rule | Real average | Shuffled average | Real share > 0 | Shuffled share > 0 |",
    "| --- | --- | --- | --- | --- |",
    ...SOFT.map((rule) => {
      const r = softReal[rule] ?? { total: 0, hits: 0 };
      const s = softShuffled[rule] ?? { total: 0, hits: 0 };
      return `| ${rule} | ${(r.total / real.length).toFixed(3)} | ${(s.total / shuffled.length).toFixed(3)} | ${percent(r.hits, real.length)} | ${percent(s.hits, shuffled.length)} |`;
    }),
    "",
    "## Examples of real outfits dropped, per rule",
    "",
    ...JUDGED.flatMap((rule) =>
      realBroken.examples[rule] ? [`**${rule}**`, "", ...realBroken.examples[rule].map((e) => `- ${e}`), ""] : [],
    ),
  ];
  writeFileSync(REPORT, `${lines.join("\n")}\n`);
  console.log(lines.slice(0, 60).join("\n"));
  expect(real.length).toBeGreaterThan(0);
});
