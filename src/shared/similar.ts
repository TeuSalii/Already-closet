import { categoryOf, type GarmentTags } from "@/shared/garment";
import { deltaE, MATCH_DELTA_E } from "@/shared/outfit/colors";
import type { Color } from "@/shared/outfit/colors";

// Given a garment the person is considering buying, find similar pieces they
// already own. "Similar" means the same broad category (you're asking "do I
// already have something for this?") ranked by how close they actually are.

export type SimilarMatch = {
  id: string;
  score: number; // higher = more similar
  headline: string; // "same type · matching colour" — one short line
};

function mainColor(tags: GarmentTags): Color {
  return tags.colors[0] as Color;
}

const FORMALITIES = ["sport", "casual", "smart-casual", "formal"] as const;

export function findSimilar(
  candidate: GarmentTags,
  closet: { id: string; tags: GarmentTags }[],
): SimilarMatch[] {
  const candidateCat = categoryOf(candidate.type);

  return closet
    .flatMap(({ id, tags }) => {
      // Only the same broad category is a meaningful "already own" answer.
      if (categoryOf(tags.type) !== candidateCat) return [];

      let score = 0;
      const signals: string[] = [];

      // Exact type match.
      if (tags.type === candidate.type) {
        score += 40;
        signals.push("same type");
      } else {
        score += 15; // same category, different cut
      }

      // Colour proximity (CIE76 ΔE on representative hex values).
      const de = deltaE(mainColor(candidate), mainColor(tags));
      if (de < MATCH_DELTA_E) {
        score += 30;
        signals.push("matching colour");
      } else if (de < 25) {
        score += 12;
        signals.push("similar colour");
      }

      // Formality: same level, or one step away.
      if (tags.formality === candidate.formality) {
        score += 20;
        signals.push("same formality");
      } else {
        const diff = Math.abs(
          FORMALITIES.indexOf(tags.formality) - FORMALITIES.indexOf(candidate.formality),
        );
        if (diff === 1) score += 8;
      }

      // Season overlap.
      if (
        tags.season === candidate.season ||
        tags.season === "all-year" ||
        candidate.season === "all-year"
      ) {
        score += 5;
      }

      const headline = signals.slice(0, 2).join(" · ") || "same category";
      return [{ id, score, headline }];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}
