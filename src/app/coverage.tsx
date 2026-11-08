import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useCloset } from "@/client/closet-context";
import { CoverageBar, EstimatePicker } from "@/client/estimate-picker";
import { colors } from "@/client/theme";
import { CATEGORY_WORDS, countOf, coverageText, scannedPerCategory } from "@/shared/coverage";
import { CATEGORIES } from "@/shared/garment";

// What is scanned, per category, against the person's own guess. A view
// of the wardrobe, not a task list: no "you should scan" (concept v3,
// "Users in control").
export default function CoverageScreen() {
  const { pieces, estimates, setEstimate } = useCloset();
  const scanned = scannedPerCategory(pieces.map((p) => (p.status === "read" ? p.tags : null)));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        A wish check only searches what is scanned. Your guesses put the numbers into proportion; change them any time.
      </Text>
      {CATEGORIES.map((category) => {
        const many = CATEGORY_WORDS[category][1];
        const estimate = estimates[category];
        return (
          <View key={category} style={styles.card}>
            <Text style={styles.title}>{many[0].toUpperCase() + many.slice(1)}</Text>
            <Text style={styles.body}>
              {coverageText(category, scanned[category], estimate) ?? `${countOf(scanned[category], category)} scanned`}
            </Text>
            {estimate !== undefined && <CoverageBar scanned={scanned[category]} estimate={estimate} />}
            <EstimatePicker category={category} value={estimate} onChange={(value) => setEstimate(category, value)} />
            <Pressable
              onPress={() => router.push({ pathname: "/sweep", params: { category } })}
              accessibilityRole="button"
            >
              <Text style={styles.link}>Scan your {many}</Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, gap: 16 },
  intro: { fontSize: 15, color: colors.soft, lineHeight: 21 },
  card: { gap: 10, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink },
  body: { fontSize: 15, color: colors.soft },
  link: { fontSize: 15, fontWeight: "600", color: colors.ink, textDecorationLine: "underline", paddingVertical: 4 },
});
