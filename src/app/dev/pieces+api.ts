import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { withoutSecrets } from "@/server/ai-call-log";
import { available, devNav, notFound } from "@/server/dev-page";
import { listPieces, renderPiece } from "@/server/outfit-photo";
import { refusedPasscode } from "@/server/passcode";
import { readJsonBody } from "@/server/photo-request";
import { isGarmentTags, PASSCODE_HEADER } from "@/shared/garment";
import { JPEG_QUALITY, MAX_SIDE } from "@/shared/photo-size";

// http://localhost:8081/dev/pieces : a photo of a person wearing an outfit →
// a card per piece, tagged and drawn alone on white (src/server/outfit-photo.ts).
// Development only, on this computer only, and every call needs the passcode:
// it spends the LLM Hub key and the Gemini key. Each rendered or cropped piece
// is saved automatically to data/pieces/ ({timestamp}-{label}.jpg + .json).

export function GET(request: Request) {
  if (!available(request)) return notFound();
  return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// body: { step: "list", photoBase64 } → { pieces }
//       { step: "render", photoBase64, piece } → { mimeType, base64 }
//       { step: "save", base64, mimeType, piece } → { saved: filename }  writes to data/pieces/
export async function POST(request: Request) {
  if (!available(request)) return notFound();
  const refused = refusedPasscode(request);
  if (refused !== null) return refused;

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const { step, photoBase64, piece } = body;

  try {
    if (step === "list") {
      if (typeof photoBase64 !== "string" || photoBase64 === "") return Response.json({ error: "Body needs photoBase64" }, { status: 400 });
      return Response.json({ pieces: await listPieces(photoBase64) });
    }
    if (step === "render") {
      if (typeof photoBase64 !== "string" || photoBase64 === "") return Response.json({ error: "Body needs photoBase64" }, { status: 400 });
      if (!isGarmentTags(piece)) return Response.json({ error: "piece must be a piece's tags" }, { status: 400 });
      return Response.json(await renderPiece(photoBase64, piece));
    }
    if (step === "save") {
      const { base64, mimeType } = body;
      if (typeof base64 !== "string" || !base64) return Response.json({ error: "Body needs base64" }, { status: 400 });
      if (!isGarmentTags(piece)) return Response.json({ error: "piece must be a piece's tags" }, { status: 400 });
      const ext = mimeType === "image/png" ? "png" : "jpg";
      const slug = piece.label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40);
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const name = `${ts}-${slug}`;
      const dir = path.join(process.cwd(), "data", "pieces");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${name}.${ext}`), Buffer.from(base64, "base64"));
      writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(piece, null, 2));
      return Response.json({ saved: name });
    }
    return Response.json({ error: 'step must be "list", "render", or "save"' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: withoutSecrets(message) }, { status: 502 });
  }
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Outfit photo to pieces</title>
<style>
  body { font: 15px system-ui, sans-serif; margin: 32px auto; max-width: 1100px; padding: 0 16px; color: #222; }
  button { font: inherit; padding: 8px 16px; margin: 8px 8px 0 0; }
  .note { color: #555; max-width: 760px; }
  .error { color: #b3261e; }
  #layout { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; margin-top: 16px; }
  #original { max-width: 320px; max-height: 480px; border-radius: 8px; }
  #found label { display: block; margin: 4px 0; }
  #found small { color: #666; }
  #cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-top: 24px; }
  .card { border: 1px solid #ddd; border-radius: 12px; overflow: hidden; background: #fff; }
  .card .picture { aspect-ratio: 1; background: #fff; display: flex; align-items: center; justify-content: center; color: #888; text-align: center; padding: 8px; box-sizing: border-box; }
  .card img { width: 100%; height: 100%; object-fit: contain; }
  .card .text { padding: 8px 12px 12px; border-top: 1px solid #eee; }
  .card small { color: #666; }
  .card button { padding: 4px 10px; font-size: 13px; }
  #crop-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.78); z-index: 100; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
  #crop-modal.open { display: flex; }
  #crop-canvas { cursor: crosshair; display: block; max-width: 90vw; max-height: 80vh; }
  #crop-actions { display: flex; gap: 8px; }
  #crop-actions button { background: #fff; padding: 8px 16px; }
</style>
</head>
<body>
${devNav("/dev/pieces")}
<h1>Outfit photo → pieces</h1>
<p class="note">Choose a photo of a person wearing an outfit. The tagging model (LLM Hub) lists and tags each piece;
then Gemini draws each chosen piece alone on white. The photo goes to LLM Hub and to Google: only use photos of
people who agreed. Drawing needs billing on for the Gemini key and costs a few cents per piece. Nothing is saved.</p>
<p><input id="passcode" type="password" placeholder="Passcode (APP_PASSCODE in .env)" size="32"></p>
<input id="photo" type="file" accept="image/jpeg,image/png,image/heic,image/webp">
<div id="layout">
  <img id="original" hidden alt="The chosen photo">
  <div>
    <button id="list" hidden>Find the pieces</button>
    <p id="status"></p>
    <div id="found"></div>
    <button id="draw" hidden></button>
  </div>
</div>
<div id="cards"></div>
<div id="crop-modal">
  <canvas id="crop-canvas"></canvas>
  <div id="crop-actions">
    <button id="crop-confirm">Use this crop</button>
    <button id="crop-cancel">Cancel</button>
  </div>
</div>
<script>
const MAX_SIDE = ${MAX_SIDE};
const JPEG_QUALITY = ${JPEG_QUALITY};
const element = (id) => document.getElementById(id);
let photoBase64 = null;
let pieces = [];

// Same size and quality as the app's shrink() in cut-picture.ts, written upright.
async function shrink(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

async function call(body) {
  const response = await fetch(location.pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json", "${PASSCODE_HEADER}": element("passcode").value },
    body: JSON.stringify({ photoBase64, ...body }),
  });
  const answer = await response.json();
  if (!response.ok) throw new Error(answer.error);
  return answer;
}

async function savePiece(base64, mimeType, piece, note) {
  try {
    const { saved } = await fetch(location.pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json", "${PASSCODE_HEADER}": element("passcode").value },
      body: JSON.stringify({ step: "save", base64, mimeType, piece }),
    }).then((r) => r.json());
    note.textContent = "Saved as " + saved;
  } catch (error) {
    note.textContent = "Save failed: " + error.message;
  }
}

const tagLine = (p) => [p.type, p.colors.join("/"), p.pattern, p.material, p.season, p.formality, p.style].join(" · ");

function setStatus(text, isError = false) {
  element("status").textContent = text;
  element("status").className = isError ? "error" : "";
}

element("photo").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  element("found").replaceChildren();
  element("draw").hidden = true;
  try {
    const dataUrl = await shrink(file);
    photoBase64 = dataUrl.split(",")[1];
    element("original").src = dataUrl;
    element("original").hidden = false;
    element("list").hidden = false;
    setStatus("");
  } catch (error) {
    setStatus("Could not read this photo: " + error.message, true);
  }
});

element("list").addEventListener("click", async () => {
  element("list").disabled = true;
  element("found").replaceChildren();
  element("draw").hidden = true;
  setStatus("Looking at the outfit…");
  try {
    pieces = (await call({ step: "list" })).pieces;
    setStatus(pieces.length === 0 ? "No pieces found." : "Found " + pieces.length + ". Untick the ones not to draw:");
    for (const [i, piece] of pieces.entries()) {
      const label = document.createElement("label");
      label.innerHTML = '<input type="checkbox" checked data-i="' + i + '"> <b></b> <small></small>';
      label.querySelector("b").textContent = piece.label + (piece.confidence === "low" ? " (unsure)" : "");
      label.querySelector("small").textContent = tagLine(piece);
      element("found").append(label);
    }
    updateDraw();
  } catch (error) {
    setStatus(error.message, true);
  }
  element("list").disabled = false;
});

const chosen = () => [...element("found").querySelectorAll("input:checked")].map((box) => pieces[Number(box.dataset.i)]);
function updateDraw() {
  const count = chosen().length;
  element("draw").hidden = count === 0;
  element("draw").textContent = "Draw " + count + (count === 1 ? " piece" : " pieces");
}
element("found").addEventListener("change", updateDraw);

function card(piece) {
  const box = document.createElement("div");
  box.className = "card";
  box.innerHTML = '<div class="picture">Waiting</div><div class="text"><b></b><br><small class="tags"></small><br><button class="again">Draw again</button> <button class="cut">Cut out</button><br><small class="note" style="color:#666"></small></div>';
  box.querySelector("b").textContent = piece.label;
  box.querySelector(".tags").textContent = tagLine(piece);
  const picture = box.querySelector(".picture");
  const again = box.querySelector(".again");
  const cut = box.querySelector(".cut");
  const note = box.querySelector(".note");
  again.hidden = true;
  cut.hidden = true;
  const draw = async () => {
    again.hidden = true;
    cut.hidden = true;
    note.textContent = "";
    picture.className = "picture";
    picture.textContent = "Drawing…";
    try {
      const { mimeType, base64 } = await call({ step: "render", piece });
      const image = document.createElement("img");
      image.src = "data:" + mimeType + ";base64," + base64;
      image.alt = piece.label;
      picture.replaceChildren(image);
      savePiece(base64, mimeType, piece, note);
    } catch (error) {
      picture.textContent = error.message;
      picture.className = "picture error";
    }
    again.hidden = false;
    cut.hidden = false;
  };
  again.addEventListener("click", draw);
  cut.addEventListener("click", () => {
    openCropModal((base64, mimeType) => {
      const img = document.createElement("img");
      img.src = "data:" + mimeType + ";base64," + base64;
      img.alt = piece.label;
      picture.replaceChildren(img);
      picture.className = "picture";
      note.textContent = "";
      savePiece(base64, mimeType, piece, note);
    });
  });
  element("cards").append(box);
  return draw;
}

// One at a time: the cards fill in order, and Gemini's rate limit stays happy.
element("draw").addEventListener("click", async () => {
  element("draw").disabled = true;
  element("cards").replaceChildren();
  const draws = chosen().map(card);
  for (const draw of draws) await draw();
  element("draw").disabled = false;
});

// Crop modal — drag a bounding box over the original photo to cut out one piece.
let cropCallback = null;
let cropStart = null;
let cropEnd = null;
let cropBitmap = null;

function drawCropCanvas() {
  const canvas = element("crop-canvas");
  const ctx = canvas.getContext("2d");
  ctx.drawImage(cropBitmap, 0, 0, canvas.width, canvas.height);
  if (cropStart && cropEnd) {
    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const w = Math.abs(cropEnd.x - cropStart.x);
    const h = Math.abs(cropEnd.y - cropStart.y);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(x, y, w, h);
  }
}

async function openCropModal(onConfirm) {
  cropCallback = onConfirm;
  cropStart = null;
  cropEnd = null;
  const response = await fetch("data:image/jpeg;base64," + photoBase64);
  const blob = await response.blob();
  cropBitmap = await createImageBitmap(blob);
  const canvas = element("crop-canvas");
  const maxW = window.innerWidth * 0.9;
  const maxH = window.innerHeight * 0.8;
  const scale = Math.min(1, maxW / cropBitmap.width, maxH / cropBitmap.height);
  canvas.width = Math.round(cropBitmap.width * scale);
  canvas.height = Math.round(cropBitmap.height * scale);
  drawCropCanvas();
  element("crop-modal").classList.add("open");
}

element("crop-canvas").addEventListener("mousedown", (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  cropStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  cropEnd = { ...cropStart };
});
element("crop-canvas").addEventListener("mousemove", (e) => {
  if (!cropStart) return;
  const rect = e.currentTarget.getBoundingClientRect();
  cropEnd = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  drawCropCanvas();
});
element("crop-canvas").addEventListener("mouseup", () => { /* selection stays */ });

element("crop-confirm").addEventListener("click", () => {
  if (!cropStart || !cropEnd || !cropBitmap) return;
  const canvas = element("crop-canvas");
  const w = Math.abs(cropEnd.x - cropStart.x);
  const h = Math.abs(cropEnd.y - cropStart.y);
  if (w < 10 || h < 10) return;
  const scaleX = cropBitmap.width / canvas.width;
  const scaleY = cropBitmap.height / canvas.height;
  const sx = Math.round(Math.min(cropStart.x, cropEnd.x) * scaleX);
  const sy = Math.round(Math.min(cropStart.y, cropEnd.y) * scaleY);
  const sw = Math.round(w * scaleX);
  const sh = Math.round(h * scaleY);
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  out.getContext("2d").drawImage(cropBitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const dataUrl = out.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = dataUrl.split(",")[1];
  element("crop-modal").classList.remove("open");
  if (cropCallback) cropCallback(base64, "image/jpeg");
});

element("crop-cancel").addEventListener("click", () => {
  element("crop-modal").classList.remove("open");
});
</script>
</body>
</html>
`;
