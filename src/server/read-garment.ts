import { createHash } from "node:crypto";

import { type AiCallEntry, appendAiCall } from "@/server/ai-call-log";
import { type GarmentTags, isGarmentTags, TAG_SCHEMA } from "@/shared/garment";

// A vision model on LLM Hub looks at the photo. The photo is sent to LLM Hub.
// Needs LLM_API_KEY in .env (read only here on the server, never
// shipped to the phone because the name has no EXPO_PUBLIC_ prefix).
const LLM_HUB_URL = "https://api.llmhub.infs.ai/v1/chat/completions";
// Each pipeline step names its own model, so one step can be switched
// without touching the others. Outfit matching will get its own setting.
const RECOGNITION_MODEL = "best-chat";
const TEMPERATURE = 0; // the same photo should get the same tags
const TIME_LIMIT_MS = 60_000; // after this the piece shows "try again", not a spinner forever

// Adapted from wardrowbe's clothing_analysis prompt. The word lists are not
// repeated here: the schema already limits every answer to them.
const INSTRUCTIONS = `You tag clothing for a personal wardrobe app.
Look at the MAIN piece of clothing in the photo and describe only that piece.
- label: what a person would call it, 2 to 4 words, e.g. "navy wool crewneck".
- colors: the main colour first, then up to two more that are clearly visible.
- material: "unknown" if you cannot tell from the photo. Do not guess.
- season: the season the piece is made for. "transitional" for spring and fall.
  "all-year" only if it is equally right in summer and winter.
- formality: how dressed up the piece is, from its fabric, cut and finish.
- style: the single style the piece reads as most.
- confidence: "high" only if the piece is clearly visible and you are sure of
  its type, colour and formality. Otherwise "low".
Reply with JSON only, matching this schema:
${JSON.stringify(TAG_SCHEMA)}`;
const USER_TEXT = "Tag this piece.";

// Changes whenever the prompt or the schema changes.
const PROMPT_FINGERPRINT = createHash("sha256")
  .update(INSTRUCTIONS + USER_TEXT + JSON.stringify(TAG_SCHEMA))
  .digest("hex")
  .slice(0, 12);

type ChatResponse = {
  model: string;
  system_fingerprint: string | null;
  choices: { finish_reason: string; message: { content: string | null; refusal: string | null } }[];
};

// Who asked: the app's own scan, or the dev test page with the item's ID.
export type CallOrigin = { source: "app" } | { source: "dev-test"; itemId: string };

// Every call is logged, whether it succeeds or fails.
export async function readGarment(photoBase64: string, origin: CallOrigin): Promise<GarmentTags> {
  const started = Date.now();
  const entry: AiCallEntry = {
    time: new Date(started).toISOString(),
    ...origin,
    modelRequested: RECOGNITION_MODEL,
    modelReturned: null,
    systemFingerprint: null,
    temperature: TEMPERATURE,
    promptFingerprint: PROMPT_FINGERPRINT,
    answer: null,
    durationMs: 0,
    error: null,
  };
  try {
    entry.answer = await askModel(photoBase64, entry);
    return entry.answer;
  } catch (error) {
    entry.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    entry.durationMs = Date.now() - started;
    appendAiCall(entry);
  }
}

async function askModel(photoBase64: string, entry: AiCallEntry): Promise<GarmentTags> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY is missing. Put it in .env and restart the dev server.");

  const response = await fetch(LLM_HUB_URL, {
    method: "POST",
    signal: AbortSignal.timeout(TIME_LIMIT_MS),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: RECOGNITION_MODEL,
      temperature: TEMPERATURE,
      response_format: {
        type: "json_schema",
        json_schema: { name: "garment_tags", strict: true, schema: TAG_SCHEMA },
      },
      messages: [
        { role: "system", content: INSTRUCTIONS },
        {
          role: "user",
          content: [
            { type: "text", text: USER_TEXT },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${photoBase64}` } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM Hub failed (${response.status}): ${await response.text()}`);
  }
  const { model, system_fingerprint, choices } = (await response.json()) as ChatResponse;
  entry.modelReturned = model;
  entry.systemFingerprint = system_fingerprint;
  const { finish_reason, message } = choices[0];
  if (message.refusal) throw new Error(`The model refused: ${message.refusal}`);
  if (finish_reason !== "stop" || message.content === null) {
    throw new Error(`The model stopped early: ${finish_reason}`);
  }
  const answer: unknown = JSON.parse(message.content);
  if (!isGarmentTags(answer)) throw new Error("The model's answer does not match the tag lists");
  return answer;
}
