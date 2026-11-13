import { appendFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as checkPasscode, POST as outfitPost } from "@/app/api/outfit+api";
import { PASSCODE_HEADER } from "@/shared/garment";
import type { OutfitPiece } from "@/shared/outfit/pieces";

import { CLOSETS, REQUESTS, TODAY } from "./fixtures/closets";
import { tags } from "./helpers";

// Tests for POST /api/outfit (steps 1–4 of the pipeline). The network and
// the log file are faked: nothing here costs money or sends data anywhere.
vi.mock("node:fs", () => ({ appendFileSync: vi.fn(), mkdirSync: vi.fn() }));

const KEY = "not-a-real-key-1234567890";
const CODE = "not-a-real-passcode";
const hub = vi.fn<typeof fetch>();
const logged = () => vi.mocked(appendFileSync).mock.calls.map((call) => String(call[1])).join("");

const REQUEST = REQUESTS["casual day"];
const PIECES = CLOSETS.casual.pieces;

function post(body: object, { code = CODE } = {}) {
  return new Request("http://192.168.1.5:8081/api/outfit", {
    method: "POST",
    headers: { "Content-Type": "application/json", [PASSCODE_HEADER]: code },
    body: JSON.stringify(body),
  });
}

function hubPicks(picks: { index: number; reason: string }[], model = "best-chat") {
  hub.mockResolvedValue(
    Response.json({ model, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ picks }), refusal: null } }] }),
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", hub);
  vi.stubEnv("LLM_API_KEY", KEY);
  vi.stubEnv("APP_PASSCODE", CODE);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  hub.mockReset();
  vi.mocked(appendFileSync).mockReset();
});

describe("GET /api/outfit", () => {
  it("checks the passcode without spending anything", () => {
    const check = (code?: string) =>
      checkPasscode(new Request("http://192.168.1.5:8081/api/outfit", { headers: code !== undefined ? { [PASSCODE_HEADER]: code } : {} }));
    expect(check(CODE).status).toBe(204);
    expect(check("wrong").status).toBe(401);
    expect(hub).not.toHaveBeenCalled();
  });
});

describe("POST /api/outfit", () => {
  it("refuses without the passcode, before calling anyone", async () => {
    expect((await outfitPost(post({ pieces: PIECES, request: REQUEST }, { code: "wrong" }))).status).toBe(401);
    expect(hub).not.toHaveBeenCalled();
  });

  it("returns 3 AI-picked suggestions with the AI's reasons", async () => {
    hubPicks([
      { index: 0, reason: "Classic casual look" },
      { index: 2, reason: "Light and fresh for the day" },
      { index: 1, reason: "Layered for warmth" },
    ]);
    const response = await outfitPost(post({ pieces: PIECES, request: REQUEST, today: TODAY }));
    const { suggestions, aiUsed, notEnough } = await response.json();
    expect(response.status).toBe(200);
    expect(notEnough).toBeNull();
    expect(aiUsed).toBe(true);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0].reason).toBe("Classic casual look");
    expect(suggestions[2].reason).toBe("Layered for warmth");
    expect(suggestions[0].pieces).toBeDefined();
    expect(suggestions[0].score).toBeDefined();
  });

  it("falls back to top 3 when the AI returns all invalid indices", async () => {
    hubPicks([{ index: 999, reason: "out of range" }]);
    const response = await outfitPost(post({ pieces: PIECES, request: REQUEST, today: TODAY }));
    const { aiUsed, suggestions } = await response.json();
    expect(response.status).toBe(200);
    expect(aiUsed).toBe(false);
    expect(suggestions).toHaveLength(3);
    expect(logged()).toContain('"usedFallback":true');
    expect(logged()).toContain('"invalidIndices":[999]');
  });

  it("falls back to top 3 when the AI call fails", async () => {
    hub.mockRejectedValue(new Error("network error"));
    const { aiUsed, suggestions } = await (await outfitPost(post({ pieces: PIECES, request: REQUEST }))).json();
    expect(aiUsed).toBe(false);
    expect(suggestions).toHaveLength(3);
    expect(logged()).toContain('"usedFallback":true');
  });

  it("skips the AI and uses score reasons when ai is false", async () => {
    const response = await outfitPost(post({ pieces: PIECES, request: REQUEST, today: TODAY, ai: false }));
    const { aiUsed, suggestions } = await response.json();
    expect(aiUsed).toBe(false);
    expect(hub).not.toHaveBeenCalled();
    expect(suggestions).toHaveLength(3);
    expect(typeof suggestions[0].reason).toBe("string");
    expect(suggestions[0].reason.length).toBeGreaterThan(0);
  });

  it("returns notEnough when the closet has nothing suitable for the request", async () => {
    const tiny: OutfitPiece[] = [{ id: "1", tags: tags({ type: "t-shirt" }) }];
    const response = await outfitPost(post({ pieces: tiny, request: REQUEST }));
    const { notEnough, suggestions } = await response.json();
    expect(response.status).toBe(200);
    expect(notEnough).toContain("Not enough pieces");
    expect(suggestions).toHaveLength(0);
    expect(hub).not.toHaveBeenCalled();
  });

  it("logs the pick entry with source outfit-api and without the key", async () => {
    hubPicks([
      { index: 0, reason: "Good match" },
      { index: 1, reason: "Classic" },
      { index: 2, reason: "Warm" },
    ]);
    await outfitPost(post({ pieces: PIECES, request: REQUEST }));
    expect(logged()).toContain('"source":"outfit-api"');
    expect(logged()).toContain('"occasion":"casual"');
    expect(logged()).not.toContain(KEY);
  });

  it("still answers when the log cannot be written", async () => {
    hubPicks([
      { index: 0, reason: "Good match" },
      { index: 1, reason: "Classic" },
      { index: 2, reason: "Warm" },
    ]);
    vi.mocked(appendFileSync).mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    expect((await outfitPost(post({ pieces: PIECES, request: REQUEST }))).status).toBe(200);
  });

  it("falls back without calling LLM Hub when the key is missing", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const { aiUsed, suggestions } = await (await outfitPost(post({ pieces: PIECES, request: REQUEST }))).json();
    expect(hub).not.toHaveBeenCalled();
    expect(aiUsed).toBe(false);
    expect(suggestions).toHaveLength(3);
  });

  it("validates: pieces must be an array", async () => {
    expect((await outfitPost(post({ pieces: "oops", request: REQUEST }))).status).toBe(400);
    expect(hub).not.toHaveBeenCalled();
  });

  it("validates: each piece needs a string id and valid tags", async () => {
    const noId = [{ tags: tags() }];
    expect((await outfitPost(post({ pieces: noId, request: REQUEST }))).status).toBe(400);

    const badTags = [{ id: "x", tags: { label: "cape", type: "cape", colors: ["black"], pattern: "solid", material: "cotton", season: "all-year", formality: "casual", style: "classic", confidence: "high" } }];
    expect((await outfitPost(post({ pieces: badTags, request: REQUEST }))).status).toBe(400);

    expect(hub).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid occasion", { occasion: "opera", season: "summer", time: "day" }],
    ["invalid season", { occasion: "casual", season: "spring", time: "day" }],
    ["invalid time", { occasion: "casual", season: "summer", time: "noon" }],
    ["not an object", "casual"],
  ])("validates: request with %s", async (_name, req) => {
    expect((await outfitPost(post({ pieces: PIECES, request: req }))).status).toBe(400);
    expect(hub).not.toHaveBeenCalled();
  });

  it("deduplicated the AI's picks when it returns the same index twice", async () => {
    hubPicks([
      { index: 0, reason: "First choice" },
      { index: 0, reason: "Same outfit again" },
      { index: 1, reason: "Second choice" },
    ]);
    const { suggestions, aiUsed } = await (await outfitPost(post({ pieces: PIECES, request: REQUEST, today: TODAY }))).json();
    expect(aiUsed).toBe(true);
    // Index 0 appears only once, then index 1.
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].reason).toBe("First choice");
    expect(suggestions[1].reason).toBe("Second choice");
  });
});
