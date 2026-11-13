import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "@/client/theme";
import {
  appliesTo, DETAILS, type Detail, detailChoices, type Field, FIELD_NAMES, FIELDS, fieldsToCheck, type GarmentTags,
  missingDetails,
} from "@/shared/garment";
import { type Color, COLOR_INFO } from "@/shared/outfit/colors";

// The AI's labels, shown so the person can check and change them before
// anything is done with them (concept v3: "Verify"). Used for pieces you own,
// and later for wishes. It only shows and reports changes; whoever uses it
// decides where they are saved.

const NAMES: Record<Field, string> = {
  type: "Type",
  colors: "Colours",
  pattern: "Pattern",
  material: "Material",
  season: "Season",
  formality: "Formality",
  style: "Style",
  shirtKind: "Shirt kind",
  neckline: "Neckline",
  metal: "Metal",
};

const isDetail = (field: Field): field is Detail => (DETAILS as readonly string[]).includes(field);

const MAX_COLORS = 3; // the same limit the model has (TAG_SCHEMA)

type Props = {
  tags: GarmentTags;
  checked?: readonly Field[];
  onChange: <F extends keyof GarmentTags>(field: F, value: GarmentTags[F]) => void;
  onConfirm: () => void;
};

export function LabelEditor({ tags, checked, onChange, onConfirm }: Props) {
  const [open, setOpen] = useState<Field | null>(null);
  const [label, setLabel] = useState(tags.label);
  const toCheck = fieldsToCheck(tags, checked);
  // Details only show for the types they apply to: no "neckline" on jeans.
  const shown = FIELD_NAMES.filter((field) => !isDetail(field) || appliesTo(field, tags.type));
  const newDetails = missingDetails(tags).some((detail) => toCheck.includes(detail));
  const unsure = toCheck.some((field) => !isDetail(field));

  function commitLabel() {
    const trimmed = label.trim();
    if (trimmed === "") setLabel(tags.label);
    else if (trimmed !== tags.label) onChange("label", trimmed);
  }

  return (
    <View style={styles.editor}>
      <TextInput
        style={styles.title}
        value={label}
        onChangeText={setLabel}
        onEndEditing={commitLabel}
        returnKeyType="done"
        accessibilityLabel="Name"
      />

      {toCheck.length > 0 && (
        <Text style={styles.note}>
          {unsure ? "The AI wasn't sure about everything. " : ""}
          {newDetails ? "Some labels are new since this piece was read. " : ""}
          Please check the marked labels.
        </Text>
      )}

      <View>
        {shown.map((field) => (
          <View key={field} style={styles.field}>
            <Pressable
              style={styles.fieldRow}
              onPress={() => setOpen(open === field ? null : field)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open === field }}
              accessibilityHint={`Change ${NAMES[field].toLowerCase()}`}
            >
              <Text style={styles.fieldName}>{NAMES[field]}</Text>
              {field === "colors" ? (
                <View style={styles.colorPreview}>
                  {tags.colors.map((c, i) => (
                    <View
                      key={i}
                      style={[
                        styles.colorDot,
                        { backgroundColor: COLOR_INFO[c as Color].hex },
                        COLOR_INFO[c as Color].lab[0] > 80 && styles.colorDotLight,
                      ]}
                    />
                  ))}
                  <Text style={styles.fieldValue} numberOfLines={1}>{tags.colors.join(", ")}</Text>
                </View>
              ) : (
                <Text style={styles.fieldValue}>{tags[field] ?? "not set"}</Text>
              )}
              {toCheck.includes(field) && <Text style={styles.check}>Please check</Text>}
            </Pressable>
            {open === field && (field === "colors" ? (
              <ColorChoice value={tags.colors} onChange={(value) => onChange("colors", value)} />
            ) : (
              <OneChoice
                options={isDetail(field) ? detailChoices(field) : FIELDS[field]}
                value={tags[field] ?? ""}
                onChange={(value) => {
                  onChange(field, value as GarmentTags[typeof field]);
                  // When the type changes, try to update the label to match.
                  // "navy top" corrected to shorts → "navy shorts". If the
                  // old type word isn't in the label, the user edits it manually.
                  if (field === "type") {
                    const pattern = new RegExp(`\\b${tags.type}\\b`, "i");
                    const newLabel = tags.label.replace(pattern, value);
                    if (newLabel !== tags.label) {
                      onChange("label", newLabel);
                      setLabel(newLabel);
                    }
                  }
                  setOpen(null);
                }}
              />
            ))}
          </View>
        ))}
      </View>

      {toCheck.length > 0 && (
        <Pressable style={styles.confirm} onPress={onConfirm} accessibilityRole="button">
          <Text style={styles.confirmText}>The labels are right</Text>
        </Pressable>
      )}
    </View>
  );
}

function OneChoice({ options, value, onChange }: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((option) => (
        <Chip key={option} text={option} chosen={option === value} onPress={() => onChange(option)} />
      ))}
    </View>
  );
}

// Colours: up to three, the main one first. Tapping adds a colour at the
// end, tapping a chosen one takes it out. At least one always stays.
// Shown as a swatch grid so the actual colour is visible — much faster
// than reading "light-blue" or "burgundy" in a list.
function ColorChoice({ value, onChange }: {
  value: GarmentTags["colors"];
  onChange: (value: GarmentTags["colors"]) => void;
}) {
  function toggle(color: GarmentTags["colors"][number]) {
    if (value.includes(color)) {
      if (value.length > 1) onChange(value.filter((c) => c !== color));
    } else if (value.length < MAX_COLORS) {
      onChange([...value, color]);
    }
  }

  return (
    <View style={styles.choice}>
      <Text style={styles.hint}>Main colour first, up to {MAX_COLORS}. Tap a chosen colour to remove it.</Text>
      <View style={styles.swatchGrid}>
        {FIELDS.colors.map((color) => {
          const position = value.indexOf(color);
          const chosen = position !== -1;
          const info = COLOR_INFO[color as Color];
          const isLight = info.lab[0] > 80;
          return (
            <Pressable
              key={color}
              style={[styles.swatch, { backgroundColor: info.hex }, isLight && styles.swatchLight]}
              onPress={() => toggle(color)}
              accessibilityRole="button"
              accessibilityLabel={color}
              accessibilityState={{ selected: chosen }}
            >
              {chosen && (
                <View style={styles.swatchBadge}>
                  <Text style={styles.swatchBadgeText}>{position + 1}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Chip({ text, chosen, onPress }: { text: string; chosen: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.chip, chosen && styles.chipChosen]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
    >
      <Text style={[styles.chipText, chosen && styles.chipTextChosen]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  editor: { gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: colors.ink, paddingVertical: 4 },
  note: { fontSize: 15, color: colors.check },
  field: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 },
  fieldName: { width: 88, fontSize: 15, color: colors.muted },
  fieldValue: { flex: 1, fontSize: 15, color: colors.ink },
  check: { fontSize: 13, fontWeight: "600", color: colors.check },
  choice: { gap: 8, paddingBottom: 12 },
  hint: { fontSize: 13, color: colors.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line },
  chipChosen: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 14, color: colors.ink },
  chipTextChosen: { color: colors.page },

  colorPreview: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  colorDotLight: { borderWidth: 1, borderColor: colors.line },

  swatchGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 12 },
  swatch: { width: 54, height: 54, borderRadius: 8 },
  swatchLight: { borderWidth: 1, borderColor: colors.line },
  swatchBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  swatchBadgeText: { fontSize: 11, fontWeight: "700", color: "white" },
  confirm: { paddingVertical: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.ink, alignItems: "center" },
  confirmText: { fontSize: 16, fontWeight: "600", color: colors.ink },
});
