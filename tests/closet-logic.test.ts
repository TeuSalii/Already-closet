import { describe, expect, it, vi } from "vitest";

import { close, extend, place } from "@/client/lasso";
import { closestOwned, plural } from "@/shared/closest";
import { coverageShare, coverageText, scannedPerCategory } from "@/shared/coverage";
import type { GarmentTags } from "@/shared/garment";
import { interruptedReadsFailed, type Piece } from "@/storage/closet";

import { tags } from "./helpers";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));

describe("closestOwned", () => {
  const tagsOf = (piece: GarmentTags | null) => piece;

  it("only compares pieces of the wish's category", () => {
    const result = closestOwned(tags(), [tags({ type: "jeans" })], tagsOf);
    expect(result).toMatchObject({ category: "top", scanned: 0, same: 0, closest: [] });
  });

  it("puts the same type and colour first and counts it as owned", () => {
    const same = tags();
    const close = tags({ type: "sweater", colors: ["black"], style: "classic", material: "wool" });
    const result = closestOwned(tags(), [close, same], tagsOf);
    expect(result.same).toBe(1);
    expect(result.closest.map((match) => match.piece)).toEqual([same, close]);
  });

  it("leaves out pieces that are in the category but nothing like the wish", () => {
    const unlike = tags({ type: "blouse", colors: ["pink"], pattern: "floral", material: "silk", style: "romantic", formality: "formal" });
    const result = closestOwned(tags(), [unlike], tagsOf);
    expect(result.scanned).toBe(1);
    expect(result.closest).toEqual([]);
  });

  it("skips pieces not read yet and respects the limit", () => {
    const result = closestOwned(tags(), [null, tags(), tags(), tags()], tagsOf, 2);
    expect(result.scanned).toBe(3);
    expect(result.same).toBe(3);
    expect(result.closest).toHaveLength(2);
  });

  it("never counts an unknown material as a shared label", () => {
    const wish = tags({ material: "unknown" });
    const [match] = closestOwned(wish, [wish], tagsOf).closest;
    expect(match.reasons).not.toContain("unknown");
  });
});

it("pluralises the app's clothing words", () => {
  expect(plural("hoodie", 2)).toBe("hoodies");
  expect(plural("dress", 2)).toBe("dresses");
  expect(plural("jeans", 2)).toBe("jeans");
  expect(plural("hoodie", 1)).toBe("hoodie");
});

describe("coverage", () => {
  it("counts read pieces per category", () => {
    const counts = scannedPerCategory([tags(), null, tags({ type: "boots" })]);
    expect(counts).toMatchObject({ top: 1, shoes: 1, bottom: 0 });
  });

  it("says what is scanned against the person's guess", () => {
    expect(coverageText("top", 12, 30)).toBe("12 of about 30 tops scanned");
    expect(coverageText("top", 30, 30)).toBe("30 tops scanned, about all you own");
    expect(coverageText("top", 12, undefined)).toBeNull();
  });

  it("never fills a bar past full", () => {
    expect(coverageShare(40, 30)).toBe(1);
  });
});

describe("the lasso", () => {
  const box = { x: 0, y: 0, width: 100, height: 200 };

  it("keeps a point inside the middle as it is", () => {
    expect(place({ x: 50, y: 100 }, box)).toEqual({ x: 50, y: 100, t: null });
  });

  it("sticks to the edge when close, and stays on the picture when off it", () => {
    expect(place({ x: 5, y: 50 }, box)).toMatchObject({ x: 0, y: 50 });
    expect(place({ x: 500, y: 50 }, box)).toMatchObject({ x: 100, y: 50 });
  });

  it("ignores a finger that barely moved", () => {
    const line = [place({ x: 50, y: 100 }, box)];
    expect(extend(line, { x: 51, y: 100 }, box)).toBe(line);
  });

  it("closes along the edge, through the corner between the two ends", () => {
    const top = place({ x: 50, y: 0 }, box);
    const left = place({ x: 0, y: 100 }, box);
    expect(close([top, left], box)).toEqual([top, left, { x: 0, y: 0, t: 0 }]);
  });

  it("leaves a shape alone when it does not start on the edge", () => {
    const line = [place({ x: 50, y: 100 }, box), place({ x: 0, y: 100 }, box)];
    expect(close(line, box)).toBe(line);
  });
});

describe("a piece saved while it was being read", () => {
  const base = { id: "a", photo: "file:///a.jpg", addedAt: "2026-11-08", origin: "gift" as const };

  it("becomes one that can be tried again, keeping what the person chose", () => {
    expect(interruptedReadsFailed([{ ...base, status: "reading" }])).toEqual([{ ...base, status: "failed" }]);
  });

  it("leaves finished pieces untouched", () => {
    const read: Piece = { ...base, status: "read", tags: tags(), checked: ["type"] };
    expect(interruptedReadsFailed([read])).toEqual([read]);
  });
});
