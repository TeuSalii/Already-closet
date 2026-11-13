import { buildCandidates, type Dropped } from "@/shared/outfit/candidates";
import type { OutfitRequest } from "@/shared/outfit/occasions";
import { category, type Outfit, type OutfitPiece } from "@/shared/outfit/pieces";
import { type Score, type ScoreContext, scoreOutfit } from "@/shared/outfit/score";

// Steps 1–3 together: build, check, score, and pick a few outfits that are
// not near-copies of each other. No AI, no randomness: the same closet and
// request always give the same answer.

export type Suggestion = { pieces: Outfit; score: Score };

export type SuggestOptions = ScoreContext & {
  anchorId?: string; // "start from this piece"
  limit?: number;
};

export type SuggestResult = {
  suggestions: Suggestion[];
  notEnough: string | null; // why there are none, in words
  checked: number;
  passed: number;
  droppedEarly: number;
  droppedBy: Record<string, Dropped>;
};

// Two suggestions must differ in at least this many clothes or shoes. A
// different belt alone doesn't make a different outfit.
const MIN_DIFFERENT = 2;

export function suggestOutfits(
  pieces: readonly OutfitPiece[],
  request: OutfitRequest,
  options: SuggestOptions = {},
): SuggestResult {
  const { anchorId, limit = 3, today } = options;
  const built = buildCandidates(pieces, request, anchorId);

  const ranked = built.outfits
    .map((outfit) => ({ pieces: outfit, score: scoreOutfit(outfit, request, { today }), key: keyOf(outfit) }))
    .sort((a, b) => b.score.total - a.score.total || a.key.localeCompare(b.key));

  const chosen: typeof ranked = [];
  for (const candidate of ranked) {
    if (chosen.length === limit) break;
    if (chosen.every((other) => differentPieces(candidate.pieces, other.pieces) >= MIN_DIFFERENT)) chosen.push(candidate);
  }

  return {
    suggestions: chosen.map(({ pieces: outfit, score }) => ({ pieces: outfit, score })),
    notEnough: chosen.length > 0 ? null : whyNone(pieces, built.usable, anchorId, built.droppedBy),
    checked: built.checked,
    passed: built.outfits.length,
    droppedEarly: built.droppedEarly,
    droppedBy: built.droppedBy,
  };
}

const keyOf = (outfit: Outfit) => outfit.map((piece) => piece.id).sort().join("|");

// Clothes and shoes in one outfit that the other doesn't have, the larger way round.
export function differentPieces(a: Outfit, b: Outfit): number {
  const worn = (outfit: Outfit) => new Set(outfit.filter((piece) => category(piece) !== "accessory").map((p) => p.id));
  const [x, y] = [worn(a), worn(b)];
  const onlyIn = (p: Set<string>, q: Set<string>) => [...p].filter((id) => !q.has(id)).length;
  return Math.max(onlyIn(x, y), onlyIn(y, x));
}

function whyNone(
  all: readonly OutfitPiece[],
  usable: readonly OutfitPiece[],
  anchorId: string | undefined,
  droppedBy: Record<string, Dropped>,
): string {
  if (all.length === 0) return "The closet is empty.";
  if (anchorId !== undefined && !usable.some((piece) => piece.id === anchorId)) {
    return "That piece doesn't fit this season or occasion.";
  }
  const has = (wanted: string) => usable.some((piece) => category(piece) === wanted);
  const missing = [
    !has("shoes") && "shoes",
    !has("bottom") && !has("dress") && "bottoms or a dress",
    !has("top") && !has("dress") && "tops or a dress",
  ].filter(Boolean);
  if (missing.length > 0) return `Not enough pieces for this yet: no ${missing.join(", ")} that fit the season and occasion.`;
  const top = Object.entries(droppedBy).sort((a, b) => b[1].count - a[1].count)[0];
  return top ? `No outfit passes the rules. Most often broken: ${top[0]}.` : "No outfit passes the rules.";
}
