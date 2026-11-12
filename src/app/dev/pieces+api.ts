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
// it spends the LLM Hub key and the Gemini key. Nothing is saved: the photo
// and the drawings live in the browser tab until it is closed.

export function GET(request: Request) {
  if (!available(request)) return notFound();
  return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// body: { step: "list", photoBase64 } → { pieces }
//       { step: "render", photoBase64, piece } → { mimeType, base64 }
export async function POST(request: Request) {
  if (!available(request)) return notFound();
  const refused = refusedPasscode(request);
  if (refused !== null) return refused;

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const { step, photoBase64, piece } = body;
  if (typeof photoBase64 !== "string" || photoBase64 === "") {
    return Response.json({ error: "Body needs photoBase64" }, { status: 400 });
  }

  try {
    if (step === "list") return Response.json({ pieces: await listPieces(photoBase64) });
    if (step === "render") {
      if (!isGarmentTags(piece)) return Response.json({ error: "piece must be a piece's tags" }, { status: 400 });
      return Response.json(await renderPiece(photoBase64, piece));
    }
    return Response.json({ error: 'step must be "list" or "render"' }, { status: 400 });
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
  box.innerHTML = '<div class="picture">Waiting</div><div class="text"><b></b><br><small></small><br><button>Draw again</button></div>';
  box.querySelector("b").textContent = piece.label;
  box.querySelector("small").textContent = tagLine(piece);
  const picture = box.querySelector(".picture");
  const again = box.querySelector("button");
  again.hidden = true;
  const draw = async () => {
    again.hidden = true;
    picture.className = "picture";
    picture.textContent = "Drawing…";
    try {
      const { mimeType, base64 } = await call({ step: "render", piece });
      const image = document.createElement("img");
      image.src = "data:" + mimeType + ";base64," + base64;
      image.alt = piece.label;
      picture.replaceChildren(image);
    } catch (error) {
      picture.textContent = error.message;
      picture.className = "picture error";
    }
    again.hidden = false;
  };
  again.addEventListener("click", draw);
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
</script>
</body>
</html>
`;
