import { CATEGORIES, type Category, categoryOf, type GarmentTags } from "@/shared/garment";

// How much of the wardrobe is scanned (concept v3, Section 6 and risk R3).
// The app only knows what was scanned; how much a person owns comes from
// their own estimate. Results always say both, so "nothing close among what
// is scanned" never reads as "you own nothing like it".

// The person's own guess per category. Missing: not asked or "not sure".
export type Estimates = Partial<Record<Category, number>>;

// Choices offered for the guess. A rough number is all that is needed, and
// tapping a chip is faster than typing.
export const ESTIMATE_CHOICES = [5, 10, 15, 20, 30, 40, 60] as const;

export const CATEGORY_WORDS: Record<Category, [one: string, many: string]> = {
  top: ["top", "tops"],
  bottom: ["bottom", "bottoms"],
  dress: ["dress", "dresses"],
  outerwear: ["jacket or coat", "jackets and coats"],
  shoes: ["pair of shoes", "pairs of shoes"],
  accessory: ["accessory", "accessories"],
};

// "1 top", "5 tops".
export const countOf = (count: number, category: Category) =>
  `${count} ${CATEGORY_WORDS[category][count === 1 ? 0 : 1]}`;

// Read pieces per category. Pieces still being read are not counted: their
// category is not known yet.
export function scannedPerCategory(tags: readonly (GarmentTags | null)[]): Record<Category, number> {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<Category, number>;
  for (const t of tags) if (t !== null) counts[categoryOf(t.type)] += 1;
  return counts;
}

// "12 of about 30 tops scanned". Null without an estimate.
export function coverageText(category: Category, scanned: number, estimate: number | undefined): string | null {
  if (estimate === undefined) return null;
  if (scanned >= estimate) return `${countOf(scanned, category)} scanned, about all you own`;
  return `${scanned} of about ${estimate} ${CATEGORY_WORDS[category][1]} scanned`;
}

// Share of the estimate scanned, 0 to 1, for a progress bar.
export const coverageShare = (scanned: number, estimate: number) => Math.min(1, scanned / estimate);
