import { Alert, FlatList, Pressable, StyleSheet, Text } from "react-native";

import { Card, cardGrid, cardText } from "@/client/card";
import { useCloset } from "@/client/closet-context";
import { colors } from "@/client/theme";
import type { SavedWish } from "@/storage/closet";

// The second-hand list: wishes nothing you own answered, kept to look for
// second-hand instead of new. The same cards as the closet. Risk R5: it must
// not become one more wish list, so it says what it is for, and it is easy
// to empty.
export default function SecondhandScreen() {
  const { wishes, removeWish, clearWishes } = useCloset();

  function confirmClear() {
    Alert.alert("Clear the list?", "All saved wishes and their pictures are removed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: clearWishes },
    ]);
  }

  // Tapping a card asks what to do with it: found it, or no longer wanted.
  // Either way it leaves the list.
  function open(wish: SavedWish) {
    Alert.alert(wish.tags.label, `Saved ${new Date(wish.savedAt).toLocaleDateString()}`, [
      { text: "Keep on the list", style: "cancel" },
      { text: "Remove from the list", style: "destructive", onPress: () => removeWish(wish.id) },
    ]);
  }

  return (
    <FlatList
      style={styles.screen}
      data={wishes}
      keyExtractor={(wish) => wish.id}
      numColumns={2}
      columnWrapperStyle={cardGrid.row}
      contentContainerStyle={cardGrid.list}
      ListHeaderComponent={
        <Text style={styles.intro}>
          {wishes.length === 0
            ? "Nothing saved. When a wish check finds nothing close in your closet, you can save the wish here."
            : "Things you wanted that your closet didn't have. Look for them second-hand, instead of new."}
        </Text>
      }
      renderItem={({ item }) => (
        <Card photo={item.photo} onPress={() => open(item)} accessibilityLabel={item.tags.label}>
          <Text style={cardText.label}>{item.tags.label}</Text>
          <Text style={cardText.muted}>{[item.tags.type, item.tags.colors.join(", ")].join(" · ")}</Text>
        </Card>
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
  intro: { fontSize: 15, color: colors.soft, lineHeight: 21 },
  clear: { paddingVertical: 14, alignItems: "center" },
  clearText: { fontSize: 15, fontWeight: "600", color: colors.danger },
});
