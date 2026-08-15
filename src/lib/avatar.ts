/**
 * Avatar customization options for the 2D avatar chat game.
 * Each player picks one value from each category; the AvatarPreview component
 * renders the resulting character as SVG.
 */

export interface AvatarConfig {
  skin: string;
  hair: string; // hair style id, one of HAIR_STYLES
  hairColor: string;
  shirt: string;
  pants: string;
  shoes: string;
}

export const SKIN_TONES = [
  "#ffe0bd",
  "#ffd1a3",
  "#f5c19a",
  "#e8a87c",
  "#d49a6a",
  "#b97e4f",
  "#8d5a2b",
  "#5c3a21",
  "#3b2314",
] as const;

export const HAIR_STYLES = [
  "short",
  "spiky",
  "long",
  "curly",
  "bob",
  "none",
] as const;

export const HAIR_COLORS = [
  "#1c1917",
  "#3b2f2f",
  "#6b4423",
  "#b45309",
  "#d97706",
  "#f59e0b",
  "#eab308",
  "#facc15",
  "#7c3aed",
  "#a21caf",
  "#db2777",
  "#ef4444",
  "#0ea5e9",
  "#64748b",
  "#e5e7eb",
] as const;

export const SHIRT_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
  "#64748b",
  "#1c1917",
  "#ffffff",
] as const;

export const PANTS_COLORS = [
  "#1e293b",
  "#334155",
  "#475569",
  "#111827",
  "#7f1d1d",
  "#1e3a8a",
  "#14532d",
  "#451a03",
  "#4a044e",
  "#27272a",
] as const;

export const SHOE_COLORS = [
  "#111827",
  "#374151",
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#ffffff",
] as const;

export const HAIR_STYLE_LABELS: Record<string, string> = {
  short: "Kısa",
  spiky: "Dikenli",
  long: "Uzun",
  curly: "Kıvırcık",
  bob: "Bob",
  none: "Kel",
};

export const AVATAR_OPTIONS = {
  skin: SKIN_TONES,
  hair: HAIR_STYLES,
  hairColor: HAIR_COLORS,
  shirt: SHIRT_COLORS,
  pants: PANTS_COLORS,
  shoes: SHOE_COLORS,
} as const;

function pick<T>(options: readonly T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

/** A randomly assembled avatar — used for the "shuffle" button and defaults. */
export function randomAvatar(): AvatarConfig {
  return {
    skin: pick(SKIN_TONES),
    hair: pick(HAIR_STYLES),
    hairColor: pick(HAIR_COLORS),
    shirt: pick(SHIRT_COLORS),
    pants: pick(PANTS_COLORS),
    shoes: pick(SHOE_COLORS),
  };
}

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: "#ffd1a3",
  hair: "short",
  hairColor: "#6b4423",
  shirt: "#3b82f6",
  pants: "#1e293b",
  shoes: "#111827",
};
