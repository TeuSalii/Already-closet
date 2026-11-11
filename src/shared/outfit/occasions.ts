import { FORMALITIES } from "@/shared/garment";

// What the person asks for, and what each occasion means for the clothes
// (Mens Fashioner, "Dress Codes"). Occasion is asked, not read from photos:
// a photo shows how dressed up a piece is, not where it will be worn.

export type Formality = (typeof FORMALITIES)[number];

export const OCCASIONS = [
  "sport", "casual", "smart-casual", "business-casual", "cocktail", "formal", "beach",
] as const;
export type Occasion = (typeof OCCASIONS)[number];

// Clothes are tagged with one of these three; "all-year" fits each of them.
export const REQUEST_SEASONS = ["summer", "transitional", "winter"] as const;
export type RequestSeason = (typeof REQUEST_SEASONS)[number];

export const TIMES = ["day", "evening"] as const;
export type Time = (typeof TIMES)[number];

export type OutfitRequest = { occasion: Occasion; season: RequestSeason; time: Time };

// "by-time": lighter by day, darker in the evening.
export type ColorMood = "lighter" | "darker" | "by-time";

export const OCCASION_RULES: Record<Occasion, { label: string; formality: Formality; colors: ColorMood | null }> = {
  sport: { label: "Sport", formality: "sport", colors: null },
  // Also: coffee, lunch, a daytime date.
  casual: { label: "Casual", formality: "casual", colors: "by-time" },
  // Elevated or smart casual. Also: dinner, a bar, a club, an evening date.
  "smart-casual": { label: "Smart casual", formality: "smart-casual", colors: "by-time" },
  "business-casual": { label: "Business casual", formality: "smart-casual", colors: null },
  // Cocktail is an evening code; semi-formal by day takes tan or light gray.
  cocktail: { label: "Cocktail or semi-formal", formality: "formal", colors: "by-time" },
  // Business formal and formal: navy or charcoal suit.
  formal: { label: "Formal", formality: "formal", colors: "darker" },
  beach: { label: "Beach or summer chic", formality: "casual", colors: "lighter" },
};

// Whether this request wants lighter or darker colours, or doesn't mind.
export function colorMood(request: OutfitRequest): "lighter" | "darker" | null {
  const mood = OCCASION_RULES[request.occasion].colors;
  if (mood === "by-time") return request.time === "day" ? "lighter" : "darker";
  return mood;
}

// Steps between two formalities: "casual" to "formal" is 2.
export const formalityGap = (a: Formality, b: Formality) =>
  Math.abs(FORMALITIES.indexOf(a) - FORMALITIES.indexOf(b));
