import type { GarmentTags } from "@/shared/garment";
import type { OutfitRequest } from "@/shared/outfit/occasions";
import type { OutfitPiece } from "@/shared/outfit/pieces";

import casual from "./casual.json";
import office from "./office.json";
import small from "./small.json";

// Sample closets for Test 2 (docs/outfit-pipeline.md) and the dev page at
// /dev/outfits. Each piece is written flat in the JSON (tags and the extra
// outfit fields side by side) to keep the files short; this turns them into
// OutfitPieces. Every piece is tagged with high confidence.

type FlatPiece = Omit<GarmentTags, "confidence"> & Omit<OutfitPiece, "tags">;

function load(flat: unknown[]): OutfitPiece[] {
  return (flat as FlatPiece[]).map(
    ({ id, layer, shirtKind, neckline, metal, accessory, lastWorn, ...tags }) => ({
      id,
      tags: { ...tags, confidence: "high" },
      ...(layer && { layer }),
      ...(shirtKind && { shirtKind }),
      ...(neckline && { neckline }),
      ...(metal && { metal }),
      ...(accessory && { accessory }),
      ...(lastWorn && { lastWorn }),
    }),
  );
}

export const CLOSETS: Record<string, { about: string; pieces: OutfitPiece[] }> = {
  casual: { about: "Mostly casual, 30 pieces, menswear", pieces: load(casual) },
  office: { about: "Office: smart casual to formal, 23 pieces, menswear", pieces: load(office) },
  small: { about: "Small closet with dresses, 12 pieces", pieces: load(small) },
};

export const REQUESTS: Record<string, OutfitRequest> = {
  "casual day": { occasion: "casual", season: "transitional", time: "day" },
  office: { occasion: "business-casual", season: "transitional", time: "day" },
  "cocktail evening": { occasion: "cocktail", season: "transitional", time: "evening" },
  beach: { occasion: "beach", season: "summer", time: "day" },
  "winter day": { occasion: "casual", season: "winter", time: "day" },
};

// "Today" for the fixtures, so "not worn for N days" never changes.
export const TODAY = "2026-11-11";
