import AsyncStorage from "@react-native-async-storage/async-storage";

import type { GarmentTags } from "@/shared/garment";

// Everything the app remembers, kept on the phone as JSON. Photos are files
// (see add-piece.ts); here we only keep where each file is.

export type Origin = "secondhand" | "new" | "gift";

// What a piece always has. `origin` is optional because the person answers
// it after scanning (or never), and pieces scanned before origin existed
// simply don't have one. Missing means "not answered yet".
type PieceBase = { id: string; photo: string; addedAt: string; origin?: Origin };

// Each state carries exactly the data that exists in it: there are tags
// only once the model has read the photo.
export type PieceStatus =
  | { status: "reading" }
  | { status: "read"; tags: GarmentTags }
  | { status: "failed" };

export type Piece = PieceBase & PieceStatus;

// One "Wearing it today". Wears are the only record of wearing: how often
// and how long ago a piece was worn is worked out from them, never stored
// twice, so the two can never disagree.
export type Wear = {
  id: string;
  date: string; // the local day, "2026-10-13"
  pieceIds: string[];
  selfie: string | null; // a mirror photo, if the person took one
};

// Separate keys, so adding wears needed no change to the saved pieces.
// v2 (2026-10-31): new label lists (season, formality, confidence). Pieces
// saved under v1 have the old words, so they are left behind and you start
// fresh. Wears move too: they point at v1 pieces that no longer load.
const PIECES_KEY = "closet:v2";
const WEARS_KEY = "closet:wears:v2";

async function load<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  return raw === null ? [] : (JSON.parse(raw) as T[]);
}

export const loadPieces = () => load<Piece>(PIECES_KEY);
export const loadWears = () => load<Wear>(WEARS_KEY);
export const savePieces = (pieces: Piece[]) => AsyncStorage.setItem(PIECES_KEY, JSON.stringify(pieces));
export const saveWears = (wears: Wear[]) => AsyncStorage.setItem(WEARS_KEY, JSON.stringify(wears));
