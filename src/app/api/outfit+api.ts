import { refusedPasscode } from "@/server/passcode";
import { pickOutfits, reasonFromScore } from "@/server/pick-outfits";
import { readJsonBody } from "@/server/photo-request";
import { isGarmentTags, type GarmentTags } from "@/shared/garment";
import {
  OCCASIONS,
  type Occasion,
  type OutfitRequest,
  REQUEST_SEASONS,
  type RequestSeason,
  TIMES,
  type Time,
} from "@/shared/outfit/occasions";
import type { OutfitPiece } from "@/shared/outfit/pieces";
import { suggestOutfits } from "@/shared/outfit/suggest";

// GET /api/outfit: is this passcode right? The app asks once before showing
// the outfit screen, so a stale passcode is caught before the first request.
export function GET(request: Request) {
  return refusedPasscode(request) ?? new Response(null, { status: 204 });
}

// POST /api/outfit body: { pieces, request, anchorId?, today?, ai? }
// Steps 1–3 of the pipeline (candidates, hard rules, score) run here with no
// AI. Step 4 (AI pick) runs unless ai is false. The same closet and request
// always give the same result when ai is false; with AI, temperature 0 makes
// it stable too. The key never leaves this server.
export async function POST(request: Request) {
  const refused = refusedPasscode(request);
  if (refused !== null) return refused;

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  const { pieces, request: req, anchorId, today, ai } = body;

  if (!Array.isArray(pieces)) return Response.json({ error: "pieces must be an array" }, { status: 400 });

  const outfitRequest = parseRequest(req);
  if (outfitRequest instanceof Response) return outfitRequest;

  const outfitPieces = parsePieces(pieces);
  if (outfitPieces instanceof Response) return outfitPieces;

  const result = suggestOutfits(outfitPieces, outfitRequest, {
    anchorId: typeof anchorId === "string" ? anchorId : undefined,
    today: typeof today === "string" ? today : undefined,
  });

  if (result.notEnough !== null) {
    return Response.json({ suggestions: [], notEnough: result.notEnough, aiUsed: false });
  }

  const useAi = ai !== false;
  if (useAi) {
    const { picked, aiUsed } = await pickOutfits(result.suggestions, outfitRequest);
    return Response.json({
      suggestions: picked.map(({ pieces: outfit, score, reason }) => ({ pieces: outfit, score, reason })),
      notEnough: null,
      aiUsed,
    });
  }

  return Response.json({
    suggestions: result.suggestions.map((s) => ({
      pieces: s.pieces,
      score: s.score,
      reason: reasonFromScore(s.score.parts),
    })),
    notEnough: null,
    aiUsed: false,
  });
}

function parseRequest(value: unknown): OutfitRequest | Response {
  if (typeof value !== "object" || value === null)
    return Response.json({ error: "request must be an object" }, { status: 400 });
  const { occasion, season, time } = value as Record<string, unknown>;
  if (!OCCASIONS.includes(occasion as Occasion))
    return Response.json({ error: `occasion must be one of: ${OCCASIONS.join(", ")}` }, { status: 400 });
  if (!REQUEST_SEASONS.includes(season as RequestSeason))
    return Response.json({ error: `season must be one of: ${REQUEST_SEASONS.join(", ")}` }, { status: 400 });
  if (!TIMES.includes(time as Time))
    return Response.json({ error: `time must be one of: ${TIMES.join(", ")}` }, { status: 400 });
  return { occasion: occasion as Occasion, season: season as RequestSeason, time: time as Time };
}

function parsePieces(values: unknown[]): OutfitPiece[] | Response {
  for (const value of values) {
    if (typeof value !== "object" || value === null || typeof (value as Record<string, unknown>).id !== "string")
      return Response.json({ error: "each piece must have a string id and tags" }, { status: 400 });
    if (!isGarmentTags((value as Record<string, unknown>).tags))
      return Response.json({ error: "each piece must have valid tags" }, { status: 400 });
  }
  return (values as Array<{ id: string; tags: GarmentTags; lastWorn?: string }>).map(({ id, tags, lastWorn }) => ({
    id,
    tags,
    ...(typeof lastWorn === "string" && { lastWorn }),
  }));
}
