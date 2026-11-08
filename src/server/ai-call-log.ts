import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import type { GarmentTags } from "@/shared/garment";

// logs/ai-calls.jsonl: one JSON line per AI call, so we notice if the model
// behind the "best-chat" alias changes. No photo data and no key in here.
export type AiCallEntry = {
  time: string;
  source: "app" | "dev-test";
  itemId?: string; // only for dev-test
  modelRequested: string;
  modelReturned: string | null;
  systemFingerprint: string | null; // LLM Hub's server build
  temperature: number;
  promptFingerprint: string;
  answer: GarmentTags | null;
  durationMs: number;
  error: string | null;
};

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "ai-calls.jsonl");

// A log that cannot be written must not cost the person their scan.
export function appendAiCall(entry: AiCallEntry): void {
  const line = { ...entry, error: entry.error === null ? null : withoutSecrets(entry.error) };
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, `${JSON.stringify(line)}\n`);
  } catch (error) {
    console.warn("Could not write the AI call log", error);
  }
}

// An error text from LLM Hub could quote what it was sent.
export function withoutSecrets(message: string): string {
  const key = process.env.LLM_API_KEY;
  const noKey = key ? message.replaceAll(key, "[key removed]") : message;
  return noKey.replace(/[A-Za-z0-9+/=_-]{64,}/g, "[data removed]");
}
