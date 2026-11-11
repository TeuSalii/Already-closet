import { withoutSecrets } from "@/server/ai-call-log";
import { refusedPasscode } from "@/server/passcode";
import { readJsonBody } from "@/server/photo-request";
import { readGarment } from "@/server/read-garment";
import { PASSCODE_HEADER } from "@/shared/garment";
import { JPEG_QUALITY, MAX_SIDE } from "@/shared/photo-size";

// http://localhost:8081/dev/test : a page for the Mac, development only, that
// sends a folder of test photos through the same AI call as the app. It is an
// API route, not a screen, so it is never part of the app people see.
// A production build, or a browser on another device on the Wi-Fi: 404. A
// program can fake the host name, so sending photos also needs the passcode.

const ID_PATTERN = /^IT-(0[1-9]|[1-5][0-9]|60)$/;

function available(request: Request): boolean {
  return process.env.NODE_ENV === "development" && request.headers.get("host")?.split(":")[0] === "localhost";
}

const notFound = () => new Response("Not found", { status: 404 });

export function GET(request: Request) {
  if (!available(request)) return notFound();
  return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// body: { id, photoBase64 }, one photo at a time
export async function POST(request: Request) {
  if (!available(request)) return notFound();
  const refused = refusedPasscode(request);
  if (refused !== null) return refused;

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;

  const { id, photoBase64 } = body;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    return Response.json({ error: "id must be IT-01 to IT-60" }, { status: 400 });
  }
  if (typeof photoBase64 !== "string" || photoBase64 === "") {
    return Response.json({ error: "Body must be { id, photoBase64 }" }, { status: 400 });
  }

  try {
    return Response.json({ tags: await readGarment(photoBase64, { source: "dev-test", itemId: id }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: withoutSecrets(message) }, { status: 502 });
  }
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Closet AI test</title>
<style>
  body { font: 15px system-ui, sans-serif; margin: 32px auto; max-width: 860px; padding: 0 16px; color: #222; }
  table { border-collapse: collapse; width: 100%; margin-top: 16px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  button { font: inherit; padding: 8px 16px; margin-top: 12px; }
  .error { color: #b3261e; }
  #progress { font-weight: 600; margin-top: 12px; }
</style>
</head>
<body>
<h1>Closet AI test</h1>
<p>Choose the folder with the test photos. Every photo is named by its ID: <code>IT-11.jpg</code>.</p>
<p><input id="passcode" type="password" placeholder="Passcode (APP_PASSCODE in .env)" size="32"></p>
<input id="folder" type="file" webkitdirectory multiple>
<div><button id="send" hidden></button></div>
<p id="progress"></p>
<div id="refused" hidden>
  <h2>Refused</h2>
  <ul id="refused-list"></ul>
</div>
<table id="table" hidden>
  <thead><tr><th>ID</th><th>File</th><th>Status</th></tr></thead>
  <tbody id="rows"></tbody>
</table>
<script>
const ID_PATTERN = ${ID_PATTERN};
const EXTENSION = /^(jpe?g|png)$/;
const MAX_SIDE = ${MAX_SIDE};
const JPEG_QUALITY = ${JPEG_QUALITY};

const element = (id) => document.getElementById(id);
let accepted = [];

// Splits the chosen files into photos to send and refused files, by name only.
function classify(files) {
  const byId = new Map();
  const refused = [];
  for (const file of files) {
    const path = file.webkitRelativePath;
    const dot = file.name.lastIndexOf(".");
    const id = file.name.slice(0, dot);
    if (!ID_PATTERN.test(id) || !EXTENSION.test(file.name.slice(dot + 1).toLowerCase())) {
      refused.push(path + ": the name must be IT-01 to IT-60 with .jpg, .jpeg or .png");
    } else {
      byId.set(id, [...(byId.get(id) ?? []), { id, path, file }]);
    }
  }
  const photos = [];
  for (const [id, copies] of byId) {
    if (copies.length === 1) photos.push(copies[0]);
    else for (const copy of copies) refused.push(copy.path + ": " + id + " appears more than once");
  }
  photos.sort((a, b) => a.id.localeCompare(b.id));
  return { photos, refused };
}

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

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (blob === null) throw new Error("Could not make a JPEG of this photo");
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { photoBase64: dataUrl.split(",")[1], size: canvas.width + " x " + canvas.height };
}

async function sendOne(photo) {
  const { photoBase64, size } = await shrink(photo.file);
  const response = await fetch(location.pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json", "${PASSCODE_HEADER}": element("passcode").value },
    body: JSON.stringify({ id: photo.id, photoBase64 }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return size;
}

function addCell(row, text) {
  const cell = row.insertCell();
  cell.textContent = text;
  return cell;
}

function showChosen({ photos, refused }) {
  accepted = photos.map((photo) => {
    const row = element("rows").insertRow();
    addCell(row, photo.id);
    addCell(row, photo.path);
    return { ...photo, status: addCell(row, "Waiting") };
  });
  for (const line of refused) {
    const item = document.createElement("li");
    item.textContent = line;
    element("refused-list").append(item);
  }
  element("refused").hidden = refused.length === 0;
  element("table").hidden = photos.length === 0;
  element("send").hidden = photos.length === 0;
  element("send").textContent = "Send " + photos.length + " photos";
}

element("folder").addEventListener("change", (event) => {
  element("rows").replaceChildren();
  element("refused-list").replaceChildren();
  element("progress").textContent = "";
  element("send").disabled = false;
  showChosen(classify(event.target.files));
});

element("send").addEventListener("click", async () => {
  element("send").disabled = true;
  element("folder").disabled = true;
  let done = 0;
  element("progress").textContent = "0 of " + accepted.length;
  for (const photo of accepted) {
    photo.status.textContent = "Sending";
    try {
      photo.status.textContent = "Done (" + (await sendOne(photo)) + ")";
    } catch (error) {
      photo.status.textContent = error.message;
      photo.status.className = "error";
    }
    done += 1;
    element("progress").textContent = done + " of " + accepted.length;
  }
  element("folder").disabled = false;
});
</script>
</body>
</html>
`;
