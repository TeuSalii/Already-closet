import { Image } from "expo-image";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/client/theme";

// One tile in a two-column grid: a photo, an optional badge, a caption.
// The closet and the second-hand list use the same card, so a saved wish
// looks like the pieces it sits next to in your head.
export function Card({ photo, badge, onPress, accessibilityLabel, children }: {
  photo: string | undefined; // undefined: a wish saved before photos were kept
  badge?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  children: ReactNode;
}) {
  return (
    <Pressable style={styles.tile} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      <View>
        {photo !== undefined ? (
          <Image source={photo} style={styles.photo} contentFit="contain" />
        ) : (
          <View style={styles.photo} />
        )}
        {badge !== undefined && <Text style={styles.badge}>{badge}</Text>}
      </View>
      <View style={styles.caption}>{children}</View>
    </Pressable>
  );
}

// Text inside a card's caption.
export const cardText = StyleSheet.create({
  label: { fontSize: 15, fontWeight: "600", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
  check: { fontSize: 13, fontWeight: "600", color: colors.check },
});

// For FlatList: two cards per row, with the same gaps everywhere.
export const cardGrid = StyleSheet.create({
  list: { padding: 16, gap: 16 },
  row: { gap: 16 },
});

const styles = StyleSheet.create({
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
});
