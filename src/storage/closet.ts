import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Field, GarmentTags } from "@/shared/garment";

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
  // `checked`: the labels the person has confirmed or changed. Kept with the
  // tags, so reading the photo again starts the check over. Missing on
  // pieces saved before checking existed, which means "none checked".
  | { status: "read"; tags: GarmentTags; checked?: Field[] }
  | { status: "failed" };

export type Piece = PieceBase & PieceStatus;

// v2 (2026-10-31): new label lists (season, formality, confidence). Pieces
// saved under v1 have the old words, so they are left behind and you start
// fresh.
const PIECES_KEY = "closet:v2";

async function load<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  return raw === null ? [] : (JSON.parse(raw) as T[]);
}

export const loadPieces = () => load<Piece>(PIECES_KEY);
export const savePieces = (pieces: Piece[]) => AsyncStorage.setItem(PIECES_KEY, JSON.stringify(pieces));
