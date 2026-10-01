/**
 * Harita ölçeği doğrulaması (kalıcı betik).
 *
 * Harita kuzeye doğru büyütüldü: dükkanların ARKASINA arka cadde + ikinci bina
 * sırası ve ana caddeyi oraya bağlayan DİKEY ara sokaklar eklendi. Bu ölçek iki
 * koordinat sistemini birden besliyor:
 *
 *   1. 3D dünya   : X -24..+24 · Z -22..+6 (birim)
 *   2. SVG px katmanı: 1 birim = S px → MAP_W × MAP_H (2400 × 1400)
 *
 * Dönüşüm `GameEngine3D.svgToWorld` ile birebir aynı olmalı; px katmanının
 * y = 0 kenarı artık haritanın en GÜNEY kenarıdır (`WORLD_Z_MAX`). Betik
 * dönüşümü gidiş-dönüş test eder, bant/kaldırım/sokak hizalarını, prop
 * ayak izlerini, çit ve bitki örtüsünün sokak ağızlarını boş bırakmasını ve yol
 * bulmanın arka sokağa kadar çalıştığını ölçer.
 *
 * Çalıştırma: bun scripts/check-map-scale.ts
 */
import {
  BENCHES,
  BENCH_WIDTH,
  BUILDINGS,
  BUS_STOPS,
  DIRECTION_SIGNS,
  FENCE_CAPS,
  FENCE_EDGES,
  FENCE_LINES,
  LAMPS,
  S,
  SIDE_STREETS,
  SIDE_STREET_SOUTH,
  SIDE_STREET_W,
  SPAWN_SVG,
  STALLS,
  TRASH_CANS,
  TREE_ROWS,
  WITCH_SHOP_DEF,
  WORLD_DEPTH,
  WORLD_WIDTH,
  WORLD_Z_MAX,
  WORLD_Z_MIN,
  ZONE,
} from "../src/engine/constants";
import {
  GIFT_BOX,
  MAP_H,
  MAP_W,
  OBSTACLES,
  SIDE_STREET_ZONES,
  VENDORS,
  WALKABLE_ZONES,
  WITCH_SHOP_WALK_ZONES,
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
console.log("HARİTA BOYUTU");
console.log(
  `  3D dünya: X ${-WORLD_WIDTH / 2}..${WORLD_WIDTH / 2} · Z ${WORLD_Z_MIN}..${WORLD_Z_MAX}` +
    `  (önceki: 48 × 26 → alan ${f(48 * 26)} → ${f(WORLD_WIDTH * WORLD_DEPTH)} birim², ` +
    `+%${f(((WORLD_WIDTH * WORLD_DEPTH) / (48 * 26) - 1) * 100, 0)})`,
);
console.log(`  px katmanı: ${MAP_W} × ${MAP_H} (S = ${S} px/birim)`);
check(MAP_W === WORLD_WIDTH * S && MAP_H === WORLD_DEPTH * S, "px katmanı S ile tutarlı");

// Yürünebilir (sokak) alan: harita büyüklüğünden çok daha anlamlı ölçü.
const walkableArea = WALKABLE_ZONES.reduce((sum, z) => sum + (z.w / S) * (z.h / S), 0);
const OLD_WALKABLE = 48 * 7.2; // önceki koridor: X 48 × Z -7.2..0
console.log(`  yürünebilir alan: ${f(walkableArea)} birim² (önceki ${f(OLD_WALKABLE)}, +%${f((walkableArea / OLD_WALKABLE - 1) * 100, 0)})`);
check(walkableArea > OLD_WALKABLE * 1.5, "yürünebilir sokak alanı belirgin şekilde büyüdü", `${f(walkableArea)} birim²`);

// GameEngine3D.svgToWorld ile aynı dönüşümün tersi (px y=0 → Z = WORLD_Z_MAX):
const toSvgX = (x: number) => (x + WORLD_WIDTH / 2) * S;
const toSvgY = (z: number) => (WORLD_Z_MAX - z) * S;
const toWorldX = (px: number) => px / S - WORLD_WIDTH / 2;
const toWorldZ = (py: number) => WORLD_Z_MAX - py / S;

const samples: [number, number][] = [
  [0, 0],
  [-24, WORLD_Z_MIN],
  [24, WORLD_Z_MAX],
  [-7.7, 0.85],
  [12.5, -3.2],
  [0, -15.2],
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
check(svgY(WORLD_Z_MAX) === 0 && svgY(WORLD_Z_MIN) === MAP_H, "px katmanının iki ucu dünya Z uçlarına oturuyor");

/* ── 2) Bantlar (ZONE ↔ WALKABLE_ZONES) ────────────────────── */
console.log("\nBANTLAR (ZONE → px)");
type Band = { name: string; south: number; north: number };
const BANDS: Band[] = [
  { name: "güney kaldırım", south: ZONE.southSidewalkBot, north: ZONE.southSidewalkTop },
  { name: "cadde", south: ZONE.roadBot, north: ZONE.roadTop },
  { name: "kuzey kaldırım", south: ZONE.northSidewalkBot, north: ZONE.northSidewalkTop },
  { name: "kuzey çim", south: ZONE.northGrassBot, north: ZONE.northGrassTop },
  { name: "güney çim", south: ZONE.southGrassBot, north: ZONE.southGrassTop },
  { name: "arka kaldırım", south: ZONE.backWalkTop, north: ZONE.backWalkBot },
  { name: "arka cadde", south: ZONE.backRoadTop, north: ZONE.backRoadBot },
  { name: "arka kuzey kaldırım", south: ZONE.backNorthWalkTop, north: ZONE.backNorthWalkBot },
  { name: "arka çim", south: ZONE.backGrassTop, north: ZONE.backGrassBot },
];
for (const b of BANDS) {
  check(b.south > b.north, `${b.name}: Z ${b.south}..${b.north}`, `${f(b.south - b.north)} birim`);
}
// Birbirine değen kenarlar: kaldırım/cadde/çim hattı boşluksuz olmalı.
const seams: [string, number][] = [
  ["güney kaldırım ↔ cadde", ZONE.southSidewalkTop - ZONE.roadBot],
  ["cadde ↔ kuzey kaldırım", ZONE.roadTop - ZONE.northSidewalkBot],
  ["kuzey kaldırım ↔ kuzey çim", ZONE.northGrassBot - ZONE.northSidewalkTop],
  ["arka kaldırım ↔ arka cadde", ZONE.backWalkBot - ZONE.backRoadTop],
  ["arka cadde ↔ arka kuzey kaldırım", ZONE.backRoadBot - ZONE.backNorthWalkTop],
  ["arka kuzey kaldırım ↔ arka çim", ZONE.backNorthWalkBot - ZONE.backGrassTop],
];
check(
  seams.every(([, d]) => Math.abs(d) < 1e-9),
  "şerit kenarları boşluksuz birleşiyor",
  seams.map(([n, d]) => `${n}=${d}`).join(" · "),
);

// Yürünebilir bantlar: ilk üçü ana cadde, dördüncüsü arka sokak.
const walkBands: [string, number, number][] = [
  ["güney kaldırım", ZONE.southSidewalkBot, ZONE.southSidewalkTop],
  ["cadde", ZONE.roadBot, ZONE.roadTop],
  ["kuzey kaldırım", ZONE.northSidewalkBot, ZONE.northSidewalkTop],
  ["arka sokak", ZONE.backWalkTop, ZONE.backNorthWalkBot],
];
walkBands.forEach(([name, south, north], i) => {
  const zone = WALKABLE_ZONES[i];
  const ok =
    Math.abs(zone.y - svgY(south)) < 1e-9 &&
    Math.abs(zone.h - (south - north) * S) < 1e-9 &&
    zone.x === 0 &&
    zone.w === MAP_W;
  check(ok, `yürünebilir ${name}: Z ${south}..${north}`, `y ${zone.y}..${zone.y + zone.h} (${f(south - north)} birim)`);
});

/* ── 3) Dikey ara sokaklar ─────────────────────────────────── */
console.log("\nDİKEY ARA SOKAKLAR");
check(SIDE_STREET_ZONES.length === SIDE_STREETS.length, "her sokak için bir yürünebilir kolon", `${SIDE_STREET_ZONES.length} sokak`);
check(
  WALKABLE_ZONES.length ===
    walkBands.length + SIDE_STREET_ZONES.length + WITCH_SHOP_WALK_ZONES.length,
  "yürünebilir alan = bantlar + sokak kolonları + cadı dükkânı kapı yolu",
  `${WALKABLE_ZONES.length} bölge`,
);
SIDE_STREET_ZONES.forEach((zone, i) => {
  const x = SIDE_STREETS[i];
  const ok =
    Math.abs(zone.x - svgX(x - SIDE_STREET_W / 2)) < 1e-9 &&
    zone.w === SIDE_STREET_W * S &&
    Math.abs(zone.y - svgY(SIDE_STREET_SOUTH)) < 1e-9 &&
    Math.abs(zone.h - (SIDE_STREET_SOUTH - ZONE.backNorthWalkBot) * S) < 1e-9;
  check(ok, `sokak X ${x}: px ${zone.x}..${zone.x + zone.w}`, `y ${zone.y}..${zone.y + zone.h}`);
});
// Kolonlar birbirine/kenara taşmamalı.
const columns = [...SIDE_STREET_ZONES].sort((a, b) => a.x - b.x);
let columnGap = Infinity;
for (let i = 1; i < columns.length; i++) columnGap = Math.min(columnGap, columns[i].x - (columns[i - 1].x + columns[i - 1].w));
check(columnGap > 0, "sokaklar birbirine girmiyor", `en dar boşluk ${f(columnGap / S)} birim`);
check(
  columns[0].x >= WORLD_BOUNDS.minX && columns[columns.length - 1].x + columns[columns.length - 1].w <= WORLD_BOUNDS.maxX,
  "sokaklar WORLD_BOUNDS içinde",
);

/* ── 4) Sınırlar ──────────────────────────────────────────── */
console.log("\nSINIRLAR");
check(
  WORLD_BOUNDS.minY === svgY(SIDE_STREET_SOUTH) && WORLD_BOUNDS.maxY === svgY(ZONE.backNorthWalkBot),
  "WORLD_BOUNDS yürünebilir alanın tam sınırı",
  `y ${WORLD_BOUNDS.minY}..${WORLD_BOUNDS.maxY}`,
);
// Bantlar tam genişlikte (x 0..MAP_W), WORLD_BOUNDS ise oyuncunun x sınırı;
// bu yüzden ölçü: her bölge haritanın içinde + sınırlarla KESİŞİYOR + y
// aralığı sınırların içinde olmalı (kuzey/güney uçları aşmamalı).
const outsideBounds = WALKABLE_ZONES.filter((z) => {
  const overlapsX = z.x + z.w > WORLD_BOUNDS.minX && z.x < WORLD_BOUNDS.maxX;
  return (
    z.x < 0 ||
    z.x + z.w > MAP_W ||
    z.y < WORLD_BOUNDS.minY - 1e-9 ||
    z.y + z.h > WORLD_BOUNDS.maxY + 1e-9 ||
    !overlapsX
  );
});
check(outsideBounds.length === 0, "her yürünebilir bölge haritanın + sınırların içinde", outsideBounds.length ? `${outsideBounds.length} taşan` : "hepsi ✔");

/* ── 5) Tezgâhlar: 3D ↔ px ↔ çarpışma kutusu ───────────────── */
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
    `    ${vendor.short.padEnd(10)} X ${String(stall.x).padStart(5)} → px x ${String(vendor.x).padStart(4)} · ` +
      `çarpışma kutusu ${obstacle.x}..${obstacle.x + obstacle.w} × ${obstacle.y}..${obstacle.y + obstacle.h}`,
  );
});
check(stallOk, "her tezgâhın px konumu + çarpışma kutusu 3D verisinden türetiliyor");

/* ── 6) Prop ayak izleri ──────────────────────────────────── */
console.log("\nPROP YERLEŞİMİ");
type Prop = { name: string; x: number; z: number; hx: number; hz: number; band: Band };
const props: Prop[] = [];
const add = (name: string, x: number, z: number, hx: number, hz: number) => {
  const band = BANDS.find((b) => z <= b.south + 1e-9 && z >= b.north - 1e-9);
  if (!band) {
    failures++;
    console.log(`  ✘ ${name}: Z ${z} hiçbir şeritte değil`);
    return;
  }
  props.push({ name, x, z, hx, hz, band });
};

STALLS.forEach((s, i) => add(`tezgâh ${VENDORS[i].short}`, s.x, s.z, 0.8, 0.3));
LAMPS.forEach((l, i) => add(`lamba ${i + 1}`, l.x, l.z, 0.3, 0.15));
// Bank ayak izi gerçek genişliğidir (BENCH_WIDTH) — dar sanılırsa banklar
// lambaya/durağa yapışsa bile kontrol kaçırır.
BENCHES.forEach((b, i) => add(`bank ${i + 1}`, b.x, b.z, BENCH_WIDTH / 2, 0.12));
TRASH_CANS.forEach((t, i) => add(`çöp ${i + 1}`, t.x, t.z, 0.2, 0.2));
BUS_STOPS.forEach((b) => add(`durak ${b.route}`, b.x, b.z, 0.9, 0.36));
DIRECTION_SIGNS.forEach((d, i) => add(`tabela ${i + 1}`, d.x, d.z, 0.31, 0.1));
TREE_ROWS.forEach((row, i) => {
  const avoidRadius = row.avoidRadius ?? 0;
  for (let x = row.startX; x <= row.endX + 1e-6; x += row.spacing) {
    if (row.avoidX?.some((ax) => Math.abs(x - ax) < avoidRadius)) continue;
    add(`ağaç sıra${i + 1}`, x, row.z, 0.4, 0.4);
  }
});

const outOfBand = props.filter((p) => p.z - p.hz < p.band.north - 1e-9 || p.z + p.hz > p.band.south + 1e-9);
check(outOfBand.length === 0, "her prop kendi şeridinin içinde", outOfBand.map((p) => `${p.name}→${p.band.name}`).join(", ") || "hepsi ✔");
const outOfWorld = props.filter((p) => Math.abs(p.x) + p.hx > WORLD_WIDTH / 2);
check(outOfWorld.length === 0, "hiçbir prop dünya sınırını taşmıyor", outOfWorld.map((p) => p.name).join(", ") || "hepsi ✔");

/** Z, cadde bandının içinde mi? (kuzey sınırı negatif tarafta) */
const onRoadBand = (z: number) => z <= ZONE.roadBot && z >= ZONE.roadTop;
const onBackRoad = (z: number) => z <= ZONE.backRoadTop && z >= ZONE.backRoadBot;

// Yol şeritleri boş kalmalı (yürünebilir orta hat).
const onRoad = props.filter((p) => onRoadBand(p.z) || onBackRoad(p.z));
check(onRoad.length === 0, "cadde + arka cadde şeritleri proplardan temiz", onRoad.map((p) => p.name).join(", ") || "temiz");

// Sokak ağızları: prop ayak izi dikey sokak kolonuna girmemeli.
const inColumn = (x: number, hx: number, z: number, hz: number) =>
  SIDE_STREET_ZONES.some(
    (zone) =>
      x + hx > zone.x &&
      x - hx < zone.x + zone.w &&
      svgY(z - hz) < zone.y + zone.h &&
      svgY(z + hz) > zone.y,
  );
const columnClash = props.filter((p) => inColumn(p.x, p.hx, p.z, p.hz));
check(columnClash.length === 0, "sokak ağızlarına prop girmiyor", columnClash.map((p) => p.name).join(", ") || "temiz");

// Çakışma: ayak izleri kesişen prop var mı?
const clashes: string[] = [];
for (let i = 0; i < props.length; i++) {
  for (let j = i + 1; j < props.length; j++) {
    const a = props[i];
    const b = props[j];
    if (Math.abs(a.x - b.x) < a.hx + b.hx && Math.abs(a.z - b.z) < a.hz + b.hz)
      clashes.push(`${a.name} ↔ ${b.name} (Δx ${f(Math.abs(a.x - b.x))}, Δz ${f(Math.abs(a.z - b.z))})`);
  }
}
check(clashes.length === 0, `prop ayak izleri çakışmıyor (${props.length} prop tarandı)`, clashes.slice(0, 5).join(" · ") || "çakışma yok");

// Çit hatları proplardan ve sokak ağızlarından uzak olmalı.
// Dikey sokak asfaltı YALNIZCA Z `SIDE_STREET_SOUTH` … `backNorthWalkTop`
// arasında uzanır; yalnızca bu aralıktaki hatlar bir sokak ağzından geçer.
// Arka çim hattı (-17.4) bu aralığın dışındadır → ağız yok, bölünmemeli.
const crossedByAlley = (z: number) =>
  z <= SIDE_STREET_SOUTH + 1e-9 && z >= ZONE.backNorthWalkTop - 1e-9;
const fenceHits: string[] = [];
const fenceInStreet: string[] = [];
const splitLines = FENCE_LINES.filter((l) => crossedByAlley(l.z));
const solidLines = FENCE_LINES.filter((l) => !crossedByAlley(l.z));
for (const line of FENCE_LINES.filter((l) => l.enabled)) {
  for (const p of props) {
    if (p.x >= line.startX - p.hx && p.x <= line.endX + p.hx && Math.abs(p.z - line.z) < p.hz)
      fenceHits.push(`${p.name} ↔ çit z=${line.z}`);
  }
  if (
    crossedByAlley(line.z) &&
    SIDE_STREETS.some((sx) => sx + SIDE_STREET_W / 2 > line.startX && sx - SIDE_STREET_W / 2 < line.endX)
  )
    fenceInStreet.push(`çit z=${line.z} x ${f(line.startX)}..${f(line.endX)}`);
}
check(fenceHits.length === 0, "sınır çitleri proplara girmiyor", fenceHits.slice(0, 4).join(" · ") || "temiz");
check(
  fenceInStreet.length === 0,
  "sokak ağzından geçen çitler ağzı kapatmıyor",
  fenceInStreet.join(" · ") || `${splitLines.length} parça bölündü`,
);
check(
  splitLines.length === 4 * 2 && solidLines.length === 1,
  "yalnızca sokağın kestiği hatlar ağızlarda bölünüyor",
  `${splitLines.length} parça (2 hat × 4) + arka hat ${solidLines.length} parça`,
);
check(
  solidLines.length === 1 &&
    Math.abs(solidLines[0].startX + WORLD_WIDTH / 2) < 1e-9 &&
    Math.abs(solidLines[0].endX - WORLD_WIDTH / 2) < 1e-9 &&
    Math.abs(solidLines[0].z - ZONE.backGrassTop) < 1e-9,
  "arka yol çiti kesintisiz (ağız yok, duvar gibi kesilmiyor)",
  solidLines.length === 1
    ? `Z ${solidLines[0].z} · X ${solidLines[0].startX}..${solidLines[0].endX}`
    : "tek parça değil",
);

/* ── 7) Binalar ───────────────────────────────────────────── */
console.log("\nBİNALAR");
const rows = new Map<number, typeof BUILDINGS>();
for (const b of BUILDINGS) {
  const key = Math.round(b.frontZ * 100) / 100;
  rows.set(key, [...(rows.get(key) ?? []), b]);
}
check(rows.size === 2, "binalar iki cephe hattında (cadde + arka cadde)", `${rows.size} sıra · ${BUILDINGS.length} bina`);
for (const [frontZ, row] of rows) {
  const spans = row.map((b) => [b.x - b.w / 2, b.x + b.w / 2] as const).sort((a, b) => a[0] - b[0]);
  let gap = Infinity;
  for (let i = 1; i < spans.length; i++) gap = Math.min(gap, spans[i][0] - spans[i - 1][1]);
  const span = spans[spans.length - 1][1] - spans[0][0];
  check(gap > 0, `cephe z=${frontZ}: binalar üst üste binmiyor`, `en dar boşluk ${f(gap)} birim`);
  check(
    spans[0][0] >= -WORLD_WIDTH / 2 && spans[spans.length - 1][1] <= WORLD_WIDTH / 2,
    `cephe z=${frontZ}: sıra haritaya sığıyor`,
    `${f(span)} ≤ ${WORLD_WIDTH} birim`,
  );
}
const deep = BUILDINGS.filter((b) => b.frontZ - b.d < WORLD_Z_MIN);
check(deep.length === 0, "hiçbir bina haritanın kuzey kenarını aşmıyor", deep.map((b) => b.signText).join(", ") || "hepsi ✔");
const shopBacks = BUILDINGS.filter((b) => b.frontZ > ZONE.backWalkTop).map((b) => b.frontZ - b.d);
const minShopBack = Math.min(...shopBacks);
check(minShopBack >= ZONE.backWalkTop, "dükkan arkaları arka kaldırıma girmiyor", `en güney arka duvar Z ${f(minShopBack)} ≥ ${ZONE.backWalkTop}`);
// Bina ayak izleri hiçbir yürünebilir bölgeye / sokak kolonuna girmemeli.
const buildingInWalkable: string[] = [];
const buildingInStreet: string[] = [];
for (const b of BUILDINGS) {
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const z0 = b.frontZ - b.d; // kuzey (arka) yüz
  const z1 = b.frontZ; // güney (cephe) yüz
  // Cadı dükkânının KENDİ ayak izi, kapı yolu + iç koridoru barındırır —
  // yürünebilir alanın binaya girmesi bu bina için İSTENEN davranıştır
  // (bkz. `constants.WITCH_SHOP_WALKWAY`). Diğer binalarda kural aynen geçerli.
  if (b === WITCH_SHOP_DEF) continue;
  for (const zone of WALKABLE_ZONES) {
    const zx0 = zone.x / S - WORLD_WIDTH / 2;
    const zx1 = (zone.x + zone.w) / S - WORLD_WIDTH / 2;
    const zz1 = toWorldZ(zone.y);
    const zz0 = toWorldZ(zone.y + zone.h);
    if (x0 < zx1 && x1 > zx0 && z0 < zz1 && z1 > zz0) buildingInWalkable.push(`${b.signText} ↔ yürünebilir alan`);
  }
  for (const sx of SIDE_STREETS) {
    if (x0 < sx + SIDE_STREET_W / 2 && x1 > sx - SIDE_STREET_W / 2) buildingInStreet.push(`${b.signText} ↔ sokak X ${sx}`);
  }
}
check(buildingInWalkable.length === 0, "bina ayak izleri yürünebilir alana taşmıyor", buildingInWalkable.slice(0, 4).join(" · ") || "hepsi ✔");
check(buildingInStreet.length === 0, "binalar dikey sokak ağızlarını kapatmıyor", buildingInStreet.slice(0, 4).join(" · ") || "hepsi ✔");
// Kuzey çim şeridindeki ağaç sırasının tacı dükkan cephesine girmemeli
// (tacın yarıçapı ≈ 1.2 birim, cephe hattı `frontZ`).
const shopFrontZ = Math.max(...BUILDINGS.map((b) => b.frontZ));
const frontTreeRow = TREE_ROWS.find((r) => r.z < ZONE.northGrassBot && r.z > ZONE.northGrassTop);
check(
  frontTreeRow !== undefined && frontTreeRow.z - 1.2 > shopFrontZ,
  "kuzey ağaç sırasının tacı dükkan cephesine girmiyor",
  `ağaç Z ${frontTreeRow?.z} - 1.2 = ${f((frontTreeRow?.z ?? 0) - 1.2)} > cephe ${f(shopFrontZ)}`,
);
const backTrees = TREE_ROWS.filter((r) => r.z < ZONE.backGrassTop);
check(backTrees.length > 0, "arka çim şeridinde ağaç sırası var", `Z ${backTrees[0]?.z}`);

/* ── 8) Doğuş / hediye / botlar ───────────────────────────── */
console.log("\nDOĞUŞ · HEDİYE · BOTLAR");
const spawnWorld = { x: toWorldX(SPAWN_SVG.x), z: toWorldZ(SPAWN_SVG.y) };
check(
  SPAWN_SVG.x === svgX(spawnWorld.x) && SPAWN_SVG.y === svgY(spawnWorld.z),
  "SPAWN_SVG ↔ dünya koordinatı tutarlı",
  `X ${f(spawnWorld.x)} · Z ${f(spawnWorld.z)}`,
);
check(onRoadBand(spawnWorld.z), "doğuş noktası cadde üzerinde", `Z ${f(spawnWorld.z)} (cadde ${ZONE.roadTop}..${ZONE.roadBot})`);
const giftWorld = { x: toWorldX(GIFT_BOX.x), z: toWorldZ(GIFT_BOX.y) };
check(onRoadBand(giftWorld.z), "hediye kutusu cadde üzerinde", `X ${f(giftWorld.x)} · Z ${f(giftWorld.z)}`);

/** World.tsx `inWalkable` ile aynı kural: yürünebilir bölgede + engelde değil. */
const inWalkable = (x: number, y: number) =>
  WALKABLE_ZONES.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) &&
  !OBSTACLES.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
check(inWalkable(SPAWN_SVG.x, SPAWN_SVG.y), "doğuş noktası yürünebilir + engelsiz");

/** World.tsx BOT_DEFS ile aynı px değerleri. */
const BOTS: [string, number, number][] = [
  ["Ada", 520, 470],
  ["Mert", 1680, 420],
  ["Elif", 300, 520],
  ["Kaan", 2080, 450],
];
const badBots = BOTS.filter(([, x, y]) => !inWalkable(x, y));
check(badBots.length === 0, "4 bot doğuş noktası yürünebilir cadde üzerinde", badBots.map(([n]) => n).join(", ") || "hepsi ✔");
VENDORS.forEach((v) => {
  const ok = inWalkable(v.x, v.y + 40);
  if (!ok) console.log(`    ✘ ${v.short} önü yürünebilir değil (px ${v.x}, ${v.y + 40})`);
});
check(VENDORS.every((v) => inWalkable(v.x, v.y + 40)), "her tezgâhın önü yürünebilir");

/* ── 9) Yol bulma ─────────────────────────────────────────── */
console.log("\nYOL BULMA");
const spawnPx = { x: SPAWN_SVG.x, y: SPAWN_SVG.y };
let reachable = 0;
for (const v of VENDORS) {
  const path = findPath(spawnPx.x, spawnPx.y, v.x, v.y + 40);
  if (path.length > 0) reachable++;
  else console.log(`    ✘ ${v.short} erişilemedi`);
}
check(reachable === VENDORS.length, `doğuştan ${VENDORS.length} tezgâhın önüne yol bulunuyor`, `${reachable}/${VENDORS.length}`);
const giftPath = findPath(spawnPx.x, spawnPx.y, GIFT_BOX.x, GIFT_BOX.y);
check(giftPath.length > 0, "hediye kutusuna yol bulunuyor", `${giftPath.length} düğüm`);

// Arka sokak: her dikey sokaktan ulaşılabilmeli + arka caddenin uçlarına kadar.
const backRoadY = svgY((ZONE.backRoadTop + ZONE.backRoadBot) / 2);
SIDE_STREETS.forEach((x) => {
  const path = findPath(spawnPx.x, spawnPx.y, svgX(x), backRoadY);
  check(path.length > 0, `sokak X ${x} üzerinden arka caddeye yol var`, `${path.length} düğüm`);
});
const backEnds: [string, number][] = [
  ["batı ucu", svgX(-22)],
  ["doğu ucu", svgX(22)],
];
for (const [name, px] of backEnds) {
  const path = findPath(spawnPx.x, spawnPx.y, px, backRoadY);
  check(path.length > 0, `arka caddenin ${name} erişilebilir`, `${path.length} düğüm`);
}
// Arka sıra binaların önündeki çim yürünebilir OLMAMALI (çit hattı).
check(!inWalkable(svgX(-4.4), svgY(-19.0)), "arka çim şeridi yürünebilir değil (çit korunuyor)");
check(!inWalkable(svgX(-4.4), svgY(-9.0)), "kuzey çim şeridi yürünebilir değil (çit korunuyor)");

/* ── 10) Dikey sokak kenarı çitleri (çime geçişi kesen hatlar) ── */
// Sınır çitleri yalnızca YATAYDI; dikey sokak ağızlarında çit kalmıyordu.
// Bu bölüm oyuncunun asfalt şeritten çime geçemediği çit hattını ölçer.
console.log("\nDİKEY SOKAK ÇİTLERİ (sokak asfaltı ↔ çim)");
const streetEdges = FENCE_EDGES.filter((e) => e.enabled);
// Cadı dükkânının kapı yolu ara sokağın doğu çitini kestiği için o kenar
// İKİYE bölünür → beklenen kenar sayısı bir fazladır (bkz. `FENCE_EDGES`).
check(
  streetEdges.length === SIDE_STREETS.length * 4 + 1,
  "her sokakta iki kenar × iki çim bandı (+ cadı yolu için bölünmüş kenar)",
  `${streetEdges.length} kenar (${SIDE_STREETS.length} sokak × 2 yan × 2 bant + 1 bölünme)`,
);

// Kenarlar TAM sokak asfaltının kenarında mı? (X = sokak ± SIDE_STREET_W/2)
const badEdgeX = streetEdges.filter(
  (e) =>
    !SIDE_STREETS.some(
      (sx) => Math.abs(Math.abs(e.x - sx) - SIDE_STREET_W / 2) < 1e-9,
    ),
);
check(
  badEdgeX.length === 0,
  "her kenar sokak asfaltının tam kenarında",
  badEdgeX.length
    ? `${badEdgeX.length} hatalı`
    : `X = sokak ± ${f(SIDE_STREET_W / 2)}`,
);

// Kenarın Z aralığı YALNIZCA çim bandında olmalı (kaldırım/cadde boyunca çit olmaz).
const pavedBands = BANDS.filter((b) => !b.name.includes("çim"));
const edgeOnPavement = streetEdges.filter((e) => {
  const south = Math.max(e.startZ, e.endZ);
  const north = Math.min(e.startZ, e.endZ);
  return pavedBands.some((b) => south > b.north + 1e-9 && north < b.south - 1e-9);
});
check(
  edgeOnPavement.length === 0,
  "kenar çitleri yalnızca çim boyunca uzanıyor",
  edgeOnPavement.length
    ? edgeOnPavement.map((e) => `X ${f(e.x)}`).join(", ")
    : "kaldırım/cadde üstünde çit yok",
);

// Kenar çitleri proplara (ağaç/lamba/çöp…) ve BİNALARA girmemeli.
const edgeHits: string[] = [];
for (const e of streetEdges) {
  const south = Math.max(e.startZ, e.endZ);
  const north = Math.min(e.startZ, e.endZ);
  for (const p of props) {
    if (Math.abs(p.x - e.x) < p.hx && p.z + p.hz > north && p.z - p.hz < south)
      edgeHits.push(`${p.name} ↔ kenar X ${f(e.x)}`);
  }
  for (const b of BUILDINGS) {
    if (Math.abs(b.x - e.x) < b.w / 2 && b.frontZ > north && b.frontZ - b.d < south)
      edgeHits.push(`${b.signText} ↔ kenar X ${f(e.x)}`);
  }
}
check(
  edgeHits.length === 0,
  "kenar çitleri proplara girmiyor",
  edgeHits.slice(0, 4).join(" · ") || "temiz",
);

// Sokak ucunu kapatan yatay hat: tam sokak genişliğinde, tam sokak ucunda.
const capsOk = SIDE_STREETS.every((sx) =>
  FENCE_CAPS.some(
    (c) =>
      Math.abs(c.z - SIDE_STREET_SOUTH) < 1e-9 &&
      Math.abs(c.startX - (sx - SIDE_STREET_W / 2)) < 1e-9 &&
      Math.abs(c.endX - (sx + SIDE_STREET_W / 2)) < 1e-9,
  ),
);
check(
  capsOk,
  "her sokağın güney ucu kapakla kapanıyor",
  `${FENCE_CAPS.length} kapak · Z ${SIDE_STREET_SOUTH} (yürünebilir sınırın üstünde)`,
);

/* ASIL KURAL: çitin DIŞI çim kalmalı ve o çim YÜRÜNEBİLİR OLMAMALI,
   çitin İÇİ (sokak) yürünebilir kalmalı. */
let grassLeak = 0;
let alleyOpen = 0;
for (const e of streetEdges) {
  const nearest = SIDE_STREETS.reduce((best, c) =>
    Math.abs(c - e.x) < Math.abs(best - e.x) ? c : best,
  );
  const outward = Math.sign(e.x - nearest) || 1;
  const midZ = (e.startZ + e.endZ) / 2;
  if (inWalkable(svgX(e.x + outward * 0.6), svgY(midZ))) grassLeak++;
  if (inWalkable(svgX(nearest), svgY(midZ))) alleyOpen++;
}
check(
  grassLeak === 0,
  "çitlerin dışındaki çim yürünebilir değil",
  grassLeak ? `${grassLeak} nokta sızıyor` : `${streetEdges.length} nokta tarandı · hepsi çit dışı`,
);
check(
  alleyOpen === streetEdges.length,
  "sokaklar çitlerin arasında hâlâ yürünebilir",
  `${alleyOpen}/${streetEdges.length}`,
);

/* ── Sonuç ────────────────────────────────────────────────── */
console.log(failures === 0 ? "\nTÜM KONTROLLER GEÇTİ ✔" : `\n${failures} KONTROL BAŞARISIZ ✘`);
if (failures > 0) process.exit(1);
