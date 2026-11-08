import { appendFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as checkPasscode, POST as tag } from "@/app/api/tag+api";
import { GET as devPage, POST as devSend } from "@/app/dev/test+api";
import { PASSCODE_HEADER } from "@/shared/garment";

import { tags } from "./helpers";

// The network and the log file are faked: nothing here costs money, sends a
// photo anywhere, or touches logs/.
vi.mock("node:fs", () => ({ appendFileSync: vi.fn(), mkdirSync: vi.fn() }));

const KEY = "not-a-real-key-1234567890";
const CODE = "not-a-real-passcode";
const PHOTO = "A".repeat(200);
const hub = vi.fn<typeof fetch>();

const logged = () => vi.mocked(appendFileSync).mock.calls.map((call) => String(call[1])).join("");

function hubAnswers(content: string | null, finish_reason = "stop") {
  hub.mockResolvedValue(
    Response.json({
      model: "some-model",
      system_fingerprint: "fp",
      choices: [{ finish_reason, message: { content, refusal: null } }],
    }),
  );
}

function post(body: string, url = "http://192.168.1.5:8081/api/tag", headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", [PASSCODE_HEADER]: CODE, ...headers },
    body,
  });
}

const devPost = (body: object, host = "localhost:8081") =>
  post(JSON.stringify(body), `http://${host}/dev/test`, { host });

beforeEach(() => {
  vi.stubGlobal("fetch", hub);
  vi.stubEnv("LLM_API_KEY", KEY);
  vi.stubEnv("APP_PASSCODE", CODE);
  vi.stubEnv("NODE_ENV", "development");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  hub.mockReset();
  vi.mocked(appendFileSync).mockReset();
});

describe("the passcode", () => {
  const photo = JSON.stringify({ photoBase64: PHOTO });
  const check = (code?: string) =>
    checkPasscode(new Request("http://192.168.1.5:8081/api/tag", { headers: code === undefined ? {} : { [PASSCODE_HEADER]: code } }));

  it("opens with the right code and costs nothing", () => {
    expect(check(CODE).status).toBe(204);
    expect(hub).not.toHaveBeenCalled();
  });

  it.each([["a wrong code", "guess"], ["an empty code", ""], ["no code", undefined]])("refuses %s", (_name, code) => {
    expect(check(code).status).toBe(401);
  });

  it("refuses a photo without the right code, before calling LLM Hub", async () => {
    expect((await tag(post(photo, undefined, { [PASSCODE_HEADER]: "guess" }))).status).toBe(401);
    expect(hub).not.toHaveBeenCalled();
  });

  it("lets nobody in when no passcode is set", async () => {
    vi.stubEnv("APP_PASSCODE", "");
    expect((await tag(post(photo))).status).toBe(503);
    expect((await tag(post(photo, undefined, { [PASSCODE_HEADER]: "" }))).status).toBe(503);
    expect(hub).not.toHaveBeenCalled();
  });

  it("cannot be skipped through the test page by faking the host name", async () => {
    const faked = post(JSON.stringify({ id: "IT-11", photoBase64: PHOTO }), "http://localhost:8081/dev/test", {
      host: "localhost:8081",
      [PASSCODE_HEADER]: "guess",
    });
    expect((await devSend(faked)).status).toBe(401);
    expect(hub).not.toHaveBeenCalled();
  });

  it("does not put the code in the test page", () => {
    const response = devPage(new Request("http://localhost:8081/dev/test", { headers: { host: "localhost:8081" } }));
    return expect(response.text()).resolves.not.toContain(CODE);
  });
});

describe("POST /api/tag", () => {
  it("returns the model's tags and sends the key only to LLM Hub", async () => {
    hubAnswers(JSON.stringify(tags()));

    const response = await tag(post(JSON.stringify({ photoBase64: PHOTO })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tags: tags() });
    const [url, init] = hub.mock.calls[0];
    expect(url).toBe("https://api.llmhub.infs.ai/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps the key and the photo out of the answer and the log when LLM Hub fails", async () => {
    hub.mockResolvedValue(new Response(`rejected ${KEY} for image ${PHOTO}`, { status: 401 }));

    const response = await tag(post(JSON.stringify({ photoBase64: PHOTO })));
    const answer = await response.text();

    expect(response.status).toBe(502);
    expect(answer).not.toContain("rejected");
    expect(answer).not.toContain(KEY);
    expect(logged()).toContain("401");
    expect(logged()).not.toContain(KEY);
    expect(logged()).not.toContain(PHOTO);
  });

  it("never logs the photo on a successful read", async () => {
    hubAnswers(JSON.stringify(tags()));
    await tag(post(JSON.stringify({ photoBase64: PHOTO })));
    expect(logged()).toContain("black cotton hoodie");
    expect(logged()).not.toContain(PHOTO);
    expect(logged()).not.toContain(KEY);
  });

  it.each([
    ["wrong word", JSON.stringify(tags({ type: "cape" as never }))],
    ["no colours", JSON.stringify(tags({ colors: [] }))],
    ["not JSON", "here are the tags"],
    ["JSON but not an object", "[1,2]"],
  ])("refuses a model answer that would break the app: %s", async (_name, content) => {
    hubAnswers(content);
    const response = await tag(post(JSON.stringify({ photoBase64: PHOTO })));
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("tags");
  });

  it("treats a cut-off answer as a failure", async () => {
    hubAnswers(JSON.stringify(tags()), "length");
    expect((await tag(post(JSON.stringify({ photoBase64: PHOTO })))).status).toBe(502);
  });

  it("waits when asked to, for testing a slow read", async () => {
    vi.stubEnv("SLOW_AI_MS", "40");
    hubAnswers(JSON.stringify(tags()));
    const started = Date.now();
    await tag(post(JSON.stringify({ photoBase64: PHOTO })));
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });

  it("ignores the test delay outside development", async () => {
    vi.stubEnv("SLOW_AI_MS", "60000");
    vi.stubEnv("NODE_ENV", "production");
    hubAnswers(JSON.stringify(tags()));
    expect((await tag(post(JSON.stringify({ photoBase64: PHOTO })))).status).toBe(200);
  });

  it("still answers when the log cannot be written", async () => {
    hubAnswers(JSON.stringify(tags()));
    vi.mocked(appendFileSync).mockImplementation(() => {
      throw new Error("disk full");
    });
    expect((await tag(post(JSON.stringify({ photoBase64: PHOTO })))).status).toBe(200);
  });

  it("fails without calling LLM Hub when the key is missing", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    expect((await tag(post(JSON.stringify({ photoBase64: PHOTO })))).status).toBe(502);
    expect(hub).not.toHaveBeenCalled();
  });

  it.each([
    ["not JSON", "{oops", 400],
    ["a JSON array", "[]", 400],
    ["no photo", "{}", 400],
    ["an empty photo", JSON.stringify({ photoBase64: "" }), 400],
    ["a photo that is not text", JSON.stringify({ photoBase64: 5 }), 400],
    ["a body far too large", JSON.stringify({ photoBase64: "A".repeat(8_000_001) }), 413],
  ])("refuses %s without calling LLM Hub", async (_name, body, status) => {
    expect((await tag(post(body))).status).toBe(status);
    expect(hub).not.toHaveBeenCalled();
  });

  it("refuses a body that is not declared as JSON, the kind a web page can send unasked", async () => {
    const response = await tag(post(JSON.stringify({ photoBase64: PHOTO }), undefined, { "Content-Type": "text/plain" }));
    expect(response.status).toBe(415);
    expect(hub).not.toHaveBeenCalled();
  });
});

describe("/dev/test", () => {
  const photo = { id: "IT-11", photoBase64: PHOTO };

  it("opens on localhost in development", () => {
    const response = devPage(new Request("http://localhost:8081/dev/test", { headers: { host: "localhost:8081" } }));
    expect(response.status).toBe(200);
  });

  it("is not found from another device", async () => {
    expect((await devSend(devPost(photo, "192.168.1.5:8081"))).status).toBe(404);
    expect(hub).not.toHaveBeenCalled();
  });

  it("is not found outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await devSend(devPost(photo))).status).toBe(404);
    expect(devPage(new Request("http://localhost:8081/dev/test", { headers: { host: "localhost:8081" } })).status).toBe(404);
    expect(hub).not.toHaveBeenCalled();
  });

  it.each(["IT-00", "IT-61", "../../etc", 11])("refuses the ID %s", async (id) => {
    expect((await devSend(devPost({ id, photoBase64: PHOTO }))).status).toBe(400);
    expect(hub).not.toHaveBeenCalled();
  });

  it("removes the key and the photo from the error it shows", async () => {
    hub.mockResolvedValue(new Response(`rejected ${KEY} for image ${PHOTO}`, { status: 401 }));
    const response = await devSend(devPost(photo));
    const answer = await response.text();
    expect(response.status).toBe(502);
    expect(answer).not.toContain(KEY);
    expect(answer).not.toContain(PHOTO);
  });

  it("logs the item's ID with the call", async () => {
    hubAnswers(JSON.stringify(tags()));
    await devSend(devPost(photo));
    expect(logged()).toContain('"itemId":"IT-11"');
  });
});
