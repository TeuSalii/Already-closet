import { describe, expect, it } from "vitest";

import { COLORS, type GarmentTags } from "@/shared/garment";
import { BOLD, type Color, COLOR_INFO, deltaE, lightness, matches, NEUTRALS } from "@/shared/outfit/colors";
import { colorMood, formalityGap, OCCASION_RULES, OCCASIONS, type OutfitRequest } from "@/shared/outfit/occasions";
import type { OutfitPiece } from "@/shared/outfit/pieces";
import { checkOutfit, HARD_RULES } from "@/shared/outfit/rules";

import { tags } from "./helpers";

// Test 1 in docs/outfit-pipeline.md: each hard rule on its own. Where the
// Mens Fashioner PDFs show a ✅ or ❌ example, the test uses it.

let next = 0;
function piece(label: string, overrides: Partial<GarmentTags>, extra: Partial<OutfitPiece> = {}): OutfitPiece {
  next += 1;
  return {
    id: `p${next}`,
    tags: tags({ label, season: "all-year", formality: "casual", pattern: "solid", material: "cotton", ...overrides }),
    ...extra,
  };
}

const tee = (color: Color = "white") => piece(`${color} tee`, { type: "t-shirt", colors: [color] });
const jeans = () => piece("blue jeans", { type: "jeans", colors: ["blue"], material: "denim" });
const whiteSneakers = () => piece("white sneakers", { type: "sneakers", colors: ["white"], material: "leather" });

const casualDay: OutfitRequest = { occasion: "casual", season: "transitional", time: "day" };

// Rule ids an outfit breaks.
const broken = (outfit: OutfitPiece[], request = casualDay) => checkOutfit(outfit, request).map((v) => v.rule);

describe("a plain outfit", () => {
  it("white tee, blue jeans and white sneakers break nothing", () => {
    expect(checkOutfit([tee(), jeans(), whiteSneakers()], casualDay)).toEqual([]);
  });
});

describe("H1 what an outfit is made of", () => {
  it("accepts a dress with shoes and no bottom", () => {
    const dress = piece("navy dress", { type: "dress", colors: ["navy"] });
    expect(broken([dress, whiteSneakers()])).not.toContain("H1");
  });

  it.each([
    ["no bottom", () => [tee(), whiteSneakers()]],
    ["two bottoms", () => [tee(), jeans(), jeans(), whiteSneakers()]],
    ["no shoes", () => [tee(), jeans()]],
    ["two pairs of shoes", () => [tee(), jeans(), whiteSneakers(), whiteSneakers()]],
    ["a dress and a bottom", () => [piece("navy dress", { type: "dress", colors: ["navy"] }), jeans(), whiteSneakers()]],
  ])("refuses %s", (_name, outfit) => {
    expect(broken(outfit())).toContain("H1");
  });

  it("refuses a T-shirt or blouse with a dress, accepts a cardigan over it", () => {
    const dress = () => piece("black dress", { type: "dress", colors: ["black"] });
    const blouse = piece("cream blouse", { type: "blouse", colors: ["cream"] });
    const cardigan = piece("beige cardigan", { type: "cardigan", colors: ["beige"] });
    expect(broken([dress(), blouse, whiteSneakers()])).toContain("H1");
    expect(broken([dress(), cardigan, whiteSneakers()])).not.toContain("H1");
  });

  it("refuses the same piece twice", () => {
    const shirt = tee();
    expect(broken([shirt, shirt, jeans(), whiteSneakers()])).toContain("H1");
  });
});

describe("layering", () => {
  const oxford = () => piece("white oxford", { type: "shirt", colors: ["white"] }, { shirtKind: "dress" });
  const crewSweater = () => piece("gray crewneck", { type: "sweater", colors: ["gray"], material: "wool" }, { neckline: "crew" });
  const vSweater = () => piece("gray v-neck", { type: "sweater", colors: ["gray"], material: "wool" }, { neckline: "v-neck" });
  const jacket = () => piece("navy bomber", { type: "jacket", colors: ["navy"], material: "nylon" });
  const coat = () => piece("camel coat", { type: "coat", colors: ["tan"], material: "wool", season: "winter" });
  const winter: OutfitRequest = { ...casualDay, season: "winter" };

  // Layering 101: "T-shirt + coat. He skipped 3 layers."
  it("H3 refuses a T-shirt straight under a coat", () => {
    expect(broken([tee(), coat(), jeans(), whiteSneakers()], winter)).toContain("H3");
  });

  it("H3 refuses two pieces on the same layer", () => {
    expect(broken([tee(), tee("black"), jeans(), whiteSneakers()])).toContain("H3");
  });

  it("H3 accepts a T-shirt under a sweater under a jacket", () => {
    const sweater = piece("gray sweatshirt", { type: "sweater", colors: ["gray"] });
    expect(broken([tee(), sweater, jacket(), jeans(), whiteSneakers()], winter)).not.toContain("H3");
  });

  // Layering 101: "2 or 3 visible layers".
  it("H2 refuses four layers", () => {
    expect(broken([tee(), oxford(), vSweater(), jacket(), jeans(), whiteSneakers()], winter)).toContain("H2");
  });

  it("H16 allows three layers in winter only", () => {
    const outfit = () => [oxford(), vSweater(), jacket(), jeans(), whiteSneakers()];
    expect(broken(outfit(), winter)).not.toContain("H16");
    expect(broken(outfit(), casualDay)).toContain("H16");
  });

  // Layering 101, "Beware: polo shirts".
  it("H4 refuses a polo under a sweater, accepts it under a blazer", () => {
    const polo = () => piece("navy polo", { type: "polo", colors: ["navy"] });
    const blazer = piece("gray blazer", { type: "blazer", colors: ["gray"], material: "wool" });
    expect(broken([polo(), crewSweater(), jeans(), whiteSneakers()])).toContain("H4");
    expect(broken([polo(), blazer, jeans(), whiteSneakers()])).not.toContain("H4");
  });

  it("H5 refuses a crew-neck over an oxford, accepts a V-neck", () => {
    expect(broken([oxford(), crewSweater(), jeans(), whiteSneakers()])).toContain("H5");
    expect(broken([oxford(), vSweater(), jeans(), whiteSneakers()])).not.toContain("H5");
  });

  it("H5 treats a plain shirt as a dress shirt until told otherwise", () => {
    const shirt = piece("white shirt", { type: "shirt", colors: ["white"] });
    expect(broken([shirt, crewSweater(), jeans(), whiteSneakers()])).toContain("H5");
  });

  it("H13 refuses a jacket on bare skin", () => {
    expect(broken([jacket(), jeans(), whiteSneakers()])).toContain("H13");
  });

  it("H14 refuses a sweater over a flannel", () => {
    const flannel = piece("green flannel", { type: "shirt", colors: ["green"], pattern: "plaid" }, { shirtKind: "flannel" });
    expect(broken([flannel, vSweater(), jeans(), whiteSneakers()])).toContain("H14");
  });

  it("H15 wants a T-shirt under a cardigan", () => {
    const cardigan = () => piece("gray cardigan", { type: "cardigan", colors: ["gray"], material: "knit" });
    const casualShirt = piece("blue shirt", { type: "shirt", colors: ["blue"] }, { shirtKind: "casual" });
    expect(broken([casualShirt, cardigan(), jeans(), whiteSneakers()])).toContain("H15");
    expect(broken([tee(), cardigan(), jeans(), whiteSneakers()])).not.toContain("H15");
  });
});

describe("H6 at most 3 colours", () => {
  it("accepts 3 colours", () => {
    const outfit = [tee("white"), piece("olive chinos", { type: "pants", colors: ["olive"] }), piece("brown boots", { type: "boots", colors: ["brown"] })];
    expect(broken(outfit)).not.toContain("H6");
  });

  it("refuses 4 colours that are not neutral", () => {
    const outfit = [
      piece("burgundy tee", { type: "t-shirt", colors: ["burgundy"] }),
      piece("olive chinos", { type: "pants", colors: ["olive"] }),
      piece("brown boots", { type: "boots", colors: ["brown"] }),
      piece("blue jacket", { type: "jacket", colors: ["light-blue"] }),
    ];
    expect(broken(outfit)).toContain("H6");
  });

  // Spring & Summer: "Neutral whites (shirts, shoes) don't count unless
  // they're major pieces like jackets."
  it("doesn't count a white tee past 3 colours, nor accessories", () => {
    const outfit = [
      tee("white"),
      piece("olive chinos", { type: "pants", colors: ["olive"] }),
      piece("burgundy overshirt", { type: "jacket", colors: ["burgundy"] }),
      piece("brown sneakers", { type: "sneakers", colors: ["brown"], material: "leather" }),
      piece("blue cap", { type: "hat", colors: ["blue"] }),
      piece("pink socks", { type: "socks", colors: ["pink"] }),
    ];
    expect(broken(outfit)).not.toContain("H6");
  });

  it("counts a white jacket", () => {
    const outfit = [
      piece("burgundy tee", { type: "t-shirt", colors: ["burgundy"] }),
      piece("olive chinos", { type: "pants", colors: ["olive"] }),
      piece("white jacket", { type: "jacket", colors: ["white"] }),
      piece("brown boots", { type: "boots", colors: ["brown"] }),
    ];
    expect(broken(outfit)).toContain("H6");
  });
});

describe("H7 one standout", () => {
  // Spring & Summer, "How to wear bold colours": a rust suede jacket with a
  // patterned shirt and bright chinos. "The shirt pattern is competing for
  // attention with the bold-colored jacket."
  it("refuses the rust jacket with a patterned shirt", () => {
    const outfit = [
      piece("floral shirt", { type: "shirt", colors: ["white", "blue"], pattern: "floral" }, { shirtKind: "casual" }),
      piece("rust suede jacket", { type: "jacket", colors: ["orange"], material: "suede" }),
      piece("blue chinos", { type: "pants", colors: ["blue"] }),
      piece("brown sneakers", { type: "sneakers", colors: ["brown"], material: "leather" }),
    ];
    expect(broken(outfit)).toContain("H7");
  });

  it("accepts one bold piece with neutral clothes", () => {
    const outfit = [piece("red sweater", { type: "sweater", colors: ["red"] }), piece("gray pants", { type: "pants", colors: ["gray"] }), whiteSneakers()];
    expect(broken(outfit)).not.toContain("H7");
  });
});

describe("leather and metals", () => {
  const brownBoots = () => piece("brown boots", { type: "boots", colors: ["brown"], material: "leather" });
  const outfit = () => [tee("white"), piece("tan chinos", { type: "pants", colors: ["tan"] })];

  it("H8 wants the belt to match leather shoes", () => {
    const tanBelt = piece("tan belt", { type: "belt", colors: ["tan"], material: "leather" });
    const brownBelt = piece("brown belt", { type: "belt", colors: ["brown"], material: "leather" });
    expect(broken([...outfit(), brownBoots(), tanBelt])).toContain("H8");
    expect(broken([...outfit(), brownBoots(), brownBelt])).not.toContain("H8");
  });

  it("H8 includes a leather watch strap", () => {
    const strap = piece("tan watch", { type: "accessories", colors: ["tan"], material: "leather" }, { accessory: "watch" });
    expect(broken([...outfit(), brownBoots(), strap])).toContain("H8");
  });

  it("H8 doesn't apply to sneakers", () => {
    const tanBelt = piece("tan belt", { type: "belt", colors: ["tan"], material: "leather" });
    expect(broken([...outfit(), whiteSneakers(), tanBelt])).not.toContain("H8");
  });

  // Spring & Summer, "Matching metals": gold jewellery with a silver buckle.
  it("H9 refuses silver with gold", () => {
    const belt = piece("brown belt", { type: "belt", colors: ["brown"], material: "leather" }, { metal: "silver" });
    const chain = piece("gold chain", { type: "accessories", colors: ["gold"] }, { metal: "gold", accessory: "jewellery" });
    expect(broken([...outfit(), brownBoots(), belt, chain])).toContain("H9");
    expect(broken([...outfit(), brownBoots(), belt])).not.toContain("H9");
  });
});

describe("H10 formality and H11 season", () => {
  const formal: OutfitRequest = { occasion: "formal", season: "transitional", time: "evening" };

  it("H10 refuses a hoodie at a formal occasion", () => {
    const hoodie = piece("gray hoodie", { type: "hoodie", colors: ["gray"] });
    expect(broken([hoodie, jeans(), whiteSneakers()], formal)).toContain("H10");
  });

  it("H10 allows one step: sneakers with smart casual", () => {
    const smart: OutfitRequest = { ...casualDay, occasion: "smart-casual" };
    const shirt = piece("white oxford", { type: "shirt", colors: ["white"], formality: "smart-casual" });
    const chinos = piece("navy chinos", { type: "pants", colors: ["navy"], formality: "smart-casual" });
    expect(broken([shirt, chinos, whiteSneakers()], smart)).not.toContain("H10");
  });

  it("H11 accepts a transitional sweater in winter, refuses a winter coat in spring", () => {
    const sweater = piece("gray sweater", { type: "sweater", colors: ["gray"], season: "transitional" });
    const coat = piece("wool coat", { type: "coat", colors: ["gray"], season: "winter" });
    expect(broken([tee(), sweater, jeans(), whiteSneakers()], { ...casualDay, season: "winter" })).not.toContain("H11");
    expect(broken([tee(), sweater, coat, jeans(), whiteSneakers()], casualDay)).toContain("H11");
  });

  it("H11 refuses a winter coat in summer, accepts all-year pieces", () => {
    const summer: OutfitRequest = { ...casualDay, season: "summer" };
    const coat = piece("wool coat", { type: "coat", colors: ["gray"], season: "winter" });
    expect(broken([tee(), coat, jeans(), whiteSneakers()], summer)).toContain("H11");
    expect(broken([tee(), jeans(), whiteSneakers()], summer)).not.toContain("H11");
  });
});

describe("H12 black", () => {
  const blackJeans = () => piece("black jeans", { type: "jeans", colors: ["black"], material: "denim" });

  // Spring & Summer, "Matching shoes": a tan jacket, white tee and light
  // jeans with black loafers. "The outfit contains no black which is why the
  // black shoes feel so heavy and dark."
  it("refuses black loafers with no black in the outfit", () => {
    const outfit = [
      tee("white"),
      piece("tan overshirt", { type: "jacket", colors: ["tan"] }),
      piece("light jeans", { type: "jeans", colors: ["light-blue"], material: "denim" }),
      piece("black loafers", { type: "shoes", colors: ["black"], material: "leather" }),
    ];
    expect(broken(outfit)).toContain("H12");
  });

  it("refuses brown boots with black jeans, accepts white sneakers", () => {
    const boots = piece("brown boots", { type: "boots", colors: ["brown"], material: "leather" });
    expect(broken([tee(), blackJeans(), boots])).toContain("H12");
    expect(broken([tee(), blackJeans(), whiteSneakers()])).not.toContain("H12");
  });

  it("wants the belt black when the outfit has black", () => {
    const belt = piece("brown belt", { type: "belt", colors: ["brown"], material: "leather" });
    expect(broken([tee(), blackJeans(), whiteSneakers(), belt])).toContain("H12");
  });

  it("allows black shoes with a navy suit", () => {
    const suit = [
      piece("white shirt", { type: "shirt", colors: ["white"], formality: "formal" }),
      piece("navy blazer", { type: "blazer", colors: ["navy"], formality: "formal" }),
      piece("navy trousers", { type: "pants", colors: ["navy"], formality: "formal" }),
      piece("black oxfords", { type: "shoes", colors: ["black"], material: "leather", formality: "formal" }),
    ];
    expect(broken(suit, { occasion: "formal", season: "transitional", time: "evening" })).not.toContain("H12");
  });

  it("allows a black belt when the outfit is only gray and white", () => {
    const outfit = [tee("white"), piece("gray pants", { type: "pants", colors: ["gray"] }), whiteSneakers(), piece("black belt", { type: "belt", colors: ["black"] })];
    expect(broken(outfit)).not.toContain("H12");
  });
});

it("every hard rule is broken by at least one test outfit", () => {
  // Guards against a rule that can never fire, e.g. after a typo in a type name.
  const cases: [OutfitPiece[], OutfitRequest][] = [
    [[tee(), whiteSneakers()], casualDay],
    [[tee(), piece("a", { type: "shirt", colors: ["white"] }), piece("b", { type: "sweater", colors: ["gray"] }), piece("c", { type: "jacket", colors: ["navy"] }), jeans(), whiteSneakers()], casualDay],
    [[tee(), piece("coat", { type: "coat", colors: ["gray"] }), jeans(), whiteSneakers()], casualDay],
    [[piece("polo", { type: "polo", colors: ["navy"] }), piece("sw", { type: "sweater", colors: ["gray"] }), jeans(), whiteSneakers()], casualDay],
    [[piece("r", { type: "t-shirt", colors: ["red"] }), piece("y", { type: "pants", colors: ["yellow"] }), piece("p", { type: "jacket", colors: ["purple"] }), piece("o", { type: "sneakers", colors: ["orange"] })], casualDay],
    [[tee(), jeans(), piece("boots", { type: "boots", colors: ["brown"], material: "leather" }), piece("belt", { type: "belt", colors: ["tan"] }, { metal: "gold" }), piece("w", { type: "accessories", colors: ["silver"] }, { metal: "silver" })], casualDay],
    [[piece("hoodie", { type: "hoodie", colors: ["gray"], season: "winter" }), jeans(), whiteSneakers()], { occasion: "formal", season: "summer", time: "day" }],
    [[tee("black"), jeans(), piece("tan boots", { type: "boots", colors: ["tan"] })], casualDay],
    [[piece("jacket", { type: "jacket", colors: ["navy"] }), jeans(), whiteSneakers()], casualDay],
    [[piece("flannel", { type: "shirt", colors: ["green"] }, { shirtKind: "flannel" }), piece("sw", { type: "sweater", colors: ["gray"] }), jeans(), whiteSneakers()], casualDay],
    [[piece("shirt", { type: "shirt", colors: ["blue"] }, { shirtKind: "casual" }), piece("cardigan", { type: "cardigan", colors: ["gray"] }), jeans(), whiteSneakers()], casualDay],
  ];
  const fired = new Set(cases.flatMap(([outfit, request]) => broken(outfit, request)));
  expect([...fired].sort()).toEqual(HARD_RULES.map((rule) => rule.id).sort());
});

describe("colour table", () => {
  it("has a shade for every colour word", () => {
    for (const color of COLORS) expect(COLOR_INFO[color].hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("orders lightness the way people see it", () => {
    const sorted = [...COLORS].sort((a, b) => lightness(a) - lightness(b));
    expect(sorted[0]).toBe("black");
    expect(sorted.at(-1)).toBe("white");
    expect(lightness("navy")).toBeLessThan(lightness("blue"));
    expect(lightness("blue")).toBeLessThan(lightness("light-blue"));
    expect(lightness("tan")).toBeLessThan(lightness("beige"));
  });

  it("measures distance: a colour matches itself, not its opposite", () => {
    expect(deltaE("navy", "navy")).toBe(0);
    expect(matches("navy", "navy")).toBe(true);
    expect(matches("black", "white")).toBe(false);
    expect(deltaE("navy", "black")).toBeLessThan(deltaE("navy", "yellow"));
  });

  it("never calls a colour both neutral and bold", () => {
    expect(NEUTRALS.filter((color) => BOLD.includes(color))).toEqual([]);
  });

  it("gives hue in degrees: red near 0, blue near 215", () => {
    const [redHue] = COLOR_INFO.red.hsl;
    expect(Math.min(redHue, 360 - redHue)).toBeLessThan(10);
    expect(COLOR_INFO.blue.hsl[0]).toBeGreaterThan(200);
    expect(COLOR_INFO.blue.hsl[0]).toBeLessThan(230);
  });
});

describe("occasions", () => {
  it("covers every occasion", () => {
    for (const occasion of OCCASIONS) expect(OCCASION_RULES[occasion].label).not.toBe("");
  });

  it("wants lighter colours by day and darker in the evening, where the occasion says so", () => {
    expect(colorMood({ occasion: "casual", season: "summer", time: "day" })).toBe("lighter");
    expect(colorMood({ occasion: "cocktail", season: "summer", time: "evening" })).toBe("darker");
    expect(colorMood({ occasion: "formal", season: "summer", time: "day" })).toBe("darker");
    expect(colorMood({ occasion: "business-casual", season: "summer", time: "day" })).toBeNull();
  });

  it("counts formality steps", () => {
    expect(formalityGap("casual", "formal")).toBe(2);
    expect(formalityGap("smart-casual", "casual")).toBe(1);
  });
});
