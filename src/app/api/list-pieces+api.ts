import { withoutSecrets } from "@/server/ai-call-log";
import { listPieces } from "@/server/outfit-photo";
import { refusedPasscode } from "@/server/passcode";
import { readJsonBody } from "@/server/photo-request";

// POST /api/list-pieces  body: { photoBase64 }  → { pieces: GarmentTags[] }
// Identifies every piece of clothing in an outfit photo, using the same tagging
// model as /api/tag. Called by the "Add an outfit" flow on the mobile app.
// Requires the app passcode.
export async function POST(request: Request) {
  const refused = refusedPasscode(request);
  if (refused !== null) return refused;

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  const { photoBase64 } = body;
  if (typeof photoBase64 !== "string" || !photoBase64) {
    return Response.json({ error: "Body needs photoBase64" }, { status: 400 });
  }

  try {
    return Response.json({ pieces: await listPieces(photoBase64) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: withoutSecrets(message) }, { status: 502 });
  }
}
