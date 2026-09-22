// 🌱 grassTufts — haritanın ÇİM ALANLARINA rüzgârda salınan dekoratif çim
// öbekleri serper (referans görseldeki yeşil gövde + turuncu uçlu hareketli çim).
//
// NEDEN HARİTANIN KENDİ BİTKİLERİNDEN TÜRETİLİR: "burası çim mi, taş yol mu, su
// mu" sorusunun güvenilir tek cevabı haritanın KENDİ çim/çalı mesh'leridir. Bu
// yüzden öbekler o mesh'lerin köşe noktalarından örneklenir:
//   · öbek tam olarak haritanın bitkisinin dibinde doğar → taş yola/plazaya düşmez,
//   · hepsi birden değil: haritanın 12 çim yamasından ~yarısı, 44 çalı yamasından
//     ~üçte biri seçilir (istenen: "her yerde değil ama bazı yerler"),
//   · SU ELENİR — ölçüm: haritada 560 su hücresinin 348'i arazinin ALTINDA
//     (gömülü nehir yatağı), 212'si GÖRÜNÜR su. Öbek yalnızca görünür suyun
//     bulunduğu hücrelerde elenir (bkz. `isWetCell`); gömülü yatak su sayılmaz,
//     yoksa bitkilerin çoğu "suda" sanılıp yanlış yere taşınırdı.
//
// MALİYET: bütün öbekler TEK birleşik geometride toplanır → tek çizim çağrısı,
// kare maliyeti yok. Salınım vertex gölgelendiricisindedir (`patchWindMaterial`)
// ve zaman uniform'unu haritanın çim geçişi ilerletir (`MapFoliagePass`) — yani
// öbekler haritanın çimiyle AYNI rüzgârda salınır, ikinci bir sürücü açılmaz.
//
// FİZİK: çarpışma/yürünebilirlik ızgarası yalnızca harita klonundan kurulur
// (`buildCollisionGrid`); bu mesh ona dahil değildir, tıklamayı da yemez
// (raycast hedefi değil). Yani çim öbekleri tamamen görseldir.
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type ReactElement } from "react";
import * as THREE from "three";
import { ARENA_D, ARENA_W } from "./arena/shared";
import { hash32, isGrassName, patchWindMaterial } from "./mapDecorScale";

/** Su yüzeyi sayılan mesh adları (projedeki ortak dil: waterFlow, collision). */
const WATER_NAME_RE = /(?:water|river|stream|lake|pond)/i;
/** Arazi/zemin mesh'leri — "gömülü su mu, görünür su mu" ayrımı için. */
const TERRAIN_NAME_RE = /(?:terrain|ground)/i;
/** Çalı/yaprak kümeleri (çimin yanına doğal duran ikinci kaynak). */
const BUSH_TOKENS = new Set(["bush", "shrub", "foliage", "canopy"]);

/** Kaynak mesh başına örneklenecek köşe sayısı. */
const SAMPLE_PER_MESH = 600;
/** Kot/su ızgarasının hücresi (arena birimi). */
const CELL = 0.35;
/** Gömülü su eşiği: su kotu zemin kotundan bu kadar aşağıdaysa görünmez. */
const WATER_VISIBLE = 0.05;
/** Ayaktan bu kadar yüksekteki su = "suyun üstünde" sayılır. */
const WATER_LIFT = 0.06;

/** Yama seçimi: çim yamalarının 1/2'si, çalı yamalarının 1/3'ü çimlendirilir. */
const KEEP_EVERY_GRASS = 2;
const KEEP_EVERY_BUSH = 3;
/** Bir yamada en fazla kaç öbek (yama duvar gibi dolmasın). */
const MAX_PER_PATCH = 6;
/** İki öbek arasındaki en küçük mesafe (arena birimi). */
const MIN_SPACING = 0.55;

/** Öbek başına yaprak (blade) sayısı ve boy aralığı (arena birimi). */
const BLADES_PER_TUFT = 5;
const TUFT_MIN_H = 0.42;
const TUFT_MAX_H = 0.78;
/**
 * Salınım çarpanı: sapma tepe noktasının tabandan yüksekliğiyle orantılıdır ve
 * dekoratif öbeklerde biraz güçlendirilir — referans görselde çim belirgin
 * şekilde dalgalanıyor.
 */
const WIND_BOOST = 1.6;

/** Yaprak renk geçişi: dipte koyu yeşil → ortada yeşil → uçta amber/turuncu. */
const BLADE_BASE_COLOR = new THREE.Color("#2f6d2a");
const BLADE_MID_COLOR = new THREE.Color("#4fae42");
const BLADE_TIP_COLOR = new THREE.Color("#ffab2b");

/** Mesh (veya en fazla 3 üst düğümü) verilen ada uyuyor mu? */
function chainHas(
  node: THREE.Object3D,
  test: (name: string) => boolean,
): boolean {
  let cur: THREE.Object3D | null = node;
  for (let i = 0; cur && i < 4; cur = cur.parent, i++) {
    if (cur.name && test(cur.name)) return true;
  }
  return false;
}

function nameTokens(name: string): string[] {
  return name
    .split(/[^A-Za-z0-9]+/)
    .flatMap((chunk) => chunk.split(/(?=[A-Z])/))
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function isBushName(name: string): boolean {
  return nameTokens(name).some((token) => BUSH_TOKENS.has(token));
}

/** Deterministik 0..1 sayı (aynı metin → aynı değer; kareler arası titreme yok). */
function unit(seed: string): number {
  return (hash32(seed) % 1000) / 1000;
}

interface MapMeshes {
  grass: THREE.Mesh[];
  bush: THREE.Mesh[];
  water: THREE.Mesh[];
  terrain: THREE.Mesh[];
}

/** Sahnedeki harita mesh'lerini adlarına göre ayırır (klon = o an oynanan harita). */
function collectMapMeshes(scene: THREE.Object3D): MapMeshes {
  const out: MapMeshes = { grass: [], bush: [], water: [], terrain: [] };
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (chainHas(mesh, (name) => WATER_NAME_RE.test(name))) out.water.push(mesh);
    else if (chainHas(mesh, isGrassName)) out.grass.push(mesh);
    else if (chainHas(mesh, isBushName)) out.bush.push(mesh);
    else if (chainHas(mesh, (name) => TERRAIN_NAME_RE.test(name)))
      out.terrain.push(mesh);
  });
  return out;
}

/**
 * Harita yerine oturdu mu? Oturmadan konum hesaplamak öbekleri haritanın ham
 * (ölçeksiz) uzayına serperdi. Fit sonrası arazi arena dikdörtgenine oturur
 * (ölçüm: 21.9 × 21.7); ham hâliyse yüz milyonlarca birim geniştir.
 */
function mapIsFitted(terrain: THREE.Mesh[]): boolean {
  if (!terrain.length) return false;
  const box = new THREE.Box3();
  for (const mesh of terrain) box.expandByObject(mesh);
  if (box.isEmpty()) return false;
  const size = box.getSize(new THREE.Vector3());
  return size.x > 1 && size.x < ARENA_W * 1.4 && size.z < ARENA_D * 1.4;
}

/** Hücre başına EN YÜKSEK kotu çıkarır (su yüzeyi ve zemin için). */
function topPerCell(
  meshes: THREE.Mesh[],
  perMesh: number,
): Map<string, number> {
  const top = new Map<string, number>();
  const v = new THREE.Vector3();
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute("position") as
      | THREE.BufferAttribute
      | undefined;
    if (!pos) continue;
    const step = Math.max(1, Math.floor(pos.count / perMesh));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const key = `${Math.round(v.x / CELL)}:${Math.round(v.z / CELL)}`;
      const known = top.get(key);
      if (known === undefined || v.y > known) top.set(key, v.y);
    }
  }
  return top;
}

/**
 * Hücre ıslak mı (görünür su mu)? İki koşul birlikte aranır:
 *   1) su kotu zemin kotunun üstünde/aynı hizada olmalı — nehrin arazi ALTINDA
 *      kalan gömülü yatağı böylece su sayılmaz (ölçüm: 560 su hücresinin 348'i
 *      gömülü; bunlar "suda" sayılsaydı haritanın bitkilerinin neredeyse tamamı
 *      yanlışlıkla elenirdi),
 *   2) su kotu öbeğin ayağından yüksek olmalı — kuru kıyıya basan öbek, yanında
 *      su olsa da suyun üstünde değildir.
 */
function isWetCell(
  waterTop: Map<string, number>,
  terrainTop: Map<string, number>,
  key: string,
  footY: number,
): boolean {
  const waterY = waterTop.get(key);
  if (waterY === undefined) return false;
  const terrainY = terrainTop.get(key);
  const visible =
    terrainY === undefined || waterY >= terrainY - WATER_VISIBLE;
  return visible && waterY >= footY - WATER_LIFT;
}

interface BuiltTufts {
  mesh: THREE.Mesh;
  tufts: number;
  patches: number;
  skippedWater: number;
}

/**
 * Çim öbeklerini kurar. `null` dönerse harita henüz hazır değildir (çağıran kare
 * döngüsü yeniden dener).
 */
function buildGrassTufts(scene: THREE.Object3D): BuiltTufts | null {
  const { grass, bush, water, terrain } = collectMapMeshes(scene);
  if (!grass.length && !bush.length) return null;
  if (!mapIsFitted(terrain)) return null;

  const waterTop = topPerCell(water, 1500);
  const terrainTop = topPerCell(terrain, 1500);

  const v = new THREE.Vector3();
  const minX = 0.6;
  const minZ = 0.6;
  const maxX = ARENA_W - 0.6;
  const maxZ = ARENA_D - 0.6;
  const chosen: { key: string; x: number; y: number; z: number }[] = [];
  let patches = 0;
  let skippedWater = 0;

  const sources: { mesh: THREE.Mesh; grass: boolean }[] = [
    ...grass.map((mesh) => ({ mesh, grass: true })),
    ...bush.map((mesh) => ({ mesh, grass: false })),
  ];

  for (const source of sources) {
    // Yama seçimi mesh adından (sabit): harita her yüklendiğinde AYNI yamalar
    // çimlenir, kareler arasında titreme olmaz.
    const name = source.mesh.name || "";
    const keepEvery = source.grass ? KEEP_EVERY_GRASS : KEEP_EVERY_BUSH;
    const patchKey = `${name}|${source.mesh.id}`;
    if (hash32(name || patchKey) % keepEvery !== 0) continue;

    const pos = source.mesh.geometry.getAttribute("position") as
      | THREE.BufferAttribute
      | undefined;
    if (!pos) continue;

    // Aday ayak izleri: mesh'in köşeleri örneklenir, hücre başına EN DÜŞÜK y
    // tutulur → öbek yaprakların ucuna değil, bitkinin DİBİNE basar (haritanın
    // çimi tabandan büyütülür: bkz. mapFoliage).
    const cellBase = new Map<string, { x: number; y: number; z: number }>();
    const step = Math.max(1, Math.floor(pos.count / SAMPLE_PER_MESH));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(source.mesh.matrixWorld);
      if (v.x < minX || v.x > maxX || v.z < minZ || v.z > maxZ) continue;
      const key = `${Math.round(v.x / CELL)}:${Math.round(v.z / CELL)}`;
      if (isWetCell(waterTop, terrainTop, key, v.y)) {
        skippedWater += 1;
        continue;
      }
      const known = cellBase.get(key);
      if (known === undefined || v.y < known.y) {
        cellBase.set(key, { x: v.x, y: v.y, z: v.z });
      }
    }
    if (cellBase.size < 2) continue;

    // Yama içinde dağılım: deterministik karıştırma + en küçük mesafe kuralı,
    // böylece öbekler tek noktaya yığılmaz.
    const ordered = [...cellBase.entries()].sort(
      (a, b) => unit(`${patchKey}#${a[0]}`) - unit(`${patchKey}#${b[0]}`),
    );
    const kept: { x: number; z: number }[] = [];
    for (const [key, cell] of ordered) {
      if (kept.length >= MAX_PER_PATCH) break;
      const tooClose = kept.some(
        (k) => Math.hypot(k.x - cell.x, k.z - cell.z) < MIN_SPACING,
      );
      if (tooClose) continue;
      kept.push(cell);
      chosen.push({
        key: `${patchKey}#${key}`,
        x: cell.x,
        y: cell.y,
        z: cell.z,
      });
    }
    if (kept.length) patches += 1;
  }
  if (!chosen.length) return null;

  // Geometri: her öbek birkaç yaprak; hepsi TEK birleşik tamponda.
  const positions: number[] = [];
  const colors: number[] = [];
  const weights: number[] = [];
  const phases: number[] = [];
  const color = new THREE.Color();

  for (const tuft of chosen) {
    const height =
      TUFT_MIN_H + unit(`${tuft.key}!h`) * (TUFT_MAX_H - TUFT_MIN_H);
    const phase = unit(`${tuft.key}!p`) * Math.PI * 2;
    for (let b = 0; b < BLADES_PER_TUFT; b++) {
      const seed = `${tuft.key}!${b}`;
      const yaw = unit(`${seed}a`) * Math.PI * 2;
      const dirX = Math.cos(yaw);
      const dirZ = Math.sin(yaw);
      const perpX = -dirZ;
      const perpZ = dirX;
      const bladeH = height * (0.7 + unit(`${seed}b`) * 0.5);
      const half = 0.028 + unit(`${seed}c`) * 0.022;
      // Yaprak uçtan dışa kavislenir: sapma t² ile artar (doğal eğilme).
      const bend = bladeH * (0.16 + unit(`${seed}d`) * 0.3);
      const levels = [
        { t: 0, along: 0, width: half },
        { t: 0.5, along: bend * 0.25, width: half * 0.7 },
        { t: 1, along: bend, width: half * 0.12 },
      ];
      const push = (level: (typeof levels)[number], side: number) => {
        const w = level.width * side;
        positions.push(
          tuft.x + dirX * level.along + perpX * w,
          tuft.y + bladeH * level.t,
          tuft.z + dirZ * level.along + perpZ * w,
        );
        if (level.t < 0.5)
          color.copy(BLADE_BASE_COLOR).lerp(BLADE_MID_COLOR, level.t * 2);
        else
          color
            .copy(BLADE_MID_COLOR)
            .lerp(BLADE_TIP_COLOR, (level.t - 0.5) * 2);
        colors.push(color.r, color.g, color.b);
        // 🌬️ Rüzgâr ağırlığı = tabandan yükseklik → kök sabit, uç salınır.
        // Haritanın çimiyle aynı uniform'u okur, aynı anda esner.
        weights.push(bladeH * level.t * WIND_BOOST);
        phases.push(phase + b * 0.7);
      };
      for (let s = 0; s < levels.length - 1; s++) {
        const low = levels[s];
        const high = levels[s + 1];
        // İki üçgen (çift yüzlü materyal: arkadan da görünür).
        push(low, -1);
        push(low, 1);
        push(high, -1);
        push(low, 1);
        push(high, 1);
        push(high, -1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    "aWindWeight",
    new THREE.Float32BufferAttribute(weights, 1),
  );
  geometry.setAttribute(
    "aWindPhase",
    new THREE.Float32BufferAttribute(phases, 1),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    // Uçlardaki amber biraz kendinden parlar (bloom eşiğinin ALTINDA kalır):
    // gündüz paletinde çim "canlı" okunur ama ekranı sislemez.
    emissive: new THREE.Color("#ff8f2a"),
    emissiveIntensity: 0.07,
  });
  // Haritanın çimiyle aynı salınım yaması (tek ortak zaman uniform'u).
  patchWindMaterial(material);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "grass-tufts";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return { mesh, tufts: chosen.length, patches, skippedWater };
}

/**
 * Sahneye bir kez çim öbekleri ekler. Harita Suspense içinde geç geldiği için
 * ilk saniye boyunca yeniden denenir; kurulduğunda arama tamamen durur (kare
 * maliyeti ~0). Kamera/atmosfer ayarlarına dokunmaz.
 */
export function GrassTufts(): ReactElement {
  const scene = useThree((state) => state.scene);
  const group = useRef<THREE.Group>(null);
  const built = useRef(false);
  const tries = useRef(0);

  useFrame(() => {
    if (built.current || !group.current || tries.current > 240) return;
    tries.current += 1;
    const result = buildGrassTufts(scene);
    if (!result) return;
    built.current = true;
    group.current.add(result.mesh);
    console.log(
      `[grassTufts] ${result.tufts} çim öbeği ${result.patches} yamaya serpildi ` +
        `(su üstü olduğu için elenen ${result.skippedWater} nokta) · ` +
        `tek çizim çağrısı, rüzgâr haritanın çimiyle ortak`,
    );
  });

  return <group ref={group} />;
}
