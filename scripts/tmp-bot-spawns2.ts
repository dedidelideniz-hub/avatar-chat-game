import { circleHitsObstacles, inWalkable, PLAYER_RADIUS } from "../src/lib/shop";
const cands: [string, number, number][] = [
  ["zeynep", 900, 380], ["zeynep2", 780, 420], ["tolga", 340, 300], ["tolga2", 400, 340],
  ["naz", 1750, 620], ["naz2", 1650, 660], ["ipek", 1100, 660], ["ipek2", 1250, 620],
  ["baris", 700, 620], ["baris2", 760, 560], ["umut", 1500, 620], ["umut2", 1400, 700],
  ["ceren", 500, 300], ["ceren2", 560, 240], ["kerem", 2150, 620], ["kerem2", 2200, 380],
  ["ada2", 620, 520], ["mert2", 1600, 500],
];
for (const [id, x, y] of cands) {
  const ok = inWalkable(x, y) && !circleHitsObstacles(x, y, PLAYER_RADIUS);
  console.log(`${id.padEnd(8)} (${x},${y}) ${ok ? "✔ UYGUN" : "✘"}`);
}
