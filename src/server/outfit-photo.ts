import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { withoutSecrets } from "@/server/ai-call-log";
import { type GarmentTags, isGarmentTags, normalizeTags, TAG_SCHEMA } from "@/shared/garment";

// A photo of a person wearing an outfit → the pieces in it, each tagged and
// drawn alone on white, as a card for the closet. Only used by /dev/pieces
// for now.
//
// Two steps, two services:
// 1. listPieces: the app's own tagging model on LLM Hub names and tags every
//    piece, with the same word lists as a scanned piece.
// 2. renderPiece: an image model at Google (Gemini) draws one piece, alone,
//    as a product photo on white. LLM Hub has no image model.
//
// The photo goes to both LLM Hub and Google. Google's image models need
// billing turned on for the key's project (the free tier has no quota for
// them). Only use photos of people who agreed to them being sent.

const LLM_HUB_URL = "https://api.llmhub.infs.ai/v1/chat/completions";
const LIST_MODEL = "best-chat";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
const TIME_LIMIT_MS = 120_000;
const MAX_PIECES = 8;

const LIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { pieces: { type: "array", items: TAG_SCHEMA, minItems: 0, maxItems: MAX_PIECES } },
  required: ["pieces"],
} as const;

const LIST_INSTRUCTIONS = `You tag clothing for a personal wardrobe app.
The photo shows a person wearing an outfit. List every piece of clothing,
footwear and accessory they wear that can be seen well enough to describe,
one entry per piece, from head to feet. A pair of shoes or socks is one piece.
Leave out what is hidden or too small to tell.
For each piece:
- label: what a person would call it, 2 to 4 words, e.g. "navy wool crewneck".
- colors: the main colour first, then up to two more that are clearly visible.
- material: "unknown" if you cannot tell from the photo. Do not guess.
- season, formality, style: from the piece itself, not from the person or place.
- confidence: "high" only if the piece is clearly visible and you are sure of
  its type, colour and formality. Otherwise "low".
- shirtKind: only for type "shirt", otherwise "none".
- neckline: only for type "sweater", otherwise "none".
- metal: only for a belt, watch, jewellery or other accessory, otherwise "none".
At most ${MAX_PIECES} pieces. Reply with JSON only, matching this schema:
${JSON.stringify(LIST_SCHEMA)}`;

type Logged = { step: "list" | "render"; model: string; label?: string; result?: string[]; durationMs: number; error: string | null };

const LOG_FILE = path.join(process.cwd(), "logs", "outfit-photo-calls.jsonl");

// One line per call: what was asked and what came back, never a photo or a key.
function log(entry: Logged) {
  try {
    mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    appendFileSync(LOG_FILE, `${JSON.stringify({ time: new Date().toISOString(), ...entry, error: entry.error && withoutSecrets(entry.error) })}\n`);
  } catch (error) {
    console.warn("Could not write the outfit photo log", error);
  }
}

async function logged<T>(entry: Omit<Logged, "durationMs" | "error">, run: () => Promise<T>, summary: (value: T) => string[]): Promise<T> {
  const started = Date.now();
  try {
    const value = await run();
    log({ ...entry, result: summary(value), durationMs: Date.now() - started, error: null });
    return value;
  } catch (error) {
    log({ ...entry, durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export function listPieces(photoBase64: string): Promise<GarmentTags[]> {
  return logged({ step: "list", model: LIST_MODEL }, () => askHub(photoBase64), (pieces) => pieces.map((p) => p.label));
}

async function askHub(photoBase64: string): Promise<GarmentTags[]> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY is missing. Put it in .env and restart the dev server.");
  const response = await fetch(LLM_HUB_URL, {
    method: "POST",
    signal: AbortSignal.timeout(TIME_LIMIT_MS),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: LIST_MODEL,
      temperature: 0,
      response_format: { type: "json_schema", json_schema: { name: "outfit_pieces", strict: true, schema: LIST_SCHEMA } },
      messages: [
        { role: "system", content: LIST_INSTRUCTIONS },
        {
          role: "user",
          content: [
            { type: "text", text: "List the pieces in this outfit." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${photoBase64}` } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`LLM Hub failed (${response.status}): ${await response.text()}`);
  const { choices } = (await response.json()) as {
    choices: { finish_reason: string; message: { content: string | null; refusal: string | null } }[];
  };
  const { finish_reason, message } = choices[0];
  if (message.refusal) throw new Error(`The model refused: ${message.refusal}`);
  if (finish_reason !== "stop" || message.content === null) throw new Error(`The model stopped early: ${finish_reason}`);
  const answer = JSON.parse(message.content) as { pieces?: unknown };
  if (!Array.isArray(answer.pieces) || !answer.pieces.every(isGarmentTags)) {
    throw new Error("The model's answer does not match the tag lists");
  }
  return answer.pieces.slice(0, MAX_PIECES).map(normalizeTags);
}

// What the image model is told about the one piece to draw.
export function renderPrompt(piece: GarmentTags): string {
  const colours = piece.colors.join(", ");
  const view = ["shoes", "sneakers", "boots"].includes(piece.type)
    ? "the pair, side by side, seen from the front-side"
    : "seen from the front, laid flat or on an invisible mannequin";
  return `This photo shows a person wearing an outfit. Take only their ${piece.label} (a ${piece.type}; ${colours}; ${piece.pattern}).
Draw it alone as a clean product photo for an online shop: ${view}, centred, filling most of a square picture, on a plain pure white background, soft even light, a faint shadow at most.
No person, no skin, no hair, no hands, no other clothing, no props, no text.
Keep it exactly as in the photo: the same colour, pattern, print, fabric, cut, length, collar, buttons, pockets and logos. Do not add, remove or improve anything. Where part of it is hidden, complete it in the plainest likely way.`;
}

export type Rendered = { mimeType: string; base64: string };

export function renderPiece(photoBase64: string, piece: GarmentTags): Promise<Rendered> {
  return logged(
    { step: "render", model: IMAGE_MODEL, label: piece.label },
    () => askGemini(photoBase64, renderPrompt(piece)),
    (image) => [`${image.mimeType}, ${Math.round((image.base64.length * 3) / 4 / 1024)} KB`],
  );
}

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] } }[];
};

async function askGemini(photoBase64: string, prompt: string): Promise<Rendered> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing. Put it in .env and restart the dev server.");
  const response = await fetch(`${GEMINI_URL}/${IMAGE_MODEL}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(TIME_LIMIT_MS),
    // The key goes in a header, not the URL, so it can't end up in an error text.
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: photoBase64 } }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    // Google gives the free tier no quota at all for its image models.
    if (response.status === 429 && /free_tier[\s\S]*limit: 0\b/.test(text)) {
      throw new Error("Gemini's free tier can't draw pictures. Turn on billing for the key's Google project (aistudio.google.com → Billing), then try again.");
    }
    throw new Error(`Gemini failed (${response.status}): ${text}`);
  }
  const body = (await response.json()) as GeminiResponse;
  if (body.promptFeedback?.blockReason) throw new Error(`Gemini refused the photo: ${body.promptFeedback.blockReason}`);
  const candidate = body.candidates?.[0];
  const image = candidate?.content?.parts?.find((part) => part.inlineData)?.inlineData;
  if (!image) {
    const said = candidate?.content?.parts?.map((part) => part.text).filter(Boolean).join(" ");
    throw new Error(`Gemini drew no picture (${candidate?.finishReason ?? "no answer"})${said ? `: ${said}` : ""}`);
  }
  return { mimeType: image.mimeType, base64: image.data };
}
