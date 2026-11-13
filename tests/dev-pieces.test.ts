import { appendFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as devIndex } from "@/app/dev/index+api";
import { GET as piecesPage, POST as piecesSend } from "@/app/dev/pieces+api";
import { renderPrompt } from "@/server/outfit-photo";
import { PASSCODE_HEADER } from "@/shared/garment";

import { tags } from "./helpers";

// /dev and /dev/pieces. The network and the log are faked: nothing here costs
// money or sends a photo anywhere.
vi.mock("node:fs", () => ({ appendFileSync: vi.fn(), mkdirSync: vi.fn() }));

const HUB_KEY = "not-a-real-hub-key-1234567890";
const GEMINI_KEY = "not-a-real-gemini-key-0987654321";
const CODE = "not-a-real-passcode";
const PHOTO = "A".repeat(200);
const net = vi.fn<typeof fetch>();
const logged = () => vi.mocked(appendFileSync).mock.calls.map((call) => String(call[1])).join("");

const get = (path: string, host = "localhost:8081") => new Request(`http://${host}${path}`, { headers: { host } });
const post = (body: object, { host = "localhost:8081", code = CODE } = {}) =>
  new Request(`http://${host}/dev/pieces`, {
    method: "POST",
    headers: { host, "Content-Type": "application/json", [PASSCODE_HEADER]: code },
    body: JSON.stringify(body),
  });

function hubLists(pieces: unknown[]) {
  net.mockResolvedValueOnce(
    Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ pieces }), refusal: null } }] }),
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", net);
  vi.stubEnv("LLM_API_KEY", HUB_KEY);
  vi.stubEnv("GEMINI_API_KEY", GEMINI_KEY);
  vi.stubEnv("APP_PASSCODE", CODE);
  vi.stubEnv("NODE_ENV", "development");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("/dev", () => {
  it("links every dev page", async () => {
    const page = await devIndex(get("/dev")).text();
    for (const path of ["/dev/test", "/dev/outfits", "/dev/pieces"]) expect(page).toContain(`href="${path}"`);
  });

  it("is not found from another device", () => {
    expect(devIndex(get("/dev", "192.168.1.5:8081")).status).toBe(404);
  });
});

describe("/dev/pieces", () => {
  it("opens on localhost only, without the passcode in the page", async () => {
    const page = await piecesPage(get("/dev/pieces")).text();
    expect(page).toContain("Outfit photo → pieces");
    expect(page).not.toContain(CODE);
    expect(piecesPage(get("/dev/pieces", "192.168.1.5:8081")).status).toBe(404);
  });

  it("refuses without the passcode, before calling anyone", async () => {
    const response = await piecesSend(post({ step: "list", photoBase64: PHOTO }, { code: "wrong" }));
    expect(response.status).toBe(401);
    expect(net).not.toHaveBeenCalled();
  });

  it("lists the pieces with the app's tag words", async () => {
    hubLists([tags({ label: "white tee", type: "t-shirt" }), tags({ label: "blue jeans", type: "jeans" })]);
    const response = await piecesSend(post({ step: "list", photoBase64: PHOTO }));
    const { pieces } = await response.json();
    expect(pieces.map((p: { label: string }) => p.label)).toEqual(["white tee", "blue jeans"]);
    expect(String(net.mock.calls[0][0])).toContain("llmhub");
    expect(logged()).toContain('"step":"list"');
    expect(logged()).not.toContain(PHOTO);
  });

  it("refuses a list with words outside the tag lists", async () => {
    hubLists([{ ...tags(), colors: ["sky blue"] }]);
    const response = await piecesSend(post({ step: "list", photoBase64: PHOTO }));
    expect(response.status).toBe(502);
  });

  it("draws a piece with Gemini, the key in a header and not the URL", async () => {
    net.mockResolvedValueOnce(
      Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "iVBORw0KGgo" } }] } }] }),
    );
    const response = await piecesSend(post({ step: "render", photoBase64: PHOTO, piece: tags({ label: "white tee" }) }));
    expect(await response.json()).toEqual({ mimeType: "image/png", base64: "iVBORw0KGgo" });
    const [url, init] = net.mock.calls[0];
    expect(String(url)).toContain("generativelanguage.googleapis.com");
    expect(String(url)).not.toContain(GEMINI_KEY);
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe(GEMINI_KEY);
    expect(String(init?.body)).toContain("white tee");
  });

  it("says why when Gemini draws nothing, without the key or the photo", async () => {
    net.mockResolvedValueOnce(new Response(`bad key ${GEMINI_KEY} for ${"B".repeat(100)}`, { status: 400 }));
    const response = await piecesSend(post({ step: "render", photoBase64: PHOTO, piece: tags() }));
    const { error } = await response.json();
    expect(response.status).toBe(502);
    expect(error).toContain("Gemini failed (400)");
    expect(error).not.toContain(GEMINI_KEY);
    expect(logged()).not.toContain(GEMINI_KEY);

    net.mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] }));
    const blocked = await (await piecesSend(post({ step: "render", photoBase64: PHOTO, piece: tags() }))).json();
    expect(blocked.error).toContain("IMAGE_SAFETY");
  });

  it("says plainly when the Gemini key has no image quota", async () => {
    net.mockResolvedValueOnce(new Response("Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: x", { status: 429 }));
    const { error } = await (await piecesSend(post({ step: "render", photoBase64: PHOTO, piece: tags() }))).json();
    expect(error).toContain("Turn on billing");
  });

  it("refuses to draw something that isn't a piece's tags", async () => {
    const response = await piecesSend(post({ step: "render", photoBase64: PHOTO, piece: { label: "x" } }));
    expect(response.status).toBe(400);
    expect(net).not.toHaveBeenCalled();
  });

  it("asks for shoes as a pair and everything on white with no person", () => {
    expect(renderPrompt(tags({ type: "sneakers", label: "white sneakers" }))).toContain("the pair");
    const prompt = renderPrompt(tags({ label: "navy crewneck", type: "sweater" }));
    expect(prompt).toContain("navy crewneck");
    expect(prompt).toContain("pure white background");
    expect(prompt).toContain("No person");
  });
});
