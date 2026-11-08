import { readGarment } from "@/server/read-garment";
import type { TagRequest, TagResponse } from "@/shared/garment";

// POST /api/tag  body: TagRequest  →  TagResponse
// Runs on the Mac, inside the Expo dev server. This keeps the LLM Hub key on
// the server: the phone only talks to the dev server it already loads the
// app from, and this route is the bridge.
export async function POST(request: Request) {
  // Read as text, then parse. The first scan failed with request.json() and
  // worked after switching to this; whether .json() was really the cause was
  // never proven (it could have been a one-off). If tagging breaks here again,
  // log the raw body length first.
  const raw = await request.text();
  const { photoBase64 } = JSON.parse(raw) as TagRequest;

  if (typeof photoBase64 !== "string" || photoBase64 === "") {
    return Response.json({ error: "Body must be { photoBase64 }" }, { status: 400 });
  }

  const body: TagResponse = { tags: await readGarment(photoBase64) };
  return Response.json(body);
}
