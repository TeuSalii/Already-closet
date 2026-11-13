import { describe, expect, it } from "vitest";

import {
  CATEGORIES, categoryOf, changeLabel, detailChoices, fieldsToCheck, isGarmentTags, missingDetails, normalizeTags,
  TAG_SCHEMA, TYPES,
} from "@/shared/garment";

import { tags } from "./helpers";

describe("isGarmentTags", () => {
  it("accepts a complete answer", () => {
    expect(isGarmentTags(tags())).toBe(true);
    expect(isGarmentTags(tags({ colors: ["black", "white", "red"] }))).toBe(true);
  });

  it.each([
    ["nothing", null],
    ["a list", []],
    ["text", "hoodie"],
    ["a blank label", tags({ label: "  " })],
    ["an unknown type", tags({ type: "cape" as never })],
    ["no colours", tags({ colors: [] })],
    ["four colours", tags({ colors: ["black", "white", "red", "blue"] })],
    ["an unknown colour", tags({ colors: ["teal" as never] })],
    ["colours that are not a list", tags({ colors: "black" as never })],
    ["an unknown confidence", tags({ confidence: "medium" as never })],
    ["a missing season", { ...tags(), season: undefined }],
  ])("refuses %s", (_name, value) => {
    expect(isGarmentTags(value)).toBe(false);
  });
});

it("gives every type a category", () => {
  for (const type of TYPES) expect(CATEGORIES).toContain(categoryOf(type));
});

describe("fieldsToCheck", () => {
  it("asks nothing when the model is sure", () => {
    expect(fieldsToCheck(tags())).toEqual([]);
  });

  it("asks for the flagged labels not yet checked", () => {
    expect(fieldsToCheck(tags({ confidence: "low" }), ["type"])).toEqual(["pattern", "material"]);
  });
});

describe("changeLabel", () => {
  it("counts a changed label as checked, once", () => {
    const first = changeLabel(tags(), [], "pattern", "striped");
    expect(first.tags.pattern).toBe("striped");
    expect(first.checked).toEqual(["pattern"]);
    expect(changeLabel(first.tags, first.checked, "pattern", "solid").checked).toEqual(["pattern"]);
  });

  it("does not count the free-text name as a checked label", () => {
    expect(changeLabel(tags(), [], "label", "my hoodie").checked).toEqual([]);
  });
});

describe("details: shirt kind, neckline, metal", () => {
  it("accepts tags without them (pieces scanned before they existed)", () => {
    expect(isGarmentTags(tags({ type: "shirt" }))).toBe(true);
  });

  it("accepts known words and refuses unknown ones", () => {
    expect(isGarmentTags(tags({ type: "sweater", neckline: "v-neck" }))).toBe(true);
    expect(isGarmentTags(tags({ type: "sweater", neckline: "boat" as never }))).toBe(false);
    expect(isGarmentTags(tags({ type: "belt", metal: "copper" as never }))).toBe(false);
  });

  it("are required from the model", () => {
    expect(TAG_SCHEMA.required).toEqual(expect.arrayContaining(["shirtKind", "neckline", "metal"]));
  });

  it("are set to none where they don't apply", () => {
    const tidy = normalizeTags(tags({ type: "hoodie", neckline: "crew", shirtKind: "dress", metal: "gold" }));
    expect(tidy).toMatchObject({ neckline: "none", shirtKind: "none", metal: "none" });
    expect(normalizeTags(tags({ type: "sweater", neckline: "crew" })).neckline).toBe("crew");
    expect(normalizeTags(tags({ type: "watch", metal: "gold" })).metal).toBe("gold");
  });

  it("asks for a detail that applies but has no answer, even when the model is sure", () => {
    expect(missingDetails(tags({ type: "shirt" }))).toEqual(["shirtKind"]);
    expect(fieldsToCheck(tags({ type: "shirt", confidence: "high" }))).toEqual(["shirtKind"]);
    expect(fieldsToCheck(tags({ type: "shirt", shirtKind: "none" }))).toEqual(["shirtKind"]);
    expect(fieldsToCheck(tags({ type: "shirt", shirtKind: "casual" }))).toEqual([]);
    expect(fieldsToCheck(tags({ type: "shirt" }), ["shirtKind"])).toEqual([]);
  });

  it("accepts no metal on a belt: a fabric belt has none", () => {
    expect(fieldsToCheck(tags({ type: "belt", metal: "none" }))).toEqual([]);
    expect(detailChoices("metal")).toContain("none");
    expect(detailChoices("shirtKind")).not.toContain("none");
  });

  it("asks again when a corrected type brings a new detail", () => {
    const tee = normalizeTags(tags({ type: "t-shirt" }));
    const corrected = changeLabel(tee, ["shirtKind"], "type", "shirt");
    expect(corrected.tags.shirtKind).toBeUndefined();
    expect(fieldsToCheck(corrected.tags, corrected.checked)).toEqual(["shirtKind"]);
  });

  it("drops a detail when a corrected type no longer has it", () => {
    const shirt = tags({ type: "shirt", shirtKind: "flannel" });
    expect(changeLabel(shirt, [], "type", "t-shirt").tags.shirtKind).toBe("none");
  });
});
