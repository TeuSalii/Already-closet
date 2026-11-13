import { withoutSecrets } from "@/server/ai-call-log";
import { renderPiece } from "@/server/outfit-photo";
import { refusedPasscode } from "@/server/passcode";
import { readJsonBody } from "@/server/photo-request";
import { isGarmentTags } from "@/shared/garment";

// POST /api/render-piece  body: { photoBase64, tags }  → { mimeType, base64 }
// Calls Gemini to draw a piece alone on white. Used by the piece screen's
// "Draw with Gemini" button. Requires the app passcode and billing turned on
// for the GEMINI_API_KEY project (the free tier has no image quota).
export async function POST(request: Request) {
  const refused = refusedPasscode(request);
  if (refused !== null) return refused;

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  const { photoBase64, tags } = body;
  if (typeof photoBase64 !== "string" || !photoBase64) {
    return Response.json({ error: "Body needs photoBase64" }, { status: 400 });
  }
  if (!isGarmentTags(tags)) {
    return Response.json({ error: "tags must be garment tags" }, { status: 400 });
  }

  try {
    return Response.json(await renderPiece(photoBase64, tags));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: withoutSecrets(message) }, { status: 502 });
  }
}
