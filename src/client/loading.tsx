import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors } from "@/client/theme";

// Shown while the app reads what is saved on the phone, so opening it never
// looks like an empty white screen.
export function Loading() {
  return (
    <View style={styles.screen} accessibilityLabel="Loading">
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.page },
});
