export const MAX_LEVEL = 10;
export const WINS_PER_LEVEL = 100;

export function levelFromWins(wins: number): number {
  return Math.min(MAX_LEVEL, Math.floor(Math.max(0, wins) / WINS_PER_LEVEL) + 1);
}

export function winsToNextLevel(wins: number): number | null {
  const level = levelFromWins(wins);
  return level >= MAX_LEVEL ? null : level * WINS_PER_LEVEL - Math.max(0, wins);
}
