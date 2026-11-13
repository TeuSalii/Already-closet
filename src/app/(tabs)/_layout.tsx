import { router, Tabs } from "expo-router";
import { useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { GridIcon, ShirtIcon } from "@/client/icons";
import { colors } from "@/client/theme";

// Moved from index.tsx: five quick taps on the barely-visible square open the
// developer screen. Lives here so it appears on the Closet tab's header.
const TAPS = 5;
const WITHIN_MS = 1500;

function SecretDoor() {
  const taps = useRef({ count: 0, last: 0 });
  function tap() {
    const now = Date.now();
    const t = taps.current;
    t.count = now - t.last < WITHIN_MS ? t.count + 1 : 1;
    t.last = now;
    if (t.count >= TAPS) {
      t.count = 0;
      router.push("/developer");
    }
  }
  return (
    <Pressable onPress={tap} hitSlop={12} accessible={false} importantForAccessibility="no-hide-descendants" style={styles.door}>
      <View style={styles.doorSquare} />
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.page, borderTopColor: colors.line },
        headerStyle: { backgroundColor: colors.page },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Outfit",
          headerTitle: "Today's outfit",
          tabBarIcon: ({ color, size }) => <ShirtIcon color={color as string | undefined} size={size} />,
        }}
      />
      <Tabs.Screen
        name="closet"
        options={{
          title: "Closet",
          headerTitle: "My closet",
          tabBarIcon: ({ color, size }) => <GridIcon color={color as string | undefined} size={size} />,
          headerRight: () => <SecretDoor />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  door: { padding: 4, marginRight: 8 },
  doorSquare: { width: 12, height: 12, backgroundColor: "#F3F2F0" },
});
