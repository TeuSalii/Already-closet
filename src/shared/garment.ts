// What the app knows about one piece of clothing, and the words it may use.
// Shared: the server makes the model answer in this shape, the app shows it.
//
// The word lists come from wardrowbe (MIT licence, github.com/Anyesh/wardrowbe),
// trimmed to what this app needs. A fixed list beats free text: "navy",
// "Navy Blue" and "dark blue" would otherwise be three colours, and you
// could never ask "how many blue things do I already own?".

export const TYPES = [
  "shirt", "t-shirt", "top", "blouse", "polo", "tank-top", "sweater", "cardigan", "hoodie",
  "pants", "jeans", "shorts", "skirt", "dress", "jumpsuit",
  "jacket", "coat", "blazer", "vest",
  "shoes", "sneakers", "boots", "sandals", "socks", "tights",
  "hat", "scarf", "belt", "bag", "tie", "watch", "jewellery", "accessories",
] as const;

export const COLORS = [
  "black", "white", "gray", "navy", "blue", "light-blue", "red", "burgundy", "pink", "green",
  "olive", "yellow", "orange", "purple", "brown", "tan", "beige", "cream", "gold", "silver",
] as const;

export const PATTERNS = [
  "solid", "striped", "plaid", "checkered", "floral", "graphic", "geometric", "polka-dot",
  "camouflage", "animal-print",
] as const;

// "unknown" is allowed on purpose: from a photo you often cannot tell
// polyester from cotton, and a guess stored as fact is worse than no answer.
export const MATERIALS = [
  "cotton", "denim", "leather", "wool", "polyester", "silk", "linen", "knit", "fleece", "suede",
  "velvet", "nylon", "canvas", "down", "unknown",
] as const;

// One season per piece. Spring and fall clothes are mostly the same clothes,
// so "transitional" replaces both: the model no longer has to guess between
// two answers that are equally right. "all-year" matches every season.
export const SEASONS = ["summer", "winter", "transitional", "all-year"] as const;

// Ordered from least to most dressed up, on purpose: outfit rules can then
// compare positions ("within one step"). Formality is visible in a photo
// (fabric, cut, finish); occasion is not, so occasion moves to what the
// person asks for when they want an outfit.
export const FORMALITIES = ["sport", "casual", "smart-casual", "formal"] as const;

// Each word means one thing. "casual" left because it is a formality word,
// "elegant" because it overlaps "classic": the model would flip between them.
export const STYLES = ["minimalist", "classic", "vintage", "streetwear", "sporty", "romantic"] as const;

// Details the outfit rules need (docs/outfit-pipeline.md, "What the tags
// need first"). Each one applies to a few types only; for every other type
// the answer is "none".
// - shirtKind, for shirts: "dress" is a dress shirt, oxford or chambray
//   (only a V-neck sweater goes over it); "flannel" takes no sweater at all.
// - neckline, for sweaters: a crew-neck can't go over a collared shirt.
// - metal, for belts, watches and jewellery: silver and gold don't mix.
export const SHIRT_KINDS = ["dress", "flannel", "casual", "none"] as const;
export const NECKLINES = ["crew", "v-neck", "turtleneck", "other", "none"] as const;
export const METALS = ["silver", "gold", "none"] as const;

// "low" makes the app ask the person instead of trusting the tags.
export const CONFIDENCES = ["low", "high"] as const;

// The coarse category comes from the type, worked out here, not asked of the
// model. If the model chose both, it could answer "jeans" and "top" at once.
// Record<Type, Category> makes TypeScript refuse to build if a type is
// missing from this table.
export const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory"] as const;
export type Type = (typeof TYPES)[number];
export type Category = (typeof CATEGORIES)[number];
const CATEGORY_OF: Record<Type, Category> = {
  shirt: "top", "t-shirt": "top", top: "top", blouse: "top", polo: "top", "tank-top": "top",
  sweater: "top", cardigan: "top", hoodie: "top",
  pants: "bottom", jeans: "bottom", shorts: "bottom", skirt: "bottom",
  dress: "dress", jumpsuit: "dress",
  jacket: "outerwear", coat: "outerwear", blazer: "outerwear", vest: "outerwear",
  shoes: "shoes", sneakers: "shoes", boots: "shoes", sandals: "shoes",
  socks: "accessory", tights: "accessory", hat: "accessory", scarf: "accessory",
  belt: "accessory", bag: "accessory", tie: "accessory", watch: "accessory", jewellery: "accessory",
  accessories: "accessory",
};
export const categoryOf = (type: Type): Category => CATEGORY_OF[type];

export type GarmentTags = {
  label: string; // a short name a person would say: "navy wool crewneck"
  type: Type;
  colors: (typeof COLORS)[number][]; // the main colour first
  pattern: (typeof PATTERNS)[number];
  material: (typeof MATERIALS)[number];
  season: (typeof SEASONS)[number];
  formality: (typeof FORMALITIES)[number];
  style: (typeof STYLES)[number]; // the one it reads as most
  confidence: (typeof CONFIDENCES)[number];
  // Missing on pieces scanned before the details existed (2026-11-11).
  // Where one applies but is missing, the app asks ("Please check").
  shirtKind?: (typeof SHIRT_KINDS)[number];
  neckline?: (typeof NECKLINES)[number];
  metal?: (typeof METALS)[number];
};

export const DETAILS = ["shirtKind", "neckline", "metal"] as const;
export type Detail = (typeof DETAILS)[number];

const DETAIL_TYPES: Record<Detail, readonly Type[]> = {
  shirtKind: ["shirt"],
  neckline: ["sweater"],
  metal: ["belt", "watch", "jewellery", "accessories"],
};
export const appliesTo = (detail: Detail, type: Type) => DETAIL_TYPES[detail].includes(type);

// The words a person can pick for a detail that applies. "none" only makes
// sense for metal (a fabric belt); a shirt always has some kind.
export const detailChoices = (detail: Detail) =>
  detail === "metal" ? FIELDS.metal : FIELDS[detail].filter((word) => word !== "none");

const isDetail = (field: string): field is Detail => (DETAILS as readonly string[]).includes(field);

// Details that apply to this type but have no answer yet.
export function missingDetails(tags: GarmentTags): Detail[] {
  return DETAILS.filter((detail) => {
    if (!appliesTo(detail, tags.type)) return false;
    const value = tags[detail];
    return value === undefined || (value === "none" && detail !== "metal");
  });
}

// "none" for details that don't apply to the type. The model sometimes
// answers them anyway (a neckline for a hoodie); the rules shouldn't see it.
export function normalizeTags(tags: GarmentTags): GarmentTags {
  const result = { ...tags };
  for (const detail of DETAILS) if (!appliesTo(detail, tags.type)) result[detail] = "none";
  return result;
}

// The labels a person can check and change, with the words each may take.
// `label` is free text and `confidence` is the model's own, so neither is here.
export const FIELDS = {
  type: TYPES,
  colors: COLORS,
  pattern: PATTERNS,
  material: MATERIALS,
  season: SEASONS,
  formality: FORMALITIES,
  style: STYLES,
  shirtKind: SHIRT_KINDS,
  neckline: NECKLINES,
  metal: METALS,
} as const;
export type Field = keyof typeof FIELDS;
export const FIELD_NAMES = Object.keys(FIELDS) as Field[];

// Which labels get "please check" when the model says its confidence is low.
// A first guess: type and pattern are what Scenario B gets wrong, and
// material is hard to see in a photo. Replace this list with the fields the
// confusion matrix shows are often wrong (concept v3, technical test 3).
export const CHECK_WHEN_LOW: readonly Field[] = ["type", "pattern", "material"];

// The fields still waiting for the person, and not yet checked: the unsure
// ones when confidence is low, and any detail that applies but has no answer
// (a shirt scanned before shirt kinds existed).
export function fieldsToCheck(tags: GarmentTags, checked: readonly Field[] = []): Field[] {
  const unsure = tags.confidence === "high" ? [] : CHECK_WHEN_LOW;
  return [...unsure, ...missingDetails(tags)].filter((field) => !checked.includes(field));
}

// Changes one label. A changed label counts as checked: the person looked.
export function changeLabel<F extends keyof GarmentTags>(
  tags: GarmentTags,
  checked: readonly Field[] = [],
  field: F,
  value: GarmentTags[F],
): { tags: GarmentTags; checked: Field[] } {
  const isField = (FIELD_NAMES as readonly string[]).includes(field);
  let changed: GarmentTags = { ...tags, [field]: value };
  let stillChecked = [...checked];
  // A new type can bring details that now apply (a T-shirt corrected to a
  // shirt needs a shirt kind) and make others not apply.
  if (field === "type") {
    changed = normalizeTags(changed);
    for (const detail of DETAILS) {
      if (appliesTo(detail, changed.type) && !appliesTo(detail, tags.type)) {
        delete changed[detail];
        stillChecked = stillChecked.filter((f) => f !== detail);
      }
    }
  }
  return {
    tags: changed,
    checked: isField && !stillChecked.includes(field as Field) ? [...stillChecked, field as Field] : stillChecked,
  };
}

// The same shape as GarmentTags, written as JSON Schema. LLM Hub uses it to
// force the model's reply into exactly this shape; isGarmentTags() below
// checks that it did, before anything is saved.
export const TAG_SCHEMA = {
  type: "object",
  additionalProperties: false, // strict JSON schema mode requires this
  properties: {
    label: { type: "string" },
    type: { type: "string", enum: TYPES },
    colors: { type: "array", items: { type: "string", enum: COLORS }, minItems: 1, maxItems: 3 },
    pattern: { type: "string", enum: PATTERNS },
    material: { type: "string", enum: MATERIALS },
    season: { type: "string", enum: SEASONS },
    formality: { type: "string", enum: FORMALITIES },
    style: { type: "string", enum: STYLES },
    confidence: { type: "string", enum: CONFIDENCES },
    shirtKind: { type: "string", enum: SHIRT_KINDS },
    neckline: { type: "string", enum: NECKLINES },
    metal: { type: "string", enum: METALS },
  },
  required: [
    "label", "type", "colors", "pattern", "material", "season", "formality", "style", "confidence",
    "shirtKind", "neckline", "metal",
  ],
} as const;

const isOneOf = (words: readonly string[], value: unknown) => typeof value === "string" && words.includes(value);

// "best-chat" is an alias: the model behind it can change, and a reply of the
// wrong shape, once saved, would crash the screens every time they open.
export function isGarmentTags(value: unknown): value is GarmentTags {
  if (typeof value !== "object" || value === null) return false;
  const tags = value as Record<string, unknown>;
  const { minItems, maxItems } = TAG_SCHEMA.properties.colors;
  return (
    typeof tags.label === "string" &&
    tags.label.trim() !== "" &&
    Array.isArray(tags.colors) &&
    tags.colors.length >= minItems &&
    tags.colors.length <= maxItems &&
    tags.colors.every((color) => isOneOf(COLORS, color)) &&
    // Details may be missing (pieces scanned before them), but not wrong.
    FIELD_NAMES.every(
      (field) => field === "colors" || (isDetail(field) && tags[field] === undefined) || isOneOf(FIELDS[field], tags[field]),
    ) &&
    isOneOf(CONFIDENCES, tags.confidence)
  );
}

// Sent with every request to the routes that spend the key (server/passcode.ts).
export const PASSCODE_HEADER = "x-closet-passcode";

// POST /api/tag
export type TagRequest = { photoBase64: string };
export type TagResponse = { tags: GarmentTags };
