import { expect, it, vi } from "vitest";

import { capture } from "@/client/add-piece";

// On a phone, File.copy finishes later. The temporary picture must not be
// deleted before it has: the piece would be saved without a photo.
const steps = vi.hoisted(() => [] as string[]);

vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("@/client/passcode-gate", () => ({}));
vi.mock("@/client/cut-out", () => ({
  cutOut: async () => "file:///cache/cut.jpg",
  deleteIfCached: () => steps.push("temporary picture deleted"),
}));
vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: async () => ({ granted: true }),
  launchCameraAsync: async () => ({ canceled: false, assets: [{ uri: "file:///cache/photo.jpg", width: 100, height: 100 }] }),
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: {} },
  Directory: class {
    create() {}
  },
  File: class {
    uri = "file:///documents/closet/a.jpg";
    async copy() {
      await new Promise((resolve) => setTimeout(resolve, 1));
      steps.push("copied");
    }
  },
}));

it("finishes copying a photo before deleting the temporary picture", async () => {
  await expect(capture("a.jpg")).resolves.toBe("file:///documents/closet/a.jpg");
  expect(steps).toEqual(["copied", "temporary picture deleted"]);
});
