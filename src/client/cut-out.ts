import { File, Paths } from "expo-file-system";
import { router } from "expo-router";

// Cutting a picture down to the one garment, with a finger: drawn around
// (lasso) or framed. Everything outside the line becomes white, on the
// phone, before anything is sent to the model. So a background, a room or
// the face of whoever wears the piece never leaves the phone (concept v3,
// risks R6 and R7). There is deliberately no way to skip this step.
//
// This file is loaded when the app opens, so it must not import Skia. The
// picture work itself is in cut-picture.ts.

// The hand-off to the cut screen. It is a screen of its own (it needs the
// whole display), but callers just await the result: the cut picture's uri,
// or null if the person went back.
let pending: ((uri: string | null) => void) | null = null;

// The picture to cut. Handed over here, not as a route parameter: in Expo
// Go, file paths contain encoded parts ("%2540anonymous%252F…"), and the
// router decodes them once more on the way, so the screen got a path to a
// file that does not exist.
type CutRequest = { photo: string; width: number; height: number };
let request: CutRequest | null = null;
export const currentCut = () => request;

// The screen opens at once and prepares the picture itself, so the person
// sees it working instead of a screen that seems stuck.
export function cutOut(photo: string, width: number, height: number): Promise<string | null> {
  pending?.(null); // an older cut that never finished
  return new Promise((resolve) => {
    pending = resolve;
    request = { photo, width, height };
    router.push("/cut");
  });
}

// Called by the cut screen. Safe to call twice: only the first counts, so
// the screen can also call it with null when it closes.
export function settleCut(uri: string | null) {
  const resolve = pending;
  pending = null;
  resolve?.(uri);
}

// Pictures made on the way (the picker's copy, the shrunk one) are deleted
// once the final one exists. Only files in the app's own cache: a file the
// app does not own is never touched.
export function deleteIfCached(uri: string) {
  if (uri.startsWith(Paths.cache.uri)) deleteFile(uri);
}

// A photo that is gone already is fine: the goal is that it is gone.
export function deleteFile(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn(error);
  }
}
