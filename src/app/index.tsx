import { Image } from "expo-image";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCloset } from "@/client/closet-context";
import { colors } from "@/client/theme";
import { fieldsToCheck } from "@/shared/garment";
import type { Piece } from "@/storage/closet";

// The closet: everything you already own, as a grid.
export default function Closet() {
  const insets = useSafeAreaInsets();
  const { pieces, addPiece, readAgain } = useCloset();
  const secondhand = pieces.filter((piece) => piece.origin === "secondhand").length;

  async function add() {
    const id = await addPiece();
    // Straight to the new piece: while the model reads the photo, the person
    // answers "Where is it from?" — the wait is put to use.
    if (id !== null) router.push({ pathname: "/piece/[id]", params: { id } });
  }

  function open(piece: Piece) {
    if (piece.status === "failed") readAgain(piece);
    else router.push({ pathname: "/piece/[id]", params: { id: piece.id } });
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={pieces}
        keyExtractor={(piece) => piece.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.count}>
            {pieces.length === 0
              ? "Photograph a piece you already own to start."
              : `${pieces.length} ${pieces.length === 1 ? "piece" : "pieces"} you already own` +
                (secondhand > 0 ? ` · ${secondhand} second-hand` : "")}
          </Text>
        }
        renderItem={({ item }) => (
          <Tile piece={item} onPress={() => open(item)} />
        )}
      />
      <View style={[styles.actions, { marginBottom: insets.bottom + 16 }]}>
        <Pressable style={[styles.button, styles.filled]} onPress={() => add().catch(console.warn)}>
          <Text style={[styles.buttonText, styles.filledText]}>Add a piece</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Tile({ piece, onPress }: { piece: Piece; onPress: () => void }) {
  return (
    <Pressable style={styles.tile} onPress={onPress}>
      <View>
        <Image source={piece.photo} style={styles.photo} contentFit="cover" />
        {piece.origin === "secondhand" && <Text style={styles.badge}>Second-hand</Text>}
      </View>
      {piece.status === "reading" && (
        <View style={styles.caption}>
          <ActivityIndicator size="small" />
          <Text style={styles.muted}>Looking at it…</Text>
        </View>
      )}
      {piece.status === "failed" && (
        <View style={styles.caption}>
          <Text style={styles.muted}>Couldn't read it. Tap to try again.</Text>
        </View>
      )}
      {piece.status === "read" && (
        <View style={styles.caption}>
          <Text style={styles.label}>{piece.tags.label}</Text>
          {fieldsToCheck(piece.tags, piece.checked).length > 0 && <Text style={styles.check}>Please check</Text>}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  list: { padding: 16, gap: 16 },
  row: { gap: 16 },
  count: { fontSize: 15, color: colors.soft, marginBottom: 4 },
  tile: { flex: 1, maxWidth: "50%" },
  photo: { aspectRatio: 1, borderRadius: 12, backgroundColor: colors.photoBack },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: colors.secondhand,
    color: colors.page,
    fontSize: 12,
    fontWeight: "600",
  },
  caption: { paddingTop: 8, gap: 2 },
  label: { fontSize: 15, fontWeight: "600", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
  check: { fontSize: 13, fontWeight: "600", color: colors.check },
  actions: { flexDirection: "row", gap: 12, marginHorizontal: 16 },
  button: { flex: 1, paddingVertical: 16, borderRadius: 999, alignItems: "center" },
  filled: { backgroundColor: colors.ink },
  buttonText: { fontSize: 16, fontWeight: "600" },
  filledText: { color: colors.page },
});
