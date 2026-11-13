import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/client/theme";

export default function Outfit() {
  return (
    <View style={styles.screen}>
      <Text style={styles.soon}>Coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page, alignItems: "center", justifyContent: "center" },
  soon: { fontSize: 15, color: colors.soft },
});
