// 🛡️ DefenseTowers — satın alınan savunma kulelerinin 3B katmanı.
//
// Ekonomi/simülasyon `@/engine/BattleTowers` içindedir (tek kaynak); burası
// yalnızca ÇİZER ve kare döngüsünü sürer:
//
//   1. ARSALAR  — koridordaki üç kule arsası, haritanın çarpışma ızgarası
//      hazır olur olmaz `findNearestWalkablePosition` ile YÜRÜNEBİLİR zemine
//      snap'lenir. Böylece "arsaya yaklaş" koşulu her zaman gerçekten
//      ulaşılabilir bir noktadır.
//   2. BOŞ ARSA GÖRSELİ — yerde dönen, nefes alan bir ışık halkası + üstünde
//      süzülen bir işaret. Oyuncu arsaya yaklaştığında halka parlar (yani
//      HUD'daki "Kule Satın Al" düğmesinin neden çıktığı sahada da okunur).
//   3. KULE — taş kaide + gövde + dönen rün halkası + ışıyan kristal baş;
//      gövde hedefe döner, ateş anında namlu ağzı parlar.
//   4. CAN BARI — kulenin üstünde kameraya bakan ince bar (yıkılana kadar ne
//      kadar dayandığı görünsün diye).
//
// Kule ATEŞ ETMEZ, hasar HESAPLAMAZ: mermiyi sahnenin kendi havuzuna bırakır
// (bkz. engine/BattleTowers → stepTowers), hasar/isabet/ölüm akışını mevcut
// savaş simülasyonu işler. Bu katman bu yüzden tamamen görseldir ve yalnızca
// `towerState.runtime` bağlandığında (bot düellosu) çalışır.
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import {
  TOWER_BODY_R,
  TOWER_COST,
  TOWER_SITE_RADIUS_PX,
  TOWER_SITE_UNITS,
  setTowerSites,
  stepTowers,
  towerAtSite,
  towerState,
  unitsToPx,
  updateTowerProximity,
  type BattleTower,
  type TowerSite,
} from "@/engine/BattleTowers";
import { findNearestWalkablePosition } from "../BattleMapModel";
import { S } from "./shared";

/** Takım rengi: oyuncu (kırmızı üs) → sıcak kor kristali. */
const CRYSTAL = "#ff5d4d";
const CRYSTAL_CORE = "#ffd9b0";
const STONE = "#574535";
const SLATE = "#6f5a44";

/** Arsa işareti: boş arsada dönen halka + süzülen inşa işareti. */
function BuildPad({ site }: { site: TowerSite }) {
  const ring = useRef<THREE.Mesh>(null);
  const mark = useRef<THREE.Mesh>(null);
  const group = useRef<THREE.Group>(null);
  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffb066",
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );

  useFrame((state, dt) => {
    const built = towerAtSite(site.id) !== null;
    const near = towerState.nearSiteId === site.id;
    if (group.current) group.current.visible = !built;
    const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3);
    if (ring.current) {
      ring.current.rotation.z += dt * (near ? 1.4 : 0.5);
      // Yakındayken halka büyür ve parlar: "buraya kule kurabilirsin".
      ring.current.scale.setScalar((near ? 1.18 : 1) + 0.05 * pulse);
      ringMat.opacity = near ? 0.55 + 0.3 * pulse : 0.22 + 0.12 * pulse;
    }
    if (mark.current) {
      mark.current.rotation.y += dt * 1.1;
      mark.current.position.y =
        1.05 + Math.sin(state.clock.elapsedTime * 2.2) * 0.09;
    }
  });

  return (
    <group position={[site.x / S, 0.02, site.y / S]} ref={group} raycast={() => null}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[0.62, 0.78, 40]} />
        <primitive object={ringMat} attach="material" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <circleGeometry args={[0.6, 32]} />
        <meshBasicMaterial
          color="#ff8a3c"
          transparent
          opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={mark} position={[0, 1.05, 0]} raycast={() => null}>
        <octahedronGeometry args={[0.16, 0]} />
        <meshBasicMaterial color={CRYSTAL_CORE} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Kulenin üstündeki can barı (her karede kameraya bakar). */
function TowerHpBar({
  fill,
  bar,
}: {
  fill: RefObject<THREE.Mesh | null>;
  bar: RefObject<THREE.Group | null>;
}) {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (bar.current) bar.current.quaternion.copy(camera.quaternion);
  });
  return (
    <group ref={bar} position={[0, 2.62, 0]}>
      <mesh raycast={() => null}>
        <planeGeometry args={[1.02, 0.13]} />
        <meshBasicMaterial color="#120c14" transparent opacity={0.72} depthWrite={false} />
      </mesh>
      <mesh ref={fill} position={[-0.48, 0, 0.001]} raycast={() => null}>
        <planeGeometry args={[0.96, 0.085]} />
        <meshBasicMaterial color="#ffca4a" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Tek bir kurulu kule (taş kaide + gövde + rün halkası + kristal baş). */
function TowerMesh({ tower }: { tower: BattleTower }) {
  const body = useRef<THREE.Group>(null);
  const runes = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.Sprite>(null);
  const fill = useRef<THREE.Mesh>(null);
  const bar = useRef<THREE.Group>(null);
  const glowTex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 1, 32, 32, 30);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, CRYSTAL_CORE);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(canvas);
  }, []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    // Gövde hedefe döner (namlu yönü = kule yönü).
    if (body.current) body.current.rotation.y = -tower.yaw + Math.PI / 2;
    if (runes.current) runes.current.rotation.y += dt * 0.8;
    if (head.current) {
      head.current.rotation.y -= dt * 1.4;
      head.current.position.y = 1.98 + Math.sin(t * 1.9) * 0.06;
    }
    // Ateş anı: kristal parlar, namlu ağzı alevlenir.
    const burst = tower.flashT > 0 ? tower.flashT / 0.18 : 0;
    if (head.current) {
      const mat = head.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.2 + 0.5 * Math.sin(t * 2.4) + burst * 3;
    }
    if (flash.current) {
      (flash.current.material as THREE.SpriteMaterial).opacity =
        Math.min(1, burst) * 0.85;
      flash.current.scale.setScalar(0.7 + burst * 0.5);
    }
    // Can barı.
    const ratio = Math.max(0, tower.hp / tower.maxHp);
    if (fill.current) {
      fill.current.scale.x = Math.max(0.001, ratio);
      fill.current.position.x = -0.48 * ratio;
      (fill.current.material as THREE.MeshBasicMaterial).color.set(
        ratio > 0.5 ? "#ffca4a" : ratio > 0.25 ? "#ff8a3c" : "#ff4d4d",
      );
    }
  });

  return (
    <group position={[tower.x / S, 0, tower.y / S]}>
      <group ref={body}>
        {/* taş kaide */}
        <mesh position={[0, 0.14, 0]} castShadow receiveShadow raycast={() => null}>
          <cylinderGeometry args={[0.62, 0.74, 0.28, 8]} />
          <meshStandardMaterial
            color={STONE}
            roughness={0.85}
            metalness={0.12}
            envMapIntensity={0.4}
          />
        </mesh>
        <mesh position={[0, 0.42, 0]} castShadow raycast={() => null}>
          <cylinderGeometry args={[0.5, 0.6, 0.3, 8]} />
          <meshStandardMaterial
            color={STONE}
            roughness={0.85}
            metalness={0.12}
            envMapIntensity={0.4}
          />
        </mesh>
        {/* gövde */}
        <mesh position={[0, 1.02, 0]} castShadow raycast={() => null}>
          <cylinderGeometry args={[0.3, 0.42, 0.94, 8]} />
          <meshStandardMaterial
            color={SLATE}
            roughness={0.6}
            metalness={0.35}
            envMapIntensity={0.6}
          />
        </mesh>
        {/* dönen rün halkası */}
        <mesh
          ref={runes}
          position={[0, 1.52, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <torusGeometry args={[0.42, 0.045, 8, 20]} />
          <meshStandardMaterial
            color="#ffcf9a"
            emissive="#ff7a3c"
            emissiveIntensity={0.5}
            roughness={0.4}
            metalness={0.4}
          />
        </mesh>
        {/* ışıyan kristal baş */}
        <mesh ref={head} position={[0, 1.98, 0]} raycast={() => null}>
          <octahedronGeometry args={[0.28, 0]} />
          <meshStandardMaterial
            color={CRYSTAL}
            emissive={CRYSTAL}
            emissiveIntensity={1.4}
            roughness={0.22}
            metalness={0.25}
          />
        </mesh>
        {/* ateş yönünü gösteren namlu */}
        <mesh
          position={[0, 1.68, 0.42]}
          rotation={[Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <coneGeometry args={[0.11, 0.34, 6]} />
          <meshStandardMaterial
            color={CRYSTAL}
            emissive={CRYSTAL}
            emissiveIntensity={0.9}
            roughness={0.3}
            metalness={0.3}
          />
        </mesh>
      </group>
      {/* namlu ağzı parlaması */}
      <sprite ref={flash} position={[0, 1.68, 0.62]} raycast={() => null}>
        <spriteMaterial
          map={glowTex}
          color={CRYSTAL_CORE}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      {/* kaide ışığı: kule kendi tabanını yalar */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} raycast={() => null}>
        <ringGeometry args={[0.7, 0.92, 36]} />
        <meshBasicMaterial
          color={CRYSTAL}
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <TowerHpBar fill={fill} bar={bar} />
    </group>
  );
}

/**
 * Kule katmanı: sahne kule sistemini bağladığında çalışır (bkz. BattleScene →
 * configureTowers). Bağlı değilken hiçbir şey çizmez, kare maliyeti yoktur.
 */
export function DefenseTowerLayer() {
  const [towerIds, setTowerIds] = useState<readonly string[]>([]);
  const [, setSiteTick] = useState(0);
  const tries = useRef(0);

  useFrame((_, rawDt) => {
    if (!towerState.runtime) return;
    const dt = Math.min(rawDt, 1 / 20);

    // 1) Arsaları BİR KEZ, yürünebilir zemine snap'leyerek kur. Çarpışma
    //    ızgarası harita yüklenince hazır olur; o ana kadar beklenir.
    if (!towerState.sitesReady && tries.current < 400) {
      tries.current += 1;
      const snapped: { x: number; y: number }[] = [];
      let ready = true;
      for (const [ux, uy] of TOWER_SITE_UNITS) {
        const [px, py] = unitsToPx(ux, uy);
        const found = findNearestWalkablePosition(px, py, TOWER_BODY_R + 8);
        if (!found) {
          ready = false;
          break;
        }
        snapped.push({ x: found[0], y: found[1] });
      }
      if (ready) {
        setTowerSites(snapped);
        setSiteTick((n) => n + 1);
        console.log(
          `[towers] ${snapped.length} kule arsası hazır ` +
            `(satın alma menzili ${(TOWER_SITE_RADIUS_PX / S).toFixed(1)} birim, ` +
            `fiyat ${TOWER_COST})`,
        );
      }
    }

    // 2) Oyuncunun arsaya yakınlığı + kulelerin hedefleme/ateş döngüsü.
    updateTowerProximity();
    stepTowers(dt);

    // 3) React listesini yalnız kurulum/yıkım olduğunda tazele.
    if (towerIds.length !== towerState.towers.length) {
      setTowerIds(towerState.towers.map((t) => t.id));
    }
  });

  if (!towerState.runtime) return null;

  return (
    <group>
      {towerState.sites.map((site) => (
        <BuildPad key={site.id} site={site} />
      ))}
      {towerIds.map((id) => {
        const tower = towerState.towers.find((t) => t.id === id);
        return tower ? <TowerMesh key={id} tower={tower} /> : null;
      })}
    </group>
  );
}
