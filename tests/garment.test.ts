import { describe, expect, it } from "vitest";

import { CATEGORIES, categoryOf, changeLabel, fieldsToCheck, isGarmentTags, TYPES } from "@/shared/garment";

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
