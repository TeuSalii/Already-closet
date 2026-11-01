import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useCloset } from "@/client/closet-context";
import { colors } from "@/client/theme";
import { describeWear, wearStats } from "@/client/wear-stats";
import type { Origin } from "@/storage/closet";

const ORIGINS: { value: Origin; label: string }[] = [
  { value: "secondhand", label: "Second-hand" },
  { value: "new", label: "New" },
  { value: "gift", label: "Gift" },
];

// One piece: what it is, where it's from, and you wearing it.
export default function PieceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pieces, wears, setOrigin, readAgain } = useCloset();

  const piece = pieces.find((p) => p.id === id);
  if (piece === undefined) throw new Error(`No piece with id ${id}`);

  const selfies = wears.filter((wear) => wear.selfie !== null && wear.pieceIds.includes(piece.id));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Image source={piece.photo} style={styles.photo} contentFit="cover" />

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
        <View style={styles.block}>
          <Text style={styles.title}>{piece.tags.label}</Text>
          <Text style={styles.muted}>{describeWear(wearStats(piece.id, wears))}</Text>
          <Text style={styles.details}>
            {[piece.tags.type, piece.tags.colors.join(", "), piece.tags.pattern, piece.tags.material]
              .filter((part) => part !== "unknown")
              .join(" · ")}
          </Text>
          <Text style={styles.details}>{piece.tags.season} · {piece.tags.formality} · {piece.tags.style}</Text>
        </View>
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

      {selfies.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.question}>You in it</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {selfies.map((wear) => (
              <View key={wear.id} style={styles.selfieBox}>
                <Image source={wear.selfie} style={styles.selfie} contentFit="cover" />
                <Text style={styles.muted}>{wear.date}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, gap: 24 },
  photo: { aspectRatio: 1, borderRadius: 16, backgroundColor: colors.photoBack },
  block: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 22, fontWeight: "700", color: colors.ink },
  details: { fontSize: 15, color: colors.soft },
  muted: { fontSize: 13, color: colors.muted },
  question: { fontSize: 16, fontWeight: "600", color: colors.ink },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line },
  chipChosen: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 15, color: colors.ink },
  chipTextChosen: { color: colors.page },
  selfieBox: { gap: 4 },
  selfie: { width: 120, height: 160, borderRadius: 12, backgroundColor: colors.photoBack },
});
