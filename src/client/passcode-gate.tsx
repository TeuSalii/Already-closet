import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput } from "react-native";

import { Loading } from "@/client/loading";
import { colors } from "@/client/theme";
import { PASSCODE_HEADER } from "@/shared/garment";
import { forgetPasscode, loadPasscode, savePasscode } from "@/storage/closet";

// The app opens once this phone has the right passcode (APP_PASSCODE in
// .env). It is typed in, never built into the app: the dev server hands the
// app's code to anyone on the Wi-Fi who asks for it.

let passcode: string | null = null;
let lock: (() => void) | null = null;

export const passcodeHeaders = () => ({ [PASSCODE_HEADER]: passcode ?? "" });

// The server said no: the passcode was changed. Ask for it again.
export function passcodeRejected() {
  passcode = null;
  forgetPasscode().catch(console.warn);
  lock?.();
}

export function PasscodeGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "locked" | "open">("loading");

  useEffect(() => {
    lock = () => setState("locked");
    loadPasscode()
      .then((saved) => {
        passcode = saved;
        setState(saved === null ? "locked" : "open");
      })
      .catch((error: unknown) => {
        console.warn(error);
        setState("locked");
      });
    return () => {
      lock = null;
    };
  }, []);

  if (state === "loading") return <Loading />;
  if (state === "locked") return <PasscodeScreen onOpen={() => setState("open")} />;
  return children;
}

function PasscodeScreen({ onOpen }: { onOpen: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const code = typed.trim();

  async function submit() {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/tag", { headers: { [PASSCODE_HEADER]: code } });
      if (response.ok) {
        passcode = code;
        await savePasscode(code);
        onOpen();
        return;
      }
      setProblem(response.status === 401 ? "That passcode isn't right." : "The computer isn't set up for this yet. Check .env and restart it.");
    } catch (error) {
      console.warn(error);
      setProblem("Can't reach the computer. Check that it's running and on the same network.");
    }
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.title}>Enter the passcode</Text>
      <Text style={styles.body}>You only need to do this once on this phone.</Text>
      <TextInput
        style={styles.input}
        value={typed}
        onChangeText={setTyped}
        onSubmitEditing={() => code !== "" && !busy && submit()}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel="Passcode"
      />
      {problem !== null && <Text style={styles.problem} accessibilityLiveRegion="polite">{problem}</Text>}
      <Pressable
        style={[styles.button, (code === "" || busy) && styles.disabled]}
        onPress={submit}
        disabled={code === "" || busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: code === "" || busy }}
      >
        {busy ? <ActivityIndicator color={colors.page} /> : <Text style={styles.buttonText}>Open</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", gap: 16, padding: 24, backgroundColor: colors.page },
  title: { fontSize: 22, fontWeight: "700", color: colors.ink },
  body: { fontSize: 16, color: colors.soft, lineHeight: 22 },
  input: { fontSize: 18, color: colors.ink, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line },
  problem: { fontSize: 15, color: colors.danger },
  button: { paddingVertical: 16, borderRadius: 999, alignItems: "center", backgroundColor: colors.ink },
  disabled: { opacity: 0.4 },
  buttonText: { fontSize: 16, fontWeight: "600", color: colors.page },
});
