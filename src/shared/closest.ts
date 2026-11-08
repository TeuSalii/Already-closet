import { type Category, categoryOf, type GarmentTags } from "@/shared/garment";

// "The closest pieces you already own" to a wish, from labels alone.
// This is the rule-based baseline of concept v3, technical test 4; image
// embeddings are the variant it will be compared with. Kept free of React
// and storage, so the test can run it on the agreed wishes directly.
//
// Only pieces of the same category count: a wished hoodie is not answered
// by black jeans, however black they are.

// How much each shared label is worth. Type and main colour carry the wish
// ("a black hoodie"); the rest decides between pieces that share those.
const WEIGHTS = {
  type: 4,
  sameCategoryOnly: 1, // a sweater for a hoodie: close, not the same
  mainColor: 3,
  otherColor: 1,
  pattern: 2,
  material: 1,
  style: 1,
  formality: 1,
} as const;

// Below this, a piece is in the category but not like the wish at all.
// Type alone (4) or main colour + pattern (5) clears it; a same-category
// piece that shares only style or formality does not.
const CLOSE_ENOUGH = 4;

export type Match<P> = {
  piece: P;
  score: number;
  reasons: string[]; // the shared labels, for "why it is close"
  same: boolean; // same type and main colour: "you own a black hoodie"
};

export type WishResult<P> = {
  category: Category;
  scanned: number; // read pieces in that category: what the search could see
  same: number; // how many owned pieces are the same type and main colour
  closest: Match<P>[]; // best first, at most `limit`
};

export function closestOwned<P>(
  wish: GarmentTags,
  pieces: readonly P[],
  tagsOf: (piece: P) => GarmentTags | null, // null: not read yet, cannot be compared
  limit = 3,
): WishResult<P> {
  const category = categoryOf(wish.type);
  const comparable = pieces.flatMap((piece) => {
    const tags = tagsOf(piece);
    return tags !== null && categoryOf(tags.type) === category ? [{ piece, tags }] : [];
  });

  const matches = comparable
    .map(({ piece, tags }) => compare(wish, piece, tags))
    .filter((match) => match.score >= CLOSE_ENOUGH)
    .sort((a, b) => b.score - a.score);

  return {
    category,
    scanned: comparable.length,
    same: matches.filter((match) => match.same).length,
    closest: matches.slice(0, limit),
  };
}

function compare<P>(wish: GarmentTags, piece: P, tags: GarmentTags): Match<P> {
  let score = 0;
  const reasons: string[] = [];

  if (tags.type === wish.type) {
    score += WEIGHTS.type;
    reasons.push(wish.type);
  } else {
    score += WEIGHTS.sameCategoryOnly;
  }

  const mainColor = wish.colors[0];
  if (tags.colors[0] === mainColor) {
    score += WEIGHTS.mainColor;
    reasons.push(mainColor);
  }
  // Any other wished colour the piece has, in any position.
  for (const color of wish.colors) {
    if (tags.colors.includes(color) && !reasons.includes(color)) {
      score += WEIGHTS.otherColor;
      reasons.push(color);
    }
  }

  if (tags.pattern === wish.pattern) {
    score += WEIGHTS.pattern;
    reasons.push(wish.pattern);
  }
  if (wish.material !== "unknown" && tags.material === wish.material) {
    score += WEIGHTS.material;
    reasons.push(wish.material);
  }
  if (tags.style === wish.style) {
    score += WEIGHTS.style;
    reasons.push(wish.style);
  }
  if (tags.formality === wish.formality) {
    score += WEIGHTS.formality;
    reasons.push(wish.formality);
  }

  return { piece, score, reasons, same: tags.type === wish.type && tags.colors[0] === mainColor };
}

// "hoodie" → "hoodies", "dress" → "dresses", "jeans" stays "jeans".
export function plural(word: string, count: number): string {
  if (count === 1) return word;
  if (word.endsWith("ss")) return `${word}es`;
  if (word.endsWith("s")) return word;
  return `${word}s`;
}
