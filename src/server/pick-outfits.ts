import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { withoutSecrets } from "@/server/ai-call-log";
import { OCCASION_RULES, type OutfitRequest } from "@/shared/outfit/occasions";
import type { Outfit } from "@/shared/outfit/pieces";
import type { ScorePart } from "@/shared/outfit/score";
import type { Suggestion } from "@/shared/outfit/suggest";

// Step 4 of the outfit pipeline: the AI chooses 3 outfits from the candidates
// that passed the hard rules and scored best. No photos: only tag descriptions.
// If the AI returns an index outside the list, or no valid picks at all, the
// step falls back to the top 3 by score, so the app always shows something.
//
// Logged in logs/ai-calls.jsonl (source "outfit-api") like tagging, so Test 4
// can compare picks to top-3-by-score and measure agreement.

const LLM_HUB_URL = "https://api.llmhub.infs.ai/v1/chat/completions";
// Each pipeline step names its own model (see read-garment.ts).
const OUTFIT_MODEL = "best-chat";
const TEMPERATURE = 0; // the same input should give the same picks
const TIME_LIMIT_MS = 60_000;
export const TOP_N = 10; // how many top-scored outfits to send to the AI

const PICK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    picks: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer", minimum: 0 },
          reason: { type: "string", minLength: 1, maxLength: 120 },
        },
        required: ["index", "reason"],
      },
    },
  },
  required: ["picks"],
} as const;

function buildInstructions(request: OutfitRequest, count: number): string {
  const { label } = OCCASION_RULES[request.occasion];
  const time = request.time === "day" ? "during the day" : "in the evening";
  const season = request.season === "transitional" ? "in spring or fall" : `in ${request.season}`;
  return `You are a personal stylist picking outfits for a client.
They are going to ${label} ${season}, ${time}.
${count} outfits passed the style rules; they are numbered 0 to ${count - 1}.
Choose 3 different ones by number, and explain each in up to 15 words.
Reply with JSON only: {"picks":[{"index":0,"reason":"..."},{"index":1,"reason":"..."},{"index":2,"reason":"..."}]}`;
}

function outfitLine(i: number, outfit: Outfit): string {
  const pieces = outfit.map(({ tags }) => `${tags.label} (${tags.type}, ${tags.colors.join("/")})`);
  return `${i}. ${pieces.join(" \u00b7 ")}`;
}

// Changes whenever the instructions template or the response schema change.
const PROMPT_FINGERPRINT = createHash("sha256")
  .update(buildInstructions({ occasion: "casual", season: "summer", time: "day" }, 10) + JSON.stringify(PICK_SCHEMA))
  .digest("hex")
  .slice(0, 12);

type PickEntry = {
  time: string;
  source: "outfit-api";
  occasion: string;
  sentCount: number;
  pickedIndices: number[] | null;
  invalidIndices: number[];
  usedFallback: boolean;
  modelRequested: string;
  modelReturned: string | null;
  temperature: number;
  promptFingerprint: string;
  durationMs: number;
  error: string | null;
};

const LOG_FILE = path.join(process.cwd(), "logs", "ai-calls.jsonl");

function log(entry: PickEntry): void {
  try {
    mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    const line = { ...entry, error: entry.error === null ? null : withoutSecrets(entry.error) };
    appendFileSync(LOG_FILE, `${JSON.stringify(line)}\n`);
  } catch (error) {
    console.warn("Could not write the outfit pick log", error);
  }
}

type ChatResponse = {
  model: string;
  choices: { finish_reason: string; message: { content: string | null; refusal: string | null } }[];
};

type AiPick = { index: number; reason: string };
type AiAnswer = { picks: AiPick[] };

export type PickedSuggestion = Suggestion & { reason: string };

// Returns picked suggestions (with reasons), or the top 3 by score if the AI
// step fails or returns no valid indices. Logs the call either way.
export async function pickOutfits(
  suggestions: Suggestion[],
  request: OutfitRequest,
): Promise<{ picked: PickedSuggestion[]; aiUsed: boolean }> {
  const candidates = suggestions.slice(0, TOP_N);
  const entry: PickEntry = {
    time: new Date().toISOString(),
    source: "outfit-api",
    occasion: request.occasion,
    sentCount: candidates.length,
    pickedIndices: null,
    invalidIndices: [],
    usedFallback: false,
    modelRequested: OUTFIT_MODEL,
    modelReturned: null,
    temperature: TEMPERATURE,
    promptFingerprint: PROMPT_FINGERPRINT,
    durationMs: 0,
    error: null,
  };
  const started = Date.now();
  try {
    const answer = await callModel(candidates, request, entry);
    const inRange = (pick: AiPick) => Number.isInteger(pick.index) && pick.index >= 0 && pick.index < candidates.length;
    const valid = answer.picks.filter(inRange);
    entry.invalidIndices = answer.picks.filter((p) => !inRange(p)).map((p) => p.index);

    // Deduplicate by index (keep first occurrence).
    const seen = new Set<number>();
    const distinct = valid.filter(({ index }) => !seen.has(index) && seen.add(index));

    if (distinct.length > 0) {
      entry.pickedIndices = distinct.map((p) => p.index);
      return { picked: distinct.map((p) => ({ ...candidates[p.index], reason: p.reason })), aiUsed: true };
    }

    // All indices invalid or empty: fall back.
    entry.usedFallback = true;
    entry.error = "No valid indices returned; using top 3 by score";
    return { picked: fallback(candidates), aiUsed: false };
  } catch (error) {
    entry.error = error instanceof Error ? error.message : String(error);
    entry.usedFallback = true;
    return { picked: fallback(candidates), aiUsed: false };
  } finally {
    entry.durationMs = Date.now() - started;
    log(entry);
  }
}

function fallback(candidates: Suggestion[]): PickedSuggestion[] {
  return candidates.slice(0, 3).map((s) => ({ ...s, reason: reasonFromScore(s.score.parts) }));
}

export function reasonFromScore(parts: ScorePart[]): string {
  const topTwo = parts.slice(0, 2).map((p) => p.reason);
  return topTwo.length > 0 ? topTwo.join(" \u00b7 ") : "Passes all style rules.";
}

async function callModel(candidates: Suggestion[], request: OutfitRequest, entry: PickEntry): Promise<AiAnswer> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY is missing. Put it in .env and restart the dev server.");

  const count = candidates.length;
  const outfitList = candidates.map((s, i) => outfitLine(i, s.pieces)).join("\n");

  const response = await fetch(LLM_HUB_URL, {
    method: "POST",
    signal: AbortSignal.timeout(TIME_LIMIT_MS),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OUTFIT_MODEL,
      temperature: TEMPERATURE,
      response_format: { type: "json_schema", json_schema: { name: "outfit_picks", strict: true, schema: PICK_SCHEMA } },
      messages: [
        { role: "system", content: buildInstructions(request, count) },
        { role: "user", content: `Outfits:\n${outfitList}` },
      ],
    }),
  });

  if (!response.ok) throw new Error(`LLM Hub failed (${response.status}): ${await response.text()}`);

  const { model, choices } = (await response.json()) as ChatResponse;
  entry.modelReturned = model;
  const { finish_reason, message } = choices[0];
  if (message.refusal) throw new Error(`The model refused: ${message.refusal}`);
  if (finish_reason !== "stop" || message.content === null) throw new Error(`The model stopped early: ${finish_reason}`);

  const answer: unknown = JSON.parse(message.content);
  if (!isAiAnswer(answer)) throw new Error("The model's answer does not match the expected schema");
  return answer;
}

function isAiAnswer(value: unknown): value is AiAnswer {
  if (typeof value !== "object" || value === null) return false;
  const { picks } = value as Record<string, unknown>;
  if (!Array.isArray(picks) || picks.length === 0) return false;
  return picks.every(
    (pick) =>
      typeof pick === "object" &&
      pick !== null &&
      typeof (pick as Record<string, unknown>).index === "number" &&
      typeof (pick as Record<string, unknown>).reason === "string" &&
      (pick as Record<string, unknown>).reason !== "",
  );
}
