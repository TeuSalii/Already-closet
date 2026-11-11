import { Directory, File, Paths } from "expo-file-system";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { capture, readPhoto } from "@/client/add-piece";
import { deleteFile } from "@/client/cut-out";
import { Loading } from "@/client/loading";
import type { Estimates } from "@/shared/coverage";
import { type Category, changeLabel, FIELD_NAMES, type GarmentTags } from "@/shared/garment";
import {
  loadEstimates,
  loadPieces,
  loadWishes,
  type Origin,
  type Piece,
  type PieceStatus,
  saveEstimates,
  savePieces,
  type SavedWish,
  saveWishes,
} from "@/storage/closet";

// The closet as shared state. Two screens need the same pieces (closet,
// piece). Kept in one screen, the other would see a stale copy. A context
// holds them once, above all screens, and every change goes through the
// functions below.

type Closet = {
  pieces: Piece[];
  addPiece: () => Promise<string | null>; // the new piece's id, or null if cancelled
  readAgain: (piece: Piece) => void;
  setOrigin: (id: string, origin: Origin) => void;
  // Changes one label. A changed label counts as checked.
  setLabel: <F extends keyof GarmentTags>(id: string, field: F, value: GarmentTags[F]) => void;
  confirmLabels: (id: string) => void; // "the labels are right": all checked
  retake: (id: string) => Promise<void>; // a new photo, read from scratch
  removePiece: (id: string) => void;

  // The second-hand list: wishes nothing owned answered, to look for
  // second-hand instead of new.
  wishes: SavedWish[];
  saveWish: (tags: GarmentTags, photo: string) => Promise<void>; // photo: the wish image, copied out of the cache
  removeWish: (id: string) => void;
  clearWishes: () => void;

  // How many pieces the person thinks they own, per category.
  estimates: Estimates;
  setEstimate: (category: Category, estimate: number | undefined) => void; // undefined: "not sure"
};

const ClosetContext = createContext<Closet | null>(null);

export function useCloset(): Closet {
  const closet = useContext(ClosetContext);
  if (closet === null) throw new Error("useCloset must be used inside <ClosetProvider>");
  return closet;
}

export function ClosetProvider({ children }: { children: ReactNode }) {
  // null while loading, so an empty list is never saved over a full one.
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [wishes, setWishes] = useState<SavedWish[] | null>(null);
  const [estimates, setEstimates] = useState<Estimates | null>(null);

  useEffect(() => {
    loadPieces().then(setPieces);
    loadWishes().then(setWishes);
    loadEstimates().then(setEstimates);
  }, []);

  useEffect(() => {
    if (estimates !== null) saveEstimates(estimates);
  }, [estimates]);

  useEffect(() => {
    if (wishes !== null) saveWishes(wishes);
  }, [wishes]);

  // Whatever changes a list, it is saved. One place, so it is never forgotten.
  useEffect(() => {
    if (pieces !== null) savePieces(pieces);
  }, [pieces]);

  // Changes one piece, always starting from the newest version of it.
  function update(id: string, change: (piece: Piece) => Piece) {
    setPieces((current) => current!.map((piece) => (piece.id === id ? change(piece) : piece)));
  }

  async function read(id: string, photo: string) {
    // Sets the status and keeps everything else as it is *now*. This matters:
    // the person may pick an origin while the model is still reading. If we
    // built the piece from the version we had when reading started, that
    // origin would be silently thrown away when the tags arrive. And if the
    // photo was retaken meanwhile, this answer is about the old photo: dropped.
    const setStatus = (status: PieceStatus) =>
      update(id, (p) => (p.photo === photo ? { id: p.id, photo: p.photo, addedAt: p.addedAt, origin: p.origin, ...status } : p));

    setStatus({ status: "reading" });
    try {
      setStatus({ status: "read", tags: await readPhoto(photo) });
    } catch (error) {
      console.warn(error);
      setStatus({ status: "failed" });
    }
  }

  if (pieces === null || wishes === null || estimates === null) return <Loading />;

  const closet: Closet = {
    pieces,

    async addPiece() {
      const id = Date.now().toString(36);
      const photo = await capture(`${id}.jpg`);
      if (photo === null) return null;
      setPieces((current) => [{ id, photo, addedAt: new Date().toISOString(), status: "reading" }, ...current!]);
      read(id, photo);
      return id;
    },

    readAgain(piece) {
      read(piece.id, piece.photo);
    },

    setOrigin(id, origin) {
      update(id, (piece) => ({ ...piece, origin }));
    },

    setLabel(id, field, value) {
      update(id, (piece) => {
        if (piece.status !== "read") return piece;
        return { ...piece, ...changeLabel(piece.tags, piece.checked, field, value) };
      });
    },

    confirmLabels(id) {
      update(id, (piece) => (piece.status === "read" ? { ...piece, checked: [...FIELD_NAMES] } : piece));
    },

    // The recovery path from the concept: a bad photo is replaced, not
    // corrected field by field. A new file name, so no screen shows the old
    // photo from its image cache.
    async retake(id) {
      const photo = await capture(`${id}-${Date.now().toString(36)}.jpg`);
      if (photo === null) return;
      const old = pieces.find((piece) => piece.id === id)?.photo;
      update(id, (piece) => ({ ...piece, photo }));
      read(id, photo);
      if (old !== undefined) deleteFile(old);
    },

    removePiece(id) {
      const photo = pieces.find((piece) => piece.id === id)?.photo;
      setPieces((current) => current!.filter((piece) => piece.id !== id));
      if (photo !== undefined) deleteFile(photo);
    },

    wishes,

    async saveWish(tags, photo) {
      const id = Date.now().toString(36);
      const folder = new Directory(Paths.document, "wishes");
      folder.create({ idempotent: true, intermediates: true });
      const kept = new File(folder, `${id}.jpg`);
      await new File(photo).copy(kept);
      const wish: SavedWish = { id, tags, savedAt: new Date().toISOString(), photo: kept.uri };
      setWishes((current) => [wish, ...current!]);
    },

    removeWish(id) {
      const photo = wishes.find((wish) => wish.id === id)?.photo;
      setWishes((current) => current!.filter((wish) => wish.id !== id));
      if (photo !== undefined) deleteFile(photo);
    },

    clearWishes() {
      for (const wish of wishes) if (wish.photo !== undefined) deleteFile(wish.photo);
      setWishes([]);
    },

    estimates,

    setEstimate(category, estimate) {
      setEstimates((current) => {
        const next = { ...current! };
        if (estimate === undefined) delete next[category];
        else next[category] = estimate;
        return next;
      });
    },
  };

  return <ClosetContext.Provider value={closet}>{children}</ClosetContext.Provider>;
}
