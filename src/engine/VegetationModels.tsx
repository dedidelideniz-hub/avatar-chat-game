/**
 * VAELOS CADDESİ — GLB bitki örtüsü katmanı (ağaç · çalı · çim öbeği).
 *
 * Cadde yeşilliği artık ilkel geometriyle (küre/silindir/konik) ÇİZİLMEZ:
 * `public/models/` altındaki gerçek low-poly modeller `useGLTF` ile yüklenir ve
 * yerleşim noktalarına InstancedMesh olarak kopyalanır.
 *
 * Modeller proje kuralı gereği TEK DOSYA ASCII glTF JSON'dur (bkz.
 * `public/ASSETS.md` + `src/lib/binaryAssets.ts` — hosting boru hattı binary
 * dosyayı bozuyor) ve `scripts/build-foliage-glb.mjs` ile üretilir.
 *
 * NEDEN INSTANCEDMESH:
 *   · 12 ağaç + 19 çalı + ~300 çim öbeği tek tek mesh olsa yüzlerce draw call
 *     olurdu. Modelin HER MALZEMESİ tek bir InstancedMesh'e dönüşür:
 *     ağaç 3, çalı 2, çim 2 → toplam 7 draw call, ~500 örnek.
 *   · Geometri ve materyal örnekler arasında PAYLAŞILIR: `useGLTF` URL başına
 *     tek indirme yapar, ağaç başına klon/indirme YOKTUR (drei önbelleği).
 *   · Her örnek kendi `instanceMatrix`'ini ve `instanceColor`'unu taşır, yani
 *     rastgele Y rotasyonu + 0.85–1.15 boyut + hafif parlaklık farkı bedava
 *     gelir (ek draw call yok).
 *
 * NORMALİZASYON ÖLÇÜLEREK YAPILIR (model uzayına güvenilmez): yükleme anında
 * kaba kutu alınır, taban y=0'a, XZ merkezi orijine çekilir ve boy 1 birime
 * ölçeklenir. Böylece modeli değiştirip üretici script'i yeniden çalıştırmak
 * yerleşim kodunu bozmaz — bombadaki `measureBodyCenter` kuralının aynısı.
 */
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  BUSHES,
  GRASS_CLUMP_ZONES,
  GRASS_LIFT,
  TREES,
  VEG_SIZES,
  WORLD_WIDTH,
} from "./constants";
import { mulberry32 } from "./StreetDetail";

/* ═══════════════════════════════════════════════════════════ */
/*  Model URL'leri                                              */
/* ═══════════════════════════════════════════════════════════ */

export const TREE_MODEL_URL = "/models/tree.glb";
/**
 * Çalı: üretilen aileye dahil edildi (ağaç/çim ile aynı stil, aynı üretici).
 * Depoda ayrıca gerçek bir Sketchfab çalısı var — `/models/stylized_bush.glb`
 * (bkz. `ArenaBushModels.tsx`). O model istenirse sadece bu satırı ona
 * çevirmek yeter; normalizasyon + instancing kodu aynı kalır.
 */
export const BUSH_MODEL_URL = "/models/bush.glb";
export const GRASS_CLUMP_MODEL_URL = "/models/grass_clump.glb";

/* ═══════════════════════════════════════════════════════════ */
/*  Varyasyon sabitleri                                         */
/* ═══════════════════════════════════════════════════════════ */

/** Her örneğin alacağı boyut çarpanı aralığı. */
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

/** Modelden çıkarılmış, normalize edilmiş tek parça (malzeme başına bir tane). */
interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  key: string;
}

const _up = new THREE.Vector3(0, 1, 0);

const span = (rnd: () => number, min: number, max: number): number =>
  min + rnd() * (max - min);

/* ═══════════════════════════════════════════════════════════ */
/*  GLB → normalize edilmiş parçalar                            */
/* ═══════════════════════════════════════════════════════════ */

/**
 * GLB sahnesini yerleştirilebilir parçalara çevirir:
 *   · her mesh'in DÜNYA matrisi, kopyalanan geometriye gömülür (glTF'te
 *     dönüşümler node'larda durur; instancing düz geometri ister),
 *   · taban y=0'a, XZ merkezi orijine taşınır,
 *   · yükseklik (Y) tam 1 birime ölçeklenir → çağıran sadece "kaç birim
 *     boyunda duracak" der.
 *
 * drei önbelleğindeki sahne ASLA değiştirilmez (paylaşılır); sadece kopyalanan
 * geometriler dönüştürülür ve bileşen sökülürken bırakılır. Materyaller
 * paylaşılır — bırakılırsa GLB'yi kullanan diğer bileşenler bozulurdu.
 */
function useModelParts(url: string): ModelPart[] {
  const { scene } = useGLTF(url);

  const parts = useMemo(() => {
    const root = scene.clone(true);
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const height = Math.max(size.y, 1e-4);
    const centerX = box.min.x + size.x / 2;
    const centerZ = box.min.z + size.z / 2;

    const out: ModelPart[] = [];
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      geometry.translate(-centerX, -box.min.y, -centerZ);
      geometry.scale(1 / height, 1 / height, 1 / height);
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      out.push({
        geometry,
        material,
        key: mesh.name || material?.name || `part-${out.length}`,
      });
    });
    return out;
  }, [scene]);

  useEffect(() => () => parts.forEach((part) => part.geometry.dispose()), [parts]);

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
      // `instanceColor` materyalin rengiyle ÇARPILIR → 1 civarı değerler
      // sadece parlaklığı oynatır, paletten çıkmaz (dokulu modellerde de
      // doku tonunu korur).
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
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}

function InstancedModel({
  url,
  placements,
  height,
  baseY,
  castShadow = true,
  receiveShadow = true,
}: {
  url: string;
  placements: VegPlacement[];
  height: number;
  baseY: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const parts = useModelParts(url);
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
    <ModelErrorBoundary label={props.url}>
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
 * Sokak ağaçları — `TREES` koordinatları.
 * `def.scale` (0.8–0.9) ağaç başına boy karakterini verir; üstüne rastgele
 * 0.85–1.15 çarpanı ve 0–360° Y rotasyonu biner.
 */
export function StreetTrees() {
  const placements = useMemo<VegPlacement[]>(
    () =>
      TREES.map((def, i) => {
        // Tohum ağaç başına sabit → her karede aynı rotasyon/boyut.
        const rnd = mulberry32(4711 + def.variant * 977 + i * 131);
        return {
          x: def.x,
          z: def.z,
          rot: rnd() * Math.PI * 2,
          scale: def.scale * span(rnd, SIZE_MIN, SIZE_MAX),
          tint: span(rnd, TINT_MIN, TINT_MAX),
        };
      }),
    [],
  );

  return (
    <GlbInstancedModel
      url={TREE_MODEL_URL}
      placements={placements}
      height={VEG_SIZES.tree}
      baseY={GRASS_LIFT}
    />
  );
}

/** Sokak çalıları — `BUSHES` koordinatları (çim şeritlerinin içi). */
export function StreetBushes() {
  const placements = useMemo<VegPlacement[]>(
    () =>
      BUSHES.map((def, i) => {
        const rnd = mulberry32(8123 + i * 337);
        return {
          x: def.x,
          z: def.z,
          rot: rnd() * Math.PI * 2,
          scale: def.s * span(rnd, SIZE_MIN, SIZE_MAX),
          tint: span(rnd, TINT_MIN, TINT_MAX),
        };
      }),
    [],
  );

  return (
    <GlbInstancedModel
      url={BUSH_MODEL_URL}
      placements={placements}
      height={VEG_SIZES.bush}
      baseY={GRASS_LIFT}
    />
  );
}

/**
 * Çim öbekleri — `GRASS_CLUMP_ZONES` bölgelerine tohumlu rastgele dağıtılır.
 * Öbekler küçük olduğu için gölge çizmezler (shadow pass maliyeti ikiye
 * katlanmasın); zemin gölgesini kendi karo dokusu ve çalılar taşır.
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
      url={GRASS_CLUMP_MODEL_URL}
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
useGLTF.preload(BUSH_MODEL_URL);
useGLTF.preload(GRASS_CLUMP_MODEL_URL);
