/**
 * YÜRÜNEBİLİRLİK SINIRI DOĞRULAMASI (kalıcı betik).
 *
 * Şikâyet: "Karakter görseldeki yere geldiğinde takılıp kalıyor — çitin
 * ilerisini hiçbir şekilde geçemesin."
 *
 * Sebep: konumu değiştiren tek şey oyuncunun girdisi değil. Karakter
 * AYRIŞTIRMA itmesi (botlar, satıcılar, diğer oyuncular) konumu
 * `PLAYER_RADIUS * 2.2` kadar yana taşır ve bu itme eskiden YALNIZCA
 * `WORLD_BOUNDS`e kırpılıyordu — yürünebilirlik kontrolü yoktu. Bir bot
 * oyuncuyu çitin ötesine (çime) itebiliyordu; orada geçerli komşu olmadığı
 * için de karakter kilitleniyordu.
 *
 * Bu betik üç şeyi ölçer:
 *   1. Çitin ÇİM tarafındaki hiçbir nokta yürünebilir değil.
 *   2. Sokak/kaldırım/ara sokak ağızları hâlâ yürünebilir (kısıtlama
 *      oyunu kilitlemiyor).
 *   3. `nearestWalkable` her durumda GEÇERLİ bir cadde noktası döndürür:
 *      8 yönden büyük itmeler + haritanın dışına atılmış noktalar dâhil.
 *
 * Çalıştırma: bun scripts/check-walkable-clamp.ts
 */
import {
  S,
  SIDE_STREETS,
  SIDE_STREET_SOUTH,
  SIDE_STREET_W,
  WORLD_CENTER_Z,
  WORLD_WIDTH,
  WORLD_Z_MAX,
  WORLD_Z_MIN,
  ZONE,
} from "../src/engine/constants";
import {
  inWalkable,
  nearestWalkable,
  PLAYER_RADIUS,
  svgX,
  svgY,
} from "../src/lib/shop";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const px = (x: number, z: number) => ({ x: svgX(x), y: svgY(z) });

console.log("\n=== YÜRÜNEBİLİRLİK SINIRI ===\n");

/* ── 1. Çitin ötesi (çim) yürünemez ────────────────────────────────── */
console.log("1) Çitin ilerisi (çim) YÜRÜNEMEZ olmalı");

/** Çim şeritleri (3D Z bantları) — çitlerin çim tarafında kalan bölgeler. */
const GRASS_BANDS: { name: string; zSouth: number; zNorth: number }[] = [
  {
    name: "güney çim şeridi",
    zSouth: ZONE.southGrassBot,
    zNorth: ZONE.southGrassTop,
  },
  {
    name: "kuzey çim şeridi",
    zSouth: ZONE.northGrassBot,
    zNorth: ZONE.northGrassTop,
  },
  {
    name: "arka çim şeridi",
    zSouth: ZONE.backGrassTop,
    zNorth: ZONE.backGrassBot,
  },
];

for (const band of GRASS_BANDS) {
  let leaked = 0;
  let scanned = 0;
  for (let x = -WORLD_WIDTH / 2 + 0.5; x <= WORLD_WIDTH / 2 - 0.5; x += 0.5) {
    for (
      let z = band.zSouth - 0.25;
      z >= band.zNorth + 0.25;
      z -= 0.25
    ) {
      // Ara sokak ağızları bilinçli olarak yürünebilir (asfalt, çitli ve
      // kapakla kapalı) — onları hariç tut.
      const inAlleyMouth = SIDE_STREETS.some(
        (sx) => Math.abs(x - sx) <= SIDE_STREET_W / 2,
      );
      if (inAlleyMouth) continue;
      scanned++;
      const p = px(x, z);
      if (inWalkable(p.x, p.y)) leaked++;
    }
  }
  check(
    `${band.name} çime çıkış yok`,
    leaked === 0,
    `${scanned} nokta tarandı · sızan ${leaked}`,
  );
}

/*
 * GENEL TARAMA: yürünebilir HER nokta ya döşeli bir yol bandında ya da ara
 * sokak kolonunda olmalı. Bu, tek tek bant taramalarından daha güçlüdür:
 * `WALKABLE_ZONES`e yanlışlıkla eklenen herhangi bir bölge (örn. çim şeridi)
 * doğrudan yakalanır.
 */
{
  const paved = (z: number) =>
    (z >= ZONE.southSidewalkTop && z <= ZONE.southSidewalkBot) ||
    (z >= ZONE.roadTop && z <= ZONE.roadBot) ||
    (z >= ZONE.northSidewalkTop && z <= ZONE.northSidewalkBot) ||
    (z >= ZONE.backNorthWalkBot && z <= ZONE.backWalkTop);
  let scanned = 0;
  let leaked = 0;
  const samples: string[] = [];
  for (let x = -WORLD_WIDTH / 2; x <= WORLD_WIDTH / 2; x += 0.4) {
    for (let z = WORLD_Z_MIN; z <= WORLD_Z_MAX; z += 0.4) {
      const p = px(x, z);
      if (!inWalkable(p.x, p.y)) continue;
      scanned++;
      const inAlley = SIDE_STREETS.some(
        (sx) =>
          Math.abs(x - sx) <= SIDE_STREET_W / 2 &&
          z <= SIDE_STREET_SOUTH &&
          z >= ZONE.backNorthWalkBot,
      );
      if (!paved(z) && !inAlley) {
        leaked++;
        if (samples.length < 4) {
          samples.push(`(${x.toFixed(1)}, ${z.toFixed(1)})`);
        }
      }
    }
  }
  check(
    "yürünebilir her nokta yol bandında ya da ara sokakta",
    leaked === 0,
    `${scanned} yürünebilir nokta · döşeme dışı ${leaked}` +
      (samples.length ? ` → ${samples.join(", ")}` : ""),
  );
}

/* Harita dışı (çitin çok ötesi) */
{
  const probes: { x: number; z: number }[] = [];
  for (let x = -60; x <= 60; x += 5) {
    probes.push({ x, z: WORLD_Z_MAX + 3 }); // en güneyin ötesi
    probes.push({ x, z: WORLD_Z_MIN - 3 }); // en kuzeyin ötesi
  }
  for (let z = WORLD_Z_MIN - 10; z <= WORLD_Z_MAX + 10; z += 3) {
    probes.push({ x: -WORLD_WIDTH / 2 - 5, z });
    probes.push({ x: WORLD_WIDTH / 2 + 5, z });
  }
  const leaked = probes.filter((p) => {
    const q = px(p.x, p.z);
    return inWalkable(q.x, q.y);
  }).length;
  check(
    "haritanın tamamen dışı yürünemez",
    leaked === 0,
    `${probes.length} nokta tarandı · sızan ${leaked}`,
  );
}

/* ── 2. Cadde ve ara sokaklar hâlâ yürünebilir ──────────────────────── */
console.log("\n2) Cadde ve sokaklar hâlâ yürünebilir olmalı");

const MUST_WALK: { name: string; x: number; z: number }[] = [
  { name: "güney kaldırım", x: 0, z: (ZONE.southSidewalkBot + ZONE.southSidewalkTop) / 2 },
  { name: "ana cadde", x: -8, z: (ZONE.roadBot + ZONE.roadTop) / 2 },
  { name: "kuzey kaldırım", x: 8, z: (ZONE.northSidewalkBot + ZONE.northSidewalkTop) / 2 },
  { name: "arka cadde", x: 5, z: (ZONE.backRoadBot + ZONE.backRoadTop) / 2 },
  {
    name: "arka sokak kaldırımı",
    x: -5,
    z: (ZONE.backWalkTop + ZONE.backNorthWalkBot) / 2,
  },
];
for (const sx of SIDE_STREETS) {
  MUST_WALK.push({
    name: `ara sokak ${sx} (orta)`,
    x: sx,
    z: (ZONE.roadBot + ZONE.northSidewalkTop) / 2,
  });
  MUST_WALK.push({
    name: `ara sokak ${sx} (güney ağzı)`,
    x: sx,
    z: (SIDE_STREET_SOUTH + ZONE.southGrassTop) / 2,
  });
}
for (const spot of MUST_WALK) {
  const p = px(spot.x, spot.z);
  check(spot.name, inWalkable(p.x, p.y));
}

/* ── 3. İtme sonrası her zaman geçerli konuma dönülüyor ─────────────── */
console.log("\n3) Ayrıştırma itmesi sonrası konum caddeye geri çekilmeli");

/** Oyun içindeki `CHAR_MIN_DIST` ile aynı: PLAYER_RADIUS * 2.2. */
const CHAR_MIN_DIST = PLAYER_RADIUS * 2.2;
/** İtmenin tek karede yapabileceği en büyük kayma. */
const MAX_PUSH = CHAR_MIN_DIST;

/** Verilen Z'de, istenen X'e en yakın yürünebilir noktayı bulur. */
function findWalkableNear(
  x0: number,
  z: number,
  maxOffset = 12,
): { name: string; x: number; z: number } | null {
  for (let d = 0; d <= maxOffset; d += 0.25) {
    for (const s of d === 0 ? [1] : [-1, 1]) {
      const x = x0 + s * d;
      const p = px(x, z);
      if (inWalkable(p.x, p.y)) return { name: `x=${x.toFixed(2)}`, x, z };
    }
  }
  return null;
}

/**
 * Ölçüm noktaları: ara sokak ağzının hemen yanı, çit hattı, sokak ortası…
 * Tezgâhların (engellerin) üstüne denk gelmemesi için nokta yürünebilir
 * olana kadar kaydırılır.
 */
const anchorSpots: { name: string; x: number; z: number }[] = [
  { name: "güney kaldırım (ara sokak yanı)", x: 2.4, z: -0.6 },
  { name: "güney kaldırım (çit hattı)", x: 10, z: -0.25 },
  { name: "ara sokak güney ağzı", x: SIDE_STREETS[1], z: 3.4 },
  { name: "kuzey kaldırım (çit hattı)", x: -6, z: -7.1 },
  { name: "arka cadde", x: 0, z: -15 },
];

let escapes = 0;
let maxDrift = 0;
let anchorsUsed = 0;
const anchorLines: string[] = [];
for (const raw of anchorSpots) {
  const found = findWalkableNear(raw.x, raw.z);
  const start = found ? px(found.x, found.z) : px(raw.x, raw.z);
  if (!found || !inWalkable(start.x, start.y)) {
    check(`${raw.name} başlangıcı geçerli`, false, "yürünebilir nokta yok");
    continue;
  }
  anchorsUsed++;
  anchorLines.push(`${raw.name} → x=${found.x.toFixed(2)}`);
  for (let deg = 0; deg < 360; deg += 15) {
    const rad = (deg * Math.PI) / 180;
    const pushed = {
      x: start.x + Math.cos(rad) * MAX_PUSH,
      y: start.y + Math.sin(rad) * MAX_PUSH,
    };
    const settled = nearestWalkable(pushed.x, pushed.y, start);
    // 1) Sonuç mutlaka yürünebilir olmalı.
    if (!inWalkable(settled.x, settled.y)) escapes++;
    // 2) Çim şeridine ışınlanmamalı: kayma makul olmalı.
    const drift = Math.hypot(settled.x - start.x, settled.y - start.y);
    maxDrift = Math.max(maxDrift, drift);
    // 3) Kare başına adım (~PLAYER_SPEED * dt) çok küçük; iki karede
    //    geri dönebilmek için kayma `MAX_PUSH`i aşmasın.
    if (drift > MAX_PUSH + 1) escapes++;
  }
}
console.log(anchorLines.map((l) => `    ${l}`).join("\n"));
check(
  "8 yönden itme sonrası konum her zaman geçerli",
  escapes === 0,
  `${anchorsUsed} nokta × 24 yön · hatalı ${escapes}`,
);
check(
  "geri çekilme mesafesi makul (ı ışınlanma yok)",
  maxDrift <= MAX_PUSH + 1,
  `en büyük kayma ${maxDrift.toFixed(2)} px ≤ ${MAX_PUSH.toFixed(2)} px`,
);

/* ── 4. Çok dışarı atılmış konum bile caddeye döner ────────────────── */
console.log("\n4) Haritanın dışına atılsa bile konum caddeye döner");
{
  const far: { name: string; x: number; z: number }[] = [
    { name: "çimin dibine (güney)", x: 2, z: WORLD_Z_MAX },
    { name: "arka çimin dibine (kuzey)", x: 2, z: WORLD_Z_MIN },
    { name: "doğu uçurumu", x: WORLD_WIDTH, z: WORLD_CENTER_Z },
    { name: "batı uçurumu", x: -WORLD_WIDTH, z: WORLD_CENTER_Z },
    { name: "köşe", x: WORLD_WIDTH, z: WORLD_Z_MIN },
  ];
  let bad = 0;
  const rows: string[] = [];
  for (const f of far) {
    const p = px(f.x, f.z);
    const settled = nearestWalkable(p.x, p.y);
    const ok = inWalkable(settled.x, settled.y);
    if (!ok) bad++;
    rows.push(
      `    ${f.name}: (${f.x.toFixed(1)}, ${f.z.toFixed(1)}) → ` +
        `(${(settled.x / S - WORLD_WIDTH / 2).toFixed(2)}, ` +
        `${(WORLD_Z_MAX - settled.y / S).toFixed(2)}) ${ok ? "✔" : "✘"}`,
    );
  }
  console.log(rows.join("\n"));
  check("dışarıdaki noktalar caddeye çekiliyor", bad === 0, `hatalı ${bad}`);
}

console.log(
  `\n${failures === 0 ? "TÜM KONTROLLER GEÇTİ ✔" : `${failures} KONTROL BAŞARISIZ ✘`}\n`,
);
if (failures > 0) process.exit(1);
