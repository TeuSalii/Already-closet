import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pick, readPhoto } from "@/client/add-piece";
import { useCloset } from "@/client/closet-context";
import { colors } from "@/client/theme";
import { CATEGORY_WORDS, coverageText } from "@/shared/coverage";
import { categoryOf, type GarmentTags } from "@/shared/garment";
import { findSimilar } from "@/shared/similar";

// --- types ------------------------------------------------------------------

type Match = {
  id: string;
  score: number;
  headline: string;
  label: string;
  photo: string | undefined;
};

type State =
  | { phase: "idle" }
  | { phase: "reading"; photo: string }
  | { phase: "results"; photo: string; tags: GarmentTags; matches: Match[]; wished: boolean }
  | { phase: "error" };

// --- screen -----------------------------------------------------------------

export default function CheckScreen() {
  const { pieces, estimates, saveWish } = useCloset();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ phase: "idle" });
  const saving = useRef(false);

  const readPieces = useMemo(() => pieces.flatMap((p) => (p.status === "read" ? [p] : [])), [pieces]);

  async function startCheck(source: "camera" | "library") {
    const photo = await pick(source);
    if (photo === null) return;

    setState({ phase: "reading", photo });
    try {
      const tags = await readPhoto(photo);
      const closetItems = readPieces.map((p) => ({ id: p.id, tags: p.tags }));
      const raw = findSimilar(tags, closetItems);
      const matches = raw.map(({ id, score, headline }) => {
        const piece = readPieces.find((p) => p.id === id)!;
        return { id, score, headline, label: piece.tags.label, photo: piece.photo };
      });
      setState({ phase: "results", photo, tags, matches, wished: false });
    } catch {
      setState({ phase: "error" });
    }
  }

  async function wish() {
    if (state.phase !== "results" || state.wished || saving.current) return;
    saving.current = true;
    try {
      await saveWish(state.tags, state.photo);
      setState({ ...state, wished: true });
    } catch {
      // ignore — the photo stays, the user can try the full wish flow
    } finally {
      saving.current = false;
    }
  }

  function reset() {
    setState({ phase: "idle" });
  }

  if (state.phase === "idle") {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
        <View style={styles.landing}>
          <Text style={styles.landingTitle}>Before you buy</Text>
          <Text style={styles.landingBody}>
            Take a photo of something you're considering. The app checks your closet for what you already own.
          </Text>
          <View style={styles.sourceRow}>
            <Pressable style={[styles.sourceBtn, styles.sourceBtnFilled]} onPress={() => startCheck("camera")}>
              <Text style={[styles.sourceBtnText, styles.sourceBtnFilledText]}>Take a photo</Text>
            </Pressable>
            <Pressable style={[styles.sourceBtn, styles.sourceBtnOutlined]} onPress={() => startCheck("library")}>
              <Text style={styles.sourceBtnText}>From library</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (state.phase === "reading") {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
        <View style={styles.landing}>
          <Image source={{ uri: state.photo }} style={styles.scanPhoto} resizeMode="cover" />
          <ActivityIndicator size="small" color={colors.soft} style={{ marginTop: 20 }} />
          <Text style={styles.readingText}>Reading the photo…</Text>
        </View>
      </View>
    );
  }

  if (state.phase === "error") {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
        <View style={styles.landing}>
          <Text style={styles.landingTitle}>Couldn't read the photo</Text>
          <Text style={styles.landingBody}>Make sure the developer server is running and try again.</Text>
          <Pressable style={[styles.sourceBtn, styles.sourceBtnFilled, { alignSelf: "center" }]} onPress={reset}>
            <Text style={[styles.sourceBtnText, styles.sourceBtnFilledText]}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Results
  const { photo, tags, matches, wished } = state;
  const category = categoryOf(tags.type);
  const [catOne, catMany] = CATEGORY_WORDS[category];
  const scanCount = readPieces.filter((p) => categoryOf(p.tags.type) === category).length;
  const estimate = estimates[category];
  const coverage = coverageText(category, scanCount, estimate);
  const noMatches = matches.length === 0;
  const plural = matches.length !== 1;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.resultsScroll, { paddingBottom: insets.bottom + 24 }]}
    >
      {/* Scanned item */}
      <View style={styles.scannedRow}>
        <Image source={{ uri: photo }} style={styles.scannedThumb} resizeMode="cover" />
        <View style={styles.scannedInfo}>
          <Text style={styles.scannedLabel}>{tags.label}</Text>
          <Text style={styles.scannedMeta}>
            {tags.colors[0]} · {tags.type} · {tags.formality}
          </Text>
        </View>
      </View>

      {/* Verdict */}
      <View style={styles.verdict}>
        {noMatches ? (
          <Text style={styles.verdictNone}>Nothing like this in your closet.</Text>
        ) : (
          <Text style={styles.verdictCount}>
            You already own {matches.length} similar {plural ? catMany : catOne}.
          </Text>
        )}
      </View>

      {/* Match list */}
      {matches.map((m) => (
        <View key={m.id} style={styles.matchCard}>
          <MatchThumb photo={m.photo} />
          <View style={styles.matchInfo}>
            <Text style={styles.matchLabel}>{m.label}</Text>
            <Text style={styles.matchHeadline}>{m.headline}</Text>
          </View>
        </View>
      ))}

      {/* Coverage note — honesty about what wasn't searched */}
      <View style={styles.coverageBlock}>
        <Text style={styles.coverageText}>
          {coverage ?? `${scanCount} scanned ${scanCount === 1 ? catOne : catMany}`}
          {". Pieces you haven't scanned aren't searched."}
        </Text>
        {(estimate === undefined || scanCount < estimate) && (
          <Pressable
            onPress={() => router.push({ pathname: "/sweep", params: { category } })}
            accessibilityRole="button"
          >
            <Text style={styles.coverageLink}>Scan more {catMany}</Text>
          </Pressable>
        )}
      </View>

      {/* Second-hand path — only when nothing was found and not yet saved */}
      {noMatches && !wished && (
        <Pressable style={styles.wishBtn} onPress={() => wish().catch(console.warn)}>
          <Text style={styles.wishBtnText}>Save to look for second-hand</Text>
        </Pressable>
      )}
      {wished && (
        <View style={styles.wishedBlock}>
          <Text style={styles.wishedText}>Saved to your second-hand list.</Text>
          <Pressable onPress={() => router.push("/secondhand")} accessibilityRole="button">
            <Text style={styles.coverageLink}>See the list →</Text>
          </Pressable>
        </View>
      )}

      {/* Check another */}
      <Pressable style={styles.againBtn} onPress={reset}>
        <Text style={styles.againBtnText}>Check another piece</Text>
      </Pressable>
    </ScrollView>
  );
}

// --- sub-components ---------------------------------------------------------

function MatchThumb({ photo }: { photo: string | undefined }) {
  if (!photo) return <View style={styles.thumbPlaceholder} />;
  return <Image source={{ uri: photo }} style={styles.thumb} />;
}

// --- styles -----------------------------------------------------------------

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },

  landing: { flex: 1, padding: 32, justifyContent: "center", alignItems: "stretch", gap: 16 },
  landingTitle: { fontSize: 22, fontWeight: "700", color: colors.ink, textAlign: "center" },
  landingBody: { fontSize: 15, color: colors.soft, textAlign: "center", lineHeight: 22 },

  sourceRow: { gap: 10, marginTop: 8 },
  sourceBtn: { paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  sourceBtnFilled: { backgroundColor: colors.ink },
  sourceBtnOutlined: { borderWidth: 1.5, borderColor: colors.ink },
  sourceBtnText: { fontSize: 15, fontWeight: "600", color: colors.ink },
  sourceBtnFilledText: { color: colors.page },

  scanPhoto: { width: 180, height: 180, borderRadius: 12, alignSelf: "center" },
  readingText: { fontSize: 15, color: colors.soft, textAlign: "center", marginTop: 10 },

  resultsScroll: { padding: 20, gap: 12 },

  scannedRow: { flexDirection: "row", gap: 14, alignItems: "center", marginBottom: 4 },
  scannedThumb: { width: 72, height: 72, borderRadius: 10 },
  scannedInfo: { flex: 1, gap: 4 },
  scannedLabel: { fontSize: 16, fontWeight: "600", color: colors.ink },
  scannedMeta: { fontSize: 13, color: colors.soft },

  verdict: { paddingVertical: 6 },
  verdictCount: { fontSize: 15, color: colors.ink, fontWeight: "500" },
  verdictNone: { fontSize: 15, color: colors.soft },

  matchCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12 },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  thumbPlaceholder: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.photoBack },
  matchInfo: { flex: 1, gap: 3 },
  matchLabel: { fontSize: 14, fontWeight: "500", color: colors.ink },
  matchHeadline: { fontSize: 13, color: colors.soft },

  coverageBlock: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.photoBack, borderRadius: 10, gap: 4 },
  coverageText: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  coverageLink: { fontSize: 13, fontWeight: "600", color: colors.ink, textDecorationLine: "underline" },

  wishBtn: { paddingVertical: 13, borderRadius: 999, borderWidth: 1.5, borderColor: colors.secondhand, alignItems: "center" },
  wishBtnText: { fontSize: 15, fontWeight: "600", color: colors.secondhand },

  wishedBlock: { gap: 4 },
  wishedText: { fontSize: 15, color: colors.secondhand, fontWeight: "500" },

  againBtn: { marginTop: 4, paddingVertical: 13, borderRadius: 999, borderWidth: 1.5, borderColor: colors.ink, alignItems: "center" },
  againBtnText: { fontSize: 15, fontWeight: "600", color: colors.ink },
});
