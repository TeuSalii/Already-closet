import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import type { GarmentTags, TagRequest, TagResponse } from "@/shared/garment";

// Taking photos and reading them, kept outside the screens so the screens
// only decide what to show.

// Opens the camera and keeps the photo under `fileName`. Returns its uri,
// or null if the person backs out.
// The photo is cropped to the piece, like the grid it lands in.
export async function capture(fileName: string): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Camera permission was not given");
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: "images",
    allowsEditing: true, // crop to the piece: less background, better tags
    aspect: [1, 1],
    quality: 0.6, // a phone photo is several MB; the model needs far less
  });
  if (result.canceled) return null;

  // The camera writes into the cache, which the phone may clear at any time.
  // Copy the photo into the app's own documents folder so it stays.
  const folder = new Directory(Paths.document, "closet");
  folder.create({ idempotent: true, intermediates: true });
  const kept = new File(folder, fileName);
  new File(result.assets[0].uri).copy(kept);
  return kept.uri;
}

// Sends a kept photo to the Mac and gets the tags back.
export async function readPhoto(photoUri: string): Promise<GarmentTags> {
  const body: TagRequest = { photoBase64: await new File(photoUri).base64() };
  const response = await fetch("/api/tag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Tagging failed (${response.status}): ${await response.text()}`);
  }
  return ((await response.json()) as TagResponse).tags;
}
