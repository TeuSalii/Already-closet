import { File } from "expo-file-system/next";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { passcodeHeaders, passcodeRejected } from "@/client/passcode-gate";
import { useCloset } from "@/client/closet-context";
import { cutOut } from "@/client/cut-out";
import { RotateCwIcon, ScissorsLineDashedIcon } from "@/client/icons";
import { colors } from "@/client/theme";
import type { GarmentTags } from "@/shared/garment";
import { JPEG_QUALITY, MAX_SIDE } from "@/shared/photo-size";

// "Add an outfit" flow: take a photo of an outfit → Gemini identifies each
// piece and renders it alone on white → review and add pieces to the closet.

type PieceRender =
  | { status: "pending" | "rendering" | "error" }
  | { status: "done"; mimeType: string; base64: string };

type PieceRow = { tags: GarmentTags; render: PieceRender; added: boolean };

type Phase =
  | { name: "start" }
  | { name: "photo"; uri: string; rotating: boolean }
  | { name: "listing"; uri: string }
  | { name: "pieces"; uri: string; pieces: PieceRow[] };

async function shrinkPhoto(uri: string, width: number, height: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_SIDE) {
    ctx.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const img = await ctx.renderAsync();
  const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  return saved.uri;
}

async function rotateCw(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.rotate(90);
  const img = await ctx.renderAsync();
  const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  return saved.uri;
}

export default function AddOutfitScreen() {
  const insets = useSafeAreaInsets();
  const { addRenderedPiece, addPieceFromUri } = useCloset();
  const [phase, setPhase] = useState<Phase>({ name: "start" });
  const photoBase64Ref = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  async function pickPhoto(source: "camera" | "library") {
    const perm = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        source === "camera" ? "Camera access is off" : "Photo access is off",
        "You can turn it on in your phone's settings.",
      );
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: "images", quality: 0.85 };
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled) return;

    const { uri, width, height } = result.assets[0];
    const shrunk = await shrinkPhoto(uri, width, height);
    setPhase({ name: "photo", uri: shrunk, rotating: false });
  }

  async function rotate() {
    if (phase.name !== "photo") return;
    setPhase({ ...phase, rotating: true });
    const rotated = await rotateCw(phase.uri);
    if (!mounted.current) return;
    setPhase({ name: "photo", uri: rotated, rotating: false });
  }

  async function findPieces() {
    if (phase.name !== "photo") return;
    const uri = phase.uri;
    setPhase({ name: "listing", uri });

    // Convert to base64 for the API calls
    const base64 = await new File(uri).base64();
    photoBase64Ref.current = base64;

    try {
      const res = await fetch("/api/list-pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...passcodeHeaders() },
        body: JSON.stringify({ photoBase64: base64 }),
      });
      if (res.status === 401) { passcodeRejected(); return; }
      if (!res.ok) throw new Error("Couldn't find the pieces");
      const data = (await res.json()) as { pieces?: GarmentTags[]; error?: string };
      if (!data.pieces?.length) throw new Error(data.error ?? "No pieces found in this photo");

      const rows: PieceRow[] = data.pieces.map((tags) => ({ tags, render: { status: "pending" }, added: false }));
      if (!mounted.current) return;
      setPhase({ name: "pieces", uri, pieces: rows });
      renderAll(base64, rows);
    } catch (error) {
      if (!mounted.current) return;
      Alert.alert("Couldn't read the photo", error instanceof Error ? error.message : "Try again.");
      setPhase({ name: "photo", uri, rotating: false });
    }
  }

  async function renderAll(base64: string, initial: PieceRow[]) {
    for (let i = 0; i < initial.length; i++) {
      if (!mounted.current) return;
      setPhase((prev) => {
        if (prev.name !== "pieces") return prev;
        return { ...prev, pieces: prev.pieces.map((p, j) => j === i ? { ...p, render: { status: "rendering" } } : p) };
      });
      try {
        const res = await fetch("/api/render-piece", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...passcodeHeaders() },
          body: JSON.stringify({ photoBase64: base64, tags: initial[i].tags }),
        });
        if (!mounted.current) return;
        const data = (await res.json()) as { mimeType?: string; base64?: string; error?: string };
        const render: PieceRender = res.ok && data.base64 && data.mimeType
          ? { status: "done", mimeType: data.mimeType, base64: data.base64 }
          : { status: "error" };
        setPhase((prev) => {
          if (prev.name !== "pieces") return prev;
          return { ...prev, pieces: prev.pieces.map((p, j) => j === i ? { ...p, render } : p) };
        });
      } catch {
        if (!mounted.current) return;
        setPhase((prev) => {
          if (prev.name !== "pieces") return prev;
          return { ...prev, pieces: prev.pieces.map((p, j) => j === i ? { ...p, render: { status: "error" } } : p) };
        });
      }
    }
  }

  async function addPiece(index: number) {
    if (phase.name !== "pieces") return;
    const row = phase.pieces[index];
    if (row.render.status !== "done") return;
    await addRenderedPiece(row.tags, row.render.base64, row.render.mimeType);
    if (!mounted.current) return;
    setPhase((prev) => {
      if (prev.name !== "pieces") return prev;
      return { ...prev, pieces: prev.pieces.map((p, j) => j === index ? { ...p, added: true } : p) };
    });
  }

  // Manual cut-out: opens the lasso tool on the full outfit photo so the
  // person can draw precisely around one piece.  The photo is already shrunk
  // to ≤ MAX_SIDE so passing MAX_SIDE avoids a second resize in cut-picture.ts.
  async function cutPiece(index: number) {
    if (phase.name !== "pieces") return;
    const uri = await cutOut(phase.uri, MAX_SIDE, MAX_SIDE);
    if (!mounted.current || uri === null) return;
    await addPieceFromUri(phase.pieces[index].tags, uri);
    if (!mounted.current) return;
    setPhase((prev) => {
      if (prev.name !== "pieces") return prev;
      return { ...prev, pieces: prev.pieces.map((p, j) => j === index ? { ...p, added: true } : p) };
    });
  }

  if (phase.name === "start") {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.landing}>
          <Text style={styles.title}>Add an outfit</Text>
          <Text style={styles.body}>
            Take a photo of an outfit you're wearing. The app identifies each piece and draws it alone — ready to add to your closet.
          </Text>
          <Pressable style={[styles.btn, styles.btnFilled]} onPress={() => pickPhoto("camera")} accessibilityRole="button">
            <Text style={[styles.btnText, styles.btnFilledText]}>Take a photo</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnOutlined]} onPress={() => pickPhoto("library")} accessibilityRole="button">
            <Text style={styles.btnText}>From library</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase.name === "photo") {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.photoWrap}>
          <Image source={{ uri: phase.uri }} style={styles.photoFull} resizeMode="contain" />
          <Pressable
            style={styles.rotateBtn}
            onPress={() => rotate().catch(console.warn)}
            disabled={phase.rotating}
            accessibilityRole="button"
            accessibilityLabel="Rotate photo"
          >
            {phase.rotating ? <ActivityIndicator size="small" color="white" /> : <RotateCwIcon size={20} color="white" />}
          </Pressable>
        </View>
        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.btnFilled, styles.btnFlex]} onPress={() => findPieces().catch(console.warn)} accessibilityRole="button">
            <Text style={[styles.btnText, styles.btnFilledText]}>Find the pieces</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase.name === "listing") {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}>
        <Image source={{ uri: phase.uri }} style={styles.photoThumb} resizeMode="contain" />
        <View style={styles.listingState}>
          <ActivityIndicator size="small" color={colors.soft} />
          <Text style={styles.listingText}>Finding pieces…</Text>
        </View>
      </View>
    );
  }

  // Phase "pieces"
  const { pieces } = phase;
  const addedCount = pieces.filter((p) => p.added).length;
  const allDone = pieces.every((p) => p.render.status === "done" || p.render.status === "error");

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <Image source={{ uri: phase.uri }} style={styles.photoThumb} resizeMode="contain" />
          <Text style={styles.listIntro}>
            {pieces.length} {pieces.length === 1 ? "piece" : "pieces"} found.{" "}
            {allDone ? "Review and add the ones you own." : "Drawing each piece…"}
          </Text>
        </View>
      }
      ListFooterComponent={
        addedCount > 0 ? (
          <Pressable style={[styles.btn, styles.btnOutlined, { marginHorizontal: 0 }]} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.btnText}>{addedCount} {addedCount === 1 ? "piece" : "pieces"} added — done</Text>
          </Pressable>
        ) : undefined
      }
      data={pieces}
      keyExtractor={(_, i) => String(i)}
      renderItem={({ item, index }) => (
        <PieceCard
          row={item}
          onAdd={() => addPiece(index).catch(console.warn)}
          onCutManually={() => cutPiece(index).catch(console.warn)}
        />
      )}
    />
  );
}

function PieceCard({ row, onAdd, onCutManually }: { row: PieceRow; onAdd: () => void; onCutManually: () => void }) {
  const { tags, render, added } = row;
  return (
    <View style={styles.card}>
      <View style={styles.cardThumbWrap}>
        {render.status === "pending" && <View style={styles.cardThumbPlaceholder} />}
        {render.status === "rendering" && (
          <View style={styles.cardThumbPlaceholder}>
            <ActivityIndicator size="small" color={colors.soft} />
          </View>
        )}
        {render.status === "error" && (
          <View style={styles.cardThumbPlaceholder}>
            <Text style={styles.cardThumbError}>✕</Text>
          </View>
        )}
        {render.status === "done" && (
          <Image
            source={{ uri: `data:${render.mimeType};base64,${render.base64}` }}
            style={styles.cardThumb}
            resizeMode="contain"
          />
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardLabel} numberOfLines={1}>{tags.label}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {tags.colors[0]} · {tags.type} · {tags.formality}
        </Text>
      </View>
      {!added && (
        <View style={styles.cardBtns}>
          {render.status === "done" && (
            <Pressable style={styles.addBtn} onPress={onAdd} accessibilityRole="button">
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          )}
          {/* Always available: draw around it manually with the lasso tool. */}
          <Pressable
            style={styles.cutBtn}
            onPress={onCutManually}
            accessibilityRole="button"
            accessibilityLabel="Cut out manually"
          >
            <ScissorsLineDashedIcon size={20} color={colors.ink} />
          </Pressable>
        </View>
      )}
      {added && <Text style={styles.addedText}>Added</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },

  landing: { flex: 1, padding: 32, justifyContent: "center", gap: 14 },
  title: { fontSize: 22, fontWeight: "700", color: colors.ink, textAlign: "center" },
  body: { fontSize: 15, color: colors.soft, lineHeight: 22, textAlign: "center", marginBottom: 6 },

  btn: { paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  btnFilled: { backgroundColor: colors.ink },
  btnOutlined: { borderWidth: 1.5, borderColor: colors.ink },
  btnFlex: { flex: 1 },
  btnText: { fontSize: 15, fontWeight: "600", color: colors.ink },
  btnFilledText: { color: colors.page },

  photoWrap: { position: "relative", flex: 1, margin: 16 },
  photoFull: { flex: 1, borderRadius: 16, backgroundColor: colors.photoBack },
  rotateBtn: {
    position: "absolute", bottom: 12, right: 12,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },

  actions: { flexDirection: "row", gap: 12, marginHorizontal: 16, marginBottom: 0 },

  photoThumb: { width: 80, height: 80, borderRadius: 10, backgroundColor: colors.photoBack },

  listingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  listingText: { fontSize: 15, color: colors.soft },

  list: { padding: 16, gap: 8 },
  listHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 8 },
  listIntro: { flex: 1, fontSize: 15, color: colors.soft, lineHeight: 21 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  cardThumbWrap: { width: 72, height: 72 },
  cardThumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.photoBack },
  cardThumbPlaceholder: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.photoBack, alignItems: "center", justifyContent: "center" },
  cardThumbError: { fontSize: 20, color: colors.muted },
  cardInfo: { flex: 1, gap: 3 },
  cardLabel: { fontSize: 15, fontWeight: "500", color: colors.ink },
  cardMeta: { fontSize: 13, color: colors.soft },
  cardBtns: { flexDirection: "row", alignItems: "center", gap: 8 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.ink },
  addBtnText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  cutBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  addedText: { fontSize: 14, fontWeight: "500", color: colors.soft },
});
