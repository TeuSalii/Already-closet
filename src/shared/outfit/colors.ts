import type { COLORS } from "@/shared/garment";

// The 20 colour words as numbers, so rules can compare them: lightness for
// "darkest on the outside", distance for "close enough to match". A word
// covers many real shades; each hex below is one typical clothing shade of
// it, not a measurement. Pieces only have the word, so this is as precise as
// the rules can be until colours are read from the pixels.

export type Color = (typeof COLORS)[number];

const HEX: Record<Color, string> = {
  black: "#141414",
  white: "#f5f5f5",
  gray: "#8c8c8c",
  navy: "#1f2a44",
  blue: "#2f5fa8",
  "light-blue": "#9cc3e6",
  red: "#c0282d",
  burgundy: "#6d1a2a",
  pink: "#f2a7c0",
  green: "#2e7d4f",
  olive: "#6b6b3a",
  yellow: "#f2d03b",
  orange: "#e8772e",
  purple: "#6a3d8f",
  brown: "#6b4428",
  tan: "#c8a27a",
  beige: "#d9c7a7",
  cream: "#f2ead3",
  gold: "#c9a43a",
  silver: "#b8bcc2",
};

// Colours that go with anything and, past three colours, are not counted
// (Color rules.md, rule 2). Brown is left out on purpose: brown trousers
// read as a colour, brown shoes are judged by the shoe rules instead.
export const NEUTRALS: readonly Color[] = ["black", "white", "gray", "navy", "beige", "cream", "tan"];

// Metals are hardware, not cloth colours.
export const METALLICS: readonly Color[] = ["gold", "silver"];

// Strong enough to be "the one standout" (Layering 101, Spring & Summer).
// Muted ones like burgundy and olive are not.
export const BOLD: readonly Color[] = ["red", "yellow", "orange", "pink", "purple", "green"];

// Two colours this close or closer "harmonise" (Color rules.md: ΔE < 10).
export const MATCH_DELTA_E = 10;

export type ColorInfo = {
  hex: string;
  lab: [l: number, a: number, b: number]; // CIE LAB, D65
  hsl: [h: number, s: number, l: number]; // degrees, 0–1, 0–1
};

export const COLOR_INFO = Object.fromEntries(
  Object.entries(HEX).map(([color, hex]) => [color, { hex, lab: toLab(hex), hsl: toHsl(hex) }]),
) as Record<Color, ColorInfo>;

export const isNeutral = (color: Color) => NEUTRALS.includes(color);
export const isBold = (color: Color) => BOLD.includes(color);

// 0 is black, 100 is white, as people see it.
export const lightness = (color: Color) => COLOR_INFO[color].lab[0];

// CIE76: straight distance in LAB. Simple, and enough for 20 fixed shades.
export function deltaE(a: Color, b: Color): number {
  const [l1, a1, b1] = COLOR_INFO[a].lab;
  const [l2, a2, b2] = COLOR_INFO[b].lab;
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export const matches = (a: Color, b: Color) => deltaE(a, b) < MATCH_DELTA_E;

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => c / 255) as [number, number, number];
}

function toLab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
