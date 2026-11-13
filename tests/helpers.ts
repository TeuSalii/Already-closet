import type { GarmentTags } from "@/shared/garment";

export function tags(overrides: Partial<GarmentTags> = {}): GarmentTags {
  return {
    label: "black cotton hoodie",
    type: "hoodie",
    colors: ["black"],
    pattern: "solid",
    material: "cotton",
    season: "all-year",
    formality: "casual",
    style: "streetwear",
    confidence: "high",
    ...overrides,
  };
}
