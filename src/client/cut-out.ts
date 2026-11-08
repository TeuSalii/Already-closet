import { ClipOp, ImageFormat, Skia, type SkImage, type SkPoint } from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { router } from "expo-router";

import { JPEG_QUALITY, MAX_SIDE } from "@/shared/photo-size";

// Cutting a picture down to the one garment, with a finger: drawn around
// (lasso) or framed. Everything outside the line becomes white, on the
// phone, before anything is sent to the model. So a background, a room or
// the face of whoever wears the piece never leaves the phone (concept v3,
// risks R6 and R7). There is deliberately no way to skip this step.

const PADDING = 0.03; // a little white around the cut-out, as a share of its size

// Makes the picture a size the phone can cut without trouble, and writes
// it upright, so what the cut screen shows is what gets cut.
export async function shrink(uri: string, width: number, height: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_SIDE) {
    context.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  return saved.uri;
}

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

// Longer than this and something is wrong: say so instead of spinning forever.
const PREPARE_LIMIT_MS = 20_000;

// Shrinks the picture and opens it for drawing. Deletes nothing: the
// screen may start this twice (React does so in development), and the
// second run still needs the original. The screen cleans up when it closes.
export function prepare(photo: string, width: number, height: number): Promise<{ uri: string; image: SkImage }> {
  const work = (async () => {
    const uri = await shrink(photo, width, height);
    return { uri, image: await openPicture(uri) };
  })();
  const limit = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Preparing the picture took over ${PREPARE_LIMIT_MS / 1000} s`)), PREPARE_LIMIT_MS),
  );
  return Promise.race([work, limit]);
}

// Called by the cut screen. Safe to call twice: only the first counts, so
// the screen can also call it with null when it closes.
export function settleCut(uri: string | null) {
  const resolve = pending;
  pending = null;
  resolve?.(uri);
}

// Opens a picture for Skia. Not with Skia's own useImage(uri): if loading
// fails it never says so, and the screen waits forever. The bytes are read
// with expo-file-system, which reads the app's own files reliably.
export async function openPicture(uri: string): Promise<SkImage> {
  const bytes = await new File(uri).bytes();
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (image === null) throw new Error(`Could not open the picture (${bytes.length} bytes)`);
  return image;
}

// The shape the person drew, in the picture's own pixels. Paints the
// picture inside it onto white and crops to the shape.
export async function renderCutout(image: SkImage, outline: SkPoint[]): Promise<string> {
  const path = Skia.Path.Polygon(outline, true);
  const shape = path.computeTightBounds();
  const pad = Math.max(shape.width, shape.height) * PADDING;
  const left = Math.max(0, Math.floor(shape.x - pad));
  const top = Math.max(0, Math.floor(shape.y - pad));
  const right = Math.min(image.width(), Math.ceil(shape.x + shape.width + pad));
  const bottom = Math.min(image.height(), Math.ceil(shape.y + shape.height + pad));

  const surface = Skia.Surface.Make(right - left, bottom - top);
  if (surface === null) throw new Error("Could not make room to cut the picture");
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color("white"));
  canvas.translate(-left, -top);
  canvas.clipPath(path, ClipOp.Intersect, true);
  canvas.drawImage(image, 0, 0);
  surface.flush();

  const file = new File(Paths.cache, `cut-${Date.now().toString(36)}.jpg`);
  await file.write(surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, 85));
  return file.uri;
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
