import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { isGarmentTags } from "@/shared/garment";
import type { OutfitPiece } from "@/shared/outfit/pieces";

// The test photos (IT-01 to IT-60) as a closet, for the outfit dev page:
// real pieces with real pictures, so outfits can be judged by eye.
//
// - Photos: read from the folder in OUTFIT_PHOTOS_DIR (.env), searched
//   through its subfolders. They stay where they are and are never copied
//   into the project: this repository is public, and the photos belong to
//   the people who took them.
// - Tags: the AI's latest answer for each item in logs/ai-calls.jsonl, from
//   the /dev/test page. Not checked by a person, so some will be wrong.
// - The extra outfit fields (shirt kind, neckline, metal) are unknown, so the
//   rules use their defaults.

const PHOTO_NAME = /^(IT-\d{2})\.(jpe?g|png)$/i;
const LOG_FILE = path.join(process.cwd(), "logs", "ai-calls.jsonl");

export type TestPhotoCloset =
  | { pieces: OutfitPiece[]; photoOf: Map<string, string>; wishes: Set<string>; missingTags: string[] }
  | { error: string };

export function loadTestPhotoCloset(): TestPhotoCloset {
  const folder = process.env.OUTFIT_PHOTOS_DIR;
  if (!folder) return { error: "OUTFIT_PHOTOS_DIR is not set in .env." };
  if (!existsSync(folder)) return { error: "The folder in OUTFIT_PHOTOS_DIR doesn't exist." };
  if (!existsSync(LOG_FILE)) return { error: "logs/ai-calls.jsonl doesn't exist yet: tag the photos on /dev/test first." };

  const photoOf = new Map<string, string>();
  const wishes = new Set<string>();
  for (const file of filesIn(folder)) {
    const match = PHOTO_NAME.exec(path.basename(file));
    if (!match) continue;
    photoOf.set(match[1], file);
    // The test set keeps photos of wanted pieces in a "wish-image" folder.
    if (file.split(path.sep).includes("wish-image")) wishes.add(match[1]);
  }

  const tagsOf = latestTags();
  const ids = [...photoOf.keys()].sort();
  const pieces = ids.flatMap((id) => {
    const tags = tagsOf.get(id);
    return tags ? [{ id, tags }] : [];
  });
  return { pieces, photoOf, wishes, missingTags: ids.filter((id) => !tagsOf.has(id)) };
}

// The last successful answer per item: a later scan replaces an earlier one.
function latestTags() {
  const found = new Map<string, OutfitPiece["tags"]>();
  for (const line of readFileSync(LOG_FILE, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const entry = JSON.parse(line);
      if (entry.source === "dev-test" && typeof entry.itemId === "string" && isGarmentTags(entry.answer)) {
        found.set(entry.itemId, entry.answer);
      }
    } catch {
      // A broken line (say, the server stopped mid-write) is skipped, not fatal.
    }
  }
  return found;
}

function filesIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) return filesIn(full);
    return entry.isFile() ? [full] : [];
  });
}

export const PHOTO_TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
