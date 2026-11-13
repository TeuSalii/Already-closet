import { buildCandidates } from "@/shared/outfit/candidates";
import type { OutfitRequest, RequestSeason } from "@/shared/outfit/occasions";
import type { OutfitPiece } from "@/shared/outfit/pieces";

// How many unique valid outfits each piece enables, across three occasions
// (casual, smart-casual, formal) for the given season. Used for the rarely-worn
// view: a high count means the piece has outfit potential the person may have forgotten.

const SAMPLE_OCCASIONS: OutfitRequest["occasion"][] = ["casual", "smart-casual", "formal"];

export type PieceStats = { id: string; outfitCount: number };

export function computeCapsuleStats(pieces: readonly OutfitPiece[], season: RequestSeason): PieceStats[] {
  const counts = new Map<string, Set<string>>();
  for (const piece of pieces) counts.set(piece.id, new Set());

  for (const occasion of SAMPLE_OCCASIONS) {
    const request: OutfitRequest = { occasion, season, time: "day" };
    const { outfits } = buildCandidates(pieces, request);
    for (const outfit of outfits) {
      const key = outfit.map((p) => p.id).sort().join("|");
      for (const p of outfit) counts.get(p.id)?.add(key);
    }
  }

  return pieces.map((p) => ({ id: p.id, outfitCount: counts.get(p.id)?.size ?? 0 }));
}
