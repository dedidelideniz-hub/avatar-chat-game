/**
 * 🪑 Bankta oturma doğrulaması.
 *
 *  1. Oturma noktaları yürünebilir mi? (BENCHES → WALKABLE_ZONES)
 *  2. Oturma pozu geometrisi: ayaklar zemine gömülüyor / havada kalıyor mu?
 *  3. Oturan karakterin bacakları bir binanın içine giriyor mu?
 *  4. GERÇEK GLB iskeletlerinde: kemik tespiti, kemik zinciri yapısı,
 *     pozun uygulanması ve İDEMPOTANS (kare başına titreme olmaması).
 *
 * Çalıştır: bun scripts/check-bench-sit.ts
 */
import { readFileSync } from "node:fs";
import * as THREE from "three";
import {
  BENCHES,
  BENCH_BACK_OFFSET,
  BENCH_WIDTH,
  BENCH_SEAT_DEPTH,
  BENCH_SEAT_TOP,
  BENCH_SEAT_FORWARD,
  BENCH_SEAT_HEIGHT,
  BENCH_INTERACT_RADIUS,
  BENCH_STAND_FALLBACKS,
  benchFacing,
  benchSeatSpot,
  benchSeatYaw,
  benchStandSpot,
  BUILDINGS,
  PLAYER_3D_HEIGHT,
  S,
  SIT_LEAN,
  SIDE_STREETS,
  SIDE_STREET_W,
  SIDE_STREET_SOUTH,
  WORLD_WIDTH,
  ZONE,
} from "../src/engine/constants";
import { WALKABLE_ZONES, OBSTACLES, svgX, svgY } from "../src/lib/shop";
import { applySitPose, canSit, findSitBones, tipOf } from "../src/engine/SitPose";

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✔ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(label);
    console.log(`  ✘ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// `SitPose.applySitPose` ile AYNI yönler (normal bank oturuşu).
const THIGH_DIR = new THREE.Vector3(0, -0.19, 1).normalize();
const SHIN_DIR = new THREE.Vector3(0, -1, 0.0875).normalize();

/* ── 1. Oturma noktası yürünebilir mi? ─────────────────────────────── */
console.log("── oturma noktaları yürünebilir alanda mı? ──");
const seats = BENCHES.map((def) => {
  const spot = benchSeatSpot(def);
  return {
    ...spot,
    facing: benchFacing(def),
    px: svgX(spot.x),
    py: svgY(spot.z),
  };
});

function inWalkable(x: number, y: number) {
  return (
    WALKABLE_ZONES.some(
      (z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h,
    ) &&
    !OBSTACLES.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
  );
}
let allWalkable = true;
for (let i = 0; i < seats.length; i++) {
  if (!inWalkable(seats[i].px, seats[i].py)) {
    allWalkable = false;
    console.log(`     ✘ bank ${i} (x ${seats[i].x}) yürünebilir değil`);
  }
}
check(`${seats.length} bankın oturma noktası yürünebilir`, allWalkable);

/* ── 2. Poz geometrisi (insan oranları) ────────────────────────────── */
console.log("── oturma pozu geometrisi ──");
const THIGH = PLAYER_3D_HEIGHT * 0.245;
const SHIN = PLAYER_3D_HEIGHT * 0.246;
const hipY = BENCH_SEAT_HEIGHT;
const kneeY = hipY + THIGH * THIGH_DIR.y;
const ankleY = kneeY + SHIN * SHIN_DIR.y;
const reach = THIGH * THIGH_DIR.z + SHIN * SHIN_DIR.z;

check(
  "Diz kalçanın ALTINDA ama minderin ÜSTÜNDE (bank oturuşu)",
  kneeY < hipY && kneeY > BENCH_SEAT_TOP,
  `kalça ${hipY.toFixed(2)} → diz ${kneeY.toFixed(2)} → minder ${BENCH_SEAT_TOP}`,
);
check(
  "Ayak zemine gömülmüyor",
  ankleY > -0.05,
  `ayak y ${ankleY.toFixed(3)}`,
);
// Birkaç cm hava payı bilinçli: minder dokusu çıtalara değmesin (z-fighting)
// ve tıknaz avatarların gövdesi çıtaların içine girmesin. Gerçek avatarların
// ölçümü `scripts/check-sit-model-pose.ts` içinde.
check("Ayak havada kalmıyor", ankleY < 0.1, `ayak y ${ankleY.toFixed(3)}`);
check(
  "Bacak erişi gerçekçi (0.45–0.75 birim)",
  reach > 0.45 && reach < 0.75,
  `${reach.toFixed(3)} birim`,
);
check(
  "Minder yüksekliği insan ölçeğinde (0.40–0.52 birim)",
  BENCH_SEAT_TOP > 0.4 && BENCH_SEAT_TOP < 0.52,
  `${BENCH_SEAT_TOP} birim`,
);
check(
  "Kalça eklemi minderin 10–20 cm üstünde (kalça dokusu mindere oturur)",
  BENCH_SEAT_HEIGHT - BENCH_SEAT_TOP > 0.1 &&
    BENCH_SEAT_HEIGHT - BENCH_SEAT_TOP < 0.2,
  `minder ${BENCH_SEAT_TOP} → kalça ${BENCH_SEAT_HEIGHT} (ölçüm: check-sit-model-pose.ts)`,
);
check(
  "Bank eni karakterin sırtından geniş (≥ 1.2 birim)",
  BENCH_WIDTH >= 1.2,
  `${BENCH_WIDTH} birim`,
);
// Bilinçli olarak gerçek park bankından biraz derin: oyuncu avatarları tıknaz
// (varsayılan 1.28 birim derin), sığ minderi tamamen örtüyorlardı.
check(
  "Oturma derinliği gerçekçi (0.35–0.62 birim, tıknaz avatarlar için derin)",
  BENCH_SEAT_DEPTH > 0.35 && BENCH_SEAT_DEPTH < 0.62,
  `${BENCH_SEAT_DEPTH} birim`,
);
check(
  "Arkalık minderin ARKASINDA (yaslanan sırt çıtaların içine girmesin)",
  BENCH_BACK_OFFSET > BENCH_SEAT_DEPTH / 2,
  `arkalık ${BENCH_BACK_OFFSET} > minder arka kenarı ${BENCH_SEAT_DEPTH / 2}`,
);
check(
  "Kalça minderin arka yarısında (sırt arkalığa yakın)",
  BENCH_SEAT_FORWARD < 0 &&
    Math.abs(BENCH_SEAT_FORWARD) > 0.05 &&
    Math.abs(BENCH_SEAT_FORWARD) < BENCH_SEAT_DEPTH / 2,
  `kayma ${BENCH_SEAT_FORWARD} birim`,
);
check(
  "Oturma noktası mindere denk geliyor",
  Math.abs(BENCH_SEAT_FORWARD) < BENCH_SEAT_DEPTH / 2,
  `kayma ${BENCH_SEAT_FORWARD} birim`,
);
check(
  "Etkileşim yarıçapı bankın yarı enini kapsıyor",
  BENCH_INTERACT_RADIUS > 0.9 && BENCH_INTERACT_RADIUS > BENCH_WIDTH / 2,
  `${BENCH_INTERACT_RADIUS} birim`,
);

/* ── 2b. Bankın ÖNÜNDEKİ duraklama noktası (ışınlanma yok) ─────────── */
// Karakter banka dokununca ışınlanmaz: önce buraya YÜRÜR (World.tsx
// `requestSit` → `benchStandPx`). En yakın yürünebilir mesafe seçilir.
console.log("── bankın önündeki duraklama noktası ──");
const stands = BENCHES.map((def) => {
  for (const offset of BENCH_STAND_FALLBACKS) {
    const s = benchStandSpot(def, offset);
    const px = svgX(s.x);
    const py = svgY(s.z);
    if (inWalkable(px, py))
      return { offset, x: s.x, z: s.z, facing: benchFacing(def), def };
  }
  return null;
});
check(
  "Her bankın önünde yürünebilir bir duraklama noktası var",
  stands.every((s) => s !== null),
  stands
    .map((s, i) => (s ? `b${i}:${s.offset}` : `b${i}:YOK`))
    .join(" "),
);
const usable = stands.filter((s) => s !== null) as NonNullable<
  (typeof stands)[number]
>[];
check(
  "Duraklama noktası bankın BAKTIĞI tarafta (önünde)",
  usable.every((s) => (s.z - s.def.z) * s.facing > 0.1),
  `en küçük ön mesafe ${Math.min(
    ...usable.map((s) => (s.z - s.def.z) * s.facing),
  ).toFixed(2)} birim`,
);
check(
  "Duraklama noktası bankın ön kenarının dışında (minderin içine denk gelmiyor)",
  usable.every(
    (s) => Math.abs(s.z - s.def.z) > BENCH_SEAT_DEPTH / 2,
  ),
  `minder derinliği ${BENCH_SEAT_DEPTH} · ön yarı ${BENCH_SEAT_DEPTH / 2}`,
);
const farStands = usable.filter((s) => s.offset >= 0.35).length;
check(
  "Çoğu bankta duraklama noktası tam mesafede (0.35+) kalabiliyor",
  farStands >= usable.length - 3,
  `${farStands}/${usable.length} bank`,
);

/* ── 2c. Banklar YOLA bakıyor mu? (oturan karakter yola bakar) ─────── */
// Bank, sırtını verdiği yönün TERSİNE bakar. Kuzey kaldırımdaki bankın
// arkası kuzeyde (çit/çim), önü CADDEYE (+Z) bakar → `facing: 1`. Güney
// kaldırımdaki bankın arkası güneyde (çim), önü CADDEYE (−Z) bakar →
// `facing: -1`. Arka sokakta duvar güneyde olduğu için onlar da −Z'ye bakar.
console.log("── banklar yola bakıyor mu? ──");
// Bant kenarlarının adlandırması bölgeden bölgeye değişiyor (kuzey/güney) —
// bu yüzden bant her zaman min/max ile kurulur.
const inBand = (z: number, a: number, b: number) =>
  z > Math.min(a, b) && z < Math.max(a, b);
const inNorthWalk = (z: number) =>
  inBand(z, ZONE.northSidewalkTop, ZONE.northSidewalkBot);
const inSouthWalk = (z: number) => inBand(z, ZONE.southGrassTop, ZONE.roadTop);
const inBackWalk = (z: number) => inBand(z, ZONE.backWalkTop, ZONE.backWalkBot);
const northWalkBenches = BENCHES.filter((b) => inNorthWalk(b.z));
const southWalkBenches = BENCHES.filter((b) => inSouthWalk(b.z));
const backWalkBenches = BENCHES.filter((b) => inBackWalk(b.z));
check(
  "Kuzey kaldırım bankları CADDEYE bakar (facing 1)",
  northWalkBenches.length > 0 && northWalkBenches.every((b) => benchFacing(b) === 1),
  `${northWalkBenches.length} bank`,
);
check(
  "Güney kaldırım bankları CADDEYE bakar (facing -1)",
  southWalkBenches.length > 0 && southWalkBenches.every((b) => benchFacing(b) === -1),
  `${southWalkBenches.length} bank`,
);
check(
  "Arka sokak bankları sokağa bakar (duvara sırt, facing -1)",
  backWalkBenches.length > 0 && backWalkBenches.every((b) => benchFacing(b) === -1),
  `${backWalkBenches.length} bank`,
);
check(
  "Tüm banklar sınıflandırıldı (kaldırım bandı dışında bank yok)",
  northWalkBenches.length + southWalkBenches.length + backWalkBenches.length ===
    BENCHES.length,
  `${northWalkBenches.length}+${southWalkBenches.length}+${backWalkBenches.length} / ${BENCHES.length}`,
);

// KESİN KURAL: oturan karakterin YÖNÜ yola bakar. `benchSeatYaw` (avatarın
// kilitlendiği tek kaynak) her bankta en yakın cadde bandına doğru olmalı.
const roadCenters = [
  (ZONE.roadTop + ZONE.roadBot) / 2,
  (ZONE.backRoadTop + ZONE.backRoadBot) / 2,
];
const roadFacing = BENCHES.map((def) => {
  const yaw = benchSeatYaw(def);
  // Modelin ileri ekseni +Z; yaw 0 → +Z. Yürüyüşle aynı dönüşüm (atan2(dx,dz)).
  const dirZ = Math.cos(yaw);
  const nearest = roadCenters.reduce((a, b) =>
    Math.abs(b - def.z) < Math.abs(a - def.z) ? b : a,
  );
  const toRoad = Math.sign(nearest - def.z);
  return dirZ * toRoad;
});
check(
  "Her bankta oturan karakter CADDEYE bakar (benchSeatYaw)",
  roadFacing.every((d) => d > 0.99),
  `dot ${roadFacing.map((d) => d.toFixed(2)).join(", ")}`,
);
check(
  "Oturma yönü yalnızca 0 veya π (bankın bakışına tam paralel)",
  BENCHES.every((b) => {
    const y = benchSeatYaw(b);
    return y === 0 || Math.abs(y - Math.PI) < 1e-9;
  }),
);

/* ── 3. Bacaklar binanın içine giriyor mu? ─────────────────────────── */
console.log("── bacaklar binaya giriyor mu? ──");
const boxes = BUILDINGS.map((b) => {
  const c = b.frontZ - b.d / 2;
  return {
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minZ: c - b.d / 2,
    maxZ: c + b.d / 2,
  };
});
const hits = (x: number, z: number) =>
  boxes.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);

let clear = true;
for (let i = 0; i < seats.length; i++) {
  const s = seats[i];
  for (const t of [0.25, 0.5, 0.75, 1]) {
    const z = s.z + t * reach * s.facing;
    if (hits(s.x, z)) {
      clear = false;
      console.log(`     ✘ bank ${i} (x ${s.x}) bacağı binaya giriyor → z ${z.toFixed(2)}`);
    }
  }
}
check("Hiçbir bankta bacaklar binanın içine girmiyor", clear);

const shopBackWalls = BUILDINGS.filter((b) => b.frontZ > ZONE.northGrassTop).map(
  (b) => b.frontZ - b.d,
);
const shopBackWall = Math.min(...shopBackWalls);
const backBenches = BENCHES.filter((b) => b.z < ZONE.backWalkTop + 0.5);
check(
  "Arka sokak bankları arkalığı duvara dönük (facing -1)",
  backBenches.length > 0 && backBenches.every((b) => benchFacing(b) === -1),
  `${backBenches.length} bank, duvar Z ${shopBackWall.toFixed(2)}`,
);
const backSeat = backBenches[0];
check(
  "Arka bankın bacakları sokakta (duvarın kuzeyinde)",
  backSeat.z + reach * benchFacing(backSeat) < shopBackWall,
  `ayak z ${(backSeat.z + reach * benchFacing(backSeat)).toFixed(2)} < duvar ${shopBackWall.toFixed(2)}`,
);
check(
  "Kuzey kaldırım bankları caddeden yana (facing 1)",
  BENCHES.filter((b) => b.z < -5 && b.z > -8).every((b) => benchFacing(b) === 1),
);

// Oturan karakterin ayakları yürünen yüzeyde kalmalı: yola taşmamalı ve
// kaldırım bandının dışına çıkmamalı (bank büyüdüğü için erişim de büyüdü).
const inRoad = (z: number) => z > ZONE.roadTop && z < ZONE.roadBot;
check(
  "Hiçbir bankta oturan ayaklar yola taşmıyor",
  seats.every((s) => !inRoad(s.z + reach * s.facing)),
  `ayak z ${seats.map((s) => (s.z + reach * s.facing).toFixed(2)).join(", ")}`,
);
const northKeepBenches = BENCHES.filter((b) => b.z < -5 && b.z > -8);
check(
  "Kuzey kaldırım banklarında ayaklar kaldırımda kalıyor",
  northKeepBenches.every((b) => {
    const s = benchSeatSpot(b);
    const footZ = s.z + reach * benchFacing(b);
    return footZ >= ZONE.northSidewalkTop && footZ <= ZONE.northSidewalkBot;
  }),
  `${northWalkBenches.length} bank`,
);

/* ── 4. Gerçek iskeletler ─────────────────────────────────────────── */
console.log("── gerçek GLB iskeletleri: tespit + poz ──");
interface GltfNode {
  name?: string;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}
interface Gltf {
  nodes: GltfNode[];
  scenes: { nodes: number[] }[];
  skins?: { joints: number[] }[];
}

const isDescendant = (ancestor: THREE.Object3D, obj: THREE.Object3D) => {
  let p: THREE.Object3D | null = obj.parent;
  while (p) {
    if (p === ancestor) return true;
    p = p.parent;
  }
  return false;
};
const worldPoint = (o: THREE.Object3D) =>
  o.getWorldPosition(new THREE.Vector3());
const dirOf = (bone: THREE.Object3D, tip: THREE.Object3D) =>
  worldPoint(tip).sub(worldPoint(bone)).normalize();

/** Tüm kemiklerin yerel quaternion + konum anlık görüntüsü (idempotans testi). */
function snapshot(root: THREE.Object3D) {
  const bones: THREE.Object3D[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o);
  });
  const q = bones.map((o) => o.quaternion.clone());
  const p = bones.map((o) => o.position.clone());
  return {
    q,
    p,
    maxDiff(other: { q: THREE.Quaternion[]; p: THREE.Vector3[] }) {
      let m = 0;
      q.forEach((qq, i) => {
        m = Math.max(
          m,
          Math.abs(qq.x - other.q[i].x),
          Math.abs(qq.y - other.q[i].y),
          Math.abs(qq.z - other.q[i].z),
          Math.abs(qq.w - other.q[i].w),
          p[i].distanceTo(other.p[i]),
        );
      });
      return m;
    },
  };
}

const MODELS = ["character", "skin-savasci", "skin-samuray", "skin-sevalye"];
for (const model of MODELS) {
  const json = JSON.parse(
    readFileSync(`public/models/${model}.glb`, "utf8"),
  ) as Gltf;
  // GLTFLoader davranışı: YALNIZCA skin.joints içindeki düğümler Bone olur;
  // aynı ismi taşıyan mesh düğümleri kemik DEĞİLDİR (character.glb: Leg.L).
  const joints = new Set<number>();
  for (const skin of json.skins ?? []) for (const j of skin.joints) joints.add(j);

  const nodes: THREE.Object3D[] = json.nodes.map((n, i) => {
    const o: THREE.Object3D = joints.has(i) ? new THREE.Bone() : new THREE.Object3D();
    o.name = n.name ?? "";
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  json.nodes.forEach((n, i) => {
    for (const c of n.children ?? []) nodes[i].add(nodes[c]);
  });
  const root = new THREE.Group();
  for (const r of json.scenes[0].nodes ?? []) root.add(nodes[r]);
  root.updateMatrixWorld(true);

  const found = findSitBones(root);
  const nm = (b: THREE.Bone | null) => (b ? b.name : "—");
  const complete =
    !!found.hips &&
    !!found.thighL &&
    !!found.thighR &&
    !!found.shinL &&
    !!found.shinR &&
    !!found.footL &&
    !!found.footR;
  check(
    `${model}: kalça + iki uyluk/baldır/ayak bulundu`,
    complete,
    `hips ${nm(found.hips)} · thigh ${nm(found.thighL)}/${nm(found.thighR)} · shin ${nm(found.shinL)}/${nm(found.shinR)}`,
  );
  if (!complete) continue; // eksik zincirde aşağıdaki testler anlamsız
  check(
    `${model}: baldır uyluğun altında (mesh düğümü değil)`,
    isDescendant(found.thighL!, found.shinL!) &&
      isDescendant(found.thighR!, found.shinR!),
  );
  check(
    `${model}: uyluğun ucu diz (baldır)`,
    tipOf(found.thighL!) === found.shinL && tipOf(found.thighR!) === found.shinR,
  );
  check(
    `${model}: baldırın ucu çözülebiliyor`,
    !!tipOf(found.shinL!) && !!tipOf(found.shinR!),
    `L → ${tipOf(found.shinL!)?.name} · R → ${tipOf(found.shinR!)?.name}`,
  );
  check(`${model}: canSit true`, canSit(found));

  // ── Poz testi ──
  applySitPose(root, found, 1, 1);
  root.updateMatrixWorld(true);
  const thighDir = dirOf(found.thighL!, tipOf(found.thighL!)!);
  const shinDir = dirOf(found.shinL!, tipOf(found.shinL!)!);
  check(
    `${model}: uyluk istenen yönde`,
    thighDir.dot(THIGH_DIR) > 0.999,
    `dot ${thighDir.dot(THIGH_DIR).toFixed(5)}`,
  );
  check(
    `${model}: baldır istenen yönde`,
    shinDir.dot(SHIN_DIR) > 0.999,
    `dot ${shinDir.dot(SHIN_DIR).toFixed(5)}`,
  );
  // Omurga geriye yatık mı (bank oturuşu): gövde dik değil, sırt arkalığa
  // yaslanmış olmalı. `SIT_LEAN` kadar geriye yatık "yukarı" yönü hedeflenir.
  const spine = found.spine;
  const spineTip = spine ? tipOf(spine) : null;
  if (spine && spineTip) {
    const dir = dirOf(spine, spineTip);
    const want = new THREE.Vector3(
      0,
      Math.cos(SIT_LEAN),
      -Math.sin(SIT_LEAN),
    ).normalize();
    check(
      `${model}: gövde geriye yatık (bank oturuşu)`,
      dir.dot(want) > 0.99,
      `omurga ${spine.name} · dot ${dir.dot(want).toFixed(5)} · yatış ${(
        Math.acos(Math.min(1, Math.max(-1, dir.y))) *
        (180 / Math.PI)
      ).toFixed(1)}°`,
    );
    // Ters yön (facing -1) için ayna: aynı açı, ters işaret.
    applySitPose(root, found, -1, 1);
    root.updateMatrixWorld(true);
    const dirBack = dirOf(spine, spineTip);
    const wantBack = new THREE.Vector3(
      0,
      Math.cos(SIT_LEAN),
      Math.sin(SIT_LEAN),
    ).normalize();
    check(
      `${model}: gövde yatışı bankın yönüne göre aynalanıyor (facing -1)`,
      dirBack.dot(wantBack) > 0.99,
      `dot ${dirBack.dot(wantBack).toFixed(5)}`,
    );
    applySitPose(root, found, 1, 1);
    root.updateMatrixWorld(true);
  } else {
    check(
      `${model}: gövdeyi yatıracak omurga kemiği bulundu`,
      false,
      spine ? "ucu çözülemedi" : "omurga kemiği yok",
    );
  }

  // Ayak, baldırın ucuna hizalanmış olmalı (character.glb'de zincir kopuktu).
  const footGap = worldPoint(found.footL!).distanceTo(
    worldPoint(tipOf(found.shinL!)!),
  );
  check(
    `${model}: ayak baldırın ucuna hizalandı`,
    footGap < 0.01,
    `uzaklık ${footGap.toFixed(5)}`,
  );

  // Poz İDEMPOTENT olmalı → kare başına titreme olmaz. 120 kere üst üste
  // uygulanır: hata birikiyorsa (poz kendi çıktısını girdi alıyorsa) sapma
  // 1e-4'ü aşardı; sadece kayan nokta yuvarlamasıysa 1e-5 mertebesinde kalır.
  const before = snapshot(root);
  for (let i = 0; i < 120; i++) {
    applySitPose(root, found, 1, 1);
    root.updateMatrixWorld(true);
  }
  const diff = before.maxDiff(snapshot(root));
  check(
    `${model}: poz idempotent (120 karede kayma yok)`,
    diff < 1e-4,
    `maks fark ${diff.toExponential(2)}`,
  );

  // blend = 0 hiçbir kemiğe dokunmamalı (ayakta hâl).
  const before0 = snapshot(root);
  applySitPose(root, found, 1, 0);
  check(
    `${model}: blend 0 hiçbir şeyi değiştirmiyor`,
    before0.maxDiff(snapshot(root)) === 0,
  );
}

/* ── 5. Sabitler ──────────────────────────────────────────────────── */
console.log("── sabitler ──");
check(
  "Harita/oturma ölçeği: 1 birim = S px",
  S === 50 && Math.abs(seats[0].px - svgX(seats[0].x)) < 0.001,
);
check(
  "Yan sokak sabitleri tutarlı",
  SIDE_STREETS.length === 3 && SIDE_STREET_W > 0 && SIDE_STREET_SOUTH > 0,
);
check(
  "Dünya ölçüleri tutarlı (kuzeyde Z daha küçük)",
  WORLD_WIDTH > 0 && ZONE.backRoadTop < ZONE.backWalkTop,
  `arka cadde ${ZONE.backRoadTop} < arka kaldırım ${ZONE.backWalkTop}`,
);

console.log(`\n${failures.length === 0 ? "TÜM KONTROLLER GEÇTİ ✔" : "BAŞARISIZ ✘"}`);
console.log(`${passed}/${passed + failures.length} kontrol geçti.`);
if (failures.length > 0) {
  console.log("Başarısız:", failures.join(", "));
  process.exit(1);
}
