import { ClipOp, ImageFormat, Skia, type SkImage, type SkPoint } from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { JPEG_QUALITY, MAX_SIDE } from "@/shared/photo-size";

// The picture work behind the cut screen. Kept apart from cut-out.ts because
// it needs Skia, and only the cut screen may import this file: in a release
// build, Skia then loads when that screen first opens, not with the app. (In
// development, Expo Router loads every screen at the start anyway.)

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
