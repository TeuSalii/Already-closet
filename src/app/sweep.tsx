import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCloset } from "@/client/closet-context";
import { CoverageBar, EstimatePicker } from "@/client/estimate-picker";
import { colors } from "@/client/theme";
import { CATEGORY_WORDS, countOf, coverageText, scannedPerCategory } from "@/shared/coverage";
import { CATEGORIES, type Category, categoryOf, fieldsToCheck } from "@/shared/garment";

// The category sweep (concept v3, Section 6): scan one category in one go,
// when a wish gives a reason to. One photo per piece; each is read in the
// background while the next is taken, so the person never waits.
export default function SweepScreen() {
  const { category: param } = useLocalSearchParams<{ category: string }>();
  const category = (CATEGORIES as readonly string[]).includes(param) ? (param as Category) : "top";
  const insets = useSafeAreaInsets();
  const { pieces, addPiece, estimates, setEstimate } = useCloset();
  const [added, setAdded] = useState<string[]>([]); // this round, newest first

  const [one, many] = CATEGORY_WORDS[category];
  const scanned = scannedPerCategory(pieces.map((p) => (p.status === "read" ? p.tags : null)))[category];
  const estimate = estimates[category];
  const coverage = coverageText(category, scanned, estimate) ?? `${countOf(scanned, category)} scanned`;

  const round = added.flatMap((id) => pieces.filter((piece) => piece.id === id));
  const reading = round.filter((piece) => piece.status === "reading").length;
  // A photo that turned out to be something else still went into the
  // closet; say so, so the count above does not seem to ignore it.
  const other = round.filter((p) => p.status === "read" && categoryOf(p.tags.type) !== category).length;

  async function scanNext() {
    const id = await addPiece();
    if (id !== null) setAdded((current) => [id, ...current]);
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: `Scan your ${many}` }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.block}>
          <Text style={styles.title}>{coverage}</Text>
          {estimate !== undefined && <CoverageBar scanned={scanned} estimate={estimate} />}
        </View>

        {estimate === undefined && (
          <EstimatePicker category={category} value={estimate} onChange={(value) => setEstimate(category, value)} />
        )}

        <Text style={styles.body}>
          One {one} per photo. Its labels are read while you take the next one; you can check them later.
        </Text>

        {round.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.question}>
              Added now: {round.length}
              {reading > 0 ? ` · reading ${reading}` : ""}
              {other > 0 ? ` · ${other} not ${CATEGORY_WORDS[category][1]}` : ""}
            </Text>
            <View style={styles.grid}>
              {round.map((piece) => (
                <Pressable
                  key={piece.id}
                  style={styles.tile}
                  onPress={() => router.push({ pathname: "/piece/[id]", params: { id: piece.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={piece.status === "read" ? piece.tags.label : "Piece being read"}
                >
                  <Image source={piece.photo} style={styles.photo} contentFit="contain" />
                  {piece.status === "reading" && <ActivityIndicator style={styles.badge} size="small" />}
                  {piece.status === "read" && fieldsToCheck(piece.tags, piece.checked).length > 0 && (
                    <Text style={styles.check}>Please check</Text>
                  )}
                  {piece.status === "failed" && <Text style={styles.check}>Couldn't read</Text>}
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={[styles.button, styles.outlined]} onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.filled]} onPress={() => scanNext().catch(console.warn)} accessibilityRole="button">
          <Text style={[styles.buttonText, styles.filledText]}>{round.length === 0 ? `Scan ${/^[aeiou]/.test(one) ? "an" : "a"} ${one}` : "Scan the next"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, gap: 20 },
  block: { gap: 8 },
  title: { fontSize: 20, fontWeight: "700", color: colors.ink },
  body: { fontSize: 15, color: colors.soft, lineHeight: 21 },
  question: { fontSize: 15, fontWeight: "600", color: colors.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { width: "31%", gap: 2 },
  photo: { aspectRatio: 1, borderRadius: 8, backgroundColor: colors.photoBack },
  badge: { position: "absolute", top: 8, right: 8 },
  check: { fontSize: 12, fontWeight: "600", color: colors.check },
  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  button: { flex: 1, paddingVertical: 16, borderRadius: 999, alignItems: "center", borderWidth: 1.5 },
  filled: { backgroundColor: colors.ink, borderColor: colors.ink },
  outlined: { borderColor: colors.ink },
  buttonText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  filledText: { color: colors.page },
});
