import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { lockAgain } from "@/client/passcode-gate";
import { colors } from "@/client/theme";

// Reached by tapping the hidden square in the closet's header five times.
// For the team, not for test participants.
//
// The dev pages (src/app/dev) answer only a browser on the Mac running the dev
// server: they show teammates' test photos and spend the AI keys, so they stay
// off the Wi-Fi. In the app on the Mac (web) they open here; on a phone this
// screen says where to find them.

const PAGES = [
  { path: "/dev", title: "All dev pages" },
  { path: "/dev/test", title: "AI test" },
  { path: "/dev/outfits", title: "Outfits" },
  { path: "/dev/pieces", title: "Outfit photo → pieces" },
];

const onMac = Platform.OS === "web" && typeof window !== "undefined" && window.location.hostname === "localhost";

export default function Developer() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Passcode</Text>
      <Text style={styles.body}>Forget the passcode on this device and show the passcode screen again.</Text>
      <Pressable style={styles.button} onPress={lockAgain} accessibilityRole="button">
        <Text style={styles.buttonText}>Enter the passcode again</Text>
      </Pressable>

      <Text style={styles.heading}>Dev pages</Text>
      {onMac ? (
        <View style={styles.links}>
          {PAGES.map(({ path, title }) => (
            <Pressable key={path} onPress={() => window.location.assign(path)} accessibilityRole="link">
              <Text style={styles.link}>{title}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.body}>
          They open only in a browser on the Mac that runs the dev server, at http://localhost:8081/dev. They show the
          team's test photos and use the AI keys, so they are kept off the Wi-Fi.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: "700", color: colors.ink, marginTop: 12 },
  body: { fontSize: 15, color: colors.soft, lineHeight: 21 },
  button: { paddingVertical: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.ink, alignItems: "center" },
  buttonText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  links: { gap: 12 },
  link: { fontSize: 16, fontWeight: "600", color: colors.ink, textDecorationLine: "underline" },
});
