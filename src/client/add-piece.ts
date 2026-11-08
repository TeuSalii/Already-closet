import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

import { cutOut, deleteIfCached } from "@/client/cut-out";
import { passcodeHeaders, passcodeRejected } from "@/client/passcode-gate";
import type { GarmentTags, TagRequest, TagResponse } from "@/shared/garment";

// Taking photos and reading them, kept outside the screens so the screens
// only decide what to show.

export type Source = "camera" | "library";

// Opens the camera, or the photo library (for a screenshot of something seen
// in an online shop), then the cut screen, where the person draws around
// the garment or frames it (see cut-out.ts).
// Returns the final picture's uri in the cache, or null if the person backs
// out. The cache may be cleared at any time: fine for a wish, which is not
// kept; a piece you own is copied out of it by capture().
export async function pick(source: Source): Promise<string | null> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      source === "camera" ? "Camera access is off" : "Photo access is off",
      "You can turn it on for this app in your phone's settings.",
    );
    return null;
  }

  // No system crop: the cut screen does that, with a free frame or a line.
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: "images", quality: 0.8 };
  const result =
    source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;

  const { uri, width, height } = result.assets[0];
  return cutOut(uri, width, height); // the cut screen cleans up what it made on the way
}

// Takes a photo of a piece you own and keeps it under `fileName`. Returns its
// uri, or null if the person backs out.
export async function capture(fileName: string): Promise<string | null> {
  const picked = await pick("camera");
  if (picked === null) return null;

  // Copy the photo out of the cache into the app's own documents folder so it stays.
  const folder = new Directory(Paths.document, "closet");
  folder.create({ idempotent: true, intermediates: true });
  const kept = new File(folder, fileName);
  await new File(picked).copy(kept); // finished before the original goes
  deleteIfCached(picked);
  return kept.uri;
}

// Sends a photo to the Mac and gets the tags back.
export async function readPhoto(photoUri: string): Promise<GarmentTags> {
  const body: TagRequest = { photoBase64: await new File(photoUri).base64() };
  const response = await fetch("/api/tag", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...passcodeHeaders() },
    body: JSON.stringify(body),
  });
  if (response.status === 401) passcodeRejected();
  if (!response.ok) {
    throw new Error(`Tagging failed (${response.status}): ${await response.text()}`);
  }
  return ((await response.json()) as TagResponse).tags;
}
