import { type GarmentTags, TAG_SCHEMA } from "@/shared/garment";

// An OpenAI vision model looks at the photo. The photo is sent to OpenAI.
// Needs LLM_API_KEY in .env (read only here on the server, never
// shipped to the phone because the name has no EXPO_PUBLIC_ prefix).
const OPENAI_URL = "https://api.llmhub.infs.ai/v1/chat/completions";
// Each pipeline step names its own model, so one step can be switched
// without touching the others. Outfit matching will get its own setting.
const RECOGNITION_MODEL = "best-chat";

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

type OpenAIResponse = {
  choices: { finish_reason: string; message: { content: string | null; refusal: string | null } }[];
};

export async function readGarment(photoBase64: string): Promise<GarmentTags> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY is missing. Put it in .env and restart the dev server.");

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: RECOGNITION_MODEL,
      temperature: 0, // the same photo should get the same tags
      response_format: {
        type: "json_schema",
        json_schema: { name: "garment_tags", strict: true, schema: TAG_SCHEMA },
      },
      messages: [
        { role: "system", content: INSTRUCTIONS },
        {
          role: "user",
          content: [
            { type: "text", text: "Tag this piece." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${photoBase64}` } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI failed (${response.status}): ${await response.text()}`);
  }
  const { choices } = (await response.json()) as OpenAIResponse;
  const { finish_reason, message } = choices[0];
  if (message.refusal) throw new Error(`OpenAI refused: ${message.refusal}`);
  if (finish_reason !== "stop" || message.content === null) {
    throw new Error(`OpenAI stopped early: ${finish_reason}`);
  }
  return JSON.parse(message.content) as GarmentTags;
}
