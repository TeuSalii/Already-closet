import {
  type Category, categoryOf, type GarmentTags, METALS as METAL_WORDS, NECKLINES as NECKLINE_WORDS,
  SHIRT_KINDS as SHIRT_KIND_WORDS, type Type,
} from "@/shared/garment";

// One piece as the outfit rules see it: its tags, plus a few fields that can
// override them. Shirt kind, neckline and metal come from the tags (asked of
// the AI since 2026-11-11, missing on older pieces). The fields here let
// tests and fixture closets set them directly. Where neither says, the type
// gives a default if it can.

// The layering order, inside to outside (Layering_Rules.md).
export const LAYERS = ["base", "shirt", "sweater", "jacket", "coat"] as const;
export type Layer = (typeof LAYERS)[number];

// The tag words without "none" (garment.ts explains them).
export type Neckline = Exclude<(typeof NECKLINE_WORDS)[number], "none">;
export type ShirtKind = Exclude<(typeof SHIRT_KIND_WORDS)[number], "none">;
export type Metal = Exclude<(typeof METAL_WORDS)[number], "none">;
const known = <T extends string>(words: readonly T[]) => words.filter((word) => word !== "none") as Exclude<T, "none">[];
export const NECKLINES = known(NECKLINE_WORDS);
export const SHIRT_KINDS = known(SHIRT_KIND_WORDS);
export const METALS = known(METAL_WORDS);

// What an accessory is, where the rules care. Since watch and jewellery are
// types, this is only needed for pieces tagged "accessories".
export const ACCESSORY_KINDS = ["watch", "jewellery"] as const;
export type AccessoryKind = (typeof ACCESSORY_KINDS)[number];

export type OutfitPiece = {
  id: string;
  tags: GarmentTags;
  layer?: Layer;
  shirtKind?: ShirtKind;
  neckline?: Neckline;
  metal?: Metal;
  accessory?: AccessoryKind;
  lastWorn?: string; // YYYY-MM-DD; missing: not known
};
export type Outfit = readonly OutfitPiece[];

// A vest has no default: a puffer vest is a jacket, a waistcoat is not.
const DEFAULT_LAYER: Partial<Record<Type, Layer>> = {
  "t-shirt": "base", "tank-top": "base", top: "base",
  shirt: "shirt", blouse: "shirt", polo: "shirt",
  sweater: "sweater", cardigan: "sweater", hoodie: "sweater",
  jacket: "jacket", blazer: "jacket",
  coat: "coat",
};

export const category = (piece: OutfitPiece): Category => categoryOf(piece.tags.type);
export const mainColor = (piece: OutfitPiece) => piece.tags.colors[0];

// A dress is worn next to the skin, so it sits where a base layer would.
export function layerOf(piece: OutfitPiece): Layer | null {
  if (category(piece) === "dress") return "base";
  return piece.layer ?? DEFAULT_LAYER[piece.tags.type] ?? null;
}

export const stepOf = (layer: Layer) => LAYERS.indexOf(layer);

const answered = <T extends string>(value: T | undefined) =>
  (value === undefined || value === "none" ? undefined : value) as Exclude<T, "none"> | undefined;

// A shirt with no kind yet counts as a dress shirt: the stricter reading,
// so a crew-neck sweater is not put over an oxford.
export function shirtKindOf(piece: OutfitPiece): ShirtKind | null {
  return piece.shirtKind ?? answered(piece.tags.shirtKind) ?? (piece.tags.type === "shirt" ? "dress" : null);
}

export const necklineOf = (piece: OutfitPiece): Neckline | null =>
  piece.neckline ?? answered(piece.tags.neckline) ?? null;

export const metalOf = (piece: OutfitPiece): Metal | null => piece.metal ?? answered(piece.tags.metal) ?? null;

export function accessoryOf(piece: OutfitPiece): AccessoryKind | null {
  if (piece.tags.type === "watch") return "watch";
  if (piece.tags.type === "jewellery") return "jewellery";
  return piece.accessory ?? null;
}

const UPPER_BODY: readonly Category[] = ["top", "outerwear", "dress"];
export const upperBody = (outfit: Outfit) => outfit.filter((piece) => UPPER_BODY.includes(category(piece)));

// Clothes and shoes, not accessories: what colour and formality rules look at.
export const visible = (outfit: Outfit) => outfit.filter((piece) => category(piece) !== "accessory");

export const isWhiteSneakers = (piece: OutfitPiece) => piece.tags.type === "sneakers" && mainColor(piece) === "white";
