// 🛡️ DefenseTowers — HARİTANIN KENDİ ORİJİNAL KULELERİNİ bulur ve onları
// "aktif" gösterir. **Hiçbir kule modeli üretilmez.**
//
// Önceki sürüm sahneye kule mesh'i (taş kaide + gövde + kristal baş) ve pembe
// arsa işaretleri ekliyordu; bu dosya artık bunların hiçbirini çizmez. Yapılan
// iş, haritanın GLB'sinde zaten duran küçük kuleleri İSİMDEN bulup
// `@/engine/BattleTowers` sistemine kaydetmek ve yalnızca ışıkla (additive
// halka + tepe ışıması + ince ışık sütunu) durumlarını göstermek:
//
//   1. TARAMA — sahne dolaşılır, adında `tower` geçen, yüksekliği kaide/decal
//      olmayacak kadar büyük mesh'ler toplanır. Aynı kulenin parçaları
//      (gövde, tepelik, sancak…) yakınlıkla TEK kuleye birleştirilir.
//      Konum, mesh'in DÜNYA konumundan gelir (px = dünya × S), yani kule
//      nerede duruyorsa sistem orada olur.
//   2. STABİLLİK — harita yüklenirken fit dönüşümü (kaydırma + ölçek) bir
//      karede uygulanır. Tarama iki ardışık karede AYNI konumu görmeden kabul
//      edilmez; böylece henüz ölçeklenmemiş koordinatlar kilitlenmez.
//   3. TAKIM — kule, oyuncunun başlangıcına mı rakibin başlangıcına mı yakın
//      olduğuna göre ayrılır. Oyuncu yalnız KENDİ kulesini aktive edebilir;
//      rakip kulesi dokunulmazdır ve ateş etmez.
//   4. GÖRSEL — kulenin BOYUTUNA dokunulmaz (ölçek uygulanmaz). Sadece:
//        · zeminde ince, additif halka (yaklaşınca parlar = "buraya gel"),
//        · aktif kulenin tepesinde ışıma çekirdeği (ateş anında parlar),
//        · aktif kulede çok ince dikey ışık sütunu (seviye arttıkça belirgin).
//      Hepsi `raycast` kapalı ve havuzsuz; kare maliyeti neredeyse sıfırdır.
//
// Kule ATEŞ ETMEZ, hasar HESAPLAMAZ: mermiyi sahnenin kendi havuzuna bırakır
// (bkz. engine/BattleTowers → stepTowers), hasar/isabet/ölüm akışını mevcut
// savaş simülasyonu işler. Bu katman bu yüzden tamamen görseldir ve yalnızca
// kule sistemi bağlıyken (bot düellosu) çalışır.
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  TOWER_SITE_RADIUS_PX,
  setTowerPosts,
  stepTowers,
  towerState,
  updateTowerProximity,
  type TowerPost,
  type TowerPostSeed,
} from "@/engine/BattleTowers";
import { findNearestWalkablePosition } from "../BattleMapModel";
import { S } from "./shared";

/** Dövüşçü yarıçapı (px): yürünebilirlik yoklaması bu açıklıkla yapılır. */
const PROBE_R = 24;

/** Kule mesh'i aranırken isimde geçmesi gereken parça. */
const TOWER_RE = /tower/i;
/** Kaide/decal/gölge parçaları kule sayılmaz (yükselmeyen yassı parçalar). */
const TOWER_SKIP_RE = /(decal|towerbase|shadow)/i;
/**
 * Bir mesh'in "kule" sayılması için gereken en küçük yükseklik (dünya birimi).
 * Kaide/decal parçaları ~0.15 birim olduğu için 0.6 yassı zemin parçalarını
 * elerken haritanın küçük kulelerini kaçırmaz.
 */
const MIN_TOWER_H = 0.6;
/**
 * Aynı kulenin parçalarının birleştirilme yarıçapı (dünya birimi).
 * Haritadaki iki AYRI kule birbirine ~3 birim uzaklıkta durduğu için bu değer
 * kasıtlı küçük: komşu kuleler tek kuleye birleşmemeli (tek kulenin kendi
 * parçaları zaten kendi ayak izinin içinde, ~1 birim içindedir).
 */
const CLUSTER_R = 1.8;

/** Sahneden bulunan ham kule parçası (dünya uzayı). */
interface RawTowerPart {
  cx: number;
  cz: number;
  baseY: number;
  top: number;
  height: number;
  footprint: number;
  semantic: string;
}

/** Kule adından kendi takım rengi (harita mesh adları kırmızı/mavi üs taşır). */
function towerColor(semantic: string): string {
  if (/red|orange|fire|magma/i.test(semantic)) return "#ff8a4c";
  if (/blue|cyan|ice|frost/i.test(semantic)) return "#5ce1ff";
  return "#a9b8ff";
}

/** Yumuşak ışıma dokusu (radial gradient) — bir kez üretilir. */
let glowTexture: THREE.Texture | null = null;
function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

/** Sahnede adında `tower` geçen, yükselen mesh'leri toplar (dünya uzayı). */
function scanTowerParts(root: THREE.Object3D): RawTowerPart[] {
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const parts: RawTowerPart[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || !mesh.visible) return;
    // Instanced mesh'lerin kutusu tüm örnekleri kapsar; kule tespiti için
    // kullanılamaz (haritada kuleler tek tek mesh).
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) return;
    const names: string[] = [];
    for (let node: THREE.Object3D | null = mesh, i = 0; node && i < 6; node = node.parent, i++) {
      if (node.name) names.push(node.name);
    }
    const semantic = names.join("/");
    if (!TOWER_RE.test(semantic) || TOWER_SKIP_RE.test(semantic)) return;
    box.setFromObject(mesh);
    if (box.isEmpty()) return;
    box.getSize(size);
    if (size.y < MIN_TOWER_H) return;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    if (!Number.isFinite(cx) || !Number.isFinite(cz)) return;
    parts.push({
      cx,
      cz,
      baseY: box.min.y,
      top: box.max.y,
      height: size.y,
      footprint: Math.max(size.x, size.z) / 2,
      semantic,
    });
  });
  return parts;
}

/**
 * Kule parçalarını kuleye dönüştürür: aynı kulenin parçaları yakınlıkla
 * birleşir, en yüksek parça çapa (gövde) kabul edilir. Liste px konumuna göre
 * sıralanır ve kimlikler buna göre verilir — yani id kararlıdır.
 */
function buildSeeds(parts: readonly RawTowerPart[]): TowerPostSeed[] {
  const sorted = [...parts].sort((a, b) => b.height - a.height);
  const clusters: RawTowerPart[][] = [];
  for (const part of sorted) {
    const hit = clusters.find((group) =>
      group.some(
        (other) => Math.hypot(other.cx - part.cx, other.cz - part.cz) < CLUSTER_R,
      ),
    );
    if (hit) hit.push(part);
    else clusters.push([part]);
  }
  const seeds = clusters.map((group) => {
    const anchor = group[0];
    const top = Math.max(...group.map((g) => g.top));
    const baseY = Math.min(...group.map((g) => g.baseY));
    const footprint = Math.max(...group.map((g) => g.footprint));
    const px = anchor.cx * S;
    const py = anchor.cz * S;
    const anchor2 = towerState.allyAnchor;
    const enemy = towerState.enemyAnchor;
    let side: "ally" | "enemy" = "ally";
    if (anchor2 && enemy) {
      const dAlly = Math.hypot(px - anchor2.x, py - anchor2.y);
      const dEnemy = Math.hypot(px - enemy.x, py - enemy.y);
      side = dAlly <= dEnemy ? "ally" : "enemy";
    }
    // ERİŞİM: kulenin dibi tamamen kapalıysa düğme hiç açılmazdı. En yakın
    // YÜRÜNEBİLİR noktayı yoklayıp erişim yarıçapını ona göre genişletiyoruz
    // (harita çarpışma ızgarası hazır değilse varsayılan yarıçap kalır).
    let reachPx = TOWER_SITE_RADIUS_PX;
    const free = findNearestWalkablePosition(px, py, PROBE_R);
    if (free) {
      const gap = Math.hypot(free[0] - px, free[1] - py);
      reachPx = Math.min(300, Math.max(TOWER_SITE_RADIUS_PX, gap + 48));
    }
    return {
      id: "",
      name: anchor.semantic.split("/").filter(Boolean)[0] ?? "tower",
      x: px,
      y: py,
      baseY,
      top,
      // Halka kulenin kendi ayak izine oturur: asla kuleyi aşacak kadar büyük
      // olmaz, kaideye yapışık kalmaz.
      radius: Math.min(1.35, Math.max(0.72, footprint * 1.15)),
      color: towerColor(anchor.semantic),
      side,
      reachPx,
    } satisfies TowerPostSeed;
  });
  seeds.sort((a, b) => a.x - b.x || a.y - b.y);
  seeds.forEach((seed, i) => {
    seed.id = `tower-${i}`;
  });
  return seeds;
}

/** İki tarama aynı konumu mu gördü? (haritanın fit dönüşümü oturdu mu) */
function sameLayout(a: readonly TowerPostSeed[], b: readonly TowerPostSeed[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (seed, i) =>
      Math.abs(seed.x - b[i].x) < 1 &&
      Math.abs(seed.y - b[i].y) < 1 &&
      Math.abs(seed.top - b[i].top) < 0.05,
  );
}

/**
 * Tek bir ORİJİNAL kule üzerindeki ışık katmanı. Model çizilmez; yalnız
 * zemindeki ince halka, tepedeki ışıma çekirdeği ve (aktifse) ince ışık
 * sütunu yönetilir.
 */
function TowerMarker({ post }: { post: TowerPost }) {
  const camera = useThree((s) => s.camera);
  const ring = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Sprite>(null);
  const beam = useRef<THREE.Mesh>(null);
  const lastLevel = useRef(post.level);
  const pulse = useRef(0);

  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: post.color,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [post.color],
  );
  const coreMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: post.color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [post.color],
  );
  const beamMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: post.color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [post.color],
  );

  const height = Math.max(0.6, post.top - post.baseY);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const t = state.clock.elapsedTime;
    // Seviye atlama nabzı: altın ödendiği an halka bir kez genişleyip parlar.
    if (post.level > lastLevel.current) pulse.current = 0.55;
    lastLevel.current = post.level;
    pulse.current = Math.max(0, pulse.current - dt);
    const pulseK = pulse.current / 0.55;

    const player = towerState.runtime?.player.current;
    const dist = player ? Math.hypot(player.x - post.x, player.y - post.y) : Number.POSITIVE_INFINITY;
    const inRange = dist <= Math.max(TOWER_SITE_RADIUS_PX, post.reachPx);
    // Kuleyi uzaktan hiç göstermeyiz; yaklaştıkça halka belirginleşir.
    const hint = THREE.MathUtils.clamp(1 - dist / 420, 0, 1);
    const active = post.level > 0;
    const breathe = 0.5 + 0.5 * Math.sin(t * 2.1);

    // ── zemin halkası: etkileşim ipucu ──
    ringMat.opacity =
      (inRange ? 0.34 + 0.2 * breathe + 0.12 * (post.level / 3) : 0.07 * hint) +
      (active ? 0.08 : 0) +
      pulseK * 0.5;
    if (ring.current) {
      ring.current.rotation.z += dt * (active ? 0.45 : 0.22);
      ring.current.scale.setScalar(1 + pulseK * 0.3 + (inRange ? 0.03 * breathe : 0));
    }

    // ── tepedeki ışıma çekirdeği: aktiflik + ateş anı ──
    const flash = post.flashT > 0 ? post.flashT / 0.18 : 0;
    coreMat.opacity = active
      ? 0.26 + 0.08 * (post.level - 1) + 0.1 * breathe + flash * 0.72 + pulseK * 0.4
      : 0;
    if (core.current) {
      core.current.visible = active;
      const base = 0.52 + 0.14 * (post.level - 1);
      core.current.scale.setScalar(base * (1 + flash * 0.5 + pulseK * 0.35));
    }

    // ── ince ışık sütunu: aktif kulenin "enerjili" okunuşu ──
    beamMat.opacity = active
      ? 0.05 + 0.025 * (post.level - 1) + flash * 0.16 + pulseK * 0.22
      : 0;
    if (beam.current) {
      beam.current.visible = active;
      // Kameraya dönük ince levha (dünya uzayında billboard).
      beam.current.rotation.y = Math.atan2(
        camera.position.x - post.x / S,
        camera.position.z - post.y / S,
      );
    }
  });

  return (
    <group position={[post.x / S, post.baseY, post.y / S]} raycast={() => null}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} raycast={() => null}>
        <ringGeometry args={[post.radius * 0.84, post.radius, 44]} />
        <primitive object={ringMat} attach="material" />
      </mesh>
      <mesh ref={beam} position={[0, height * 0.5, 0]} raycast={() => null}>
        <planeGeometry args={[0.34, height]} />
        <primitive object={beamMat} attach="material" />
      </mesh>
      <sprite ref={core} position={[0, height + 0.06, 0]} raycast={() => null}>
        <primitive object={coreMat} attach="material" />
      </sprite>
    </group>
  );
}

/**
 * Kule katmanı: sahne kule sistemini bağladığında çalışır (bkz. BattleScene →
 * configureTowers). Bağlı değilken hiçbir şey çizmez, kare maliyeti yoktur.
 */
export function DefenseTowerLayer() {
  const scene = useThree((s) => s.scene);
  const [allyIds, setAllyIds] = useState<readonly string[]>([]);
  const tries = useRef(0);
  const lastSeeds = useRef<TowerPostSeed[] | null>(null);
  const done = useRef(false);

  useFrame((_, rawDt) => {
    if (!towerState.runtime) return;
    const dt = Math.min(rawDt, 1 / 20);

    // 1) Haritanın orijinal kulelerini bul (fit dönüşümü oturana kadar bekle).
    if (!towerState.postsReady && !done.current && tries.current < 600) {
      tries.current += 1;
      const seeds = buildSeeds(scanTowerParts(scene));
      const previous = lastSeeds.current;
      // İki ardışık kare AYNI konumu görmeden kabul etme: harita fit dönüşümü
      // bir karede uygulanır ve o karede koordinatlar henüz ölçeklenmemiştir.
      const stable = previous !== null && sameLayout(previous, seeds);
      const forced = tries.current >= 600;
      if (seeds.length > 0 && (stable || forced)) {
        setTowerPosts(seeds);
        done.current = true;
        const ally = seeds.filter((s) => s.side === "ally").length;
        setAllyIds(seeds.filter((s) => s.side === "ally").map((s) => s.id));
        console.log(
          `[towers] haritanın orijinal kuleleri bulundu: ${seeds.length} kule ` +
            `(${ally} benim / ${seeds.length - ally} rakip) — model üretilmedi, ` +
            `yalnızca ışık katmanı eklendi`,
        );
      } else if (forced) {
        done.current = true;
        console.warn("[towers] haritada kule mesh'i bulunamadı (ad eşleşmesi yok)");
      }
      lastSeeds.current = seeds;
    }

    // 2) Oyuncunun kuleye yakınlığı + aktif kulelerin hedefleme/ateş döngüsü.
    updateTowerProximity();
    stepTowers(dt);

    // 3) React listesi yalnız oyuncu tarafındaki kuleler değiştiğinde tazelenir.
    const ally = towerState.posts.filter((p) => p.side === "ally");
    if (ally.length !== allyIds.length) {
      setAllyIds(ally.map((p) => p.id));
    }
  });

  if (!towerState.runtime) return null;

  return (
    <group>
      {allyIds.map((id) => {
        const post = towerState.posts.find((p) => p.id === id);
        return post ? <TowerMarker key={id} post={post} /> : null;
      })}
    </group>
  );
}
