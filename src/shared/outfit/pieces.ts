import { type Category, categoryOf, type GarmentTags, type Type } from "@/shared/garment";

// One piece as the outfit rules see it: its tags, plus details the tags do
// not hold yet (docs/outfit-pipeline.md, "What the tags need first"). Until
// the tagger asks for them they are optional: tests and fixture closets fill
// them in, and where the type gives a sensible answer, that is the default.

// The layering order, inside to outside (Layering_Rules.md).
export const LAYERS = ["base", "shirt", "sweater", "jacket", "coat"] as const;
export type Layer = (typeof LAYERS)[number];

export const NECKLINES = ["crew", "v-neck", "turtleneck", "collar", "other"] as const;
export type Neckline = (typeof NECKLINES)[number];

// dress: dress shirt, oxford or chambray. Only a V-neck sweater goes over it.
// flannel: no sweater over it at all. casual: any other shirt with buttons.
export const SHIRT_KINDS = ["dress", "flannel", "casual"] as const;
export type ShirtKind = (typeof SHIRT_KINDS)[number];

// Belt buckle, watch case, jewellery.
export const METALS = ["silver", "gold"] as const;
export type Metal = (typeof METALS)[number];

// What an "accessories" piece is, where the rules care.
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

// A plain "shirt" counts as a dress shirt until the tags say otherwise: the
// stricter reading, so a crew-neck sweater is not put over an oxford.
export function shirtKindOf(piece: OutfitPiece): ShirtKind | null {
  if (piece.shirtKind) return piece.shirtKind;
  return piece.tags.type === "shirt" ? "dress" : null;
}

const UPPER_BODY: readonly Category[] = ["top", "outerwear", "dress"];
export const upperBody = (outfit: Outfit) => outfit.filter((piece) => UPPER_BODY.includes(category(piece)));

// Clothes and shoes, not accessories: what colour and formality rules look at.
export const visible = (outfit: Outfit) => outfit.filter((piece) => category(piece) !== "accessory");

export const isWhiteSneakers = (piece: OutfitPiece) => piece.tags.type === "sneakers" && mainColor(piece) === "white";
