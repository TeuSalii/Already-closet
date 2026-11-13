import { useMemo, useState } from "react";
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCloset } from "@/client/closet-context";
import { colors } from "@/client/theme";
import { OCCASION_RULES, OCCASIONS, type Occasion, type OutfitRequest, type RequestSeason, type Time } from "@/shared/outfit/occasions";
import { category, type OutfitPiece } from "@/shared/outfit/pieces";
import { checkOutfit } from "@/shared/outfit/rules";
import { scoreOutfit, type Score } from "@/shared/outfit/score";
import { suggestOutfits } from "@/shared/outfit/suggest";

// --- helpers ----------------------------------------------------------------

function currentSeason(): RequestSeason {
  const m = new Date().getMonth() + 1;
  if (m >= 6 && m <= 8) return "summer";
  if (m === 12 || m <= 2) return "winter";
  return "transitional";
}

function currentTime(): Time {
  return new Date().getHours() < 18 ? "day" : "evening";
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatReason(score: Score): string {
  const positive = score.parts.filter((p) => p.points > 0);
  if (positive.length === 0) return "A clean, balanced look.";
  return positive.slice(0, 2).map((p) => p.reason).join(" · ");
}

// --- types ------------------------------------------------------------------

type DisplayOutfit = { pieces: OutfitPiece[]; reason: string; done: boolean };

type SwapState = {
  idx: number;
  piece: OutfitPiece | null;      // null = still picking which piece
  alts: { piece: OutfitPiece; score: number }[];
};

// --- swap logic (pure, runs locally) ----------------------------------------

function findAlternatives(
  outfit: OutfitPiece[],
  toSwap: OutfitPiece,
  all: OutfitPiece[],
  request: OutfitRequest,
): { piece: OutfitPiece; score: number }[] {
  const rest = outfit.filter((p) => p.id !== toSwap.id);
  const cat = category(toSwap);
  return all
    .filter((p) => !outfit.some((o) => o.id === p.id) && category(p) === cat)
    .flatMap((candidate) => {
      const trial = [...rest, candidate];
      if (checkOutfit(trial, request).length > 0) return [];
      return [{ piece: candidate, score: scoreOutfit(trial, request).total }];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// --- screen -----------------------------------------------------------------

export default function OutfitScreen() {
  const { pieces, markWorn } = useCloset();
  const insets = useSafeAreaInsets();

  const [request, setRequest] = useState<OutfitRequest | null>(null);
  const [notEnough, setNotEnough] = useState<string | null>(null);
  const [outfits, setOutfits] = useState<DisplayOutfit[]>([]);
  const [swapping, setSwapping] = useState<SwapState | null>(null);

  // All tagged pieces as OutfitPiece[], for the pipeline and swap search.
  const outfitPieces = useMemo<OutfitPiece[]>(
    () =>
      pieces.flatMap((p) => {
        if (p.status !== "read") return [];
        return [{ id: p.id, tags: p.tags, ...(p.lastWorn ? { lastWorn: p.lastWorn } : {}) }];
      }),
    [pieces],
  );

  const photoFor = useMemo(() => new Map(pieces.map((p) => [p.id, p.photo])), [pieces]);

  function suggest(occ: Occasion) {
    const req: OutfitRequest = { occasion: occ, season: currentSeason(), time: currentTime() };
    setRequest(req);
    const r = suggestOutfits(outfitPieces, req, { today: todayString() });
    setNotEnough(r.notEnough);
    setOutfits(r.suggestions.map((s) => ({ pieces: [...s.pieces], reason: formatReason(s.score), done: false })));
  }

  function markOutfitWorn(idx: number) {
    markWorn(outfits[idx].pieces.map((p) => p.id));
    setOutfits((cur) => cur.map((o, i) => (i === idx ? { ...o, done: true } : o)));
  }

  function skipOutfit(idx: number) {
    setOutfits((cur) => cur.map((o, i) => (i === idx ? { ...o, done: true } : o)));
  }

  function beginSwap(idx: number) {
    setSwapping({ idx, piece: null, alts: [] });
  }

  function selectSwapPiece(piece: OutfitPiece) {
    if (!swapping || !request) return;
    const alts = findAlternatives(outfits[swapping.idx].pieces, piece, outfitPieces, request);
    setSwapping({ ...swapping, piece, alts });
  }

  function applySwap(alt: OutfitPiece) {
    if (!swapping?.piece) return;
    const { idx, piece } = swapping;
    setOutfits((cur) =>
      cur.map((o, i) => (i === idx ? { ...o, pieces: o.pieces.map((p) => (p.id === piece.id ? alt : p)) } : o)),
    );
    setSwapping(null);
  }

  const hasReadPieces = outfitPieces.length > 0;
  const visible = outfits.filter((o) => !o.done);
  const allDone = request !== null && outfits.length > 0 && visible.length === 0;

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      {/* Occasion picker */}
      <FlatList
        horizontal
        data={OCCASIONS}
        keyExtractor={(o) => o}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.pill, request?.occasion === item && styles.pillActive]}
            onPress={() => suggest(item)}
          >
            <Text style={[styles.pillText, request?.occasion === item && styles.pillTextActive]}>
              {OCCASION_RULES[item].label}
            </Text>
          </Pressable>
        )}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {!hasReadPieces && (
          <Text style={styles.hint}>Add pieces to your closet to get outfit suggestions.</Text>
        )}
        {hasReadPieces && !request && (
          <Text style={styles.hint}>Pick an occasion above.</Text>
        )}
        {request && notEnough && (
          <Text style={styles.hint}>{notEnough}</Text>
        )}
        {allDone && (
          <View style={styles.allDone}>
            <Text style={styles.hint}>That's it for today.</Text>
            <Pressable style={styles.againBtn} onPress={() => request && suggest(request.occasion)}>
              <Text style={styles.againBtnText}>Suggest again</Text>
            </Pressable>
          </View>
        )}
        {outfits.map((outfit, idx) =>
          outfit.done ? null : (
            <OutfitCard
              key={idx}
              outfit={outfit}
              photoFor={photoFor}
              onWorn={() => markOutfitWorn(idx)}
              onSwap={() => beginSwap(idx)}
              onSkip={() => skipOutfit(idx)}
            />
          ),
        )}
      </ScrollView>

      {/* Swap sheet */}
      <Modal visible={swapping !== null} transparent animationType="slide" onRequestClose={() => setSwapping(null)}>
        <View style={styles.modalOuter}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSwapping(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {swapping?.piece === null ? (
              <>
                <Text style={styles.sheetTitle}>Which piece to swap?</Text>
                {outfits[swapping.idx]?.pieces.map((piece) => (
                  <Pressable key={piece.id} style={styles.sheetRow} onPress={() => selectSwapPiece(piece)}>
                    <Thumb photo={photoFor.get(piece.id)} size={44} />
                    <Text style={styles.sheetLabel}>{piece.tags.label}</Text>
                  </Pressable>
                ))}
              </>
            ) : swapping ? (
              <>
                <Pressable onPress={() => setSwapping({ ...swapping, piece: null, alts: [] })}>
                  <Text style={styles.sheetBack}>← Back</Text>
                </Pressable>
                <Text style={styles.sheetTitle}>Swapping the {swapping.piece.tags.label}</Text>
                {swapping.alts.length === 0 ? (
                  <Text style={styles.hint}>Nothing else in your closet works here.</Text>
                ) : (
                  swapping.alts.map(({ piece }) => (
                    <Pressable key={piece.id} style={styles.sheetRow} onPress={() => applySwap(piece)}>
                      <Thumb photo={photoFor.get(piece.id)} size={44} />
                      <Text style={styles.sheetLabel}>{piece.tags.label}</Text>
                    </Pressable>
                  ))
                )}
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// --- sub-components ---------------------------------------------------------

function Thumb({ photo, size = 56 }: { photo: string | undefined; size?: number }) {
  const r = size * 0.18;
  if (!photo) return <View style={[styles.thumbPlaceholder, { width: size, height: size, borderRadius: r }]} />;
  return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: r }} />;
}

function OutfitCard({
  outfit,
  photoFor,
  onWorn,
  onSwap,
  onSkip,
}: {
  outfit: DisplayOutfit;
  photoFor: Map<string, string>;
  onWorn: () => void;
  onSwap: () => void;
  onSkip: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.thumbRow}>
        {outfit.pieces.map((p) => (
          <Thumb key={p.id} photo={photoFor.get(p.id)} />
        ))}
      </View>
      <Text style={styles.reason}>{outfit.reason}</Text>
      <View style={styles.cardActions}>
        <Pressable style={[styles.btn, styles.btnFilled]} onPress={onWorn}>
          <Text style={[styles.btnText, styles.btnFilledText]}>Worn today</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnOutlined]} onPress={onSwap}>
          <Text style={styles.btnText}>Swap a piece</Text>
        </Pressable>
        <Pressable style={styles.skipBtn} onPress={onSkip}>
          <Text style={styles.skipText}>Not today</Text>
        </Pressable>
      </View>
    </View>
  );
}

// --- styles -----------------------------------------------------------------

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },

  pillRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line },
  pillActive: { borderColor: colors.ink, backgroundColor: colors.ink },
  pillText: { fontSize: 14, color: colors.soft },
  pillTextActive: { color: colors.page },

  scroll: { padding: 16, gap: 12, flexGrow: 1 },
  hint: { fontSize: 15, color: colors.soft, textAlign: "center", marginTop: 32 },

  allDone: { alignItems: "center" },
  againBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, borderWidth: 1.5, borderColor: colors.ink },
  againBtnText: { fontSize: 15, fontWeight: "600", color: colors.ink },

  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 16, gap: 12 },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumbPlaceholder: { backgroundColor: colors.photoBack },
  reason: { fontSize: 14, color: colors.soft, lineHeight: 20 },

  cardActions: { gap: 8 },
  btn: { paddingVertical: 13, borderRadius: 999, alignItems: "center" },
  btnFilled: { backgroundColor: colors.ink },
  btnOutlined: { borderWidth: 1.5, borderColor: colors.ink },
  btnText: { fontSize: 15, fontWeight: "600", color: colors.ink },
  btnFilledText: { color: colors.page },
  skipBtn: { alignItems: "center", paddingVertical: 4 },
  skipText: { fontSize: 14, color: colors.muted },

  modalOuter: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: colors.page,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, gap: 4,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  sheetTitle: { fontSize: 16, fontWeight: "600", color: colors.ink, marginBottom: 8 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  sheetLabel: { fontSize: 15, color: colors.ink, flex: 1 },
  sheetBack: { fontSize: 14, color: colors.soft, marginBottom: 8 },
});
