import { type GarmentTags, TAG_SCHEMA } from "@/shared/garment";

// Gemma 4 12B looks at the photo, on this Mac, through Ollama. The photo
// never leaves the machine. Needs the Ollama app running and
// `ollama pull gemma4:12b` done once (the same model Happy Habits Buddy uses).
const OLLAMA_URL = "http://localhost:11434/api/chat";
// Each pipeline step names its own model, so one step can be switched
// without touching the others. Outfit matching will get its own setting.
const RECOGNITION_MODEL = "gemma4:12b";

// Adapted from wardrowbe's clothing_analysis prompt. The word lists are not
// repeated here: the schema already limits every answer to them.
const INSTRUCTIONS = `You tag clothing for a personal wardrobe app.
Look at the MAIN piece of clothing in the photo and describe only that piece.
- label: what a person would call it, 2 to 4 words, e.g. "navy wool crewneck".
- colors: the main colour first, then up to two more that are clearly visible.
- material: "unknown" if you cannot tell from the photo. Do not guess.
- season: the season the piece is made for. "transitional" for spring and fall.
  "all-year" only if it is equally right in summer and winter.
- formality: how dressed up the piece is, from its fabric, cut and finish.
- style: the single style the piece reads as most.
- confidence: "high" only if the piece is clearly visible and you are sure of
  its type, colour and formality. Otherwise "low".
Reply with JSON only, matching this schema:
${JSON.stringify(TAG_SCHEMA)}`;

type OllamaResponse = {
  message: { content: string };
  done_reason: string;
};

export async function readGarment(photoBase64: string): Promise<GarmentTags> {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: RECOGNITION_MODEL,
      stream: false,
      think: false, // same reason as in Happy Habits Buddy: thinking runs past Expo's 30 s timeout
      format: TAG_SCHEMA,
      options: { temperature: 0 }, // the same photo should get the same tags
      messages: [
        { role: "system", content: INSTRUCTIONS },
        { role: "user", content: "Tag this piece.", images: [photoBase64] },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama failed (${response.status}): ${await response.text()}`);
  }
  const data = (await response.json()) as OllamaResponse;
  if (data.done_reason !== "stop") {
    throw new Error(`Gemma stopped early: ${data.done_reason}`);
  }
  return JSON.parse(data.message.content) as GarmentTags;
}
