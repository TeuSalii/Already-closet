import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors } from "@/client/theme";
import { type Field, FIELD_NAMES, FIELDS, fieldsToCheck, type GarmentTags } from "@/shared/garment";

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
};

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
        <Text style={styles.note}>The AI wasn't sure about everything. Please check the marked labels.</Text>
      )}

      <View>
        {FIELD_NAMES.map((field) => (
          <View key={field} style={styles.field}>
            <Pressable
              style={styles.fieldRow}
              onPress={() => setOpen(open === field ? null : field)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open === field }}
              accessibilityHint={`Change ${NAMES[field].toLowerCase()}`}
            >
              <Text style={styles.fieldName}>{NAMES[field]}</Text>
              <Text style={styles.fieldValue}>{field === "colors" ? tags.colors.join(", ") : tags[field]}</Text>
              {toCheck.includes(field) && <Text style={styles.check}>Please check</Text>}
            </Pressable>
            {open === field && (field === "colors" ? (
              <ColorChoice value={tags.colors} onChange={(value) => onChange("colors", value)} />
            ) : (
              <OneChoice
                options={FIELDS[field]}
                value={tags[field]}
                onChange={(value) => {
                  onChange(field, value as GarmentTags[typeof field]);
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
      <Text style={styles.hint}>Main colour first, up to {MAX_COLORS}. Tap a chosen colour to take it out.</Text>
      <View style={styles.chips}>
        {FIELDS.colors.map((color) => {
          const position = value.indexOf(color);
          return (
            <Chip
              key={color}
              text={position === -1 ? color : `${position + 1}. ${color}`}
              chosen={position !== -1}
              onPress={() => toggle(color)}
            />
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
  confirm: { paddingVertical: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.ink, alignItems: "center" },
  confirmText: { fontSize: 16, fontWeight: "600", color: colors.ink },
});
