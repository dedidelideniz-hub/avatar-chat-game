// Geçici doğrulama: aday bot doğuş noktaları yürünebilir mi ve engelsiz mi?
import {
  circleHitsObstacles,
  inWalkable,
  MAP_H,
  MAP_W,
  PLAYER_RADIUS,
} from "../src/lib/shop";

const candidates: [string, number, number][] = [
  ["bot-ada", 520, 470],
  ["bot-mert", 1680, 420],
  ["bot-elif", 300, 520],
  ["bot-kaan", 2080, 450],
  ["bot-zeynep", 820, 300],
  ["bot-emre", 1180, 560],
  ["bot-selin", 1450, 330],
  ["bot-baris", 640, 640],
  ["bot-naz", 1900, 600],
  ["bot-tolga", 260, 350],
  ["bot-deniz", 2280, 520],
  ["bot-ipek", 1000, 700],
  ["bot-yusuf", 1780, 700],
  ["bot-ceren", 420, 250],
];

console.log(`harita ${MAP_W}x${MAP_H}, yarıçap ${PLAYER_RADIUS}`);
for (const [id, x, y] of candidates) {
  const ok = inWalkable(x, y);
  const hit = circleHitsObstacles(x, y, PLAYER_RADIUS);
  console.log(
    `${id.padEnd(12)} (${String(x).padStart(4)},${String(y).padStart(4)}) ` +
      `yürünebilir=${ok ? "EVET" : "HAYIR"} engel=${hit ? "VAR" : "yok"} ` +
      `${ok && !hit ? "✔" : "✘"}`,
  );
}