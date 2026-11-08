import { File } from "expo-file-system";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { capture, readPhoto } from "@/client/add-piece";
import { FIELD_NAMES, type Field, type GarmentTags } from "@/shared/garment";
import { loadPieces, type Origin, type Piece, type PieceStatus, savePieces } from "@/storage/closet";

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

  useEffect(() => {
    loadPieces().then(setPieces);
  }, []);

  // Whatever changes a list, it is saved. One place, so it is never forgotten.
  useEffect(() => {
    if (pieces !== null) savePieces(pieces);
  }, [pieces]);

  // Changes one piece, always starting from the newest version of it.
  function update(id: string, change: (piece: Piece) => Piece) {
    setPieces((current) => current!.map((piece) => (piece.id === id ? change(piece) : piece)));
  }

  // Sets the status and keeps everything else as it is *now*. This matters:
  // the person may pick an origin while the model is still reading. If we
  // built the piece from the version we had when reading started, that
  // origin would be silently thrown away when the tags arrive.
  function setStatus(id: string, status: PieceStatus) {
    update(id, (p) => ({ id: p.id, photo: p.photo, addedAt: p.addedAt, origin: p.origin, ...status }));
  }

  async function read(id: string, photo: string) {
    setStatus(id, { status: "reading" });
    try {
      setStatus(id, { status: "read", tags: await readPhoto(photo) });
    } catch (error) {
      console.warn(error);
      setStatus(id, { status: "failed" });
    }
  }

  if (pieces === null) return null;

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
        const checked = piece.checked ?? [];
        const isField = (FIELD_NAMES as string[]).includes(field);
        return {
          ...piece,
          tags: { ...piece.tags, [field]: value },
          checked: isField && !checked.includes(field as Field) ? [...checked, field as Field] : checked,
        };
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
      if (old !== undefined) deletePhoto(old);
    },

    removePiece(id) {
      const photo = pieces.find((piece) => piece.id === id)?.photo;
      setPieces((current) => current!.filter((piece) => piece.id !== id));
      if (photo !== undefined) deletePhoto(photo);
    },
  };

  return <ClosetContext.Provider value={closet}>{children}</ClosetContext.Provider>;
}

// A photo that is gone already is fine: the goal is that it is gone.
function deletePhoto(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn(error);
  }
}
