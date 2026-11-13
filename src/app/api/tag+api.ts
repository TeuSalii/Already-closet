import { refusedPasscode } from "@/server/passcode";
import { readJsonBody } from "@/server/photo-request";
import { readGarment } from "@/server/read-garment";
import type { TagResponse } from "@/shared/garment";

// GET /api/tag: is this passcode right? Costs nothing, the phone asks it once.
export function GET(request: Request) {
  return refusedPasscode(request) ?? new Response(null, { status: 204 });
}

// POST /api/tag  body: TagRequest  →  TagResponse
// Runs on the Mac, inside the Expo dev server. This keeps the LLM Hub key on
// the server: the phone only talks to the dev server it already loads the
// app from, and this route is the bridge.
export async function POST(request: Request) {
  const refused = refusedPasscode(request);
  if (refused !== null) return refused;

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  const { photoBase64 } = body;
  if (typeof photoBase64 !== "string" || photoBase64 === "") {
    return Response.json({ error: "Body must be { photoBase64 }" }, { status: 400 });
  }

  // To test what happens during a read: SLOW_AI_MS=30000 npx expo start
  const delay = Number(process.env.SLOW_AI_MS);
  if (process.env.NODE_ENV === "development" && delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    const answer: TagResponse = { tags: await readGarment(photoBase64, { source: "app" }) };
    return Response.json(answer);
  } catch {
    // The reason is in logs/ai-calls.jsonl. Anyone on the Wi-Fi can reach this
    // route, so what LLM Hub said stays on the Mac.
    return Response.json({ error: "The photo could not be read" }, { status: 502 });
  }
}
