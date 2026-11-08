import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, cardGrid, cardText } from "@/client/card";
import { useCloset } from "@/client/closet-context";
import { colors } from "@/client/theme";
import { fieldsToCheck } from "@/shared/garment";
import type { Piece } from "@/storage/closet";

// The closet: everything you already own, as a grid.
export default function Closet() {
  const insets = useSafeAreaInsets();
  const { pieces, addPiece, wishes } = useCloset();
  const secondhand = pieces.filter((piece) => piece.origin === "secondhand").length;

  async function add() {
    const id = await addPiece();
    // Straight to the new piece: while the model reads the photo, the person
    // answers "Where is it from?" — the wait is put to use.
    if (id !== null) router.push({ pathname: "/piece/[id]", params: { id } });
  }

  // Always to the piece, also when reading failed: trying again, retaking
  // and removing are all there.
  function open(piece: Piece) {
    router.push({ pathname: "/piece/[id]", params: { id: piece.id } });
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={pieces}
        keyExtractor={(piece) => piece.id}
        numColumns={2}
        columnWrapperStyle={cardGrid.row}
        contentContainerStyle={cardGrid.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.count}>
              {pieces.length === 0
                ? "Photograph a piece you already own to start."
                : `${pieces.length} ${pieces.length === 1 ? "piece" : "pieces"} you already own` +
                  (secondhand > 0 ? ` · ${secondhand} second-hand` : "")}
            </Text>
            {pieces.length > 0 && (
              <Pressable onPress={() => router.push("/coverage")} accessibilityRole="button">
                <Text style={styles.plainLink}>What's scanned</Text>
              </Pressable>
            )}
            {wishes.length > 0 && (
              <Pressable onPress={() => router.push("/secondhand")} accessibilityRole="button">
                <Text style={styles.link}>To look for second-hand: {wishes.length}</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Tile piece={item} onPress={() => open(item)} />
        )}
      />
      <View style={[styles.actions, { marginBottom: insets.bottom + 16 }]}>
        <Pressable style={[styles.button, styles.outlined]} onPress={() => add().catch(console.warn)}>
          <Text style={styles.buttonText}>Add a piece</Text>
        </Pressable>
        {/* The critical flow (concept v3): the main button. */}
        <Pressable style={[styles.button, styles.filled]} onPress={() => router.push("/wish")}>
          <Text style={[styles.buttonText, styles.filledText]}>I want something</Text>
        </Pressable>
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
  header: { gap: 4, marginBottom: 4 },
  count: { fontSize: 15, color: colors.soft },
  link: { fontSize: 15, fontWeight: "600", color: colors.secondhand, textDecorationLine: "underline" },
  plainLink: { fontSize: 15, fontWeight: "600", color: colors.ink, textDecorationLine: "underline" },
  actions: { flexDirection: "row", gap: 12, marginHorizontal: 16 },
  button: { flex: 1, paddingVertical: 16, borderRadius: 999, alignItems: "center" },
  filled: { backgroundColor: colors.ink },
  outlined: { borderWidth: 1.5, borderColor: colors.ink },
  buttonText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  filledText: { color: colors.page },
});
