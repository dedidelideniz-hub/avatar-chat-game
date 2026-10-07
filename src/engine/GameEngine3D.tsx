/**
 * VAELOS 3D GAME ENGINE — Visual Polish Pass
 *
 * All positions, coordinates, zones, and dimensions are UNCHANGED.
 * This file only improves: materials, colors, lighting, detail geometry.
 */
import React, { useRef, useMemo, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import { GlbAvatarTest } from "./GlbAvatarTest";
import { GlbAvatar3D, SVG_DEBUG_MODE } from "./GlbAvatar3D";
import { cameraFraming, cameraOpenAmount } from "./cameraFraming";
// Eski saydamlaştırma (kamera occlusion) sistemi devre dışı bırakıldı —
// binaların arkasına girildiğinde artık kamera açısı otomatik açılıyor
// (bkz. `FollowCamera`). `BUILDING_USER_DATA` sadece binaları işaretleyen
// zararsız meta veri olarak kalıyor (sistem gerekirse yeniden açılabilir).
import { BUILDING_USER_DATA } from "./buildingOcclusion";
import { getBenchNear, requestBenchSit } from "./benchSeat";
import { STREET_MODELS } from "./streetPreload";
import {
  CanvasGuard,
  WebglContextKeeper,
  useWebglRetry,
} from "./WebglCanvas";
import { PROTECTED_PRIORITY, verifiedPowerPreference } from "./webglSupport";
import { hasCharacterSkin } from "./EquipmentRegistry";
import type { AvatarConfig } from "@/lib/avatar";
import { usePresenceOthers, type PresenceEntry } from "@/hooks/use-presence";
import {
  WORLD_WIDTH,
  WORLD_Z_MAX,
  SIDE_STREETS,
  SIDE_STREET_W,
  SIDE_STREET_SOUTH,
  CAMERA_ELEVATION,
  CAMERA_ZOOM,
  CAMERA_LERP_SPEED,
  CAMERA_OPEN_LERP_SPEED,
  SPAWN_SVG,
  ZONE,
  BUILDINGS,
  HOUSE_TRIGGER,
  WITCH_SHOP_DEF,
  LAMPS,
  BENCHES,
  BENCH_WIDTH,
  BENCH_BACK_OFFSET,
  BENCH_SEAT_DEPTH,
  BENCH_SEAT_TOP,
  benchFacing,
  benchSeatSpot,
  STALLS,
  S,
  type SeatState,
  type BuildingDef,
  type LampDef,
  type BenchDef,
  type StallDef,
} from "./constants";
import {
  LampGlowFx,
  RoofDetail,
  ShopAwning,
  StreetBusStops,
  StreetCrosswalks,
  StreetDirectionSigns,
  StreetFences,
  StreetTrashCans,
  useStreetGroundTextures,
} from "./StreetDetail";
import { makeSignTexture } from "./streetTextures";
// Çim zemin GLB karolarıyla döşenir — kodla çizilen çim düzlemi kaldırıldı.
import { GrassGround } from "./GrassGround";
// Yeşillik SADECE akçaağaç GLB'sinden (ağaç) ve çim öbeği GLB'sinden gelir:
// ilkel ağaç/çalı/çiçek geometrisi (küre top, kutu çit, mantar çiçek) kaldırıldı.
import { StreetGrassClumps, StreetTrees } from "./VegetationModels";
// Bina satırı artık prosedürel geometriyle DEĞİL, tek tek eklenen GLB
// modelleriyle kurulur (bkz. `constants.BUILDINGS` → `modelUrl`).
import { GlbBuilding } from "./GlbBuilding";
import {
  HOUSE_ENTER_LABEL,
  HOUSE_LOST_LABEL,
  getHouseNear,
  getHouseOwned,
  requestHouseEnter,
} from "./houseDoor";
// Cadı dükkânının görünen kapı yolu (yürünebilir şeritle aynı sınırlar).
import { WitchShopWalkway } from "./WitchShop";

/* ═══════════════════════════════════════════════════════════ */
/*  Helpers                                                    */
/* ═══════════════════════════════════════════════════════════ */

function sX(svgX: number): number {
  return svgX / S - WORLD_WIDTH / 2;
}
function sZ(svgY: number): number {
  return WORLD_Z_MAX - svgY / S;
}
/** Inverse: 3D X → SVG X */
function toSvgX(x3: number): number {
  return (x3 + WORLD_WIDTH / 2) * S;
}
/** Inverse: 3D Z → SVG Y */
function toSvgY(z3: number): number {
  return (WORLD_Z_MAX - z3) * S;
}

/* ═══════════════════════════════════════════════════════════ */
/*  Raycast API — exported for World.tsx click handling         */
/* ═══════════════════════════════════════════════════════════ */

let _engineCamera: THREE.PerspectiveCamera | null = null;
const _raycaster = new THREE.Raycaster();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _screenVec = new THREE.Vector2();

/** Convert screen pixel position to SVG world coordinates via 3D raycast.
 *  Call from World.tsx click handler: raycastScreenToSVG(e.clientX, e.clientY, containerEl)
 *  Returns null if the ray doesn't hit the ground. */
export function raycastScreenToSVG(
  clientX: number,
  clientY: number,
  container: HTMLElement,
): { x: number; y: number } | null {
  if (!_engineCamera) return null;
  const rect = container.getBoundingClientRect();
  // Normalized device coordinates (-1..+1)
  _screenVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _screenVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_screenVec, _engineCamera);
  const hit = new THREE.Vector3();
  const intersected = _raycaster.ray.intersectPlane(_groundPlane, hit);
  if (!intersected) return null;
  return { x: toSvgX(hit.x), y: toSvgY(hit.z) };
}

/** Convert SVG coordinates to 3D world coordinates.
 *  SVG X → 3D X, SVG Y → 3D Z, ground Y = 0. */
export function svgToWorld(svgX: number, svgY: number): { x: number; y: number; z: number } {
  return { x: svgX / S - WORLD_WIDTH / 2, y: 0, z: WORLD_Z_MAX - svgY / S };
}

/** Project a 3D world position to screen-space pixel coordinates.
 *  Returns null if the point is behind the camera. */
export function worldToScreen(
  worldX: number,
  worldY: number,
  worldZ: number,
  container: HTMLElement,
): { sx: number; sy: number } | null {
  if (!_engineCamera) return null;
  const vec = new THREE.Vector3(worldX, worldY, worldZ);
  vec.project(_engineCamera);
  const rect = container.getBoundingClientRect();
  return {
    sx: ((vec.x + 1) / 2) * rect.width,
    sy: ((-vec.y + 1) / 2) * rect.height,
  };
}



/* ═══════════════════════════════════════════════════════════ */
/*  Follow Camera                                             */
/* ═══════════════════════════════════════════════════════════ */

function FollowCamera({ posRef }: { posRef: React.RefObject<{ x: number; y: number }> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  // Expose camera for raycastScreenToSVG
  React.useEffect(() => { _engineCamera = camera; return () => { _engineCamera = null; }; }, [camera]);
  const target = useRef(new THREE.Vector3());
  const cur = useRef(new THREE.Vector3(sX(SPAWN_SVG.x), 0, sZ(SPAWN_SVG.y)));
  // 0 = cadde kamerası, 1 = tam açık (bina arkası / üst sokak) kamerası.
  const open = useRef(0);

  useFrame((_, dt) => {
    const p = posRef.current;
    const tx = p.x / S - WORLD_WIDTH / 2;
    const tz = WORLD_Z_MAX - p.y / S;
    target.current.set(tx, 0, tz);
    const lerp = Math.min(1, CAMERA_LERP_SPEED * dt);
    cur.current.lerp(target.current, lerp);

    // Oyuncu dükkan sırasının arkasına / üst sokağa girdikçe görüş açısını
    // otomatik aç: kamera daha dik (top-down) ve biraz daha yukarı taşınır.
    // Yumuşatılmış `cur` konumundan hesaplanır ki geçiş kamera takibiyle
    // birlikte pürüzsüz olsun; açı/yükseklik ayrıca yavaşça lerp edilir.
    const want = cameraOpenAmount(cur.current.z);
    open.current += (want - open.current) * Math.min(1, CAMERA_OPEN_LERP_SPEED * dt);
    const { elevation: el, zoom: d } = cameraFraming(open.current);

    camera.position.set(
      cur.current.x,
      cur.current.y + Math.sin(el) * d,
      cur.current.z + Math.cos(el) * d,
    );
    camera.lookAt(cur.current.x, 0, cur.current.z);
  });

  return null;
}

/* ═══════════════════════════════════════════════════════════ */
/*  Ground — polished zones with road detail                   */
/* ═══════════════════════════════════════════════════════════ */

function Ground() {
  const roadMid = (ZONE.roadTop + ZONE.roadBot) / 2;
  const roadW = ZONE.roadBot - ZONE.roadTop;

  // Kaldırım taşı + asfalt dokusu (tek kez üretilir, paylaşılır).
  // Çim zemini doku değil, GLB karosudur → `<GrassGround />`.
  const { pavement, asphalt } = useStreetGroundTextures();

  // Arka cadde ve dikey sokaklar ana caddeden ÇOK farklı oranlarda (kısa/geniş
  // yerine uzun/dar) → paylaşılan dokunun `repeat`i onlara uymaz. Görüntü
  // paylaşılır, döşeme ayarı klonlarda ayrı tutulur (2 ek doku, doku 2×2 birim).
  const backAsphalt = useMemo(() => {
    const t = asphalt.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(WORLD_WIDTH / 2, (ZONE.backRoadTop - ZONE.backRoadBot) / 2);
    t.needsUpdate = true;
    return t;
  }, [asphalt]);
  const sideAsphalt = useMemo(() => {
    const t = asphalt.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(SIDE_STREET_W / 2, (SIDE_STREET_SOUTH - ZONE.backNorthWalkTop) / 2);
    t.needsUpdate = true;
    return t;
  }, [asphalt]);

  // Subtle road dashes for pedestrian walkway feel
  const dashes = useMemo(() => {
    const arr: number[] = [];
    for (let x = -14; x <= 14; x += 1.6) arr.push(x);
    return arr;
  }, []);

  return (
    <group>
      {/* ÇİM ZEMİN — `public/models/grass_ground.glb` karolarıyla döşenir
          (kodla çizilen düz/satranç dokulu çim düzlemleri kaldırıldı). Taban
          `GRASS_GROUND_Y` = 0, yani yol (0.008) ve kaldırımın (0.005) hemen
          altında kalır; propların tabanı da aynı seviyede olduğu için
          hiçbiri havada durmaz / zemine gömülmez. */}
      <GrassGround />

      {/* North sidewalk — warm stone (kaldırım taşı dokusu).
          `map` ile `color` ÇARPILIR; renk dokunun kendi tonunu bozmasın diye
          çarpan beyaz bırakılır (doku zaten sıcak taş renginde üretildi). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, (ZONE.northSidewalkTop + ZONE.northSidewalkBot) / 2]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH, ZONE.northSidewalkBot - ZONE.northSidewalkTop]} />
        <meshStandardMaterial color="#ffffff" roughness={0.92} map={pavement} />
      </mesh>

      {/* Road surface — asfalt dokusu */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, roadMid]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH, roadW]} />
        <meshStandardMaterial color="#ffffff" roughness={0.95} map={asphalt} />
      </mesh>

      {/* Road dashes — pedestrian lane markers */}
      {dashes.map((dx) => (
        <mesh key={dx} rotation={[-Math.PI / 2, 0, 0]} position={[dx, 0.012, roadMid]}>
          <planeGeometry args={[0.6, 0.06]} />
          <meshStandardMaterial color="#bfb5a3" roughness={0.9} />
        </mesh>
      ))}

      {/* South sidewalk — warm stone (kaldırım taşı dokusu) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, (ZONE.southSidewalkTop + ZONE.southSidewalkBot) / 2]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH, ZONE.southSidewalkBot - ZONE.southSidewalkTop]} />
        <meshStandardMaterial color="#ffffff" roughness={0.92} map={pavement} />
      </mesh>

      {/* ═══ ARKA SOKAK (binaların arkası) ═══
          Dükkan sırasının kuzeyinde ikinci bir cadde: arka kaldırım + asfalt +
          karşı kaldırım. Sınır çitleri ve yürünebilir bantlar `ZONE.back*`. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, (ZONE.backWalkTop + ZONE.backWalkBot) / 2]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH, ZONE.backWalkTop - ZONE.backWalkBot]} />
        <meshStandardMaterial color="#ffffff" roughness={0.92} map={pavement} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, (ZONE.backRoadTop + ZONE.backRoadBot) / 2]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH, ZONE.backRoadTop - ZONE.backRoadBot]} />
        <meshStandardMaterial color="#ffffff" roughness={0.95} map={backAsphalt} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, (ZONE.backNorthWalkTop + ZONE.backNorthWalkBot) / 2]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH, ZONE.backNorthWalkTop - ZONE.backNorthWalkBot]} />
        <meshStandardMaterial color="#ffffff" roughness={0.92} map={pavement} />
      </mesh>

      {/* ═══ DİKEY ARA SOKAKLAR ═══
          Ana caddeyi kuzey-güney yönünde keser, dükkan bloklarının arasından
          geçip arka caddeye ulaşır (güneyde +4.0'a kadar uzanan ağız). */}
      {SIDE_STREETS.map((x) => (
        <mesh
          key={`side-${x}`}
          rotation={[-Math.PI / 2, 0, 0]}
          // 0.009: ana cadde ve arka cadde 0.008'de; aynı düzlemde çakışıp
          // z-fighting yapmasınlar diye ara sokak bir tık üstte.
          position={[x, 0.009, (SIDE_STREET_SOUTH + ZONE.backNorthWalkTop) / 2]}
          receiveShadow
        >
          <planeGeometry args={[SIDE_STREET_W, SIDE_STREET_SOUTH - ZONE.backNorthWalkTop]} />
          <meshStandardMaterial color="#ffffff" roughness={0.95} map={sideAsphalt} />
        </mesh>
      ))}

      {/* ═══ Curbs ═══ */}
      {/* North sidewalk → road curb */}
      <mesh position={[0, 0.05, ZONE.northSidewalkBot]}>
        <boxGeometry args={[WORLD_WIDTH, 0.1, 0.12]} />
        <meshStandardMaterial color="#b5ad98" roughness={0.88} />
      </mesh>
      {/* Road → south sidewalk curb */}
      <mesh position={[0, 0.05, ZONE.southSidewalkTop]}>
        <boxGeometry args={[WORLD_WIDTH, 0.1, 0.12]} />
        <meshStandardMaterial color="#b5ad98" roughness={0.88} />
      </mesh>

      {/* ═══ Central plaza circle ═══ */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, roadMid]}>
        <circleGeometry args={[1.3, 32]} />
        <meshStandardMaterial color="#c8bca4" roughness={0.85} />
      </mesh>
      {/* Plaza inner ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, roadMid]}>
        <ringGeometry args={[0.8, 0.85, 32]} />
        <meshStandardMaterial color="#a89880" roughness={0.88} />
      </mesh>
      {/* Plaza center dot */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, roadMid]}>
        <circleGeometry args={[0.25, 16]} />
        <meshStandardMaterial color="#b8a890" roughness={0.82} />
      </mesh>

      {/* ═══ Yaya geçidi şeritleri (asfalt üzerine) ═══ */}
      <StreetCrosswalks />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Building — polished with ledges, awnings, window frames   */
/* ═══════════════════════════════════════════════════════════ */

/**
 * ESKİ PROSEDÜREL BİNA — şu an ÇİZİLMİYOR.
 *
 * Bina satırı artık GLB modelleriyle kurulur (`GlbBuilding`): gözler boştur ve
 * `constants.BUILDINGS` içindeki `modelUrl` alanı dolduruldukça dikilir.
 * Bu bileşen silinmedi çünkü göz tanımları (renk/pencere/tabela/tente) hâlâ
 * orada duruyor ve bir binayı ilkel geometriyle geri koymak gerekirse tek
 * satırla kullanılabilir. Kullanılmadığı için hiçbir maliyeti yoktur.
 */
function Building({ def }: { def: BuildingDef }) {
  const storyH = def.h / def.floors;
  const winW = Math.min(0.38, ((def.w - 0.6) / def.windows) * 0.52);
  const winH = storyH * 0.32;

  // Zemin kat pencereleri dünya yüksekliği 0.69·storyH'de başlar (aşağıdaki
  // pencere formülünden). Tente onun hemen altına, tabela ise zemin kat ile
  // 1. kat pencereleri ARASINDAKİ boşluğa (1.35·storyH) oturtulur — böylece
  // hiçbir binada pano pencereyi kapatmaz.
  const awningY = Math.min(0.95, 0.69 * storyH - 0.12);
  const signY = 1.35 * storyH;

  // Alternate facade material colors for visual variety
  const facadeMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({ color: def.front, roughness: 0.82 });
  }, [def.front]);
  const sideMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({ color: def.side, roughness: 0.88 });
  }, [def.side]);
  const roofMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({ color: def.roof, roughness: 0.75 });
  }, [def.roof]);

  // Pencere materyalleri PAYLAŞILIR (pencere başına yeni materyal üretilmez):
  // sönük cam + yanan sıcak cam. "Pencerelerde parıltı" böylece toplam
  // materyal sayısını artırmaz (shader derleme maliyeti sabit kalır).
  const { sillMat, glassMat, glassLitMat, frameMat, litSeed } = useMemo(() => {
    const seed = Math.round((def.x + 20) * 13) + def.floors * 3;
    return {
      frameMat: new THREE.MeshStandardMaterial({ color: "#e8e4dc", roughness: 0.7 }),
      sillMat: new THREE.MeshStandardMaterial({ color: "#d8d0c0", roughness: 0.8 }),
      glassMat: new THREE.MeshStandardMaterial({
        color: "#5cc8f0",
        roughness: 0.2,
        metalness: 0.15,
        emissive: "#183848",
        emissiveIntensity: 0.15,
      }),
      glassLitMat: new THREE.MeshStandardMaterial({
        color: "#ffd98a",
        roughness: 0.35,
        metalness: 0.05,
        emissive: "#ffc061",
        emissiveIntensity: 0.8,
      }),
      litSeed: seed,
    };
  }, [def.x, def.floors]);

  // Vitrin tabelası — dükkan adı renkli panoya yazılır ve hafifçe parlar.
  const signFaceMat = useMemo(() => {
    if (!def.signText) return null;
    const tex = makeSignTexture(def.signText, def.signBg ?? "#ffffff", def.signFg ?? "#2b2320");
    return new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: "#ffffff",
      emissiveIntensity: 0.34,
      roughness: 0.62,
    });
  }, [def.signText, def.signBg, def.signFg]);

  return (
    // `BUILDING_USER_DATA`: bu grubun bir bina olduğunu işaretleyen meta veri
    // (saydamlaştırma kapalı; sadece ileride gerekirse kullanılır).
    <group position={[def.x, def.h / 2, def.frontZ - def.d / 2]} userData={BUILDING_USER_DATA}>
      {/* Main body */}
      <mesh material={facadeMat} castShadow receiveShadow>
        <boxGeometry args={[def.w, def.h, def.d]} />
      </mesh>

      {/* Side face — darker */}
      <mesh position={[def.w / 2 + 0.005, 0, 0]} material={sideMat}>
        <planeGeometry args={[def.d, def.h]} />
      </mesh>

      {/* ═══ Roof — textured slab with slight overhang ═══ */}
      <mesh position={[0, def.h / 2 + 0.06, 0]} material={roofMat} castShadow>
        <boxGeometry args={[def.w + 0.18, 0.14, def.d + 0.18]} />
      </mesh>
      {/* Roof edge trim */}
      <mesh position={[0, def.h / 2 + 0.14, 0]}>
        <boxGeometry args={[def.w + 0.22, 0.04, def.d + 0.22]} />
        <meshStandardMaterial color="#e0dcd4" roughness={0.7} />
      </mesh>

      {/* ═══ Front ledge — architectural detail ═══ */}
      <mesh position={[0, -def.h / 2 + 0.08, def.d / 2 + 0.02]}>
        <boxGeometry args={[def.w + 0.08, 0.16, 0.06]} />
        <meshStandardMaterial color="#d8d0c0" roughness={0.8} />
      </mesh>

      {/* ═══ Door ═══ */}
      {/* Door frame */}
      <mesh position={[0, -def.h / 2 + 0.4, def.d / 2 + 0.015]}>
        <boxGeometry args={[0.52, 0.82, 0.03]} />
        <meshStandardMaterial color="#7a5838" roughness={0.85} />
      </mesh>
      {/* Door panel */}
      <mesh position={[0, -def.h / 2 + 0.38, def.d / 2 + 0.035]}>
        <planeGeometry args={[0.4, 0.7]} />
        <meshStandardMaterial color="#5c3820" roughness={0.88} />
      </mesh>
      {/* Door handle */}
      <mesh position={[0.12, -def.h / 2 + 0.38, def.d / 2 + 0.05]}>
        <sphereGeometry args={[0.025, 6, 6]} />
        <meshStandardMaterial color="#d4a840" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* ═══ Windows — with frames; bir kısmı sıcak ışıkla yanar ═══ */}
      {Array.from({ length: def.floors }).map((_, floor) =>
        Array.from({ length: def.windows }).map((_, win) => {
          const wx = -def.w / 2 + (win + 1) * (def.w / (def.windows + 1));
          const wy = -def.h / 2 + (floor + 1) * storyH - storyH * 0.15;
          const lit = (floor * 3 + win * 5 + litSeed) % 4 === 0;
          return (
            <group key={`${floor}-${win}`} position={[wx, wy, def.d / 2 + 0.01]}>
              {/* Window frame */}
              <mesh position={[0, 0, -0.005]} material={frameMat}>
                <boxGeometry args={[winW + 0.06, winH + 0.06, 0.02]} />
              </mesh>
              {/* Glass pane — sönük ya da sıcak ışıklı */}
              <mesh position={[0, 0, 0.005]} material={lit ? glassLitMat : glassMat}>
                <planeGeometry args={[winW, winH]} />
              </mesh>
              {/* Window sill */}
              <mesh position={[0, -winH / 2 - 0.02, 0.02]} material={sillMat}>
                <boxGeometry args={[winW + 0.1, 0.04, 0.06]} />
              </mesh>
            </group>
          );
        })
      )}

      {/* ═══ Dükkan tentesi — canlı renkli branda ═══ */}
      {def.awningA && def.awningB && (
        <ShopAwning
          x={0}
          y={-def.h / 2 + awningY}
          z={def.d / 2 + 0.01}
          width={def.w}
          colorA={def.awningA}
          colorB={def.awningB}
        />
      )}

      {/* ═══ Vitrin tabelası — renkli pano + dükkan adı ═══ */}
      {signFaceMat && (
        <group position={[0, -def.h / 2 + signY, def.d / 2 + 0.03]}>
          {/* Pano gövdesi (çerçeve) */}
          <mesh>
            <boxGeometry args={[def.w * 0.7, 0.32, 0.04]} />
            <meshStandardMaterial color="#3a2c1e" roughness={0.82} />
          </mesh>
          {/* Yazı yüzü */}
          <mesh position={[0, 0, 0.026]} material={signFaceMat}>
            <planeGeometry args={[def.w * 0.64, 0.26]} />
          </mesh>
        </group>
      )}

      {/* ═══ Çatı detayı — dükkan silüetine canlılık ═══ */}
      <RoofDetail kind={def.roofDetail} w={def.w} d={def.d} topY={def.h / 2 + 0.15} />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Lamp Post                                                  */
/* ═══════════════════════════════════════════════════════════ */

function Lamp3D({ def }: { def: LampDef }) {
  return (
    <group position={[def.x, 0, def.z]}>
      {/* Base plate */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.06, 8]} />
        <meshStandardMaterial color="#3a3a40" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Pole */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 1.75, 6]} />
        <meshStandardMaterial color="#4a4a52" roughness={0.55} metalness={0.3} />
      </mesh>
      {/* Arm bracket */}
      <mesh position={[0.1, 1.72, 0]} rotation={[0, 0, -0.35]}>
        <cylinderGeometry args={[0.018, 0.018, 0.28, 4]} />
        <meshStandardMaterial color="#4a4a52" roughness={0.55} metalness={0.3} />
      </mesh>
      {/* Lamp housing */}
      <mesh position={[0.18, 1.68, 0]}>
        <boxGeometry args={[0.12, 0.1, 0.1]} />
        <meshStandardMaterial color="#3a3a40" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Light globe — warm glow */}
      <mesh position={[0.18, 1.62, 0]}>
        <sphereGeometry args={[0.065, 8, 8]} />
        <meshStandardMaterial color="#fff8d4" emissive="#ffe870" emissiveIntensity={0.8} roughness={0.15} />
      </mesh>
      {/* Ampul halesi + zemine düşen ışık havuzu. Gerçek PointLight EKLENMEZ:
          ışık sayısı değişirse three tüm shader'ları yeniden derler. */}
      <LampGlowFx />
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Bench                                                      */
/* ═══════════════════════════════════════════════════════════ */

const BENCH_WOOD = "#c89153";
const BENCH_METAL = "#4a4a52";

/**
 * 🪑 PARK BANKI — ölçüler `constants.ts`te (BENCH_*) tanımlıdır.
 *
 * NEDEN BU KADAR BÜYÜK: oyuncu 1.92 birim boyunda. Eski bank 0.55 × 0.24
 * birimdi (insan ölçeğinde ~0.55 m geniş, 0.24 m yüksek bank) ve karakterin
 * arkasında tamamen kayboluyordu — "bankta oturuyor" okunmuyordu. Yeni
 * ölçüler yetişkin bir park bankı: 1.5 birim en, 0.46 birim oturma
 * yüksekliği. 3 oturma çıtası + 2 arkalık çıtası + metal yan ayaklar.
 */
function Bench3D({ def }: { def: BenchDef }) {
  const seatY = BENCH_SEAT_TOP;
  // Arkalık, oturma yüzeyinin ARKASINDA durur (`BENCH_BACK_OFFSET`): oturan
  // karakterin sırtı arkalığa yaslandığında çıtaların içine girmesin.
  const backZ = -BENCH_BACK_OFFSET;
  const postZ = backZ - 0.06;
  return (
    // `facing: -1` olan banklar 180° döner — sırtı duvara bakan banklarda
    // oturan karakterin bacakları duvarın içine girmesin diye (bkz. BENCHES).
    <group
      position={[def.x, 0, def.z]}
      rotation={[0, benchFacing(def) === -1 ? Math.PI : 0, 0]}
    >
      {/* Oturma çıtaları (4) — tıknaz avatarların altında görünür kalsın */}
      {[-0.21, -0.07, 0.07, 0.21].map((sz) => (
        <mesh key={`s${sz}`} position={[0, seatY - 0.03, sz]} castShadow receiveShadow>
          <boxGeometry args={[BENCH_WIDTH, 0.06, 0.13]} />
          <meshStandardMaterial color={BENCH_WOOD} roughness={0.78} />
        </mesh>
      ))}
      {/* Arkalık çıtaları (2) */}
      {[0, 1].map((i) => (
        <mesh
          key={`b${i}`}
          position={[0, seatY + 0.16 + i * 0.18, backZ]}
          castShadow
        >
          <boxGeometry args={[BENCH_WIDTH, 0.13, 0.06]} />
          <meshStandardMaterial color={BENCH_WOOD} roughness={0.78} />
        </mesh>
      ))}
      {/* Metal yan ayaklar: ön ayak + arkalık direği (arkalığın en üstüne kadar) */}
      {[-1, 1].map((side) => {
        const lx = side * (BENCH_WIDTH / 2 - 0.12);
        return (
          <group key={side} position={[lx, 0, 0]}>
            <mesh position={[0, seatY / 2 - 0.03, 0.19]} castShadow>
              <boxGeometry args={[0.07, seatY - 0.06, 0.07]} />
              <meshStandardMaterial color={BENCH_METAL} roughness={0.55} metalness={0.3} />
            </mesh>
            {/* Arkalık direği — arkalığın EN ÜST çıtasına kadar yükselir. */}
            <mesh
              position={[0, (seatY + 0.37) / 2, postZ]}
              castShadow
            >
              <boxGeometry args={[0.07, seatY + 0.37, 0.07]} />
              <meshStandardMaterial color={BENCH_METAL} roughness={0.55} metalness={0.3} />
            </mesh>
            {/* Oturma çıtalarını taşıyan yan kasa */}
            <mesh position={[0, seatY - 0.09, 0]} castShadow>
              <boxGeometry args={[0.06, 0.06, BENCH_SEAT_DEPTH - 0.06]} />
              <meshStandardMaterial color={BENCH_METAL} roughness={0.55} metalness={0.3} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  🪑 Oturma düğmesi — menzildeki bankın üstünde                 */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Oyuncu bir bankın menziline girdiğinde o bankın üzerinde beliren "Otur"
 * düğmesi. Tıklama yalnızca `benchSeat` deposuna istek bırakır; oyun döngüsü
 * (World.tsx) isteği bir sonraki karede tüketip karakteri oturtur — böylece
 * 3D katman ile oyun mantığı React prop'u paylaşmaz.
 *
 * Konum depodan hesaplandığı ve yalnızca bank dizini değiştiğinde React
 * state'i yazıldığı için kare başına re-render olmaz.
 */
function BenchSitButton() {
  const [benchIndex, setBenchIndex] = useState<number | null>(null);
  const shownRef = useRef<number | null>(null);

  useFrame(() => {
    const near = getBenchNear();
    if (near === shownRef.current) return;
    shownRef.current = near;
    setBenchIndex(near);
  });

  if (benchIndex === null) return null;
  const spot = benchSeatSpot(BENCHES[benchIndex]);

  return (
    <Html
      center
      distanceFactor={9}
      position={[spot.x, 0.98, spot.z]}
      zIndexRange={[30, 20]}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => requestBenchSit()}
        style={{ pointerEvents: "auto" }}
        className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-white bg-gradient-to-r from-emerald-500 to-teal-600 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-lg transition-transform active:scale-95"
      >
        🪑 Otur
      </button>
    </Html>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  🏠 Ev kapısı düğmesi — evin kapısının önünde               */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Oyuncu evin kapı menziline girdiğinde kapının önünde beliren düğme.
 *
 * Tıklama yalnızca `houseDoor` deposuna istek bırakır; oyun döngüsü (World.tsx)
 * isteği bir sonraki karede tüketip odaya girişi başlatır (yükleme ekranı +
 * oda) — böylece 3D katman ile oyun mantığı React prop'u paylaşmaz (bank
 * "Otur" düğmesiyle aynı desen).
 *
 * Kapı caddede TEK'tir: oda her oyuncuya özel olduğu için düğme de herkese
 * "Evine gir" der (bkz. `houseDoor.HOUSE_ENTER_LABEL`).
 */
function HouseEnterButton() {
  const [near, setNear] = useState(false);
  const [owned, setOwned] = useState(true);
  const shownNear = useRef(false);
  const shownOwned = useRef(true);

  useFrame(() => {
    const value = getHouseNear();
    const canEnter = getHouseOwned();
    if (value === shownNear.current && canEnter === shownOwned.current) return;
    shownNear.current = value;
    shownOwned.current = canEnter;
    setNear(value);
    setOwned(canEnter);
  });

  if (!near) return null;

  // 🏚️ EV YOK: evini kaybeden oyuncuda kapı yeşil "Evine gir" DEMEZ — aksi
  // halde sunucu reddeder ve ham hata görünürdü. Düğme soluk/kilitli durur ve
  // tıklama aynı isteği bırakır; oyun döngüsü nazikçe yol gösterir.
  const label = owned ? HOUSE_ENTER_LABEL : HOUSE_LOST_LABEL;

  return (
    <Html
      center
      distanceFactor={9}
      position={[
        WITCH_SHOP_DEF.x,
        1.15,
        (HOUSE_TRIGGER.southZ + HOUSE_TRIGGER.northZ) / 2,
      ]}
      zIndexRange={[30, 20]}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => requestHouseEnter()}
        style={{ pointerEvents: "auto" }}
        className={
          owned
            ? "flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-white bg-gradient-to-r from-emerald-500 to-teal-600 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-lg transition-transform active:scale-95"
            : "flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-white bg-gradient-to-r from-slate-500 to-slate-700 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-lg transition-transform active:scale-95"
        }
      >
        {label.emoji} {owned ? label.label : "Ev yok · düello kazan"}
      </button>
    </Html>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Stall — vendor market stall                                */
/* ═══════════════════════════════════════════════════════════ */

function Stall3D({ def }: { def: StallDef }) {
  const isWeaponStall = def.color === "#b91c1c"; // Silahçı unique look
  return (
    <group position={[def.x, 0, def.z]}>
      {/* Table surface — dark wood */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.08, 0.5]} />
        <meshStandardMaterial color={isWeaponStall ? "#5c3018" : "#7a5838"} roughness={0.85} />
      </mesh>
      {/* Table edge trim */}
      <mesh position={[0, 0.395, 0.25]}>
        <boxGeometry args={[1.4, 0.02, 0.02]} />
        <meshStandardMaterial color="#a08060" roughness={0.8} />
      </mesh>
      {/* Table legs — dark wood */}
      {[-0.55, 0.55].map((lx) =>
        [-0.15, 0.15].map((lz) => (
          <mesh key={`${lx}-${lz}`} position={[lx, 0.17, lz]}>
            <boxGeometry args={[0.06, 0.34, 0.06]} />
            <meshStandardMaterial color="#5c3820" roughness={0.9} />
          </mesh>
        ))
      )}
      {/* Awning — striped fabric (compact, low tilt) */}
      <mesh position={[0, 0.78, -0.15]} rotation={[0.15, 0, 0]} castShadow>
        <boxGeometry args={[1.5, 0.04, 0.6]} />
        <meshStandardMaterial color={def.color} roughness={0.7} />
      </mesh>
      {/* Awning underside — darker */}
      <mesh position={[0, 0.76, -0.14]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[1.46, 0.02, 0.56]} />
        <meshStandardMaterial color={def.accent} roughness={0.75} />
      </mesh>
      {/* Support poles — dark wood */}
      {[-0.6, 0.6].map((lx) => (
        <mesh key={lx} position={[lx, 0.55, -0.3]}>
          <cylinderGeometry args={[0.022, 0.022, 0.85, 4]} />
          <meshStandardMaterial color="#5c3820" roughness={0.9} />
        </mesh>
      ))}
      {/* Items on table — per-stall themed goods */}
      {isWeaponStall ? (
        // Weapon stall: sword, shield, helmet display
        <>
          {/* Sword on table */}
          <mesh position={[-0.35, 0.42, 0]} rotation={[0, 0, Math.PI / 2]}
            castShadow>
            <boxGeometry args={[0.02, 0.3, 0.008]} />
            <meshStandardMaterial color="#cfd6dd" metalness={0.7} roughness={0.25} />
          </mesh>
          {/* Shield on table */}
          <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.015, 16]} />
            <meshStandardMaterial color="#3f6fd0" metalness={0.3} roughness={0.45} />
          </mesh>
          {/* Helmet on table */}
          <mesh position={[0.35, 0.42, 0]}>
            <sphereGeometry args={[0.055, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#8a8a8a" metalness={0.5} roughness={0.4} />
          </mesh>
        </>
      ) : (
        // Default: colorful goods
        [-0.35, 0, 0.35].map((ix, i) => (
          <mesh key={i} position={[ix, 0.42, 0]}>
            <sphereGeometry args={[0.06, 6, 6]} />
            <meshStandardMaterial color={i === 0 ? "#ff6b6b" : i === 1 ? "#4ecdc4" : "#ffe66d"} roughness={0.7} />
          </mesh>
        ))
      )}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Move Target Marker                                         */
/* ═══════════════════════════════════════════════════════════ */

function MoveTarget3D({ target }: { target: { x: number; y: number } | null }) {
  if (!target) return null;
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useFrame((_, dt) => {
    timeRef.current += dt;
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + Math.sin(timeRef.current * 3) * 0.15;
    }
    if (ringRef.current) {
      const s = 1 + Math.sin(timeRef.current * 2.5) * 0.15;
      ringRef.current.scale.set(s, s, s);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.25 + Math.sin(timeRef.current * 2.5) * 0.1;
    }
  });

  return (
    <group position={[sX(target.x), 0.01, sZ(target.y)]}>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.22, 20]} />
        <meshBasicMaterial color="#ff6b4a" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[0.28, 0.32, 20]} />
        <meshBasicMaterial color="#ff9060" transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Player Avatar3D                                            */
/* ═══════════════════════════════════════════════════════════ */

/** Normal gameplay: real 3D GLB avatar (skeleton + animations). ?svg=1 restores legacy SVG. */
function PlayerAvatar3D({
  posRef, config, equipped, facingRef, seat, speech, speechName, speechColorId,
}: {
  posRef: React.RefObject<{ x: number; y: number }>;
  config: AvatarConfig;
  equipped: string[];
  facingRef: React.RefObject<number>;
  seat?: SeatState | null;
  /** Baş üstündeki sohbet baloncuğu metni (bkz. ChatBubble3D). */
  speech?: string | null;
  /** Baloncukta yazan gönderen adı. */
  speechName?: string;
  /** Baloncuk rengi (`BUBBLE_COLORS` id'si). */
  speechColorId?: string;
}) {
  if (SVG_DEBUG_MODE) {
    return <SvgPlayerAvatar3D posRef={posRef} config={config} equipped={equipped} facingRef={facingRef} />;
  }
  // Oyuncunun oyun girişinde seçtiği renk karakterin dokusuna boyanır — ama
  // YALNIZCA varsayılan görünümde: tam karakter skini (Kraliyet Savaşçısı /
  // Samuray / Şövalye) kuşanılmışsa model orijinal renklerini korur.
  return (
    <GlbAvatar3D
      posRef={posRef}
      facingRef={facingRef}
      equipped={equipped}
      tint={hasCharacterSkin(equipped) ? undefined : config.shirt}
      seat={seat}
      // Yerel oyuncu oturma durumunu px katmanının deposundan okur; botlar
      // ve uzak oyuncular bu bayrağı almaz (birlikte oturmasınlar).
      readSeatStore
      speech={speech}
      speechName={speechName}
      speechColorId={speechColorId}
    />
  );
}

/** Legacy SVG avatar (debug only — ?svg=1). */
function SvgPlayerAvatar3D({
  posRef, config, equipped, facingRef,
}: {
  posRef: React.RefObject<{ x: number; y: number }>;
  config: AvatarConfig;
  equipped: string[];
  facingRef: React.RefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const divRef = useRef<HTMLDivElement>(null);
  const smoothPos = useRef({ x: 0, y: 0 });
  const isWalking = useRef(false);

  useFrame((_, dt) => {
    if (!groupRef.current || !posRef.current) return;
    const p = posRef.current;
    // Smooth interpolation toward target position
    const lerpFactor = Math.min(1, 14 * dt);
    smoothPos.current.x += (p.x - smoothPos.current.x) * lerpFactor;
    smoothPos.current.y += (p.y - smoothPos.current.y) * lerpFactor;
    groupRef.current.position.set(
      smoothPos.current.x / S - WORLD_WIDTH / 2,
      0.02,
      WORLD_Z_MAX - smoothPos.current.y / S,
    );
    const dx = Math.abs(p.x - smoothPos.current.x);
    const dy = Math.abs(p.y - smoothPos.current.y);
    const moving = dx > 0.3 || dy > 0.3;
    if (moving !== isWalking.current && divRef.current) {
      isWalking.current = moving;
      divRef.current.classList.toggle("walking", moving);
    }
    if (divRef.current) {
      divRef.current.style.transform = `scaleX(${(facingRef.current ?? 1) < 0 ? -1 : 1})`;
    }
  });

  return (
    <group ref={groupRef}>
      <Html center distanceFactor={10} style={{ pointerEvents: "none", transform: "translateY(-50%)" }} zIndexRange={[10, 0]}>
        <div
          ref={divRef}
          style={{
            position: "relative",
            width: 70,
            height: 96,
            transform: `scaleX(${(facingRef.current ?? 1) < 0 ? -1 : 1})`,
            transformOrigin: "center bottom",
          }}
        >
          <AvatarPreview width={70} height={96} config={config} equipped={equipped} />
          <EquippedItems equipped={equipped} width={70} height={96} className="absolute inset-0 pointer-events-none" />
        </div>
      </Html>
    </group>
  );
}

interface StreetPresence {
  name: string;
  config: AvatarConfig;
  equipped: string[];
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  vy?: number;
  inBattle?: boolean;
  /** Baş üstü sohbet baloncuğu metni (varlık yayınından gelir). */
  speech?: string | null;
}

function RemoteAvatar3D({ entry, onSelect }: { entry: PresenceEntry<StreetPresence>; onSelect: (entry: PresenceEntry<StreetPresence>) => void }) {
  const data = entry.data;
  const posRef = useRef({ x: data?.x ?? 0, y: data?.y ?? 0 });
  const facingRef = useRef(data?.facing ?? 1);
  if (!data) return null;
  posRef.current.x = data.x;
  posRef.current.y = data.y;
  facingRef.current = data.facing || 1;
  // GlbAvatar3D positions itself every frame from posRef (sp.x/S - WORLD_WIDTH/2,
  // ... same as sX/sZ here), so it must be rendered DIRECTLY in scene space. Wrapping
  // it in a positioned <group> double-translates the avatar and pushes it off-screen.
  // Only the invisible click-hit cylinder belongs in the positioned group.
  return (
    <>
      <group
        position={[data.x / S - WORLD_WIDTH / 2, 0, WORLD_Z_MAX - data.y / S]}
        onClick={(event) => { event.stopPropagation(); onSelect(entry); }}
        onPointerDown={(event) => { event.stopPropagation(); onSelect(entry); }}
      >
        <mesh position={[0, 0.9, 0]} raycast={() => null}>
          <cylinderGeometry args={[0.42, 0.42, 1.8, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <GlbAvatar3D
        posRef={posRef}
        facingRef={facingRef}
        equipped={data.equipped ?? []}
        lerpSpeed={12}
        // Karşı oyuncu da kendi rengini giyer; ama skini varsa orijinal kalır.
        tint={
          hasCharacterSkin(data.equipped)
            ? undefined
            : data.config?.shirt
        }
        // 💬 Karşı oyuncunun sohbet baloncuğu — kendi seçtiği balon rengiyle
        // (VIP renkleri dahil) varlık yayını üzerinden gelir.
        speech={data.speech ?? null}
        speechName={data.name}
      />
    </>
  );
}

function StreetRemotePlayers({ sessionId, onSelect }: { sessionId: string; onSelect?: (entry: PresenceEntry<StreetPresence>) => void }) {
  const { others } = usePresenceOthers<StreetPresence>("world", sessionId);
  return <>{others.filter((entry) => entry.data && !entry.data.inBattle).map((entry) => <RemoteAvatar3D key={entry.sessionId} entry={entry} onSelect={onSelect ?? (() => {})} />)}</>;
}

/* ═══════════════════════════════════════════════════════════ */
/*  Bot Avatar3D                                               */
/* ═══════════════════════════════════════════════════════════ */

/** Bot/Vendor avatar that reads its position from a shared ref every frame.
 *  This avoids stale props — the ref is mutated by the game loop and read
 *  directly in useFrame, so positions update without React re-renders. */
function BotAvatar3D({
  index,
  botsDataRef,
  speech,
}: {
  index: number;
  botsDataRef: React.RefObject<Array<{
    def: {
      id: string;
      /** Görünen ad (baloncukta "İsim: mesaj" olarak yazılır). */
      name?: string;
      config: AvatarConfig;
      equipped: string[];
      /** Satıcı NPC'ler sabit ve simli renkte görünür. */
      isVendor?: boolean;
    };
    pos: { x: number; y: number };
    facing: number;
    moving: boolean;
  }>>;
  /** Bu botun baş üstü sohbet baloncuğu (varsa). */
  speech?: string | null;
}) {
  if (SVG_DEBUG_MODE) {
    return <SvgBotAvatar3D index={index} botsDataRef={botsDataRef} />;
  }
  return (
    <GlbBotAvatar3D
      index={index}
      botsDataRef={botsDataRef}
      speech={speech}
    />
  );
}

/** GLB bot/vendor avatar — feeds the shared ref into GlbAvatar3D. */
function GlbBotAvatar3D({
  index,
  botsDataRef,
  speech,
}: {
  index: number;
  botsDataRef: React.RefObject<Array<{
    def: {
      id: string;
      /** Görünen ad (baloncukta "İsim: mesaj" olarak yazılır). */
      name?: string;
      config: AvatarConfig;
      equipped: string[];
      /** Satıcı NPC'ler sabit ve simli renkte görünür. */
      isVendor?: boolean;
    };
    pos: { x: number; y: number };
    facing: number;
    moving: boolean;
  }>>;
  speech?: string | null;
}) {
  const posRef = useRef({ x: 0, y: 0 });
  const facingRef = useRef(1);
  const initRef = useRef(false);

  useFrame(() => {
    const bot = botsDataRef.current?.[index];
    if (!bot) return;
    if (!initRef.current) {
      initRef.current = true;
      posRef.current = { x: bot.pos.x, y: bot.pos.y };
      facingRef.current = bot.facing || 1;
    }
    posRef.current = bot.pos;
    if (bot.moving) facingRef.current = bot.facing;
  });

  // Read config from ref (only used at mount — bots don't change equipment).
  const bot = botsDataRef.current?.[index];
  const equipped = bot?.def.equipped ?? [];
  // Her bot kendi karakter rengiyle dolaşır (caddede karışık renkler).
  // Satıcılar boyanmaz — kendi renklerinde kalır, sadece etraflarında
  // simli parıltı döner (tezgâh başında oldukları belli olsun).
  const isVendor = bot?.def.isVendor === true;
  // Skin kuşanmış botlar (ve satıcılar) boyanmaz: orijinal görünümlerini
  // korurlar. Diğer botlar kendi karakter rengiyle dolaşır.
  const tint =
    isVendor || hasCharacterSkin(equipped)
      ? undefined
      : bot?.def.config?.shirt;

  return (
    <GlbAvatar3D
      posRef={posRef}
      facingRef={facingRef}
      equipped={equipped}
      lerpSpeed={12}
      tint={tint}
      sparkle={isVendor}
      speech={speech}
      speechName={bot?.def.name}
    />
  );
}

/** Legacy SVG bot avatar (debug only — ?svg=1). */
function SvgBotAvatar3D({
  index,
  botsDataRef,
}: {
  index: number;
  botsDataRef: React.RefObject<Array<{
    def: {
      id: string;
      config: AvatarConfig;
      equipped: string[];
      /** Satıcı NPC'ler sabit ve simli renkte görünür. */
      isVendor?: boolean;
    };
    pos: { x: number; y: number };
    facing: number;
    moving: boolean;
  }>>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const divRef = useRef<HTMLDivElement>(null);
  // Smooth interpolation state
  const smoothPos = useRef({ x: 0, y: 0 });
  const isWalkingRef = useRef(false);
  const facingRef = useRef(1);

  useFrame((_, dt) => {
    if (!groupRef.current || !botsDataRef.current) return;
    const bot = botsDataRef.current[index];
    if (!bot) return;

    // Read fresh position from ref (updated by game loop)
    const targetX = bot.pos.x;
    const targetY = bot.pos.y;

    // Smooth interpolation — lerp toward target
    const lerpFactor = Math.min(1, 12 * dt);
    smoothPos.current.x += (targetX - smoothPos.current.x) * lerpFactor;
    smoothPos.current.y += (targetY - smoothPos.current.y) * lerpFactor;

    // Set 3D position
    const wx = smoothPos.current.x / S - WORLD_WIDTH / 2;
    const wz = WORLD_Z_MAX - smoothPos.current.y / S;
    groupRef.current.position.set(wx, 0.02, wz);

    // Walking animation
    const dx = Math.abs(targetX - smoothPos.current.x);
    const dy = Math.abs(targetY - smoothPos.current.y);
    const moving = dx > 0.3 || dy > 0.3;
    if (moving !== isWalkingRef.current && divRef.current) {
      isWalkingRef.current = moving;
      divRef.current.classList.toggle("walking", moving);
    }

    // Facing direction
    if (bot.moving) facingRef.current = bot.facing;
    if (divRef.current) {
      divRef.current.style.transform = `scaleX(${facingRef.current < 0 ? -1 : 1})`;
    }
  });

  // Read initial config from ref (only changes if component remounts)
  const bot = botsDataRef.current?.[index];
  const config = bot?.def.config ?? { skin: "#ffd1a3", hair: "short", hairColor: "#3d2f2a", shirt: "#888", pants: "#444", shoes: "#333" };
  const equipped = bot?.def.equipped ?? [];

  return (
    <group ref={groupRef}>
      <Html center distanceFactor={10} style={{ pointerEvents: "none", transform: "translateY(-50%)" }} zIndexRange={[10, 0]}>
        <div
          ref={divRef}
          style={{
            position: "relative",
            width: 70,
            height: 96,
            transform: "scaleX(1)",
            transformOrigin: "center bottom",
          }}
        >
          <AvatarPreview width={70} height={96} config={config} equipped={equipped} />
          <EquippedItems equipped={equipped} width={70} height={96} className="absolute inset-0 pointer-events-none" />
        </div>
      </Html>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Main GameEngine3D                                          */
/* ═══════════════════════════════════════════════════════════ */

/**
 * SAHNE HAZIR SİNYALİ
 *
 * İlk kareler pahalıdır: tüm materyallerin shader'ları derlenir, dokular
 * GPU'ya yüklenir. Yükleme ekranı (World'deki cadde kapısı) bu sinyali
 * beklediği için oyuncu caddeyi ilk kez DONARAK değil, hazır hâlde görür —
 * yani "girdikten sonra render oluyor" durumu ortadan kalkar.
 *
 * Sinyal, canvas gerçekten birkaç kare çizdikten sonra BİR kez verilir.
 */
function SceneReadyPing({
  armed,
  onReady,
  frames = 8,
}: {
  /** Varlıklar hazır olmadan sayaç işlemez (bkz. `StreetAssetsProbe`). */
  armed: boolean;
  onReady: () => void;
  frames?: number;
}) {
  const count = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (!armed || done.current) return;
    count.current += 1;
    if (count.current >= frames) {
      done.current = true;
      onReady();
    }
  });
  return null;
}

/**
 * Cadde varlıkları kapısı — YALNIZCA KRİTİK modelleri bekler:
 * `STREET_MODELS.ground` (caddenin zemini) + `STREET_MODELS.character`
 * (oyuncu/botlar). Hepsi çözülene kadar (suspense) alt bileşenler bağlanmaz;
 * bu yüzden `SceneReadyPing` bu bileşenle aynı suspense sınırında durur ve
 * ilk kareler ancak modeller hazırken sayılır.
 *
 * ⚠️ Ağaç ve çim öbekleri BİLİNÇLİ olarak buradan ÇIKARILDI: cadde açılırken
 * aynı anda çözülen GLB sayısı 4'ten 2'ye indi. Ağaç (2,3 MB, 449 mesh) ve
 * binalar (cadı dükkânı 43 MiB GPU dokusu) artık `engine/assetQueue` sırasıyla,
 * cadde AÇILDIKTAN sonra TEK TEK yüklenir (bkz. `VegetationModels`,
 * `GlbBuilding`) — Android/WebView bellek zirvesinin asıl sebebi buydu.
 */
function StreetAssetsProbe({ onReady }: { onReady: () => void }) {
  useGLTF(STREET_MODELS.ground);
  useGLTF(STREET_MODELS.character);

  React.useEffect(() => {
    onReady();
  }, [onReady]);

  return null;
}

/** Tek bir ek modeli yalnızca BEKLER (önbelleği ısıtır, sahneye bir şey eklemez). */
function ModelProbe({ url }: { url: string }) {
  useGLTF(url);
  return null;
}

/**
 * Kapı yüklenemezse sahneyi düşürmesin: `GrassGroundBoundary` ile aynı desen.
 * Kapı açılmazsa `World`'deki emniyet supabı oyunu yine de başlatır.
 */
class StreetAssetBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[cadde kapısı] varlıklar yüklenemedi:", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface GameEngine3DProps {
  playerPosRef: React.RefObject<{ x: number; y: number }>;
  playerConfig: AvatarConfig;
  playerEquipped: string[];
  facingRef: React.RefObject<number>;
  botsRef: React.RefObject<Array<{
    def: {
      id: string;
      config: AvatarConfig;
      equipped: string[];
      /** Satıcı NPC'ler sabit ve simli renkte görünür. */
      isVendor?: boolean;
    };
    pos: { x: number; y: number };
    facing: number;
    moving: boolean;
  }>>;
  moveTarget: { x: number; y: number } | null;
  isMobile: boolean;
  /** Dev-only: render the Phase 1 GLB avatar test next to spawn. */
  glbTest?: boolean;
  presenceSessionId?: string;
  onRemotePlayerSelect?: (entry: PresenceEntry<StreetPresence>) => void;
  remotePlayerSelectRef?: React.MutableRefObject<((entry: PresenceEntry<StreetPresence>) => void) | null>;
  /** Doluysa yerel oyuncu bir bankta oturuyor (bkz. `SeatState`). */
  seat?: SeatState | null;
  /**
   * Sahne birkaç kare çizildikten sonra BİR kez çağrılır — yükleme ekranı
   * bunu bekleyip oyunu açar (bkz. `SceneReadyPing`).
   */
  onSceneReady?: () => void;
  /**
   * `onSceneReady`den ÖNCE beklenmesi gereken ek model URL'leri (ör. oyuncunun
   * kuşandığı karakter skini). Caddenin temel modelleri `streetPreload.ts`
   * içindedir, buraya yazılmaz.
   */
  readyModelUrls?: readonly string[];
  /**
   * Yerel oyuncunun baş üstü sohbet baloncuğu metni (Sanalika/Habbo stili).
   * `null` → baloncuk yok. Süre `ChatBubble3D.CHAT_BUBBLE_MS` kadardır.
   */
  speech?: string | null;
  /** Baloncukta görünen gönderen adı (yerel oyuncunun kullanıcı adı). */
  speechName?: string;
  /** Baloncuk rengi (`BUBBLE_COLORS` id'si — VIP renkleri buradan gelir). */
  speechColorId?: string;
  /**
   * Bot/satıcı baloncukları: `bot.def.id` → metin. Caddede gezinirken
   * botların kendi aralarında konuşması baş üstünde görünür.
   */
  botSpeech?: Record<string, string | null | undefined>;
  /**
   * Cadde sahnesi DURDURULSUN mu?
   *
   * Tam ekran bir katman (oda, savaş) açıkken cadde görünmez; arka planda
   * çizmeye devam etmesi GPU'yu ve bağlam yuvalarını boşa tüketir — bu da
   * tam ekran katmanın KENDİ WebGL bağlamını açamamasına yol açıyordu.
   * Duraklatma `frameloop="never"`dır: sahne bellekte ve ayakta kalır, çizmez
   * (kapandığında kaldığı yerden devam eder — yeniden kurulmaz).
   */
  paused?: boolean;
}

export function GameEngine3D({
  playerPosRef,
  playerConfig,
  playerEquipped,
  facingRef,
  botsRef,
  moveTarget,
  isMobile,
  glbTest,
  presenceSessionId,
  onRemotePlayerSelect,
  remotePlayerSelectRef,
  seat = null,
  onSceneReady,
  readyModelUrls,
  speech = null,
  speechName,
  speechColorId,
  botSpeech,
  paused = false,
}: GameEngine3DProps) {
  // 🧯 Bağlam emniyeti: cadde sahnesinin bağlamı ASLA feda edilmez
  // (`PROTECTED_PRIORITY`); bağlam kurulamazsa yeni bir canvas ile yeniden
  // denenir ve denemeler biterse çökme yerine sade bir bilgi katmanı kalır.
  const { attempt, exhausted, handleCreated } = useWebglRetry(2);
  // Senkron kurulum hatası (React hata sınırı): sahne sökülür, sayfa yaşar.
  const [stageFailed, setStageFailed] = useState(false);
  const handleStageFail = useCallback(() => setStageFailed(true), []);
  // Yükleme kapısı için: cadde varlıkları çözüldü mü? (`onSceneReady`
  // verilmediyse hiç kullanılmaz — durum makinesi boşta durur.)
  const [assetsReady, setAssetsReady] = useState(false);
  const handleAssetsReady = useCallback(() => setAssetsReady(true), []);
  const remoteSelect = useCallback((entry: PresenceEntry<StreetPresence>) => {
    onRemotePlayerSelect?.(entry);
  }, [onRemotePlayerSelect]);
  if (remotePlayerSelectRef) remotePlayerSelectRef.current = remoteSelect;
  const initCamY = Math.sin(CAMERA_ELEVATION) * CAMERA_ZOOM;
  const initCamZ = Math.cos(CAMERA_ELEVATION) * CAMERA_ZOOM;

  // Track bot count to force re-render when vendors are added after mount
  const [botsLen, setBotsLen] = useState(botsRef.current.length);
  React.useEffect(() => {
    // Poll for new bots/vendors being added to the ref
    const iv = setInterval(() => {
      const len = botsRef.current.length;
      if (len !== botsLen) setBotsLen(len);
    }, 200);
    return () => clearInterval(iv);
  }, [botsRef, botsLen]);

  // Bağlam yuvası gerçekten tükendi: boş/donmuş bir sahne yerine dürüst bir
  // bilgi katmanı göster (oyunun geri kalanı — HUD, giriş akışı — çalışır).
  if (exhausted || stageFailed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#78c8e8] via-[#bfe4f5] to-[#dff0c9]">
        <p className="mx-4 max-w-xs rounded-2xl bg-black/55 px-4 py-3 text-center text-xs font-bold text-white">
          📵 3D cadde başlatılamadı — cihaz aynı anda çok fazla 3D sahne
          açamıyor. Sayfayı yenilemek sorunu çözer.
        </p>
      </div>
    );
  }

  return (
    <CanvasGuard
      resetKey={attempt}
      onFail={handleStageFail}
      // Bağlam yuvası YOK (deneme başarısız): canvas HİÇ kurulmaz — R3F'ın
      // asenkron `configure()` hatası React sınırına uğramaz, bu yüzden tek
      // güvenli yol sahneyi denememektir. Aynı yedek bilgi katmanına düşülür.
      onUnavailable={handleStageFail}
    >
      <Canvas
        key={attempt}
        // 📱 MOBİL BELLEK: telefonlarda piksel oranı 1.25 ile sınırlı ve çok
        // örneklemeli kenar yumuşatma (MSAA) KAPALI. 1.5 dpr + MSAA, Android
        // WebView/Chrome'da renk+derinlik tamponlarını şişiriyor ve ağır cadde
        // modelleriyle birlikte süreci çökertiyordu ("Hay aksi!"). Piksel
        // sayısı ~%40 azaldı: aynı sahne, çok daha düşük bellek zirvesi.
        dpr={[1, isMobile ? 1.25 : 2]}
        shadows={!isMobile ? "soft" : false}
        frameloop={paused ? "never" : "always"}
        // R3F varsayılanı `high-performance`: kapı `default` ile geçtiyse
        // `high-performance` reddedilebilir ve `configure()` düşer. Denemenin
        // doğruladığı ayarı kullan.
        gl={{
          powerPreference: verifiedPowerPreference(),
          antialias: !isMobile,
        }}
        camera={{
          position: [sX(SPAWN_SVG.x), initCamY, sZ(SPAWN_SVG.y) + initCamZ],
          fov: 70,
          near: 0.1,
          far: 200,
        }}
        className="absolute inset-0"
        style={{ pointerEvents: "none" }}
        onCreated={({ gl }) => {
          // Mobile browsers evict the OLDEST WebGL context when a new one is
          // created (e.g. the profile-card canvas). Without preventDefault the
          // main canvas never restores and shows a large corrupted/blank
          // region covering part of the map. With it, THREE re-initializes
          // automatically on "webglcontextrestored".
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
          });
        }}
      >
        {/* Bağlamı kayıt defterine yazar (korunmuş öncelik), sökülünce
            BIRAKIR ve sahnenin kurulduğunu emniyet kancasına bildirir. */}
        <WebglContextKeeper
          priority={PROTECTED_PRIORITY}
          onCreated={handleCreated}
        />
        {/* ── CADDE HAZIRLIK KAPISI ────────────────────────────────────
          Yükleme ekranı (`World`) bu sinyali bekler: önce caddenin temel
          modelleri (çim zemin, ağaçlar, çim öbekleri, karakter) ve varsa
          oyuncuya özel skini çözülür, SONRA ilk kareler çizilir. Böylece
          oyuncu caddeyi ilk kez donarak/eksik görmez. */}
      {onSceneReady && (
        <>
          <StreetAssetBoundary>
            <React.Suspense fallback={null}>
              <StreetAssetsProbe onReady={handleAssetsReady} />
              {(readyModelUrls ?? []).map((url) => (
                <ModelProbe key={url} url={url} />
              ))}
            </React.Suspense>
          </StreetAssetBoundary>
          <SceneReadyPing armed={assetsReady} onReady={onSceneReady} />
        </>
      )}

      <FollowCamera posRef={playerPosRef} />

      {/* Kamera, oyuncu binaların arkasına / üst sokağa girince otomatik
          olarak daha dik (top-down) ve daha yüksek bir açıya geçer; caddeye
          dönünce yumuşakça eski açıya döner. Binalar saydamlaştırılmaz. */}

      {/* Sky — soft warm blue */}
      <color attach="background" args={["#78c8e8"]} />

      {/* UZAKLIK SİSİ — ufku gökyüzüne bağlar.
          Çim döşemesi oynanabilir alanın çok ötesine uzansa da bir yerde
          bitiyor; sis o kenarı yutar ve eskiden harita dışına bakınca görünen
          düz mavi dikdörtgen kaybolur.

          Sis rengi arka planla BİREBİR aynı olmak ZORUNDA, yoksa ufukta renk
          bandı oluşur. Haritanın kendisi sisi görmez: kamera oyuncunun
          10-14 birim arkasında olduğu için cadde ve binalar `near`in
          (65) altında kalır; sis yalnızca çok uzaktaki zemini etkiler. */}
      <fog attach="fog" args={["#78c8e8", 65, 120]} />

      {/* ═══ LIGHTING — warm stylized mobile-game lighting ═══
          Ortam ışığı yükseltildi: çim zeminin dokusu koyu ve AO haritası
          kapatıldı, yani zemin dolaylı ışığın tamamını artık alıyor — gölgede
          kalan çim siyaha düşmesin. Ayar tek yerden: aşağıdaki iki satır. */}
      <ambientLight intensity={0.8} color="#f0e8d8" />
      <hemisphereLight args={["#cfe6ff", "#58a038", 0.62]} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.6}
        color="#fff4e0"
        castShadow={!isMobile}
        shadow-mapSize-width={isMobile ? 512 : 1024}
        shadow-mapSize-height={isMobile ? 512 : 1024}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.001}
      />
      {/* Fill light — soft cool from opposite side */}
      <directionalLight position={[-5, 6, -4]} intensity={0.25} color="#b8d8ff" />
      {/* Rim/back light — separates characters from the background with a
          subtle cool edge glow (no shadow cost, mobile friendly). */}
      <directionalLight position={[-6, 7, -8]} intensity={0.5} color="#a8d4ff" />

      {/* Sun disc */}
      <mesh position={[14, 10, -10]}>
        <sphereGeometry args={[0.4, 12, 12]} />
        <meshBasicMaterial color="#ffe870" />
      </mesh>

      {/* === GROUND === */}
      <Ground />

      {/* === BUILDINGS === */}
      {/* Satır BOŞ GÖZLERDEN oluşur: yalnızca `modelUrl` atanmış göz dikilir,
          diğerlerinin yeri boştur (yeni GLB eklendikçe `constants.BUILDINGS`
          içindeki ilgili göze `modelUrl` yazılır). `fade` HİÇBİR binada
          açılmaz: evler yürünerek girilmediği için saydamlaşan bina yoktur
          (bkz. `constants.HOUSE_TRIGGER`) — kapıdan "Evine gir" ile girilir. */}
      {BUILDINGS.map((def, i) =>
        def.modelUrl ? (
          <GlbBuilding key={i} def={def} playerPosRef={playerPosRef} />
        ) : null,
      )}

      {/* Cadı dükkânının GÖRÜNEN giriş yolu (yürünebilir şeritle aynı sınırlar). */}
      <WitchShopWalkway />

      {/* === LAMPS === */}
      {LAMPS.map((def, i) => (
        <Lamp3D key={i} def={def} />
      ))}

      {/* === STALLS === */}
      {STALLS.map((def, i) => (
        <Stall3D key={i} def={def} />
      ))}

      {/* 🪑 Menzildeki bankın üstünde beliren oturma düğmesi (bkz. `benchSeat`). */}
      <BenchSitButton />

      {/* 🏠 Evin kapısında beliren "Evine gir" düğmesi. */}
      <HouseEnterButton />

      {/* === BENCHES === */}
      {BENCHES.map((def, i) => (
        <Bench3D key={i} def={def} />
      ))}

      {/* ═══════════════════════════════════════════════════════
          MODÜLER CADDE DETAYLARI (yaşayan şehir katmanı)
          ═══════════════════════════════════════════════════════ */}
      {/* Yeşillik: SADECE akçaağaç sıraları (`StreetTrees`) + çim öbekleri.
          Eski ilkel çalı kütleleri, kutu çitler ve çiçek tarhları kaldırıldı;
          ahşap çitler şehir detayı olarak kalıyor. */}
      <StreetTrees />
      <StreetGrassClumps />
      <StreetFences />

      {/* Sokak mobilyası: çöp kutuları, otobüs durakları, yön tabelaları */}
      <StreetTrashCans />
      <StreetBusStops />
      <StreetDirectionSigns />

      {/* === MOVE TARGET === */}
      <MoveTarget3D target={moveTarget} />

      {/* === LOCAL PLAYER === */}
      <PlayerAvatar3D
        posRef={playerPosRef}
        config={playerConfig}
        equipped={playerEquipped}
        facingRef={facingRef}
        seat={seat}
        speech={speech}
        speechName={speechName}
        speechColorId={speechColorId}
      />
      {presenceSessionId && <StreetRemotePlayers sessionId={presenceSessionId} onSelect={onRemotePlayerSelect ?? ((entry) => remotePlayerSelectRef?.current?.(entry))} />}

      {/* === BOTS + VENDORS (read from ref every frame) === */}
      {Array.from({ length: botsLen }, (_, i) => (
        <BotAvatar3D
          key={botsRef.current[i]?.def.id ?? `bot-${i}`}
          index={i}
          botsDataRef={botsRef}
          speech={botSpeech?.[botsRef.current[i]?.def.id ?? ""] ?? null}
        />
      ))}

        {/* === PHASE 1 GLB AVATAR TEST (dev-only, ?glbtest=1) === */}
        {glbTest && <GlbAvatarTest />}

        {/* === DEBUG OVERLAY (temporary — shows coordinate pipeline state) === */}
      </Canvas>
    </CanvasGuard>
  );
}

export default GameEngine3D;
