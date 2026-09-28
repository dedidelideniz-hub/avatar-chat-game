/**
 * VAELOS CADDESİ — GLB bitki örtüsü katmanı (akçaağaç · çim öbeği).
 *
 * Caddenin yeşilliği ilkel geometriyle (küre/silindir/konik) ÇİZİLMEZ:
 * `public/models/` altındaki modeller `useGLTF` ile BİR KEZ yüklenir ve
 * yerleşim noktalarına `InstancedMesh` olarak kopyalanır.
 *
 * Modeller proje kuralı gereği TEK DOSYA ASCII glTF JSON'dur (bkz.
 * `public/ASSETS.md` + `src/lib/binaryAssets.ts` — hosting boru hattı binary
 * dosyayı bozar; `maple_tree.glb` bu yüzden
 * `scripts/glb-to-embedded-json.mjs` ile çevrildi).
 *
 * PERFORMANS (istenen: "draw call / bellek şişmesin"):
 *   · Dosya URL başına BİR kez inilir (drei `useGLTF` önbelleği) ve tüm
 *     örnekler aynı geometri + materyali paylaşır; örnek başına klon YOK.
 *   · Modelin her MALZEMESİ tek bir InstancedMesh'e indirilir. `maple_tree.glb`
 *     tek başına 2070 mesh taşıyor: birleştirme olmasa 2070 draw call olurdu,
 *     birleştirmeyle 2'ye iner (bkz. `vegModelPrep.ts`).
 *   · Örnek başına rastgele Y rotasyonu + ±%15 boyut + hafif parlaklık
 *     `instanceMatrix` / `instanceColor` ile verilir → ek draw call yok.
 *
 * Boyut ve yön ÖLÇÜLEREK uygulanır (model uzayına güvenilmez): ölçüm, yön
 * düzeltmesi ve normalizasyon `vegModelPrep.ts` içinde, React'ten bağımsız
 * saf fonksiyon olarak durur.
 */
import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { GRASS_CLUMP_ZONES, GRASS_LIFT, TREE_ROWS, VEG_SIZES, WORLD_WIDTH } from "./constants";
import { mulberry32 } from "./StreetDetail";
import {
  GRASS_CLUMP_MODEL_URL,
  GRASS_MODEL_CONFIG,
  TREE_MODEL_CONFIG,
  TREE_MODEL_URL,
  prepareVegetationModel,
  type ModelPart,
  type VegModelConfig,
} from "./vegModelPrep";

export { GRASS_CLUMP_MODEL_URL, TREE_MODEL_URL };

/* ═══════════════════════════════════════════════════════════ */
/*  Varyasyon sabitleri                                         */
/* ═══════════════════════════════════════════════════════════ */

/** Her örneğin alacağı boyut çarpanı aralığı (istenen: ±%15). */
const SIZE_MIN = 0.85;
const SIZE_MAX = 1.15;
/** Hafif parlaklık farkı (örnek rengi) — hiçbiri birebir aynı durmasın. */
const TINT_MIN = 0.9;
const TINT_MAX = 1.1;

/** Örnek başına yerleşim: konum + Y rotasyonu + boyut + parlaklık. */
export interface VegPlacement {
  x: number;
  z: number;
  /** Y ekseni rotasyonu (radyan, 0–2π). */
  rot: number;
  /** Boyut çarpanı (0.85–1.15). */
  scale: number;
  /** Parlaklık çarpanı (0.9–1.1) — `instanceColor` ile uygulanır. */
  tint: number;
}

const _up = new THREE.Vector3(0, 1, 0);

const span = (rnd: () => number, min: number, max: number): number =>
  min + rnd() * (max - min);

/* ═══════════════════════════════════════════════════════════ */
/*  Yükleme + hazırlık                                          */
/* ═══════════════════════════════════════════════════════════ */

function useModelParts(cfg: VegModelConfig): ModelPart[] {
  const { scene } = useGLTF(cfg.url);
  const prepared = useMemo(() => prepareVegetationModel(scene, cfg), [scene, cfg]);
  const { parts, owned, report } = prepared;

  // Kopyalanan geometriler ve klonlanan materyaller paylaşılan GLB önbelleğinden
  // bağımsızdır → sökülürken bırakılır (paylaşılanlara dokunulmaz).
  useEffect(
    () => () => {
      for (const item of owned) item.dispose();
    },
    [owned],
  );

  // Model değişirse (yeni export) boyut/yön varsayımlarının hâlâ doğru
  // olduğunu konsoldan doğrulamak için tek satırlık ölçüm raporu.
  useEffect(() => {
    const size = report.rawSize;
    console.info(
      `[bitki örtüsü] ${cfg.url} · ${report.sourceMeshes} mesh → ${report.drawCalls} draw call · ` +
        `ham boy ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} birim · ` +
        `yön düzeltmesi: ${report.flipped ? "180° X (model -Y'ye büyüyor)" : "yok"}`,
    );
  }, [cfg.url, report]);

  return parts;
}

/* ═══════════════════════════════════════════════════════════ */
/*  Parça → InstancedMesh                                       */
/* ═══════════════════════════════════════════════════════════ */

function PartInstances({
  part,
  placements,
  height,
  baseY,
  castShadow,
  receiveShadow,
}: {
  part: ModelPart;
  placements: VegPlacement[];
  /** Modelin dünyadaki boyu (normalize model 1 birim olduğu için tek çarpan). */
  height: number;
  baseY: number;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scaleV = new THREE.Vector3();
    const color = new THREE.Color();

    placements.forEach((p, i) => {
      const s = height * p.scale;
      quat.setFromAxisAngle(_up, p.rot);
      position.set(p.x, baseY, p.z);
      scaleV.set(s, s, s);
      matrix.compose(position, quat, scaleV);
      mesh.setMatrixAt(i, matrix);
      // `instanceColor` materyalin rengiyle/dokusuyla ÇARPILIR → 1 civarı
      // değerler sadece parlaklığı oynatır, paletten çıkmaz.
      color.setScalar(p.tint);
      mesh.setColorAt(i, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Örnekler sahneye yayıldığı için kaba kutu instansiyon matrislerinden
    // hesaplanmalı; yoksa mesh yanlışlıkla frustum'dan düşer.
    mesh.computeBoundingSphere();
  }, [placements, height, baseY]);

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, placements.length]}
      // Şeffaflığı olmayan kart yapraklar yere dikdörtgen gölge basar → gölge çizmez.
      castShadow={castShadow && !part.card}
      receiveShadow={receiveShadow}
    />
  );
}

function InstancedModel({
  cfg,
  placements,
  height,
  baseY,
  castShadow = true,
  receiveShadow = true,
}: {
  cfg: VegModelConfig;
  placements: VegPlacement[];
  height: number;
  baseY: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const parts = useModelParts(cfg);
  if (placements.length === 0 || parts.length === 0) return null;
  return (
    <>
      {parts.map((part) => (
        <PartInstances
          key={part.key}
          part={part}
          placements={placements}
          height={height}
          baseY={baseY}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      ))}
    </>
  );
}

/**
 * Model dosyası bozuksa/indirilemezse SADECE bu katman düşer; caddenin geri
 * kalanı çalışmaya devam eder. İlkel yedek çizilmez (istem: "küre/silindir
 * çalı ve ağaç kalmasın"), sadece konsola hata düşer.
 */
class ModelErrorBoundary extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[bitki örtüsü] ${this.props.label} yüklenemedi:`, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * GLB modeli yükler ve verilen yerleşimlere instancing ile dizer.
 * Model hazır olana kadar hiçbir şey çizilmez (ilkel yedek YOK).
 */
function GlbInstancedModel(props: Parameters<typeof InstancedModel>[0]) {
  return (
    <ModelErrorBoundary label={props.cfg.url}>
      <Suspense fallback={null}>
        <InstancedModel {...props} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  SOKAK YEŞİLLİĞİ — yerleşim                                  */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Sokak ağaçları — `TREE_ROWS` ile EŞİT ARALIKLI iki sıra (kuzey/güney yeşillik
 * şeritleri). Her ağaca yerleştirilirken rastgele Y rotasyonu (0–360°) ve
 * ±%15 boyut farkı verilir; tohum sabit olduğu için kare kare aynı kalır.
 */
export function StreetTrees() {
  const placements = useMemo<VegPlacement[]>(() => {
    const out: VegPlacement[] = [];
    TREE_ROWS.forEach((row, rowIndex) => {
      const rnd = mulberry32(4711 + rowIndex * 7919);
      for (let x = row.startX; x <= row.endX + 1e-6; x += row.spacing) {
        out.push({
          x,
          z: row.z,
          rot: rnd() * Math.PI * 2,
          scale: span(rnd, SIZE_MIN, SIZE_MAX),
          tint: span(rnd, TINT_MIN, TINT_MAX),
        });
      }
    });
    return out;
  }, []);

  return (
    <GlbInstancedModel
      cfg={TREE_MODEL_CONFIG}
      placements={placements}
      height={VEG_SIZES.tree}
      baseY={GRASS_LIFT}
    />
  );
}

/**
 * Çim öbekleri — `GRASS_CLUMP_ZONES` bölgelerine tohumlu rastgele dağıtılır.
 * Öbekler küçük olduğu için gölge çizmezler (shadow pass maliyeti ikiye
 * katlanmasın); zemin gölgesini karo dokusu ve ağaç/çalılar taşır.
 */
export function StreetGrassClumps() {
  const placements = useMemo<VegPlacement[]>(() => {
    const out: VegPlacement[] = [];
    const inset = 0.14; // kaldırım bordürüne taşmasın
    for (const zone of GRASS_CLUMP_ZONES) {
      const rnd = mulberry32(zone.seed);
      const depth = Math.max(0.2, zone.depth - inset * 2);
      const count = Math.max(1, Math.round(WORLD_WIDTH * depth * zone.density));
      for (let i = 0; i < count; i++) {
        out.push({
          x: (rnd() - 0.5) * (WORLD_WIDTH - 0.6),
          z: zone.z + (rnd() - 0.5) * depth,
          rot: rnd() * Math.PI * 2,
          scale: span(rnd, SIZE_MIN, SIZE_MAX),
          tint: span(rnd, TINT_MIN, TINT_MAX),
        });
      }
    }
    return out;
  }, []);

  return (
    <GlbInstancedModel
      cfg={GRASS_MODEL_CONFIG}
      placements={placements}
      height={VEG_SIZES.grassClump}
      baseY={GRASS_LIFT}
      castShadow={false}
      receiveShadow={false}
    />
  );
}

/* İndirme, sahne kurulmadan önce başlasın (cadde ilk karede yeşilsiz kalmasın). */
useGLTF.preload(TREE_MODEL_URL);
useGLTF.preload(GRASS_CLUMP_MODEL_URL);
