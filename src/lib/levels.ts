export const MAX_LEVEL = 10;
export const WINS_PER_LEVEL = 100;

export function levelFromWins(wins: number): number {
  return Math.min(MAX_LEVEL, Math.floor(Math.max(0, wins) / WINS_PER_LEVEL) + 1);
}

export function winsToNextLevel(wins: number): number | null {
  const level = levelFromWins(wins);
  return level >= MAX_LEVEL ? null : level * WINS_PER_LEVEL - Math.max(0, wins);
}

/* ── Ligler (MOBA sıralama sistemi) ─────────────────────────────────
 * Seviye, zafer sayısından türetilir; lig ise seviyeye bakar. Böylece
 * tek bir sayı (battleWins) hem seviyeyi hem ligi besler.
 */
export interface Rank {
  id: string;
  name: string;
  /** Seviye aralığı (dahil). */
  minLevel: number;
  maxLevel: number;
  /** Rozet rengi (hex) + arka plan gradyanı. */
  color: string;
  gradient: string;
  icon: string;
}

export const RANKS: Rank[] = [
  {
    id: "bronze",
    name: "Bronz",
    minLevel: 1,
    maxLevel: 2,
    color: "#c07a45",
    gradient: "linear-gradient(135deg,#7a4a24,#c07a45)",
    icon: "🥉",
  },
  {
    id: "silver",
    name: "Gümüş",
    minLevel: 3,
    maxLevel: 4,
    color: "#cbd5e1",
    gradient: "linear-gradient(135deg,#64748b,#cbd5e1)",
    icon: "🥈",
  },
  {
    id: "gold",
    name: "Altın",
    minLevel: 5,
    maxLevel: 6,
    color: "#e0b25c",
    gradient: "linear-gradient(135deg,#8a6520,#e0b25c)",
    icon: "🥇",
  },
  {
    id: "platinum",
    name: "Platin",
    minLevel: 7,
    maxLevel: 8,
    color: "#7dd3fc",
    gradient: "linear-gradient(135deg,#0e7490,#7dd3fc)",
    icon: "💠",
  },
  {
    id: "diamond",
    name: "Elmas",
    minLevel: 9,
    maxLevel: 9,
    color: "#a5b4fc",
    gradient: "linear-gradient(135deg,#4338ca,#a5b4fc)",
    icon: "💎",
  },
  {
    id: "legend",
    name: "Efsane",
    minLevel: 10,
    maxLevel: MAX_LEVEL,
    color: "#f0abfc",
    gradient: "linear-gradient(135deg,#a21caf,#f0abfc)",
    icon: "👑",
  },
];

export function rankFromLevel(level: number): Rank {
  const safe = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level) || 1));
  return (
    RANKS.find((r) => safe >= r.minLevel && safe <= r.maxLevel) ??
    RANKS[0]
  );
}

/** Üyelik etiketi: aktif VIP ise kalan gün sayısı da döner. */
export function membershipInfo(
  vip: boolean,
  vipUntil?: number,
): { label: string; detail: string; daysLeft: number | null } {
  if (vip && vipUntil) {
    const daysLeft = Math.max(
      0,
      Math.ceil((vipUntil - Date.now()) / 86_400_000),
    );
    return {
      label: "VIP Üye",
      detail: `${daysLeft} gün kaldı`,
      daysLeft,
    };
  }
  return { label: "Standart Üye", detail: "VIP'ye yükselt", daysLeft: null };
}
