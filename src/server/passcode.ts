import { createHash, timingSafeEqual } from "node:crypto";

import { PASSCODE_HEADER } from "@/shared/garment";

// The phone reaches the dev server over the Wi-Fi, so so can anyone else on
// it. Every route that spends the key asks for APP_PASSCODE from .env first.

const digest = (text: string) => createHash("sha256").update(text).digest();

// The Response that refuses the request, or null if the passcode is right.
// No passcode set means nobody gets in, not everybody.
export function refusedPasscode(request: Request): Response | null {
  const expected = process.env.APP_PASSCODE;
  if (!expected) {
    return Response.json({ error: "APP_PASSCODE is missing. Put it in .env and restart the dev server." }, { status: 503 });
  }
  const given = request.headers.get(PASSCODE_HEADER) ?? "";
  // Compared as digests: equal length, and the time taken gives nothing away.
  return timingSafeEqual(digest(given), digest(expected)) ? null : Response.json({ error: "Wrong passcode" }, { status: 401 });
}
