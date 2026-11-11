import { formalityGap, OCCASION_RULES, type OutfitRequest } from "@/shared/outfit/occasions";
import {
  category, LAYERS, layerOf, type Outfit, type OutfitPiece, upperBody,
} from "@/shared/outfit/pieces";
import { checkOutfit, checkRules, fitsSeason } from "@/shared/outfit/rules";

// Step 1 of the pipeline: every outfit the closet allows that breaks no hard
// rule. Built in stages, upper body → bottom → shoes → belt, so a half-built
// outfit that already breaks a rule is dropped before it multiplies.
//
// A half-built outfit may only be dropped by a rule that more pieces can
// never fix. That holds for these:
// - the upper-body rules, because the upper body is complete once chosen;
// - H6 and H7, because a piece only adds colours and standouts;
// - H12, once all clothes are chosen: a belt can't fix the shoes.
// tests/outfit-suggest.test.ts checks this against trying every subset.

const UPPER_RULES = ["H2", "H3", "H4", "H5", "H13", "H14", "H15", "H16"];
const GROWING_RULES = ["H6", "H7"];
const WITH_SHOES_RULES = [...GROWING_RULES, "H12"];

// Pieces the builder uses. Accessories other than a belt (bag, hat, watch,
// jewellery) are left out for now: they'd multiply the outfits, and only H8
// and H9 look at them. An upper-body piece with no known layer (a vest)
// can't be placed in the layer order, so it's left out too.
export function considered(piece: OutfitPiece): boolean {
  if (category(piece) === "accessory") return piece.tags.type === "belt";
  if (upperBody([piece]).length > 0) return layerOf(piece) !== null;
  return true;
}

// H10 and H11 for one piece on its own.
export function fits(piece: OutfitPiece, request: OutfitRequest): boolean {
  if (!fitsSeason(piece, request)) return false;
  if (category(piece) === "accessory") return true;
  return formalityGap(piece.tags.formality, OCCASION_RULES[request.occasion].formality) <= 1;
}

export type Dropped = { count: number; example: string };

export type Candidates = {
  outfits: Outfit[];
  usable: OutfitPiece[]; // pieces that fit the season and occasion
  checked: number; // complete outfits that got the full check
  droppedEarly: number; // half-built outfits dropped before completing
  droppedBy: Record<string, Dropped>; // complete outfits that failed, by first rule broken
};

export function buildCandidates(pieces: readonly OutfitPiece[], request: OutfitRequest, anchorId?: string): Candidates {
  const usable = pieces.filter((piece) => considered(piece) && fits(piece, request));
  const result: Candidates = { outfits: [], usable, checked: 0, droppedEarly: 0, droppedBy: {} };

  const anchor = anchorId === undefined ? undefined : usable.find((piece) => piece.id === anchorId);
  if (anchorId !== undefined && anchor === undefined) return result;
  const only = (list: OutfitPiece[]) => (anchor && list.includes(anchor) ? [anchor] : list);

  const ofCategory = (wanted: string) => usable.filter((piece) => category(piece) === wanted);
  const bottoms = only(ofCategory("bottom"));
  const shoes = only(ofCategory("shoes"));
  const belts = only(ofCategory("accessory"));
  const beltChoices: (OutfitPiece | null)[] = anchor && belts.includes(anchor) ? [anchor] : [null, ...belts];

  for (const stack of upperStacks(upperBody(usable))) {
    if (anchor && upperBody([anchor]).length > 0 && !stack.includes(anchor)) continue;
    if (checkRules(stack, request, UPPER_RULES).length > 0) {
      result.droppedEarly += 1;
      continue;
    }
    const hasDress = stack.some((piece) => category(piece) === "dress");
    if (hasDress && anchor && category(anchor) === "bottom") continue;
    for (const bottom of hasDress ? [null] : bottoms) {
      const dressed = bottom ? [...stack, bottom] : stack;
      if (checkRules(dressed, request, GROWING_RULES).length > 0) {
        result.droppedEarly += 1;
        continue;
      }
      for (const shoe of shoes) {
        const shod = [...dressed, shoe];
        if (checkRules(shod, request, WITH_SHOES_RULES).length > 0) {
          result.droppedEarly += 1;
          continue;
        }
        for (const belt of beltChoices) {
          const outfit = belt ? [...shod, belt] : shod;
          result.checked += 1;
          const broken = checkOutfit(outfit, request);
          if (broken.length === 0) {
            result.outfits.push(outfit);
            continue;
          }
          const first = broken[0];
          const dropped = (result.droppedBy[first.rule] ??= { count: 0, example: "" });
          dropped.count += 1;
          if (dropped.example === "") dropped.example = `${outfit.map((p) => p.tags.label).join(" + ")}: ${first.reason}`;
        }
      }
    }
  }
  return result;
}

// Every way to wear 1 to 3 upper-body pieces, at most one per layer, inside
// to outside. Same-layer pairs can't come out of this, so H3 only has gaps
// left to check.
function upperStacks(upper: readonly OutfitPiece[]): OutfitPiece[][] {
  const byLayer = LAYERS.map((layer) => upper.filter((piece) => layerOf(piece) === layer));
  const stacks: OutfitPiece[][] = [];
  const walk = (step: number, stack: OutfitPiece[]) => {
    if (step === LAYERS.length) {
      if (stack.length > 0) stacks.push(stack);
      return;
    }
    walk(step + 1, stack);
    if (stack.length === 3) return;
    for (const piece of byLayer[step]) walk(step + 1, [...stack, piece]);
  };
  walk(0, []);
  return stacks;
}
