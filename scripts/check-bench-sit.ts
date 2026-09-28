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
  BENCH_WIDTH,
  BENCH_SEAT_DEPTH,
  BENCH_SEAT_TOP,
  BENCH_SEAT_FORWARD,
  BENCH_SEAT_HEIGHT,
  BENCH_INTERACT_RADIUS,
  benchFacing,
  benchSeatSpot,
  BUILDINGS,
  PLAYER_3D_HEIGHT,
  S,
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
check("Ayak havada kalmıyor", ankleY < 0.06, `ayak y ${ankleY.toFixed(3)}`);
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
  "Kalça eklemi minderin 6–13 cm üstünde (kalça dokusu mindere oturur)",
  BENCH_SEAT_HEIGHT - BENCH_SEAT_TOP > 0.06 &&
    BENCH_SEAT_HEIGHT - BENCH_SEAT_TOP < 0.13,
  `minder ${BENCH_SEAT_TOP} → kalça ${BENCH_SEAT_HEIGHT}`,
);
check(
  "Bank eni karakterin sırtından geniş (≥ 1.2 birim)",
  BENCH_WIDTH >= 1.2,
  `${BENCH_WIDTH} birim`,
);
check(
  "Oturma derinliği gerçekçi (0.35–0.55 birim)",
  BENCH_SEAT_DEPTH > 0.35 && BENCH_SEAT_DEPTH < 0.55,
  `${BENCH_SEAT_DEPTH} birim`,
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
const northWalkBenches = BENCHES.filter((b) => b.z < -5 && b.z > -8);
check(
  "Kuzey kaldırım banklarında ayaklar kaldırımda kalıyor",
  northWalkBenches.every((b) => {
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
