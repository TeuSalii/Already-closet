import { Canvas, Circle, Group, Image as SkiaImage, Path, Rect, Skia, type SkImage, type SkPoint } from "@shopify/react-native-skia";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { ActivityIndicator, type GestureResponderEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { currentCut, deleteIfCached, settleCut } from "@/client/cut-out";
import { prepare, renderCutout, rotateCw } from "@/client/cut-picture";
import { FrameIcon, type IconProps, RestartIcon, RotateCwIcon, ScissorsLineDashedIcon } from "@/client/icons";
import { caughtEdge, close, extend, type LassoPoint, place } from "@/client/lasso";
import { colors } from "@/client/theme";

// Cut out the garment: draw around it with a finger, or drag a frame.
// Opened by cutOut() in cut-out.ts, which waits for this screen's answer.

type Mode = "draw" | "frame";

const MIN_SIZE = 40; // on screen, in points: smaller is a slip of the finger
const CLOSE_SNAP = 36; // points from the start dot that triggers auto-close on lift
const ZOOM_LEVELS = [1, 2, 3] as const;

export default function CutScreen() {
  // Read once: the request belongs to this screen for as long as it is open.
  const [params] = useState(currentCut);
  const insets = useSafeAreaInsets();
  const [prepared, setPrepared] = useState<{ uri: string; image: SkImage } | null>(null);
  const image = prepared?.image ?? null;
  const [failed, setFailed] = useState<string | null>(params === null ? "No picture was handed to this screen." : null);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [points, setPoints] = useState<LassoPoint[]>([]); // on screen; see lasso.ts
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [zoom, setZoom] = useState<1 | 2 | 3>(1);
  const [nearOrigin, setNearOrigin] = useState(false);
  // The last raw touch position, used in release() to snap-to-start without
  // relying on the nearOrigin state which may be one render behind.
  const lastRaw = useRef<{ x: number; y: number } | null>(null);

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
  // At zoom > 1 the image is scaled up around the centre of the canvas so
  // the person can draw more precisely.  All lasso coordinates stay in
  // screen space; only the fit box shifts, so the existing lasso logic and
  // the cut-to-pixel conversion both work without change.
  const fit =
    image !== null && area !== null
      ? (() => {
          const baseScale = Math.min(area.width / image.width(), area.height / image.height());
          const baseX = (area.width - image.width() * baseScale) / 2;
          const baseY = (area.height - image.height() * baseScale) / 2;
          const scale = baseScale * zoom;
          const cx = area.width / 2;
          const cy = area.height / 2;
          return {
            scale,
            x: cx - (cx - baseX) * zoom,
            y: cy - (cy - baseY) * zoom,
            width: image.width() * scale,
            height: image.height() * scale,
          };
        })()
      : null;

  // The shape on screen, from what the finger did.
  const outline: SkPoint[] =
    mode === "frame" && points.length >= 2 ? frameCorners(points[0], points[points.length - 1]) : points;
  const bounds = boundsOf(outline);
  const ready = !drawing && outline.length >= 3 && bounds.width >= MIN_SIZE && bounds.height >= MIN_SIZE;

  // The finger, where it is on screen. The picture's edge is applied by
  // lasso.ts: off the picture the line stays on it, near the edge it sticks.
  const at = (event: GestureResponderEvent) => ({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY });

  function start(event: GestureResponderEvent) {
    if (fit === null) return;
    setDrawing(true);
    setNearOrigin(false);
    lastRaw.current = null;
    setPoints([place(at(event), fit)]);
  }

  function move(event: GestureResponderEvent) {
    if (fit === null) return;
    const raw = at(event);
    lastRaw.current = raw;
    setPoints((current) =>
      mode === "frame" && current.length > 0 ? [current[0], place(raw, fit)] : extend(current, raw, fit),
    );
    if (mode === "draw") {
      setNearOrigin(
        points.length >= 3 &&
          Math.hypot(raw.x - points[0].x, raw.y - points[0].y) < CLOSE_SNAP,
      );
    }
  }

  function release() {
    setDrawing(false);
    setNearOrigin(false);
    if (mode === "draw" && fit !== null) {
      const raw = lastRaw.current;
      lastRaw.current = null;
      setPoints((current) => {
        if (current.length < 3) return close(current, fit);
        // Snap to the starting point when the finger lifts close enough to it.
        const shouldSnap =
          raw !== null && Math.hypot(raw.x - current[0].x, raw.y - current[0].y) < CLOSE_SNAP;
        const pts = shouldSnap ? [...current.slice(0, -1), { ...current[0] }] : current;
        return close(pts, fit);
      });
    }
  }

  // Closes the current draw path without needing to return to the start.
  function closeShape() {
    if (fit === null || mode !== "draw" || points.length < 3) return;
    setDrawing(false);
    setNearOrigin(false);
    setPoints((current) => close(current, fit));
  }

  // A light tap when the line catches the picture's edge, so the snap is
  // felt as well as seen.
  const last = points[points.length - 1];
  const lastBefore = useRef<LassoPoint | undefined>(undefined);
  useEffect(() => {
    if (drawing && caughtEdge(lastBefore.current, last)) Haptics.selectionAsync().catch(() => {});
    lastBefore.current = last;
  }, [drawing, last]);
  const onEdge = drawing && last !== undefined && last.t !== null;

  async function rotate() {
    if (prepared === null || rotating || busy) return;
    setRotating(true);
    setPoints([]);
    setZoom(1);
    setNearOrigin(false);
    try {
      const next = await rotateCw(prepared.uri);
      made.add(next.uri);
      setPrepared(next);
    } catch (error) {
      console.warn(error);
    } finally {
      setRotating(false);
    }
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
        onResponderRelease={release}
        onResponderTerminate={release}
        accessibilityLabel="The picture. Draw around the piece you mean."
      >
        {failed ? (
          <View style={styles.flex}>
            <Text style={styles.hint}>
              This picture couldn't be opened for cutting. Go back and choose another.
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
            {onEdge && (
              // The edge lights up while the line is stuck to it.
              <>
                <Rect x={fit.x} y={fit.y} width={fit.width} height={fit.height} style="stroke" strokeWidth={5} color={colors.ink} />
                <Rect x={fit.x} y={fit.y} width={fit.width} height={fit.height} style="stroke" strokeWidth={2} color="white" />
              </>
            )}
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
            {/* Start dot: shows where the finger must return to close the shape.
                Pulses green when the finger is close enough to snap shut. */}
            {drawing && points.length >= 1 && mode === "draw" && (
              <>
                {nearOrigin && <Circle cx={points[0].x} cy={points[0].y} r={18} color="rgba(50,200,80,0.30)" />}
                <Circle cx={points[0].x} cy={points[0].y} r={8} color={nearOrigin ? "rgb(40,190,70)" : colors.ink} />
                <Circle cx={points[0].x} cy={points[0].y} r={5} color="white" />
              </>
            )}
          </Canvas>
        )}
      </View>

      <View style={styles.modes}>
        {/* Icons only, like a photo editor; the hint above says what the
            chosen tool does, and each button has a spoken label. */}
        <Tool icon={ScissorsLineDashedIcon} label="Draw around it" chosen={mode === "draw"} onPress={() => { setMode("draw"); setPoints([]); setNearOrigin(false); }} />
        <Tool icon={FrameIcon} label="Frame" chosen={mode === "frame"} onPress={() => { setMode("frame"); setPoints([]); setNearOrigin(false); }} />
        <View style={styles.flex} />
        {/* Zoom: tap to cycle 1× → 2× → 3× → 1×. Resets the lasso because
            screen-space points shift when the fit box changes. */}
        <Pressable
          style={[styles.tool, styles.toolZoom, fit === null && styles.disabled]}
          onPress={() => { setZoom((z) => ZOOM_LEVELS[(ZOOM_LEVELS.indexOf(z) + 1) % ZOOM_LEVELS.length]); setPoints([]); setNearOrigin(false); }}
          disabled={fit === null}
          accessibilityRole="button"
          accessibilityLabel={`Zoom ${zoom}×, tap to change`}
        >
          <Text style={[styles.zoomText, zoom > 1 && styles.zoomTextActive]}>{zoom}×</Text>
        </Pressable>
        <Pressable
          style={[styles.tool, (prepared === null || rotating || busy) && styles.disabled]}
          onPress={() => rotate().catch(console.warn)}
          disabled={prepared === null || rotating || busy}
          accessibilityRole="button"
          accessibilityLabel="Rotate 90°"
          accessibilityState={{ disabled: prepared === null || rotating || busy }}
        >
          <RotateCwIcon color={colors.ink} />
        </Pressable>
        <Pressable
          style={[styles.tool, points.length === 0 && styles.disabled]}
          onPress={() => { setPoints([]); setZoom(1); setNearOrigin(false); }}
          disabled={points.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Start over"
          accessibilityState={{ disabled: points.length === 0 }}
        >
          <RestartIcon color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.actions}>
        {/* Close shape: an explicit way to seal the path without returning the
            finger to the starting dot.  Appears once there is something to
            close. */}
        {mode === "draw" && points.length >= 3 && !busy && (
          <Pressable
            style={styles.button}
            onPress={closeShape}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Close</Text>
          </Pressable>
        )}
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

function Tool({ icon: Icon, label, chosen, onPress }: {
  icon: ComponentType<IconProps>;
  label: string;
  chosen: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tool, chosen && styles.toolChosen]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: chosen }}
    >
      <Icon size={24} color={chosen ? colors.page : colors.ink} />
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

// The picture "Cut out" handed on, so cleanup never deletes it, and the
// shrunk pictures made on the way. Module-level: the
// cleanup runs after the screen is gone.
let kept: string | null = null;
const made = new Set<string>();

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page, gap: 12 },
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 8 },
  muted: { fontSize: 13, color: colors.muted },
  hint: { fontSize: 15, color: colors.soft, paddingHorizontal: 16, paddingTop: 12, lineHeight: 21 },
  area: { flex: 1, backgroundColor: colors.photoBack },
  modes: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 },
  tool: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  toolChosen: { backgroundColor: colors.ink, borderColor: colors.ink },
  toolZoom: { width: 48, height: 48 },
  zoomText: { fontSize: 13, fontWeight: "700", color: colors.ink },
  zoomTextActive: { color: colors.secondhand },
  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 16 },
  button: { flex: 1, paddingVertical: 16, borderRadius: 999, alignItems: "center", borderWidth: 1.5, borderColor: colors.ink },
  filled: { backgroundColor: colors.ink, borderColor: colors.ink },
  disabled: { opacity: 0.4 },
  buttonText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  filledText: { color: colors.page },
});
