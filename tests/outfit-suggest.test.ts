import { describe, expect, it } from "vitest";

import {
  COLORS, FORMALITIES, type GarmentTags, isGarmentTags, MATERIALS, PATTERNS, SEASONS, STYLES, TYPES,
} from "@/shared/garment";
import { buildCandidates, considered } from "@/shared/outfit/candidates";
import { OCCASIONS, type OutfitRequest, REQUEST_SEASONS, TIMES } from "@/shared/outfit/occasions";
import { METALS, NECKLINES, type Outfit, type OutfitPiece, SHIRT_KINDS } from "@/shared/outfit/pieces";
import { checkOutfit, passes } from "@/shared/outfit/rules";
import { scoreOutfit } from "@/shared/outfit/score";
import { differentPieces, suggestOutfits } from "@/shared/outfit/suggest";

import { CLOSETS, REQUESTS, TODAY } from "./fixtures/closets";
import { tags } from "./helpers";

// Test 2 in docs/outfit-pipeline.md: whole suggestions, on the sample closets
// and on random ones.

const keyOf = (outfit: Outfit) => outfit.map((piece) => piece.id).sort().join("|");

describe("sample closets", () => {
  it("are valid: real tags, no id used twice", () => {
    const all = Object.values(CLOSETS).flatMap((closet) => closet.pieces);
    for (const piece of all) expect(isGarmentTags(piece.tags), piece.id).toBe(true);
    expect(new Set(all.map((piece) => piece.id)).size).toBe(all.length);
  });

  for (const [closetName, closet] of Object.entries(CLOSETS)) {
    for (const [requestName, request] of Object.entries(REQUESTS)) {
      describe(`${closetName} closet, ${requestName}`, () => {
        const result = suggestOutfits(closet.pieces, request, { today: TODAY });

        it("suggests 1 to 3 outfits", () => {
          expect(result.notEnough).toBeNull();
          expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
          expect(result.suggestions.length).toBeLessThanOrEqual(3);
        });

        it("never suggests an outfit that breaks a hard rule", () => {
          for (const { pieces } of result.suggestions) expect(checkOutfit(pieces, request)).toEqual([]);
        });

        it("gives the same answer every time", () => {
          const again = suggestOutfits(closet.pieces, request, { today: TODAY });
          expect(again.suggestions.map((s) => keyOf(s.pieces))).toEqual(result.suggestions.map((s) => keyOf(s.pieces)));
        });

        it("suggests outfits that differ in at least two pieces", () => {
          const outfits = result.suggestions.map((s) => s.pieces);
          for (let i = 0; i < outfits.length; i++) {
            for (let j = i + 1; j < outfits.length; j++) expect(differentPieces(outfits[i], outfits[j])).toBeGreaterThanOrEqual(2);
          }
        });

        it("ranks best first, with a reason for every point", () => {
          const totals = result.suggestions.map((s) => s.score.total);
          expect(totals).toEqual([...totals].sort((a, b) => b - a));
          for (const { score } of result.suggestions) for (const part of score.parts) expect(part.reason).not.toBe("");
        });
      });
    }
  }

  it("puts a navy suit with black oxfords among the cocktail evening outfits", () => {
    const result = suggestOutfits(CLOSETS.office.pieces, REQUESTS["cocktail evening"], { today: TODAY });
    const labels = result.suggestions.map((s) => s.pieces.map((piece) => piece.tags.label));
    expect(labels).toContainEqual(expect.arrayContaining(["navy blazer", "navy trousers", "black oxfords"]));
  });

  it("puts no summer-only piece in a winter outfit", () => {
    for (const closet of Object.values(CLOSETS)) {
      const result = suggestOutfits(closet.pieces, REQUESTS["winter day"], { today: TODAY });
      for (const { pieces } of result.suggestions) for (const piece of pieces) expect(piece.tags.season).not.toBe("summer");
    }
  });
});

describe("start from this piece", () => {
  const { pieces } = CLOSETS.casual;
  const request = REQUESTS["casual day"];

  it.each(pieces.map((piece) => [piece.tags.label, piece.id]))("every outfit for %s contains it", (_label, id) => {
    const result = suggestOutfits(pieces, request, { anchorId: id, today: TODAY });
    for (const { pieces: outfit } of result.suggestions) expect(outfit.map((piece) => piece.id)).toContain(id);
  });

  it("explains when the piece doesn't fit the request", () => {
    const result = suggestOutfits(pieces, request, { anchorId: "c-puffer" });
    expect(result.suggestions).toEqual([]);
    expect(result.notEnough).toMatch(/doesn't fit/);
  });
});

describe("too few pieces", () => {
  const request = REQUESTS["casual day"];

  it("says the closet is empty", () => {
    expect(suggestOutfits([], request).notEnough).toBe("The closet is empty.");
  });

  it("says what is missing", () => {
    const tee = { id: "t", tags: tags({ type: "t-shirt", colors: ["white"], season: "all-year", formality: "casual" }) };
    const result = suggestOutfits([tee], request);
    expect(result.suggestions).toEqual([]);
    expect(result.notEnough).toMatch(/shoes/);
    expect(result.notEnough).toMatch(/bottoms/);
  });
});

// A small seeded random generator, so a failing random closet can be replayed.
function random(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  return { next, pick };
}

// Clothes-heavy, so most closets can make outfits at all.
const WEIGHTED_TYPES = [
  ...TYPES, "t-shirt", "t-shirt", "shirt", "sweater", "jeans", "pants", "pants", "sneakers", "boots", "shoes", "belt", "jacket",
] as const;

function randomCloset(seed: number, size: number): OutfitPiece[] {
  const { next, pick } = random(seed);
  return Array.from({ length: size }, (_, i) => {
    const type = pick(WEIGHTED_TYPES);
    const colors = [pick(COLORS), ...(next() < 0.3 ? [pick(COLORS)] : [])];
    const pieceTags: GarmentTags = {
      label: `piece ${i}`,
      type,
      colors: [...new Set(colors)],
      pattern: next() < 0.75 ? "solid" : pick(PATTERNS),
      material: pick(MATERIALS),
      season: pick(SEASONS),
      formality: pick(FORMALITIES),
      style: pick(STYLES),
      confidence: "high",
    };
    return {
      id: `r${seed}-${i}`,
      tags: pieceTags,
      ...(type === "shirt" && { shirtKind: pick(SHIRT_KINDS) }),
      ...(type === "sweater" && { neckline: pick(NECKLINES) }),
      ...((type === "belt" || type === "accessories") && next() < 0.6 && { metal: pick(METALS) }),
      ...(next() < 0.7 && { lastWorn: `2026-${String(1 + Math.floor(next() * 10)).padStart(2, "0")}-15` }),
    };
  });
}

function randomRequest(seed: number): OutfitRequest {
  const { pick } = random(seed * 7919);
  return { occasion: pick(OCCASIONS), season: pick(REQUEST_SEASONS), time: pick(TIMES) };
}

describe("random closets", () => {
  it("never suggest an outfit that breaks a hard rule", () => {
    let withSuggestions = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const request = randomRequest(seed);
      const result = suggestOutfits(randomCloset(seed, 30), request, { today: TODAY });
      if (result.suggestions.length > 0) withSuggestions += 1;
      else expect(result.notEnough, `seed ${seed}`).not.toBeNull();
      for (const { pieces } of result.suggestions) expect(checkOutfit(pieces, request), `seed ${seed}`).toEqual([]);
    }
    // Random closets are messy, but the test means little if almost none suggest anything.
    expect(withSuggestions).toBeGreaterThan(10);
  });
});

// Every subset of the pieces the builder uses, as outfits: the slow, sure way.
function bruteForce(pieces: readonly OutfitPiece[], request: OutfitRequest): Set<string> {
  const usable = pieces.filter(considered);
  const found = new Set<string>();
  for (let mask = 1; mask < 1 << usable.length; mask++) {
    const outfit = usable.filter((_, i) => mask & (1 << i));
    if (passes(outfit, request)) found.add(keyOf(outfit));
  }
  return found;
}

describe("building outfits in stages", () => {
  // The builder drops half-built outfits early. This checks that it never
  // drops one that would have passed, and never lets through one that fails.
  it("finds exactly the outfits that trying every subset finds: small closet", () => {
    for (const request of Object.values(REQUESTS)) {
      const built = buildCandidates(CLOSETS.small.pieces, request);
      expect(new Set(built.outfits.map(keyOf))).toEqual(bruteForce(CLOSETS.small.pieces, request));
    }
  });

  it("finds exactly the outfits that trying every subset finds: random closets", () => {
    for (let seed = 100; seed < 106; seed++) {
      const closet = randomCloset(seed, 13);
      const request = randomRequest(seed);
      expect(new Set(buildCandidates(closet, request).outfits.map(keyOf)), `seed ${seed}`).toEqual(bruteForce(closet, request));
    }
  });
});

describe("scores", () => {
  const request: OutfitRequest = { occasion: "casual", season: "transitional", time: "day" };
  const piece = (id: string, overrides: Partial<GarmentTags>, extra: Partial<OutfitPiece> = {}): OutfitPiece => ({
    id,
    tags: tags({ label: id, season: "all-year", formality: "casual", ...overrides }),
    ...extra,
  });
  const jeans = piece("jeans", { type: "jeans", colors: ["blue"] });
  const sneakers = piece("sneakers", { type: "sneakers", colors: ["white"] });
  const part = (outfit: Outfit, rule: string, context = {}) =>
    scoreOutfit(outfit, request, context).parts.find((p) => p.rule === rule);

  it("S1 likes the darker layer outside", () => {
    const whiteTee = piece("white tee", { type: "t-shirt", colors: ["white"] });
    const blackTee = piece("black tee", { type: "t-shirt", colors: ["black"] });
    const navyJacket = piece("navy jacket", { type: "jacket", colors: ["navy"] });
    const whiteJacket = piece("white jacket", { type: "jacket", colors: ["white"] });
    expect(part([whiteTee, navyJacket, jeans, sneakers], "S1")?.points).toBeGreaterThan(0);
    expect(part([blackTee, whiteJacket, jeans, sneakers], "S1")?.points).toBeLessThan(0);
  });

  it("S3 dislikes shoes the same colour as the trousers", () => {
    const pants = piece("brown pants", { type: "pants", colors: ["brown"] });
    const boots = piece("brown boots", { type: "boots", colors: ["brown"] });
    expect(part([piece("tee", { type: "t-shirt", colors: ["white"] }), pants, boots], "S3")?.points).toBeLessThan(0);
  });

  it("S7 likes navy with white", () => {
    const outfit = [piece("tee", { type: "t-shirt", colors: ["white"] }), piece("chinos", { type: "pants", colors: ["navy"] }), sneakers];
    expect(part(outfit, "S7")?.reason).toBe("navy + white");
  });

  it("S10 rewards pieces not worn for a while, and never penalises", () => {
    const tee = (lastWorn: string) => piece("tee", { type: "t-shirt", colors: ["white"] }, { lastWorn });
    const old = part([tee("2026-06-01"), jeans, sneakers], "S10", { today: TODAY });
    expect(old?.points).toBeGreaterThan(0);
    expect(old?.reason).toMatch(/not worn for/);
    expect(part([tee("2026-11-10"), jeans, sneakers], "S10", { today: TODAY })).toBeUndefined();
  });

  it("adds the parts up to the total", () => {
    for (const closet of Object.values(CLOSETS)) {
      for (const { score } of suggestOutfits(closet.pieces, request, { today: TODAY }).suggestions) {
        const sum = score.parts.reduce((total, p) => total + p.points, 0);
        expect(score.total).toBeCloseTo(sum, 1);
      }
    }
  });
});
