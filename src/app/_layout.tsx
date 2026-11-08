import { Stack } from "expo-router";

import { ClosetProvider } from "@/client/closet-context";
import { PasscodeGate } from "@/client/passcode-gate";

// The provider sits above the Stack, so every screen shares one closet.
export default function RootLayout() {
  return (
    <PasscodeGate>
      <ClosetProvider>
        <Stack>
          <Stack.Screen name="index" options={{ title: "My closet" }} />
          <Stack.Screen name="piece/[id]" options={{ title: "" }} />
          <Stack.Screen name="wish" options={{ title: "Wish check" }} />
          <Stack.Screen name="cut" options={{ title: "Cut out" }} />
          <Stack.Screen name="secondhand" options={{ title: "Second-hand list" }} />
          <Stack.Screen name="coverage" options={{ title: "What's scanned" }} />
          <Stack.Screen name="sweep" options={{ title: "Scan" }} />
        </Stack>
      </ClosetProvider>
    </PasscodeGate>
  );
}
