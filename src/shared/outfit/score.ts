import { type Color, COLOR_INFO, deltaE, isNeutral, lightness, MATCH_DELTA_E, matches } from "@/shared/outfit/colors";
import { colorMood, type OutfitRequest } from "@/shared/outfit/occasions";
import {
  category, isWhiteSneakers, layerOf, mainColor, type Outfit, type OutfitPiece, stepOf, upperBody, visible,
} from "@/shared/outfit/pieces";

// Step 3: the soft rules. Each gives a value from -1 (against the rule) to
// 1 (follows it well), times its weight, and says why in a few words. The
// numbers match docs/outfit-pipeline.md. H12 (the black-clothing link) was
// formed from S4 and S5 as a hard rule and is now dropped. The white-sneaker
// bonus is what remains of S4; S11 replaces S5's belt-shoe insight as a soft
// penalty. S10 only rewards (0 to 1) and never penalises: punishing a suit
// worn last week would keep it from the one evening it's right for.

export const WEIGHTS = { S1: 1, S2: 1, S3: 1, S4: 0.5, S6: 1, S7: 1, S8: 0.5, S9: 0.5, S10: 1.5, S11: 1 } as const;
type SoftRule = keyof typeof WEIGHTS;

export type ScorePart = { rule: SoftRule; points: number; reason: string };
export type Score = { total: number; parts: ScorePart[] };

// Options that aren't part of the request: the date, for "not worn for".
export type ScoreContext = { today?: string };

type Value = { value: number; reason: string } | null;

export function scoreOutfit(outfit: Outfit, request: OutfitRequest, context: ScoreContext = {}): Score {
  const values: Record<SoftRule, Value> = {
    S1: darkestOutside(outfit),
    S2: lightWithLight(outfit),
    S3: shoesStandApart(outfit),
    S4: whiteSneakers(outfit),
    S6: moodOfTheDay(outfit, request),
    S7: provenPairs(outfit),
    S8: tonal(outfit),
    S9: colourWheel(outfit),
    S10: rarelyWorn(outfit, context.today),
    S11: beltShoesMatch(outfit),
  };
  const parts = (Object.keys(values) as SoftRule[]).flatMap((rule) => {
    const found = values[rule];
    if (found === null || found.value === 0) return [];
    return [{ rule, points: round(found.value * WEIGHTS[rule]), reason: found.reason }];
  });
  return { total: round(parts.reduce((sum, part) => sum + part.points, 0)), parts };
}

const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => Math.max(-1, Math.min(1, n));
const clothes = (outfit: Outfit) => visible(outfit).filter((piece) => category(piece) !== "shoes");
const distinct = <T>(items: readonly T[]) => [...new Set(items)];

// S1: lighter inside, darker outside. Equal or a little lighter (5) still passes.
function darkestOutside(outfit: Outfit): Value {
  const layered = upperBody(outfit)
    .flatMap((piece) => {
      const layer = layerOf(piece);
      return layer === null ? [] : [{ piece, step: stepOf(layer) }];
    })
    .sort((a, b) => a.step - b.step);
  if (layered.length < 2) return null;
  let good = 0;
  let worst: [OutfitPiece, OutfitPiece] | null = null;
  for (let i = 1; i < layered.length; i++) {
    const under = layered[i - 1].piece;
    const over = layered[i].piece;
    if (lightness(mainColor(over)) <= lightness(mainColor(under)) + 5) good += 1;
    else worst ??= [over, under];
  }
  const pairs = layered.length - 1;
  const value = (good - (pairs - good)) / pairs;
  return worst
    ? { value, reason: `${worst[0].tags.label} is lighter than the ${worst[1].tags.label} under it` }
    : { value, reason: "darker layers outside" };
}

// S2: the coloured pieces all light or all dark. Neutrals go either way.
function lightWithLight(outfit: Outfit): Value {
  const colours = distinct(clothes(outfit).map(mainColor)).filter((color) => !isNeutral(color));
  if (colours.length < 2) return null;
  const light = colours.map((color) => lightness(color) >= 50);
  if (light.every(Boolean)) return { value: 1, reason: "light colours with light" };
  if (!light.some(Boolean)) return { value: 1, reason: "dark colours with dark" };
  return { value: -1, reason: `light and dark colours mixed: ${colours.join(", ")}` };
}

// S3: shoes either match a clothing piece tonally (ΔE < MATCH_DELTA_E, a
// deliberate choice) or contrast clearly (ΔE ≥ NEAR_MISS_DELTA_E). Near-miss
// colours — close but not matching — look like a mistake. White sneakers and
// all-white/all-black outfits are excluded.
const NEAR_MISS_DELTA_E = 25;
function shoesStandApart(outfit: Outfit): Value {
  const shoes = visible(outfit).find((piece) => category(piece) === "shoes");
  if (!shoes || isWhiteSneakers(shoes)) return null;
  const clothing = clothes(outfit);
  if (clothing.every((piece) => mainColor(piece) === "white") || clothing.every((piece) => mainColor(piece) === "black")) return null;
  const shoeColor = mainColor(shoes);
  const closest = clothing
    .map((piece) => ({ piece, de: deltaE(shoeColor, mainColor(piece)) }))
    .reduce((a, b) => (a.de <= b.de ? a : b));
  if (closest.de < MATCH_DELTA_E) return { value: 1, reason: `shoes tonal with the ${closest.piece.tags.label}` };
  if (closest.de < NEAR_MISS_DELTA_E) return { value: -1, reason: `shoes close to but not matching the ${closest.piece.tags.label}` };
  return { value: 1, reason: "shoes contrast with the outfit" };
}

// S11: when a belt is worn, it should match the shoes. Replaces the
// belt-shoe insight from H12 (now dropped) as a soft penalty.
function beltShoesMatch(outfit: Outfit): Value {
  const belt = outfit.find((piece) => piece.tags.type === "belt");
  if (!belt) return null;
  const shoes = visible(outfit).find((piece) => category(piece) === "shoes");
  if (!shoes) return null;
  if (matches(mainColor(belt), mainColor(shoes))) return null;
  return { value: -1, reason: `${belt.tags.label} doesn't match the ${shoes.tags.label}` };
}

function whiteSneakers(outfit: Outfit): Value {
  return outfit.some(isWhiteSneakers) ? { value: 1, reason: "white sneakers go with everything" } : null;
}

// S6: lighter by day, darker in the evening, where the occasion cares.
function moodOfTheDay(outfit: Outfit, request: OutfitRequest): Value {
  const mood = colorMood(request);
  const colours = clothes(outfit).map(mainColor);
  if (mood === null || colours.length === 0) return null;
  const average = colours.reduce((sum, color) => sum + lightness(color), 0) / colours.length;
  const value = clamp(((mood === "lighter" ? average - 50 : 50 - average) / 50) * 2);
  if (Math.abs(value) < 0.2) return null;
  const when = request.time === "day" ? "the day" : "the evening";
  return { value, reason: value > 0 ? `${mood} colours for ${when}` : `too ${mood === "lighter" ? "dark" : "light"} for ${when}` };
}

// S7: pairs the Spring & Summer guide shows work. Sage counts as olive.
const PROVEN_PAIRS: [Color, Color][] = [
  ["navy", "white"], ["olive", "tan"], ["light-blue", "tan"], ["green", "blue"], ["white", "tan"],
];
function provenPairs(outfit: Outfit): Value {
  const colours = new Set(clothes(outfit).map(mainColor));
  const found = PROVEN_PAIRS.filter(([a, b]) => colours.has(a) && colours.has(b));
  return found.length > 0 ? { value: 1, reason: found.map(([a, b]) => `${a} + ${b}`).join(", ") } : null;
}

// S8: two coloured pieces close in colour (ΔE < 10), e.g. olive with olive.
function tonal(outfit: Outfit): Value {
  const coloured = clothes(outfit).filter((piece) => !isNeutral(mainColor(piece)));
  for (let i = 0; i < coloured.length; i++) {
    for (let j = i + 1; j < coloured.length; j++) {
      if (matches(mainColor(coloured[i]), mainColor(coloured[j]))) {
        return { value: 1, reason: `tonal: ${coloured[i].tags.label} with ${coloured[j].tags.label}` };
      }
    }
  }
  return null;
}

// S9: colour-wheel harmony between the coloured pieces. Small weight: the
// sources disagree on whether the wheel matters (docs, "sources disagree").
function colourWheel(outfit: Outfit): Value {
  const hues = distinct(clothes(outfit).map(mainColor))
    .filter((color) => !isNeutral(color) && COLOR_INFO[color].hsl[1] >= 0.25)
    .map((color) => COLOR_INFO[color].hsl[0]);
  if (hues.length < 2 || hues.length > 3) return null;
  const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const gaps = hues.flatMap((a, i) => hues.slice(i + 1).map((b) => apart(a, b)));
  if (gaps.every((gap) => gap <= 30)) return { value: 1, reason: "analogous colours" };
  if (hues.length === 2 && Math.abs(gaps[0] - 180) <= 20) return { value: 1, reason: "complementary colours" };
  if (gaps.every((gap) => Math.abs(gap - 120) <= 15)) return { value: 1, reason: "triadic colours" };
  return null;
}

// S10: pieces not worn for a while score higher, up to 60 days. Pieces with
// no known date are left out of the average. 0 to 1: a reward, never a penalty.
const FULL_CREDIT_DAYS = 60;
function rarelyWorn(outfit: Outfit, today: string | undefined): Value {
  if (today === undefined) return null;
  const days = visible(outfit).flatMap((piece) =>
    piece.lastWorn ? [{ piece, days: (Date.parse(today) - Date.parse(piece.lastWorn)) / 86_400_000 }] : [],
  );
  if (days.length === 0) return null;
  const average = days.reduce((sum, d) => sum + Math.min(d.days, FULL_CREDIT_DAYS), 0) / days.length;
  const value = average / FULL_CREDIT_DAYS;
  const longest = days.reduce((a, b) => (b.days > a.days ? b : a));
  if (longest.days < 30) return null;
  return { value, reason: `brings back the ${longest.piece.tags.label}, not worn for ${Math.round(longest.days)} days` };
}
