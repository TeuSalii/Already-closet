import { Image } from "expo-image";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCloset } from "@/client/closet-context";
import { colors } from "@/client/theme";
import { computeCapsuleStats } from "@/shared/outfit/capsule";
import type { RequestSeason } from "@/shared/outfit/occasions";
import type { OutfitPiece } from "@/shared/outfit/pieces";

// Surfaces pieces the person hasn't worn lately, ranked by how many outfits
// they can make. The idea: you have more than you think — look here before buying.

const RARELY_WORN_DAYS = 30;

function currentSeason(): RequestSeason {
  const m = new Date().getMonth() + 1;
  if (m >= 6 && m <= 8) return "summer";
  if (m === 12 || m <= 2) return "winter";
  return "transitional";
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function wornText(lastWorn: string | undefined): string {
  if (!lastWorn) return "Never worn";
  const days = daysAgo(lastWorn);
  if (days === 0) return "Worn today";
  if (days === 1) return "Worn yesterday";
  if (days < 30) return `Worn ${days} days ago`;
  if (days < 60) return "Worn last month";
  return `Worn ${Math.floor(days / 30)} months ago`;
}

export default function CapsuleScreen() {
  const { pieces } = useCloset();
  const insets = useSafeAreaInsets();

  const readPieces = useMemo(() => pieces.flatMap((p) => (p.status === "read" ? [p] : [])), [pieces]);

  const stats = useMemo(() => {
    const outfitPieces: OutfitPiece[] = readPieces.map((p) => ({
      id: p.id,
      tags: p.tags,
      ...(p.lastWorn ? { lastWorn: p.lastWorn } : {}),
    }));
    return computeCapsuleStats(outfitPieces, currentSeason());
  }, [readPieces]);

  const countFor = useMemo(() => new Map(stats.map((s) => [s.id, s.outfitCount])), [stats]);

  const rarelyWorn = useMemo(
    () =>
      readPieces
        .filter((p) => !p.lastWorn || daysAgo(p.lastWorn) >= RARELY_WORN_DAYS)
        .sort((a, b) => (countFor.get(b.id) ?? 0) - (countFor.get(a.id) ?? 0)),
    [readPieces, countFor],
  );

  if (rarelyWorn.length === 0) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <Text style={styles.emptyTitle}>Everything's being worn.</Text>
        <Text style={styles.emptyBody}>
          Pieces you haven't worn in {RARELY_WORN_DAYS}+ days will appear here, ranked by how many outfits they can make.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
      data={rarelyWorn}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <Text style={styles.intro}>
          {rarelyWorn.length} {rarelyWorn.length === 1 ? "piece" : "pieces"} you haven't worn in{" "}
          {RARELY_WORN_DAYS}+ days — most outfit potential first.
        </Text>
      }
      renderItem={({ item }) => {
        const count = countFor.get(item.id) ?? 0;
        return (
          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: "/piece/[id]", params: { id: item.id } })}
            accessibilityRole="button"
          >
            <Image source={item.photo} style={styles.photo} contentFit="contain" />
            <View style={styles.info}>
              <Text style={styles.label}>{item.tags.label}</Text>
              <Text style={styles.worn}>{wornText(item.lastWorn)}</Text>
            </View>
            {count > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeCount}>{count}</Text>
                <Text style={styles.badgeSub}>looks</Text>
              </View>
            )}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },

  empty: { justifyContent: "center", alignItems: "center", padding: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.ink, textAlign: "center" },
  emptyBody: { fontSize: 15, color: colors.soft, textAlign: "center", lineHeight: 21 },

  list: { padding: 16, gap: 2 },
  intro: { fontSize: 15, color: colors.soft, lineHeight: 21, marginBottom: 8 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  photo: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.photoBack },
  info: { flex: 1, gap: 3 },
  label: { fontSize: 15, fontWeight: "500", color: colors.ink },
  worn: { fontSize: 13, color: colors.muted },

  badge: { alignItems: "center", minWidth: 44 },
  badgeCount: { fontSize: 20, fontWeight: "700", color: colors.ink },
  badgeSub: { fontSize: 11, color: colors.muted },
});
