import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useCloset } from "@/client/closet-context";
import { LabelEditor } from "@/client/label-editor";
import { colors } from "@/client/theme";
import type { Origin } from "@/storage/closet";

const ORIGINS: { value: Origin; label: string }[] = [
  { value: "secondhand", label: "Second-hand" },
  { value: "new", label: "New" },
  { value: "gift", label: "Gift" },
];

// One piece: what it is, where it's from, and the way to fix or remove it.
export default function PieceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pieces, setOrigin, readAgain, setLabel, confirmLabels, retake, removePiece } = useCloset();

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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Image source={piece.photo} style={styles.photo} contentFit="contain" />

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
  photo: { aspectRatio: 1, borderRadius: 16, backgroundColor: colors.photoBack },
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
});
