import { File, Paths, Directory } from "expo-file-system/next";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { passcodeHeaders, passcodeRejected } from "@/client/passcode-gate";
import { useCloset } from "@/client/closet-context";
import { AstroidIcon, RotateCwIcon } from "@/client/icons";
import { LabelEditor } from "@/client/label-editor";
import { colors } from "@/client/theme";
import type { Origin } from "@/storage/closet";

const ORIGINS: { value: Origin; label: string }[] = [
  { value: "secondhand", label: "Second-hand" },
  { value: "new", label: "New" },
  { value: "gift", label: "Gift" },
];

type RenderState =
  | { status: "idle" }
  | { status: "drawing" }
  | { status: "done"; mimeType: string; base64: string }
  | { status: "error"; message: string };

// One piece: what it is, where it's from, and the way to fix or remove it.
export default function PieceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pieces, setOrigin, readAgain, setLabel, confirmLabels, retake, removePiece, updatePhoto } = useCloset();
  const [render, setRender] = useState<RenderState>({ status: "idle" });
  const [rotating, setRotating] = useState(false);

  // Undefined for a moment after "Remove", while the screen closes.
  const piece = pieces.find((p) => p.id === id);
  if (piece === undefined) return null;

  function confirmRemove() {
    Alert.alert("Remove this piece?", "Its photo and labels are deleted from this phone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          router.back();
          removePiece(piece!.id);
        },
      },
    ]);
  }

  async function drawWithGemini() {
    if (piece!.status !== "read") return;
    setRender({ status: "drawing" });
    try {
      const photoBase64 = await new File(piece!.photo).base64();
      const response = await fetch("/api/render-piece", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...passcodeHeaders() },
        body: JSON.stringify({ photoBase64, tags: piece!.tags }),
      });
      if (response.status === 401) { passcodeRejected(); return; }
      const data = (await response.json()) as { mimeType?: string; base64?: string; error?: string };
      if (!response.ok || !data.base64 || !data.mimeType) {
        setRender({ status: "error", message: data.error ?? "No image returned" });
      } else {
        setRender({ status: "done", mimeType: data.mimeType, base64: data.base64 });
      }
    } catch (error) {
      setRender({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function rotatePhoto() {
    if (rotating) return;
    setRotating(true);
    try {
      const ctx = ImageManipulator.manipulate(piece!.photo);
      ctx.rotate(90);
      const img = await ctx.renderAsync();
      const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      const folder = new Directory(Paths.document, "closet");
      folder.create({ idempotent: true, intermediates: true });
      const kept = new File(folder, `${piece!.id}-r${Date.now().toString(36)}.jpg`);
      await new File(saved.uri).copy(kept);
      updatePhoto(piece!.id, kept.uri);
    } catch (error) {
      console.warn("Rotation failed:", error);
    } finally {
      setRotating(false);
    }
  }

  async function useRendered() {
    if (render.status !== "done") return;
    const { base64, mimeType } = render;
    const ext = mimeType === "image/png" ? "png" : "jpg";
    const fileName = `${piece!.id}-rendered-${Date.now().toString(36)}.${ext}`;
    const folder = new Directory(Paths.document, "closet");
    folder.create({ idempotent: true, intermediates: true });
    const kept = new File(folder, fileName);
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    await kept.write(bytes);
    updatePhoto(piece!.id, kept.uri);
    setRender({ status: "idle" });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.photoContainer}>
        <Image source={piece.photo} style={styles.photo} contentFit="contain" />
        {piece.status === "read" && (
          <Pressable
            style={styles.geminiBtn}
            onPress={() => drawWithGemini().catch(console.warn)}
            disabled={render.status === "drawing"}
            accessibilityRole="button"
            accessibilityLabel="Draw with Gemini"
          >
            {render.status === "drawing" ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <AstroidIcon size={20} color="white" />
            )}
          </Pressable>
        )}
        <Pressable
          style={styles.rotateBtn}
          onPress={() => rotatePhoto().catch(console.warn)}
          disabled={rotating}
          accessibilityRole="button"
          accessibilityLabel="Rotate photo"
        >
          {rotating ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <RotateCwIcon size={20} color="white" />
          )}
        </Pressable>
      </View>

      {piece.status === "reading" && (
        <View style={styles.row}>
          <ActivityIndicator size="small" />
          <Text style={styles.muted}>Looking at it…</Text>
        </View>
      )}
      {piece.status === "failed" && (
        <Pressable onPress={() => readAgain(piece)}>
          <Text style={styles.muted}>Couldn't read it. Tap to try again.</Text>
        </Pressable>
      )}
      {piece.status === "read" && (
        <LabelEditor
          key={piece.photo} // a new photo brings new labels: start the editor over
          tags={piece.tags}
          checked={piece.checked}
          onChange={(field, value) => setLabel(piece.id, field, value)}
          onConfirm={() => confirmLabels(piece.id)}
        />
      )}

      {/* Asked here, not in a form during scanning: one tap, skippable, and
          it fills the seconds while the model reads. */}
      <View style={styles.block}>
        <Text style={styles.question}>Where is it from?</Text>
        <View style={styles.row}>
          {ORIGINS.map((origin) => {
            const chosen = piece.origin === origin.value;
            return (
              <Pressable
                key={origin.value}
                style={[styles.chip, chosen && styles.chipChosen]}
                onPress={() => setOrigin(piece.id, origin.value)}
              >
                <Text style={[styles.chipText, chosen && styles.chipTextChosen]}>{origin.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {render.status === "done" && (
        <View style={styles.block}>
          <Image
            source={{ uri: `data:${render.mimeType};base64,${render.base64}` }}
            style={styles.photo}
            contentFit="contain"
          />
          <View style={styles.renderActions}>
            <Pressable style={styles.action} onPress={useRendered} accessibilityRole="button">
              <Text style={styles.actionText}>Use this photo</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => drawWithGemini().catch(console.warn)} accessibilityRole="button">
              <Text style={styles.actionText}>Draw again</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => setRender({ status: "idle" })} accessibilityRole="button">
              <Text style={[styles.actionText, styles.actionMuted]}>Discard</Text>
            </Pressable>
          </View>
        </View>
      )}

      {render.status === "error" && (
        <Text style={styles.renderError}>{render.message}</Text>
      )}

      <View style={styles.block}>
        <Pressable style={styles.action} onPress={() => retake(piece.id).catch(console.warn)} accessibilityRole="button">
          <Text style={styles.actionText}>Retake photo</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={confirmRemove} accessibilityRole="button">
          <Text style={[styles.actionText, styles.danger]}>Remove from closet</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, gap: 24 },
  photoContainer: { position: "relative" },
  photo: { aspectRatio: 1, borderRadius: 16, backgroundColor: colors.photoBack },
  geminiBtn: {
    position: "absolute", top: 12, right: 12,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  rotateBtn: {
    position: "absolute", bottom: 12, right: 12,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  block: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  muted: { fontSize: 13, color: colors.muted },
  question: { fontSize: 16, fontWeight: "600", color: colors.ink },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line },
  chipChosen: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 15, color: colors.ink },
  chipTextChosen: { color: colors.page },
  action: { paddingVertical: 12 },
  actionText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  danger: { color: colors.danger },
  actionMuted: { color: colors.muted },
  renderActions: { gap: 0 },
  renderError: { fontSize: 14, color: colors.danger, lineHeight: 20 },
});
