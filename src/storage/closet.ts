import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Estimates } from "@/shared/coverage";
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

// Nothing is still reading when the app starts. A piece saved as "reading"
// lost its answer when the app closed, and would show a spinner forever.
export const interruptedReadsFailed = (pieces: Piece[]): Piece[] =>
  pieces.map((piece) => (piece.status === "reading" ? { ...piece, status: "failed" } : piece));

export const loadPieces = () => load<Piece>(PIECES_KEY).then(interruptedReadsFailed);
export const savePieces = (pieces: Piece[]) => AsyncStorage.setItem(PIECES_KEY, JSON.stringify(pieces));

// A wish saved to look for second-hand (concept v3, "Act"). Its photo is
// the cut-out of the garment, kept on the phone only while the wish is on
// the list. Missing on wishes saved before photos were kept.
export type SavedWish = { id: string; tags: GarmentTags; savedAt: string; photo?: string };

const WISHES_KEY = "secondhand:v1";

export const loadWishes = () => load<SavedWish>(WISHES_KEY);
export const saveWishes = (wishes: SavedWish[]) => AsyncStorage.setItem(WISHES_KEY, JSON.stringify(wishes));

// The passcode for the dev server, typed once on this phone.
const PASSCODE_KEY = "passcode:v1";

export const loadPasscode = () => AsyncStorage.getItem(PASSCODE_KEY);
export const savePasscode = (passcode: string) => AsyncStorage.setItem(PASSCODE_KEY, passcode);
export const forgetPasscode = () => AsyncStorage.removeItem(PASSCODE_KEY);

// The person's own guess of how many pieces they own per category.
const ESTIMATES_KEY = "estimates:v1";

export async function loadEstimates(): Promise<Estimates> {
  const raw = await AsyncStorage.getItem(ESTIMATES_KEY);
  return raw === null ? {} : (JSON.parse(raw) as Estimates);
}
export const saveEstimates = (estimates: Estimates) => AsyncStorage.setItem(ESTIMATES_KEY, JSON.stringify(estimates));
