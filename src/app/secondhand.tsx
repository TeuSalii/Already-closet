import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { useCloset } from "@/client/closet-context";
import { colors } from "@/client/theme";

// The second-hand list: wishes nothing you own answered, kept to look for
// second-hand instead of new. Risk R5: it must not become one more wish
// list, so it says what it is for, and it is easy to empty.
export default function SecondhandScreen() {
  const { wishes, removeWish, clearWishes } = useCloset();

  function confirmClear() {
    Alert.alert("Clear the list?", "All saved wishes are removed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: clearWishes },
    ]);
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={wishes}
      keyExtractor={(wish) => wish.id}
      ListHeaderComponent={
        <Text style={styles.intro}>
          {wishes.length === 0
            ? "Nothing saved. When a wish check finds nothing close in your closet, you can save the wish here."
            : "Things you wanted that your closet didn't have. Look for them second-hand, instead of new."}
        </Text>
      }
      renderItem={({ item }) => (
        <View style={styles.item}>
          <View style={styles.flex}>
            <Text style={styles.label}>{item.tags.label}</Text>
            <Text style={styles.muted}>
              {[item.tags.type, item.tags.colors.join(", "), item.tags.pattern].join(" · ")}
            </Text>
            <Text style={styles.muted}>Saved {new Date(item.savedAt).toLocaleDateString()}</Text>
          </View>
          <Pressable onPress={() => removeWish(item.id)} accessibilityRole="button" accessibilityLabel={`Remove ${item.tags.label}`}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      )}
      ListFooterComponent={
        wishes.length > 0 ? (
          <Pressable style={styles.clear} onPress={confirmClear} accessibilityRole="button">
            <Text style={styles.clearText}>Clear the list</Text>
          </Pressable>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, gap: 12 },
  intro: { fontSize: 15, color: colors.soft, lineHeight: 21, marginBottom: 4 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  flex: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: "600", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
  remove: { fontSize: 15, fontWeight: "600", color: colors.ink, padding: 8 },
  clear: { paddingVertical: 14, alignItems: "center" },
  clearText: { fontSize: 15, fontWeight: "600", color: colors.danger },
});
