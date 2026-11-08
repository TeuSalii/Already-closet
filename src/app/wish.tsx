import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { pick, readPhoto, type Source } from "@/client/add-piece";
import { useCloset } from "@/client/closet-context";
import { deleteFile } from "@/client/cut-out";
import { LabelEditor } from "@/client/label-editor";
import { colors } from "@/client/theme";
import { CoverageBar, EstimatePicker } from "@/client/estimate-picker";
import { closestOwned, plural } from "@/shared/closest";
import { CATEGORY_WORDS, coverageText } from "@/shared/coverage";
import { type Category, changeLabel, type Field, fieldsToCheck, type GarmentTags } from "@/shared/garment";
import type { Piece } from "@/storage/closet";

// The wish check (concept v3, critical flow): something you want → the
// closest pieces you already own → you decide. The app shows, the person
// decides: no "you don't need this", no buy suggestion.
//
// The wish image (risk R6: it may show a friend or an influencer) is cut out
// to the garment before the model sees it, and stays in the cache while this
// screen is open. It is deleted when the check ends, unless the wish is saved
// to the second-hand list: then a copy of the cut-out stays with it, until
// the wish is removed from the list.

type Step =
  | { step: "start" }
  | { step: "reading"; photo: string }
  | { step: "failed"; photo: string }
  | { step: "verify"; photo: string; tags: GarmentTags; checked: Field[] }
  | { step: "results"; photo: string; tags: GarmentTags; checked: Field[] }
  | { step: "done"; ending: Ending };

type Ending = "wear-mine" | "saved" | "let-go";

const ENDINGS: Record<Ending, string> = {
  "wear-mine": "You're wearing one of yours.",
  saved: "Saved to your second-hand list.",
  "let-go": "You let the wish go.",
};

// "your 1 scanned top", "your 5 scanned tops".
const scanned = (count: number, category: Category) =>
  `${count} scanned ${CATEGORY_WORDS[category][count === 1 ? 0 : 1]}`;

export default function WishScreen() {
  const { pieces, saveWish } = useCloset();
  const [state, setState] = useState<Step>({ step: "start" });
  const saving = useRef(false);

  const photo = "photo" in state ? state.photo : null;
  useEffect(() => {
    if (photo === null) return;
    return () => deleteFile(photo); // replaced, ended, or screen closed
  }, [photo]);

  async function begin(source: Source) {
    const picked = await pick(source);
    if (picked === null) return;
    read(picked);
  }

  async function read(picked: string) {
    setState({ step: "reading", photo: picked });
    try {
      const tags = await readPhoto(picked);
      setState({ step: "verify", photo: picked, tags, checked: [] });
    } catch (error) {
      console.warn(error);
      setState({ step: "failed", photo: picked });
    }
  }

  async function end(ending: Ending, tags: GarmentTags, picture: string) {
    if (saving.current) return; // another tap while copying
    saving.current = true;
    try {
      // The copy is finished first: leaving this step deletes the cache image.
      if (ending === "saved") await saveWish(tags, picture);
      setState({ step: "done", ending });
    } catch (error) {
      console.warn(error);
      Alert.alert("Couldn't save the wish", "Please try again.");
    } finally {
      saving.current = false;
    }
  }

  switch (state.step) {
    case "start":
      return (
        <View style={[styles.screen, styles.content]}>
          <Text style={styles.title}>Want something new?</Text>
          <Text style={styles.body}>
            Take a photo of it, or choose a screenshot from an online shop. You'll see the closest pieces you already own.
          </Text>
          <View style={styles.gap} />
          <Button text="Choose a screenshot" filled onPress={() => begin("library").catch(console.warn)} />
          <Button text="Take a photo" onPress={() => begin("camera").catch(console.warn)} />
          <Text style={styles.muted}>Crop to the piece you want. The image is not kept after the check.</Text>
        </View>
      );

    case "reading":
      return (
        <View style={[styles.screen, styles.content]}>
          <Image source={state.photo} style={styles.photo} contentFit="contain" />
          <View style={styles.row}>
            <ActivityIndicator size="small" />
            <Text style={styles.muted}>Looking at it…</Text>
          </View>
        </View>
      );

    case "failed":
      return (
        <View style={[styles.screen, styles.content]}>
          <Image source={state.photo} style={styles.photo} contentFit="contain" />
          <Text style={styles.body}>Couldn't read it.</Text>
          <Button text="Try again" filled onPress={() => read(state.photo)} />
          <Button text="Use another image" onPress={() => setState({ step: "start" })} />
        </View>
      );

    case "verify": {
      const open = fieldsToCheck(state.tags, state.checked);
      return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
          <Image source={state.photo} style={styles.photo} contentFit="contain" />
          <Text style={styles.muted}>Is this what you want? Change anything that's wrong first.</Text>
          <LabelEditor
            tags={state.tags}
            checked={state.checked}
            onChange={(field, value) => setState({ ...state, ...changeLabel(state.tags, state.checked, field, value) })}
            onConfirm={() => setState({ ...state, checked: [...open, ...state.checked] })}
          />
          {/* Error prevention: the search runs on labels the person has looked at. */}
          <Button
            text={open.length > 0 ? "Check the marked labels first" : "Find what I own"}
            filled
            disabled={open.length > 0}
            onPress={() => setState({ ...state, step: "results" })}
          />
          <Button text="Use another image" onPress={() => setState({ step: "start" })} />
        </ScrollView>
      );
    }

    case "results":
      return (
        <Results
          wish={state.tags}
          photo={state.photo}
          pieces={pieces}
          onEdit={() => setState({ ...state, step: "verify" })}
          onEnd={(ending) => end(ending, state.tags, state.photo)}
        />
      );

    case "done":
      return (
        <View style={[styles.screen, styles.content]}>
          <Text style={styles.title}>{ENDINGS[state.ending]}</Text>
          <Text style={styles.body}>
            {state.ending === "saved"
              ? "Look for it second-hand, instead of new. The cut-out and its labels are kept on this phone until you remove it from the list."
              : "The wish image has been deleted."}
          </Text>
          <View style={styles.gap} />
          <Button text="Back to my closet" filled onPress={() => router.back()} />
          {state.ending === "saved" && <Button text="See the list" onPress={() => router.replace("/secondhand")} />}
        </View>
      );
  }
}

function Results({ wish, photo, pieces, onEdit, onEnd }: {
  wish: GarmentTags;
  photo: string;
  pieces: Piece[];
  onEdit: () => void;
  onEnd: (ending: Ending) => void;
}) {
  const result = closestOwned(wish, pieces, (piece) => (piece.status === "read" ? piece.tags : null));
  const { estimates, setEstimate } = useCloset();
  const estimate = estimates[result.category];
  const reading = pieces.filter((piece) => piece.status === "reading").length;
  const group = CATEGORY_WORDS[result.category][1];
  const found = result.closest.length > 0;

  // Concept v3, Scenario B: "closest among what is scanned" must never read
  // as "nothing like it exists", so what the search could see is always said.
  const headline =
    result.same > 0
      ? `You own ${result.same} ${wish.colors[0]} ${plural(wish.type, result.same)}.`
      : result.closest.length > 0
        ? `Closest among your ${scanned(result.scanned, result.category)}:`
        : result.scanned > 0
          ? `Nothing close among your ${scanned(result.scanned, result.category)}.`
          : `You haven't scanned any ${group} yet.`;
  // Coverage beside every result (concept v3, risk R3).
  const coverage = coverageText(result.category, result.scanned, estimate);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <Image source={photo} style={styles.wishThumb} contentFit="contain" />
        <Pressable style={styles.flex} onPress={onEdit} accessibilityRole="button" accessibilityHint="Change the wish labels">
          <Text style={styles.label}>Your wish: {wish.label}</Text>
          <Text style={styles.muted}>Change labels</Text>
        </Pressable>
      </View>

      <View style={styles.block}>
        <Text style={styles.title}>{headline}</Text>
        {result.same > 0 && <Text style={styles.muted}>Among your {scanned(result.scanned, result.category)}.</Text>}
      </View>

      <View style={styles.coverage}>
        {coverage !== null && estimate !== undefined ? (
          <>
            <Text style={styles.muted}>{coverage}. Pieces you haven't scanned aren't searched.</Text>
            <CoverageBar scanned={result.scanned} estimate={estimate} />
          </>
        ) : (
          <>
            <Text style={styles.muted}>Pieces you haven't scanned aren't searched.</Text>
            <EstimatePicker category={result.category} value={estimate} onChange={(v) => setEstimate(result.category, v)} />
          </>
        )}
        {reading > 0 && (
          <View style={styles.row}>
            <ActivityIndicator size="small" />
            <Text style={styles.muted}>Reading {reading} new {reading === 1 ? "piece" : "pieces"}…</Text>
          </View>
        )}
        {/* The category sweep (concept v3, Section 6): offered when a wish
            gives a reason to. The results update when the new pieces are read. */}
        {(estimate === undefined || result.scanned < estimate) && (
          <Pressable
            onPress={() => router.push({ pathname: "/sweep", params: { category: result.category } })}
            accessibilityRole="button"
          >
            <Text style={styles.link}>Scan your {group} now</Text>
          </Pressable>
        )}
      </View>

      {result.closest.map(({ piece, reasons }) => (
        <Pressable
          key={piece.id}
          style={styles.match}
          onPress={() => router.push({ pathname: "/piece/[id]", params: { id: piece.id } })}
          accessibilityRole="button"
        >
          <Image source={piece.photo} style={styles.matchPhoto} contentFit="contain" />
          <View style={styles.flex}>
            <Text style={styles.label}>{piece.status === "read" ? piece.tags.label : ""}</Text>
            <Text style={styles.muted}>Same: {reasons.join(" · ")}</Text>
          </View>
        </Pressable>
      ))}

      <View style={styles.gap} />
      <Text style={styles.question}>What will you do?</Text>
      {/* Three ways out, in the concept's order: what you own first, then
          second-hand. None is pushed: when nothing close was found, no
          button is the filled "main" one. */}
      {found && <Button text="I'll wear one of mine" filled onPress={() => onEnd("wear-mine")} />}
      <Button text="Save to look for second-hand" onPress={() => onEnd("saved")} />
      <Button text="Let the wish go" onPress={() => onEnd("let-go")} />
    </ScrollView>
  );
}

function Button({ text, onPress, filled, disabled }: {
  text: string;
  onPress: () => void;
  filled?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, filled ? styles.filled : styles.outlined, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={[styles.buttonText, filled && styles.filledText]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, gap: 16 },
  gap: { height: 8 },
  flex: { flex: 1, gap: 2 },
  block: { gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  photo: { aspectRatio: 1, borderRadius: 16, backgroundColor: colors.photoBack },
  wishThumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.photoBack },
  title: { fontSize: 22, fontWeight: "700", color: colors.ink },
  body: { fontSize: 16, color: colors.soft, lineHeight: 22 },
  label: { fontSize: 15, fontWeight: "600", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
  question: { fontSize: 16, fontWeight: "600", color: colors.ink },
  coverage: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.photoBack },
  link: { fontSize: 15, fontWeight: "600", color: colors.ink, textDecorationLine: "underline", paddingVertical: 6 },
  match: { flexDirection: "row", alignItems: "center", gap: 12 },
  matchPhoto: { width: 88, height: 88, borderRadius: 12, backgroundColor: colors.photoBack },
  button: { paddingVertical: 16, borderRadius: 999, alignItems: "center", borderWidth: 1.5 },
  filled: { backgroundColor: colors.ink, borderColor: colors.ink },
  outlined: { borderColor: colors.ink },
  disabled: { opacity: 0.4 },
  buttonText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  filledText: { color: colors.page },
});
