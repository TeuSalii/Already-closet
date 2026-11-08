// The first check for every route that receives a photo.

// A shrunk photo (MAX_SIDE, JPEG) is 1 to 2 MB as base64. Far above that, it
// is not a photo from this app.
const MAX_BODY_CHARS = 8_000_000;

const refuse = (status: number, error: string) => Response.json({ error }, { status });

// The parsed JSON object, or the Response that refuses the request.
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | Response> {
  // Insisting on JSON makes a browser ask permission before sending this to
  // another site's server, so a web page cannot quietly spend the key.
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return refuse(415, "Content-Type must be application/json");
  }

  // Read as text, then parse. The first scan failed with request.json() and
  // worked after switching to this; whether .json() was really the cause was
  // never proven (it could have been a one-off). If tagging breaks here again,
  // log the raw body length first.
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return refuse(413, "The photo is too large");

  try {
    const body: unknown = JSON.parse(raw);
    if (typeof body === "object" && body !== null && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // Not JSON: refused below, like any other wrong body.
  }
  return refuse(400, "Body must be a JSON object");
}
