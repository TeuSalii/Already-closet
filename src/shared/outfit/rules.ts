import { type Color, isBold, isNeutral, matches, METALLICS } from "@/shared/outfit/colors";
import { formalityGap, OCCASION_RULES, type OutfitRequest } from "@/shared/outfit/occasions";
import {
  category, isWhiteSneakers, type Layer, layerOf, mainColor, type Outfit, type OutfitPiece, shirtKindOf, stepOf,
  upperBody, visible,
} from "@/shared/outfit/pieces";

// The hard rules: an outfit that breaks one is never suggested. Each rule's
// id is its number in docs/outfit-pipeline.md, where its source is named.
// A check returns null when the outfit passes, or what is wrong in words, so
// tests and the dev page can show why an outfit was dropped.

export type HardRule = {
  id: string;
  says: string;
  check: (outfit: Outfit, request: OutfitRequest) => string | null;
};

export type Violation = { rule: string; reason: string };

export function checkOutfit(outfit: Outfit, request: OutfitRequest): Violation[] {
  return HARD_RULES.flatMap((rule) => {
    const reason = rule.check(outfit, request);
    return reason === null ? [] : [{ rule: rule.id, reason }];
  });
}

export const passes = (outfit: Outfit, request: OutfitRequest) => checkOutfit(outfit, request).length === 0;

const names = (pieces: readonly OutfitPiece[]) => pieces.map((piece) => piece.tags.label).join(", ");
const distinct = <T>(items: readonly T[]) => [...new Set(items)];
const ofCategory = (outfit: Outfit, wanted: string) => outfit.filter((piece) => category(piece) === wanted);

// Upper-body pieces with a known layer, inside to outside.
function layered(outfit: Outfit): { piece: OutfitPiece; layer: Layer }[] {
  return upperBody(outfit)
    .flatMap((piece) => {
      const layer = layerOf(piece);
      return layer === null ? [] : [{ piece, layer }];
    })
    .sort((a, b) => stepOf(a.layer) - stepOf(b.layer));
}

const wearsLayer = (outfit: Outfit, layer: Layer) => layered(outfit).some((worn) => worn.layer === layer);

export const HARD_RULES: readonly HardRule[] = [
  {
    id: "H1",
    says: "One top or dress, one bottom unless it's a dress, one pair of shoes",
    check(outfit) {
      if (new Set(outfit.map((piece) => piece.id)).size !== outfit.length) return "the same piece twice";
      const dresses = ofCategory(outfit, "dress").length;
      const bottoms = ofCategory(outfit, "bottom").length;
      const shoes = ofCategory(outfit, "shoes").length;
      if (dresses > 1) return `${dresses} dresses`;
      if (dresses === 1 && bottoms > 0) return "a dress and a bottom";
      if (dresses === 0 && bottoms !== 1) return bottoms === 0 ? "no bottom" : `${bottoms} bottoms`;
      if (shoes !== 1) return shoes === 0 ? "no shoes" : `${shoes} pairs of shoes`;
      return null;
    },
  },
  {
    id: "H2",
    says: "At most 3 visible layers on the upper body",
    check(outfit) {
      const upper = upperBody(outfit);
      return upper.length > 3 ? `${upper.length} layers: ${names(upper)}` : null;
    },
  },
  {
    id: "H3",
    says: "Each layer is at most 2 steps above the one under it, never on the same step",
    check(outfit) {
      const worn = layered(outfit);
      for (let i = 1; i < worn.length; i++) {
        const under = worn[i - 1];
        const over = worn[i];
        const gap = stepOf(over.layer) - stepOf(under.layer);
        if (gap === 0) return `${under.piece.tags.label} and ${over.piece.tags.label} are both a ${over.layer} layer`;
        if (gap > 2) return `${over.piece.tags.label} over ${under.piece.tags.label}: ${gap} steps apart`;
      }
      return null;
    },
  },
  {
    id: "H4",
    says: "A polo is worn alone or under a jacket or blazer",
    check(outfit) {
      if (!outfit.some((piece) => piece.tags.type === "polo")) return null;
      const others = upperBody(outfit).filter((piece) => piece.tags.type !== "polo");
      const wrong = others.filter((piece) => piece.tags.type !== "jacket" && piece.tags.type !== "blazer");
      return wrong.length > 0 ? `a polo with ${names(wrong)}` : null;
    },
  },
  {
    id: "H5",
    says: "Over a dress shirt, oxford or chambray, only a V-neck sweater",
    check(outfit) {
      if (!outfit.some((piece) => shirtKindOf(piece) === "dress")) return null;
      const wrong = layered(outfit)
        .filter(({ piece, layer }) => layer === "sweater" && !(piece.tags.type === "sweater" && piece.neckline === "v-neck"))
        .map(({ piece }) => piece);
      return wrong.length > 0 ? `${names(wrong)} over a collared shirt` : null;
    },
  },
  {
    id: "H6",
    says: "At most 3 colours; past 3, neutrals don't count unless one is a jacket or coat",
    check(outfit) {
      const pieces = visible(outfit);
      const all = distinct(pieces.flatMap((piece) => piece.tags.colors)).filter((color) => !METALLICS.includes(color));
      if (all.length <= 3) return null;
      // A neutral still counts as the main colour of outerwear: a white jacket is not background.
      const counted = distinct(
        pieces.flatMap((piece) =>
          piece.tags.colors.filter(
            (color: Color, i) => !METALLICS.includes(color) && (!isNeutral(color) || (i === 0 && category(piece) === "outerwear")),
          ),
        ),
      );
      return counted.length > 3 ? `${counted.length} colours: ${counted.join(", ")}` : null;
    },
  },
  {
    id: "H7",
    says: "At most one bold colour or pattern",
    check(outfit) {
      const standouts = visible(outfit).filter((piece) => piece.tags.pattern !== "solid" || isBold(mainColor(piece)));
      return standouts.length > 1 ? `${standouts.length} standouts: ${names(standouts)}` : null;
    },
  },
  {
    id: "H8",
    says: "With leather shoes, the belt and a leather watch strap match the shoes",
    check(outfit) {
      const shoes = ofCategory(outfit, "shoes")[0];
      if (!shoes) return null;
      const leather = (piece: OutfitPiece) => piece.tags.material === "leather" || piece.tags.material === "suede";
      if (!(["shoes", "boots"].includes(shoes.tags.type) && leather(shoes))) return null;
      const others = outfit.filter(
        (piece) => piece.tags.type === "belt" || (piece.accessory === "watch" && leather(piece)),
      );
      const wrong = others.filter((piece) => !matches(mainColor(piece), mainColor(shoes)));
      return wrong.length > 0 ? `${names(wrong)} doesn't match ${shoes.tags.label}` : null;
    },
  },
  {
    id: "H9",
    says: "Metals match: all silver or all gold",
    check(outfit) {
      const metals = distinct(outfit.flatMap((piece) => (piece.metal ? [piece.metal] : [])));
      return metals.length > 1 ? "silver and gold together" : null;
    },
  },
  {
    id: "H10",
    says: "Every piece is at most one formality step from the occasion",
    check(outfit, request) {
      const wanted = OCCASION_RULES[request.occasion].formality;
      const wrong = visible(outfit).filter((piece) => formalityGap(piece.tags.formality, wanted) > 1);
      return wrong.length > 0 ? `too far from ${wanted}: ${names(wrong)}` : null;
    },
  },
  {
    id: "H11",
    says: "Every piece fits the season",
    check(outfit, request) {
      const wrong = outfit.filter((piece) => piece.tags.season !== "all-year" && piece.tags.season !== request.season);
      return wrong.length > 0 ? `not for ${request.season}: ${names(wrong)}` : null;
    },
  },
  {
    id: "H12",
    says: "Black clothes: black shoes and belt, or white sneakers. No black clothes: no black shoes or belt",
    check(outfit) {
      const clothes = visible(outfit).filter((piece) => category(piece) !== "shoes");
      const shoes = ofCategory(outfit, "shoes")[0];
      const belts = outfit.filter((piece) => piece.tags.type === "belt");
      const hasBlack = clothes.some((piece) => mainColor(piece) === "black");
      if (hasBlack) {
        if (shoes && !isWhiteSneakers(shoes) && mainColor(shoes) !== "black") return `black in the outfit, but ${shoes.tags.label}`;
        const wrongBelts = belts.filter((belt) => mainColor(belt) !== "black");
        return wrongBelts.length > 0 ? `black in the outfit, but ${names(wrongBelts)}` : null;
      }
      // Exceptions: a navy suit takes black shoes, and an outfit of only
      // gray and white takes a black belt (Spring & Summer, matching leathers).
      const navySuit = ["blazer", "pants"].every((type) =>
        clothes.some((piece) => piece.tags.type === type && mainColor(piece) === "navy"),
      );
      const grayAndWhite = clothes.every((piece) => piece.tags.colors.every((color) => color === "gray" || color === "white"));
      if (navySuit || grayAndWhite) return null;
      const wrong = [...(shoes ? [shoes] : []), ...belts].filter((piece) => mainColor(piece) === "black");
      return wrong.length > 0 ? `no black in the outfit, but ${names(wrong)}` : null;
    },
  },
  {
    id: "H13",
    says: "A base layer, shirt, sweater or dress is worn: no jacket on bare skin",
    check(outfit) {
      return (["base", "shirt", "sweater"] as const).some((layer) => wearsLayer(outfit, layer))
        ? null
        : "nothing under the jacket or coat";
    },
  },
  {
    id: "H14",
    says: "No sweater over a flannel shirt",
    check(outfit) {
      const flannel = outfit.some((piece) => shirtKindOf(piece) === "flannel");
      return flannel && wearsLayer(outfit, "sweater") ? "a sweater over a flannel shirt" : null;
    },
  },
  {
    id: "H15",
    says: "A cardigan has a T-shirt (base layer) under it",
    check(outfit) {
      const cardigan = outfit.some((piece) => piece.tags.type === "cardigan");
      return cardigan && !wearsLayer(outfit, "base") ? "a cardigan with no T-shirt under it" : null;
    },
  },
  {
    id: "H16",
    says: "Three upper layers only in winter",
    check(outfit, request) {
      const upper = upperBody(outfit);
      return upper.length >= 3 && request.season !== "winter" ? `${upper.length} layers in ${request.season}` : null;
    },
  },
];
