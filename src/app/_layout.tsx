import { Stack } from "expo-router";

import { ClosetProvider } from "@/client/closet-context";
import { PasscodeGate } from "@/client/passcode-gate";

export default function RootLayout() {
  return (
    <PasscodeGate>
      <ClosetProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="piece/[id]" options={{ title: "" }} />
          <Stack.Screen name="wish" options={{ title: "Wish check" }} />
          <Stack.Screen name="cut" options={{ title: "Cut out" }} />
          <Stack.Screen name="secondhand" options={{ title: "Second-hand list" }} />
          <Stack.Screen name="coverage" options={{ title: "What's scanned" }} />
          <Stack.Screen name="sweep" options={{ title: "Scan" }} />
          <Stack.Screen name="capsule" options={{ title: "Rarely worn" }} />
          <Stack.Screen name="developer" options={{ title: "Developer" }} />
        </Stack>
      </ClosetProvider>
    </PasscodeGate>
  );
}
