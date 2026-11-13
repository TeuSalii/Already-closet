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
  #crop-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.82); z-index: 100; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
  #crop-modal.open { display: flex; }
  #crop-canvas { cursor: crosshair; display: block; max-width: 90vw; max-height: 75vh; }
  #crop-toolbar { display: flex; align-items: center; gap: 8px; }
  .crop-tool { width: 40px; height: 40px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.4); background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; color: white; padding: 0; margin: 0; font: inherit; }
  .crop-tool:hover { border-color: rgba(255,255,255,0.7); }
  .crop-tool-chosen { background: white; color: #26221E; border-color: white; }
  #crop-confirm { font: inherit; padding: 10px 24px; border-radius: 999px; background: white; border: none; cursor: pointer; font-weight: 600; color: #26221E; margin: 0; }
  #crop-confirm:disabled { opacity: 0.35; cursor: default; }
  #crop-cancel { font: inherit; padding: 10px 16px; border-radius: 999px; background: transparent; border: 1.5px solid rgba(255,255,255,0.4); color: white; cursor: pointer; margin: 0; }
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
  <div id="crop-toolbar">
    <button id="crop-draw" class="crop-tool crop-tool-chosen" title="Draw around it" aria-label="Draw around it">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5.42 9.42 8 12"/><circle cx="4" cy="8" r="2"/><path d="m14 6-8.58 8.58"/>
        <circle cx="4" cy="16" r="2"/><path d="M10.8 14.8 14 18"/><path d="M16 12h-2"/><path d="M22 12h-2"/>
      </svg>
    </button>
    <button id="crop-frame" class="crop-tool" title="Frame" aria-label="Frame">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" x2="2" y1="6" y2="6"/><line x1="22" x2="2" y1="18" y2="18"/>
        <line x1="6" x2="6" y1="2" y2="22"/><line x1="18" x2="18" y1="2" y2="22"/>
      </svg>
    </button>
    <button id="crop-restart" class="crop-tool" title="Start over" aria-label="Start over">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6.586 16.061a7 7 0 1 0 0-8.122L3.75 10.75"/><path d="M3.75 4.75v6h6"/>
      </svg>
    </button>
    <div style="flex:1"></div>
    <button id="crop-confirm" disabled>Cut out</button>
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

// Crop modal — draw around or frame a piece to cut it from the original photo.
// Two modes, matching the mobile cut screen: freehand lasso (scissors icon)
// and rectangle frame. Outside the selection is dimmed once the shape is valid.
let cropCallback = null;
let cropBitmap = null;
let cropMode = "draw"; // "draw" | "frame"
let cropPoints = []; // display-coord {x,y} points of the current shape
let cropDrawing = false; // true while mouse is held in draw mode
let cropFrameStart = null; // anchor point for frame mode

const MIN_CROP_PX = 10;

function framePoints(a, b) {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
}

function getShapePoints() {
  if (cropMode === "frame" && cropPoints.length >= 2) return framePoints(cropPoints[0], cropPoints[1]);
  return cropPoints;
}

function cropIsValid() {
  if (cropDrawing) return false;
  const pts = getShapePoints();
  if (pts.length < 3) return false;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return (Math.max(...xs) - Math.min(...xs)) >= MIN_CROP_PX &&
         (Math.max(...ys) - Math.min(...ys)) >= MIN_CROP_PX;
}

function drawCropCanvas() {
  const canvas = element("crop-canvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(cropBitmap, 0, 0, canvas.width, canvas.height);

  const pts = getShapePoints();
  if (pts.length < 2) { element("crop-confirm").disabled = true; return; }

  // Dim outside the selection once the shape is closed and valid
  if (cropIsValid()) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill("evenodd");
    ctx.restore();
  }

  // Outline: thick dark stroke + thin white stroke, like the mobile screen
  const closed = !cropDrawing || cropMode === "frame";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed) ctx.closePath();
  ctx.setLineDash([]);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#26221E";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.stroke();

  element("crop-confirm").disabled = !cropIsValid();
}

function setCropMode(mode) {
  cropMode = mode;
  cropPoints = [];
  cropFrameStart = null;
  cropDrawing = false;
  element("crop-draw").className = "crop-tool" + (mode === "draw" ? " crop-tool-chosen" : "");
  element("crop-frame").className = "crop-tool" + (mode === "frame" ? " crop-tool-chosen" : "");
}

async function openCropModal(onConfirm) {
  cropCallback = onConfirm;
  setCropMode("draw");
  const response = await fetch("data:image/jpeg;base64," + photoBase64);
  const blob = await response.blob();
  cropBitmap = await createImageBitmap(blob);
  const canvas = element("crop-canvas");
  const maxW = window.innerWidth * 0.9;
  const maxH = window.innerHeight * 0.75;
  const scale = Math.min(1, maxW / cropBitmap.width, maxH / cropBitmap.height);
  canvas.width = Math.round(cropBitmap.width * scale);
  canvas.height = Math.round(cropBitmap.height * scale);
  element("crop-toolbar").style.width = canvas.width + "px";
  ctx_drawInitial(canvas);
  element("crop-confirm").disabled = true;
  element("crop-modal").classList.add("open");
}

function ctx_drawInitial(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(cropBitmap, 0, 0, canvas.width, canvas.height);
}

element("crop-draw").addEventListener("click", () => { setCropMode("draw"); ctx_drawInitial(element("crop-canvas")); element("crop-confirm").disabled = true; });
element("crop-frame").addEventListener("click", () => { setCropMode("frame"); ctx_drawInitial(element("crop-canvas")); element("crop-confirm").disabled = true; });
element("crop-restart").addEventListener("click", () => { cropPoints = []; cropFrameStart = null; cropDrawing = false; ctx_drawInitial(element("crop-canvas")); element("crop-confirm").disabled = true; });

element("crop-canvas").addEventListener("mousedown", (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  if (cropMode === "draw") {
    cropDrawing = true;
    cropPoints = [pt];
  } else {
    cropFrameStart = pt;
    cropPoints = [pt, pt];
  }
  drawCropCanvas();
});

element("crop-canvas").addEventListener("mousemove", (e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  if (cropMode === "draw" && cropDrawing) {
    const last = cropPoints[cropPoints.length - 1];
    if ((pt.x - last.x) ** 2 + (pt.y - last.y) ** 2 >= 9) {
      cropPoints = [...cropPoints, pt];
      drawCropCanvas();
    }
  } else if (cropMode === "frame" && cropFrameStart) {
    cropPoints = [cropFrameStart, pt];
    drawCropCanvas();
  }
});

element("crop-canvas").addEventListener("mouseup", (e) => {
  if (cropMode === "draw" && cropDrawing) {
    cropDrawing = false;
    drawCropCanvas();
  } else if (cropMode === "frame" && cropFrameStart) {
    const rect = e.currentTarget.getBoundingClientRect();
    cropPoints = [cropFrameStart, { x: e.clientX - rect.left, y: e.clientY - rect.top }];
    cropFrameStart = null;
    drawCropCanvas();
  }
});

element("crop-canvas").addEventListener("mouseleave", () => {
  if (cropMode === "draw" && cropDrawing) { cropDrawing = false; drawCropCanvas(); }
});

element("crop-confirm").addEventListener("click", () => {
  if (!cropIsValid() || !cropBitmap) return;
  const canvas = element("crop-canvas");
  const pts = getShapePoints();
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scaleX = cropBitmap.width / canvas.width;
  const scaleY = cropBitmap.height / canvas.height;
  const sx = Math.round(minX * scaleX), sy = Math.round(minY * scaleY);
  const sw = Math.round((maxX - minX) * scaleX), sh = Math.round((maxY - minY) * scaleY);
  const out = document.createElement("canvas");
  out.width = sw; out.height = sh;
  out.getContext("2d").drawImage(cropBitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const base64 = out.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1];
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
