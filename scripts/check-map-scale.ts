/**
 * Harita ölçeği doğrulaması (kalıcı betik).
 *
 * Harita büyütüldü (X 32→48, Z 18→26). Bu ölçek iki koordinat sistemini
 * birden besliyor:
 *
 *   1. 3D dünya   : X -24..+24 · Z -13..+13 (birim)
 *   2. SVG px katmanı: 1 birim = S px → MAP_W × MAP_H (2400 × 1300)
 *
 * Dönüşüm `GameEngine3D.svgToWorld` ile birebir aynı olmalı. Betik dönüşümü
 * gidiş-dönüş test eder, tüm yerleşimlerin doğru bantta olduğunu, prop
 * ayak izlerinin çakışmadığını ve yol bulmanın hâlâ çalıştığını ölçer.
 *
 * Çalıştırma: bun scripts/check-map-scale.ts
 */
import {
  BENCHES,
  BUILDINGS,
  BUS_STOPS,
  DIRECTION_SIGNS,
  FENCE_LINES,
  LAMPS,
  S,
  SPAWN_SVG,
  STALLS,
  TRASH_CANS,
  TREE_ROWS,
  WORLD_DEPTH,
  WORLD_WIDTH,
  ZONE,
} from "../src/engine/constants";
import {
  GIFT_BOX,
  MAP_H,
  MAP_W,
  OBSTACLES,
  VENDORS,
  WALKABLE_ZONES,
  WORLD_BOUNDS,
  svgX,
  svgY,
} from "../src/lib/shop";
import { findPath } from "../src/lib/pathfinding";

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
}
const f = (n: number, d = 2) => n.toFixed(d);

/* ── 1) Dünya boyutu ve px katmanı ─────────────────────────── */
console.log("HARİTA BOYUTU");console.log(
    `  3D dünya: X ${-WORLD_WIDTH / 2}..${WORLD_WIDTH / 2} · Z ${-WORLD_DEPTH / 2}..${WORLD_DEPTH / 2}` +
    `  (öncesi: 32 × 18 → alan ${f(32 * 18)} → ${f(WORLD_WIDTH * WORLD_DEPTH)} birim², +%${f(((WORLD_WIDTH * WORLD_DEPTH) / (32 * 18) - 1) * 100, 0)})`,
);
console.log(`  px katmanı: ${MAP_W} × ${MAP_H} (S = ${S} px/birim)`);
check(MAP_W === WORLD_WIDTH * S && MAP_H === WORLD_DEPTH * S, "px katmanı S ile tutarlı");

// GameEngine3D.svgToWorld ile aynı dönüşümün tersi:
const toSvgX = (x: number) => (x + WORLD_WIDTH / 2) * S;
const toSvgY = (z: number) => (WORLD_DEPTH / 2 - z) * S;
const toWorldX = (px: number) => px / S - WORLD_WIDTH / 2;
const toWorldZ = (py: number) => -(py / S - WORLD_DEPTH / 2);

const samples: [number, number][] = [
  [0, 0],
  [-24, -13],
  [24, 13],
  [-7.7, 0.85],
  [12.5, -3.2],
];
let roundTripMax = 0;
for (const [x, z] of samples) {
  roundTripMax = Math.max(
    roundTripMax,
    Math.abs(toWorldX(svgX(x)) - x),
    Math.abs(toWorldZ(svgY(z)) - z),
    Math.abs(toSvgX(x) - svgX(x)),
    Math.abs(toSvgY(z) - svgY(z)),
  );
}
check(roundTripMax < 1e-9, "dünya ↔ px dönüşümü gidiş-dönüş hatasız", `en büyük sapma ${roundTripMax}`);

/* ── 2) Bantlar (ZONE ↔ WALKABLE_ZONES) ────────────────────── */
console.log("\nBANTLAR (ZONE → yürünebilir px)");
// [ad, güney kenarı (büyük Z), kuzey kenarı (küçük Z)]
const bands: [string, number, number][] = [
  ["güney kaldırım", ZONE.southSidewalkBot, ZONE.southSidewalkTop],
  ["cadde", ZONE.roadBot, ZONE.roadTop],
  ["kuzey kaldırım", ZONE.northSidewalkBot, ZONE.northSidewalkTop],
];
bands.forEach(([name, south, north], i) => {
  const zone = WALKABLE_ZONES[i];
  const ok =
    Math.abs(zone.y - svgY(south)) < 1e-9 &&
    Math.abs(zone.h - (south - north) * S) < 1e-9 &&
    zone.x === 0 &&
    zone.w === MAP_W;
  check(
    ok,
    `${name}: Z ${south}..${north} → y ${zone.y}..${zone.y + zone.h}`,
    `${(south - north) * S} px (${f(south - north)} birim)`,
  );
});
let gap = 0;
for (let i = 0; i < WALKABLE_ZONES.length - 1; i++) {
  const a = WALKABLE_ZONES[i];
  const b = WALKABLE_ZONES[i + 1];
  gap = Math.max(gap, Math.abs(b.y - (a.y + a.h)));
}
check(gap < 1e-9, "bantlar boşluksuz/üst üste binmeden birleşiyor", `en büyük boşluk ${gap}`);
check(
  WORLD_BOUNDS.minY === WALKABLE_ZONES[0].y &&
    WORLD_BOUNDS.maxY === WALKABLE_ZONES[WALKABLE_ZONES.length - 1].y + WALKABLE_ZONES[WALKABLE_ZONES.length - 1].h,
  "WORLD_BOUNDS yürünebilir koridorun tam sınırı",
  `y ${WORLD_BOUNDS.minY}..${WORLD_BOUNDS.maxY} · x ${WORLD_BOUNDS.minX}..${WORLD_BOUNDS.maxX}`,
);

/* ── 3) Tehgâhlar: 3D ↔ px ↔ çarpışma kutusu ───────────────── */
console.log("\nTEZGÂHLAR (STALLS → VENDORS → OBSTACLES)");
check(VENDORS.length === STALLS.length, "satıcı sayısı tezgâh sayısına eşit", `${VENDORS.length}`);
let stallOk = true;
STALLS.forEach((stall, i) => {
  const vendor = VENDORS[i];
  const obstacle = OBSTACLES[i];
  const same = vendor.x === svgX(stall.x) && vendor.color === stall.color;
  const boxOk =
    Math.abs(obstacle.x - (svgX(stall.x) - 0.8 * S)) < 1e-9 &&
    Math.abs(obstacle.y - (svgY(stall.z) - 0.3 * S)) < 1e-9 &&
    obstacle.w === 1.6 * S &&
    obstacle.h === 0.6 * S;
  if (!same || !boxOk) stallOk = false;
  console.log(
    `    ${vendor.short.padEnd(10)} X ${String(stall.x).padStart(3)} → px x ${String(vendor.x).padStart(4)} · ` +
      `çarpışma kutusu ${obstacle.x}..${obstacle.x + obstacle.w} × ${obstacle.y}..${obstacle.y + obstacle.h}`,
  );
});
check(stallOk, "her tezgâhın px konumu + çarpışma kutusu 3D verisinden türetiliyor");

/* ── 4) Prop ayak izleri ve bant kontrolü ──────────────────── */
console.log("\nPROP YERLEŞİMİ");
type Prop = { name: string; x: number; z: number; hx: number; hz: number; band: [number, number] };
const props: Prop[] = [];
const add = (name: string, x: number, z: number, hx: number, hz: number, band: [number, number]) =>
  props.push({ name, x, z, hx, hz, band });

STALLS.forEach((s, i) => add(`tezgâh ${VENDORS[i].short}`, s.x, s.z, 0.8, 0.3, [ZONE.southSidewalkTop, ZONE.southSidewalkBot]));
LAMPS.forEach((l, i) => {
  const inNorth = l.z < ZONE.roadTop;
  add(`lamba ${i + 1}`, l.x, l.z, 0.3, 0.15, inNorth ? [ZONE.northSidewalkTop, ZONE.northSidewalkBot] : [ZONE.southSidewalkTop, ZONE.southSidewalkBot]);
});
BENCHES.forEach((b, i) => {
  const inNorth = b.z < ZONE.roadTop;
  add(`bank ${i + 1}`, b.x, b.z, 0.28, 0.12, inNorth ? [ZONE.northSidewalkTop, ZONE.northSidewalkBot] : [ZONE.southSidewalkTop, ZONE.southSidewalkBot]);
});
TRASH_CANS.forEach((t, i) => {
  const inNorth = t.z < ZONE.roadTop;
  add(`çöp ${i + 1}`, t.x, t.z, 0.2, 0.2, inNorth ? [ZONE.northSidewalkTop, ZONE.northSidewalkBot] : [ZONE.southSidewalkTop, ZONE.southSidewalkBot]);
});
BUS_STOPS.forEach((b, i) => add(`durak ${b.route}`, b.x, b.z, 0.9, 0.36, [ZONE.northSidewalkTop, ZONE.northSidewalkBot]));
DIRECTION_SIGNS.forEach((d, i) => {
  const inNorth = d.z < ZONE.roadTop;
  add(`tabela ${i + 1}`, d.x, d.z, 0.31, 0.1, inNorth ? [ZONE.northSidewalkTop, ZONE.northSidewalkBot] : [ZONE.southSidewalkTop, ZONE.southSidewalkBot]);
});
TREE_ROWS.forEach((row, i) => {
  const band: [number, number] = row.z < ZONE.roadTop ? [ZONE.northGrassTop, ZONE.northGrassBot] : [ZONE.southGrassTop, ZONE.southGrassBot];
  for (let x = row.startX; x <= row.endX + 1e-6; x += row.spacing) {
    add(`ağaç sıra${i + 1}`, x, row.z, 0.4, 0.4, band);
  }
});

const outOfBand = props.filter((p) => p.z - p.hz < Math.min(p.band[0], p.band[1]) || p.z + p.hz > Math.max(p.band[0], p.band[1]));
check(outOfBand.length === 0, "her prop kendi bandının içinde", outOfBand.map((p) => p.name).join(", ") || "hepsi ✔");
const outOfWorld = props.filter((p) => Math.abs(p.x) + p.hx > WORLD_WIDTH / 2);
check(outOfWorld.length === 0, "hiçbir prop dünya sınırını taşmıyor", outOfWorld.map((p) => p.name).join(", ") || "hepsi ✔");

/** Z, cadde bandının içinde mi? (kuzey sınırı negatif tarafta) */
const onRoadBand = (z: number) => z <= ZONE.roadBot && z >= ZONE.roadTop;

// Yol şeridi (cadde) boş kalmalı: yürünebilir koridorun ortası.
const onRoad = props.filter((p) => onRoadBand(p.z));
check(onRoad.length === 0, "cadde şeridi (yürünebilir orta hat) proplardan temiz", onRoad.map((p) => p.name).join(", ") || "temiz");

// Çakışma: ayak izleri kesişen prop var mı?
const clashes: string[] = [];
for (let i = 0; i < props.length; i++) {
  for (let j = i + 1; j < props.length; j++) {
    const a = props[i];
    const b = props[j];
    const overlapX = Math.abs(a.x - b.x) < a.hx + b.hx;
    const overlapZ = Math.abs(a.z - b.z) < a.hz + b.hz;
    if (overlapX && overlapZ) clashes.push(`${a.name} ↔ ${b.name} (Δx ${f(Math.abs(a.x - b.x))}, Δz ${f(Math.abs(a.z - b.z))})`);
  }
}
check(clashes.length === 0, `prop ayak izleri çakışmıyor (${props.length} prop tarandı)`, clashes.slice(0, 5).join(" · ") || "çakışma yok");

// Çit hatları ile prop teması (çit kaldırım kenarında, propların dışında kalmalı).
const fenceHits: string[] = [];
for (const line of FENCE_LINES.filter((l) => l.enabled)) {
  for (const p of props) {
    const inX = p.x >= line.startX - p.hx && p.x <= line.endX + p.hx;
    if (inX && Math.abs(p.z - line.z) < p.hz) fenceHits.push(`${p.name} ↔ çit z=${line.z}`);
  }
}
check(fenceHits.length === 0, "sınır çitleri proplara girmiyor", fenceHits.slice(0, 4).join(" · ") || "temiz");

/* ── 5) Dükkanlar ─────────────────────────────────────────── */
console.log("\nDÜKKANLAR");
const fronts = BUILDINGS.map((b) => b.frontZ);
const frontGap = Math.max(...fronts) - Math.min(...fronts);
check(frontGap < 1e-9, `${BUILDINGS.length} dükkan aynı cephe hattında`, `z = ${fronts[0]}`);
const spans = BUILDINGS.map((b) => [b.x - b.w / 2, b.x + b.w / 2] as const).sort((a, b) => a[0] - b[0]);
let shopGap = Infinity;
for (let i = 1; i < spans.length; i++) shopGap = Math.min(shopGap, spans[i][0] - spans[i - 1][1]);
check(shopGap > 0, "dükkanlar üst üste binmiyor", `en dar boşluk ${f(shopGap)} birim`);
const rowSpan = spans[spans.length - 1][1] - spans[0][0];
check(rowSpan <= WORLD_WIDTH, "dükkan sırası haritaya sığıyor", `${f(rowSpan)} ≤ ${WORLD_WIDTH} birim`);
// Ağaç tacı cepheye girmemeli (ağaç yarıçapı ≈ 1.2 birim).
const northTrees = TREE_ROWS.filter((r) => r.z < ZONE.roadTop);
const canopyClash = northTrees.some((r) => r.z - 1.2 < Math.max(...fronts));
check(!canopyClash, "kuzey ağaç sırasının tacı dükkan cephesine girmiyor", `ağaç z ${northTrees[0]?.z} · cephe ${fronts[0]}`);

/* ── 6) Doğuş noktası, hediye kutusu ──────────────────────── */
console.log("\nDOĞUŞ VE HEDİYE KUTUSU");
const spawnWorld = { x: toWorldX(SPAWN_SVG.x), z: toWorldZ(SPAWN_SVG.y) };
check(
  SPAWN_SVG.x === svgX(spawnWorld.x) && SPAWN_SVG.y === svgY(spawnWorld.z),
  "SPAWN_SVG ↔ dünya koordinatı tutarlı",
  `X ${f(spawnWorld.x)} · Z ${f(spawnWorld.z)}`,
);
check(
  onRoadBand(spawnWorld.z),
  "doğuş noktası cadde üzerinde",
  `Z ${f(spawnWorld.z)} (cadde ${ZONE.roadTop}..${ZONE.roadBot})`,
);
const spawnBlocked = STALLS.some(
  (s) => Math.abs(spawnWorld.x - s.x) < 0.8 + 20 / S && Math.abs(spawnWorld.z - s.z) < 0.3 + 20 / S,
);
check(!spawnBlocked, "doğuş noktası tezgâh çarpışma kutusunun dışında");
const giftWorld = { x: toWorldX(GIFT_BOX.x), z: toWorldZ(GIFT_BOX.y) };
check(
  onRoadBand(giftWorld.z),
  "hediye kutusu cadde üzerinde",
  `X ${f(giftWorld.x)} · Z ${f(giftWorld.z)}`,
);

/* ── 7) Yol bulma ─────────────────────────────────────────── */
console.log("\nYOL BULMA");
const spawnPx = { x: SPAWN_SVG.x, y: SPAWN_SVG.y };
let reachable = 0;
for (const v of VENDORS) {
  const path = findPath(spawnPx, { x: v.x, y: v.y + 40 });
  if (path.length > 0) reachable++;
  else console.log(`    ✘ ${v.short} erişilemedi`);
}
check(reachable === VENDORS.length, `doğuştan ${VENDORS.length} tezgâhın önüne yol bulunuyor`, `${reachable}/${VENDORS.length}`);
const giftPath = findPath(spawnPx, { x: GIFT_BOX.x, y: GIFT_BOX.y });
check(giftPath.length > 0, "hediye kutusuna yol bulunuyor", `${giftPath.length} düğüm`);

/* ── Sonuç ────────────────────────────────────────────────── */
console.log(failures === 0 ? "\nTÜM KONTROLLER GEÇTİ ✔" : `\n${failures} KONTROL BAŞARISIZ ✘`);
if (failures > 0) process.exit(1);
