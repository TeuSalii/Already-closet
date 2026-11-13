import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/client/theme";
import { CATEGORY_WORDS, coverageShare, ESTIMATE_CHOICES } from "@/shared/coverage";
import type { Category } from "@/shared/garment";

// "About how many tops do you own?", answered with one tap. A rough number
// is enough: it only puts "12 scanned" into proportion.
export function EstimatePicker({ category, value, onChange }: {
  category: Category;
  value: number | undefined;
  onChange: (estimate: number | undefined) => void;
}) {
  return (
    <View style={styles.picker}>
      <Text style={styles.question}>About how many {CATEGORY_WORDS[category][1]} do you own?</Text>
      <View style={styles.chips}>
        {ESTIMATE_CHOICES.map((choice) => (
          <Chip key={choice} text={`${choice}`} chosen={value === choice} onPress={() => onChange(choice)} />
        ))}
        <Chip text="Not sure" chosen={false} onPress={() => onChange(undefined)} />
      </View>
    </View>
  );
}

// How much of the guess is scanned. Text says the numbers; this only shows them.
export function CoverageBar({ scanned, estimate }: { scanned: number; estimate: number }) {
  return (
    <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.fill, { width: `${coverageShare(scanned, estimate) * 100}%` }]} />
    </View>
  );
}

function Chip({ text, chosen, onPress }: { text: string; chosen: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.chip, chosen && styles.chipChosen]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
    >
      <Text style={[styles.chipText, chosen && styles.chipTextChosen]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  picker: { gap: 8 },
  question: { fontSize: 15, fontWeight: "600", color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minWidth: 44, alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line },
  chipChosen: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 14, color: colors.ink },
  chipTextChosen: { color: colors.page },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: 6, backgroundColor: colors.ink },
});
