import { Canvas, Group, Image as SkiaImage, Path, Rect, Skia, type SkImage, type SkPoint } from "@shopify/react-native-skia";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, type GestureResponderEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { currentCut, deleteIfCached, prepare, renderCutout, settleCut } from "@/client/cut-out";
import { colors } from "@/client/theme";

// Cut out the garment: draw around it with a finger, or drag a frame.
// Opened by cutOut() in cut-out.ts, which waits for this screen's answer.

type Mode = "draw" | "frame";

const MIN_SIZE = 40; // on screen, in points: smaller is a slip of the finger
const MIN_STEP = 3; // skip touch points closer than this: a lighter outline

export default function CutScreen() {
  // Read once: the request belongs to this screen for as long as it is open.
  const [params] = useState(currentCut);
  const insets = useSafeAreaInsets();
  const [prepared, setPrepared] = useState<{ uri: string; image: SkImage } | null>(null);
  const image = prepared?.image ?? null;
  const [failed, setFailed] = useState<string | null>(params === null ? "No picture was handed to this screen." : null);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [points, setPoints] = useState<SkPoint[]>([]); // on screen
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (params === null) return;
    let open = true;
    prepare(params.photo, params.width, params.height)
      .then((ready) => {
        made.add(ready.uri);
        if (open) setPrepared(ready);
      })
      .catch((error: unknown) => {
        console.warn(error);
        if (open) setFailed(error instanceof Error ? error.message : String(error));
      });
    return () => {
      open = false;
    };
  }, [params]);

  // Only when the screen really closes: leaving by the back button or
  // gesture means "cancel", and every picture made on the way is deleted
  // except the one handed on.
  const original = params?.photo;
  useEffect(
    () => () => {
      settleCut(null);
      for (const uri of [original, ...made]) if (uri !== undefined && uri !== kept) deleteIfCached(uri);
      made.clear();
    },
    [original],
  );

  function finish(uri: string) {
    kept = uri;
    settleCut(uri);
    router.back();
  }

  // Where the picture sits on screen ("contain": all of it, centred).
  const fit =
    image !== null && area !== null
      ? (() => {
          const scale = Math.min(area.width / image.width(), area.height / image.height());
          const width = image.width() * scale;
          const height = image.height() * scale;
          return { scale, x: (area.width - width) / 2, y: (area.height - height) / 2, width, height };
        })()
      : null;

  // The shape on screen, from what the finger did.
  const outline: SkPoint[] =
    mode === "frame" && points.length >= 2 ? frameCorners(points[0], points[points.length - 1]) : points;
  const bounds = boundsOf(outline);
  const ready = !drawing && outline.length >= 3 && bounds.width >= MIN_SIZE && bounds.height >= MIN_SIZE;

  function at(event: GestureResponderEvent): SkPoint {
    const { locationX, locationY } = event.nativeEvent;
    if (fit === null) return { x: locationX, y: locationY };
    // Kept on the picture: a line that wanders off it still cuts the picture.
    return {
      x: clamp(locationX, fit.x, fit.x + fit.width),
      y: clamp(locationY, fit.y, fit.y + fit.height),
    };
  }

  function start(event: GestureResponderEvent) {
    setDrawing(true);
    setPoints([at(event)]);
  }

  function move(event: GestureResponderEvent) {
    const point = at(event);
    setPoints((current) => {
      if (mode === "frame") return [current[0], point];
      const last = current[current.length - 1];
      return Math.hypot(point.x - last.x, point.y - last.y) < MIN_STEP ? current : [...current, point];
    });
  }

  async function cut() {
    if (fit === null) return;
    setBusy(true);
    try {
      // From screen points to the picture's own pixels.
      const inPicture = outline.map((p) => ({ x: (p.x - fit.x) / fit.scale, y: (p.y - fit.y) / fit.scale }));
      finish(await renderCutout(image!, inPicture));
    } catch (error) {
      console.warn(error);
      setBusy(false);
    }
  }

  const shape = outline.length >= 2 ? Skia.Path.Polygon(outline, !drawing || mode === "frame") : null;

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.hint}>
        {mode === "draw" ? "Draw around the piece with your finger." : "Drag across the piece to frame it."}
        {" "}Everything outside turns white before the AI sees it.
      </Text>

      <View
        style={styles.area}
        onLayout={(event) => setArea(event.nativeEvent.layout)}
        onStartShouldSetResponder={() => !busy}
        onMoveShouldSetResponder={() => !busy}
        onResponderGrant={start}
        onResponderMove={move}
        onResponderRelease={() => setDrawing(false)}
        onResponderTerminate={() => setDrawing(false)}
        accessibilityLabel="The picture. Draw around the piece you mean."
      >
        {failed ? (
          <View style={styles.flex}>
            <Text style={styles.hint}>
              This picture couldn't be opened for cutting. Use it as it is, or go back and choose another.
            </Text>
            <Text style={[styles.hint, styles.muted]} selectable>Details: {failed}</Text>
          </View>
        ) : fit === null ? (
          <View style={[styles.flex, styles.center]}>
            <ActivityIndicator />
            <Text style={styles.muted}>Preparing the picture…</Text>
          </View>
        ) : (
          <Canvas style={styles.flex} pointerEvents="none">
            <SkiaImage image={image} x={fit.x} y={fit.y} width={fit.width} height={fit.height} fit="fill" />
            {shape !== null && ready && (
              // Dims what will be cut away, so the result is visible before cutting.
              <Group clip={shape} invertClip>
                <Rect x={0} y={0} width={area!.width} height={area!.height} color="rgba(255,255,255,0.75)" />
              </Group>
            )}
            {shape !== null && (
              <>
                <Path path={shape} style="stroke" strokeWidth={5} color={colors.ink} strokeJoin="round" strokeCap="round" />
                <Path path={shape} style="stroke" strokeWidth={2} color="white" strokeJoin="round" strokeCap="round" />
              </>
            )}
          </Canvas>
        )}
      </View>

      <View style={styles.modes}>
        <Chip text="Draw around it" chosen={mode === "draw"} onPress={() => { setMode("draw"); setPoints([]); }} />
        <Chip text="Frame" chosen={mode === "frame"} onPress={() => { setMode("frame"); setPoints([]); }} />
        {points.length > 0 && <Chip text="Start over" chosen={false} onPress={() => setPoints([])} />}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.outlined, !prepared && !failed && styles.disabled]}
          onPress={() => (params === null ? router.back() : finish(prepared?.uri ?? params.photo))}
          disabled={busy || (!prepared && !failed)}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Use as it is</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.filled, (!ready || busy) && styles.disabled]}
          onPress={cut}
          disabled={!ready || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || busy }}
        >
          {busy ? <ActivityIndicator color={colors.page} /> : <Text style={[styles.buttonText, styles.filledText]}>Cut out</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function Chip({ text, chosen, onPress }: { text: string; chosen: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.chip, chosen && styles.chipChosen]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
    >
      <Text style={[styles.chipText, chosen && styles.chipTextChosen]}>{text}</Text>
    </Pressable>
  );
}

function frameCorners(a: SkPoint, b: SkPoint): SkPoint[] {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
}

function boundsOf(points: SkPoint[]) {
  if (points.length === 0) return { width: 0, height: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

// Which picture "Use as it is" or "Cut out" handed on, so cleanup never
// deletes it, and the shrunk pictures made on the way. Module-level: the
// cleanup runs after the screen is gone.
let kept: string | null = null;
const made = new Set<string>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page, gap: 12 },
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 8 },
  muted: { fontSize: 13, color: colors.muted },
  hint: { fontSize: 15, color: colors.soft, paddingHorizontal: 16, paddingTop: 12, lineHeight: 21 },
  area: { flex: 1, backgroundColor: colors.photoBack },
  modes: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line },
  chipChosen: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 14, color: colors.ink },
  chipTextChosen: { color: colors.page },
  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 16 },
  button: { flex: 1, paddingVertical: 16, borderRadius: 999, alignItems: "center", borderWidth: 1.5 },
  filled: { backgroundColor: colors.ink, borderColor: colors.ink },
  outlined: { borderColor: colors.ink },
  disabled: { opacity: 0.4 },
  buttonText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  filledText: { color: colors.page },
});
