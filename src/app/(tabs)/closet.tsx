import { router } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, cardGrid, cardText } from "@/client/card";
import { useCloset } from "@/client/closet-context";
import { colors } from "@/client/theme";
import { categoryOf, fieldsToCheck } from "@/shared/garment";
import type { Piece } from "@/storage/closet";

// Tops first: the progressive scan guides the person to scan their tops
// before anything else. Three tops is enough to use the Check tab and get
// the first outfit suggestion. Bottoms unlock outfit combinations.

export default function Closet() {
  const insets = useSafeAreaInsets();
  const { pieces, addPiece, wishes } = useCloset();

  const readPieces = useMemo(() => pieces.flatMap((p) => (p.status === "read" ? [p] : [])), [pieces]);
  const topCount = readPieces.filter((p) => categoryOf(p.tags.type) === "top").length;
  const pairCount = readPieces.filter((p) => ["bottom", "dress"].includes(categoryOf(p.tags.type))).length;
  const secondhand = pieces.filter((piece) => piece.origin === "secondhand").length;

  async function add() {
    const id = await addPiece();
    if (id !== null) router.push({ pathname: "/piece/[id]", params: { id } });
  }

  function open(piece: Piece) {
    router.push({ pathname: "/piece/[id]", params: { id: piece.id } });
  }

  // Progressive scan stage — determines the guidance shown in the header.
  const stage: "empty" | "need-tops" | "need-bottoms" | "ready" =
    pieces.length === 0
      ? "empty"
      : topCount < 3
        ? "need-tops"
        : pairCount === 0
          ? "need-bottoms"
          : "ready";

  const header = (
    <View style={styles.header}>
      {stage === "empty" && (
        <View style={styles.landing}>
          <Text style={styles.landingTitle}>Start with your tops</Text>
          <Text style={styles.landingBody}>
            Scan 3–5 tops. The app reads each one while you take the next — first check in minutes.
          </Text>
          <Pressable
            style={styles.sweepBtn}
            onPress={() => router.push({ pathname: "/sweep", params: { category: "top" } })}
            accessibilityRole="button"
          >
            <Text style={styles.sweepBtnText}>Scan your tops →</Text>
          </Pressable>
        </View>
      )}

      {stage === "need-tops" && (
        <View style={styles.nudge}>
          <Text style={styles.nudgeText}>
            {topCount === 0 ? "No tops yet" : `${topCount} ${topCount === 1 ? "top" : "tops"} scanned`}
            {" — "}scan {3 - topCount} more to unlock outfit suggestions.
          </Text>
          <Pressable
            onPress={() => router.push({ pathname: "/sweep", params: { category: "top" } })}
            accessibilityRole="button"
          >
            <Text style={styles.nudgeLink}>Scan more tops</Text>
          </Pressable>
        </View>
      )}

      {stage === "need-bottoms" && (
        <View style={styles.nudge}>
          <Text style={styles.nudgeText}>{topCount} tops ready — scan a bottom or dress to unlock outfit suggestions.</Text>
          <Pressable
            onPress={() => router.push({ pathname: "/sweep", params: { category: "bottom" } })}
            accessibilityRole="button"
          >
            <Text style={styles.nudgeLink}>Scan a bottom</Text>
          </Pressable>
        </View>
      )}

      {stage === "ready" && (
        <Text style={styles.count}>
          {pieces.length} {pieces.length === 1 ? "piece" : "pieces"} you already own
          {secondhand > 0 ? ` · ${secondhand} second-hand` : ""}
        </Text>
      )}

      {pieces.length > 0 && (
        <View style={styles.links}>
          <Pressable onPress={() => router.push("/coverage")} accessibilityRole="button">
            <Text style={styles.plainLink}>What's scanned</Text>
          </Pressable>
          {stage === "ready" && (
            <Pressable onPress={() => router.push("/capsule")} accessibilityRole="button">
              <Text style={styles.plainLink}>Rarely worn</Text>
            </Pressable>
          )}
          {wishes.length > 0 && (
            <Pressable onPress={() => router.push("/secondhand")} accessibilityRole="button">
              <Text style={styles.link}>Second-hand: {wishes.length}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={pieces}
        keyExtractor={(piece) => piece.id}
        numColumns={2}
        columnWrapperStyle={cardGrid.row}
        contentContainerStyle={cardGrid.list}
        ListHeaderComponent={header}
        renderItem={({ item }) => <Tile piece={item} onPress={() => open(item)} />}
      />
      <View style={[styles.actions, { marginBottom: insets.bottom + 16 }]}>
        {stage === "empty" ? (
          <Pressable
            style={[styles.button, styles.filled, { flex: 1 }]}
            onPress={() => router.push("/wish")}
          >
            <Text style={[styles.buttonText, styles.filledText]}>I want something</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={[styles.button, styles.outlined]} onPress={() => add().catch(console.warn)}>
              <Text style={styles.buttonText}>Add a piece</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.filled]} onPress={() => router.push("/wish")}>
              <Text style={[styles.buttonText, styles.filledText]}>I want something</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function Tile({ piece, onPress }: { piece: Piece; onPress: () => void }) {
  return (
    <Card photo={piece.photo} badge={piece.origin === "secondhand" ? "Second-hand" : undefined} onPress={onPress}>
      {piece.status === "reading" && (
        <>
          <ActivityIndicator size="small" />
          <Text style={cardText.muted}>Looking at it…</Text>
        </>
      )}
      {piece.status === "failed" && <Text style={cardText.muted}>Couldn't read it. Tap to fix it.</Text>}
      {piece.status === "read" && (
        <>
          <Text style={cardText.label}>{piece.tags.label}</Text>
          {fieldsToCheck(piece.tags, piece.checked).length > 0 && <Text style={cardText.check}>Please check</Text>}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },

  header: { gap: 8, marginBottom: 4 },

  landing: { gap: 10, paddingVertical: 8 },
  landingTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  landingBody: { fontSize: 15, color: colors.soft, lineHeight: 21 },
  sweepBtn: { alignSelf: "flex-start", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.ink, marginTop: 4 },
  sweepBtnText: { fontSize: 15, fontWeight: "600", color: colors.page },

  nudge: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.photoBack, borderRadius: 10, gap: 4 },
  nudgeText: { fontSize: 14, color: colors.soft, lineHeight: 20 },
  nudgeLink: { fontSize: 14, fontWeight: "600", color: colors.ink, textDecorationLine: "underline" },

  count: { fontSize: 15, color: colors.soft },
  links: { flexDirection: "row", gap: 16 },
  link: { fontSize: 15, fontWeight: "600", color: colors.secondhand, textDecorationLine: "underline" },
  plainLink: { fontSize: 15, fontWeight: "600", color: colors.ink, textDecorationLine: "underline" },

  actions: { flexDirection: "row", gap: 12, marginHorizontal: 16 },
  button: { flex: 1, paddingVertical: 16, borderRadius: 999, alignItems: "center" },
  filled: { backgroundColor: colors.ink },
  outlined: { borderWidth: 1.5, borderColor: colors.ink },
  buttonText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  filledText: { color: colors.page },
});
