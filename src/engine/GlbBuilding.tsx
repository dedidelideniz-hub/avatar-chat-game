/**
 * GLB BİNA — cadde satırındaki bir GÖZÜ modele diken genel bileşen.
 *
 * Satırı kurmak için tek gereken, `constants.BUILDINGS` içindeki göze bir
 * `modelUrl` yazmaktır (ör. `WITCH_SHOP_INDEX`). Bileşen:
 *   · modeli ölçer ve göze oturtur (`buildingModelPrep.ts`) — taban zemine,
 *     cephe satırın cephe hattına, genişlik gözün genişliğine,
 *   · gölge bayraklarını açar (model mesh'leri GLTF'ten kapalı gelir),
 *   · `fade` verilirse, oyuncu binanın İÇİNDEYKEN görüşü kesildiğinde YALNIZCA
 *     bu binayı yumuşakça saydamlaştırır (test edilmiş çekirdek:
 *     `buildingOcclusion.ts`). Caddenin geri kalanındaki "kamera açısı
 *     otomatik açılır" davranışına dokunmaz. Evler yürünerek girilen hacimler
 *     OLMADIĞI için bugün hiçbir bina bu bayrağı açmaz (bkz.
 *     `constants.HOUSE_*`) — saydam kalan bir ev, oyuncunun içeride durduğu
 *     izlenimini veriyordu.
 *
 *   · `sign` verilirse, binanın tepesinde bir DOM levhası asar (oyuncu
 *     evlerinin sahibi adı burada yazar). Aynı model birden çok arsaya
 *     dikilebildiği için model sahnesi örnek başına KLONLANIR.
 *
 * Model indirilemezse yalnızca bu göz düşer (bitki örtüsü katmanıyla aynı
 * desen); caddenin geri kalanı çalışmaya devam eder.
 */
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  S,
  WORLD_WIDTH,
  WORLD_Z_MAX,
  type BuildingDef,
} from "./constants";
import {
  BUILDING_USER_DATA,
  buildOccluder,
  fadeOccluders,
  resetOccluders,
  updateCameraOcclusion,
  type BuildingOccluder,
} from "./buildingOcclusion";
import { measureBuildingModel, planBuildingPlacement } from "./buildingModelPrep";

/**
 * Oyuncu binanın merkezinden bu kadar (dünya birimi) uzaktayken ışın testi
 * hiç yapılmaz (kaba eleme). Modeller ağır olduğu için üçgen düzeyindeki test
 * yalnızca oyuncu binanın yanındayken çalışır — mobil kare bütçesi korunur.
 */
const FADE_NEAR_RADIUS = 5;

function GlbBuildingModel({
  def,
  playerPosRef,
  fade,
  sign,
}: {
  def: BuildingDef;
  playerPosRef?: React.RefObject<{ x: number; y: number }>;
  fade: boolean;
  /** Kapının üstünde asılı levha (ör. "🏠 oyuncu adı"). */
  sign?: ReactNode;
}) {
  const url = def.modelUrl as string;
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);

  /**
   * SAHNE KLONLANIR — TEK bir `useGLTF` önbelleği aynı modeli isteyen her
   * göze AYNI `Object3D`yi döner. Aynı nesne sahne grafiğinde iki yere
   * takılamayacağı için (ikinci konum birincisinin üstüne yazar) her örnek
   * kendi klonunu kullanır. Klon geometriyi/malzemeyi PAYLAŞIR, yani ek
   * GPU belleği harcamaz: yalnızca düğüm ağacı kopyalanır. Oyuncu evleri
   * (aynı model, farklı arsalar) bu yüzden dikilebilir.
   */
  const model = useMemo(() => {
    const root = scene as THREE.Object3D;
    // Önizleme yer tutucusu (`{}`) gerçek bir Object3D değil → çizim yok.
    return root?.isObject3D ? root.clone(true) : null;
  }, [scene]);

  const placement = useMemo(() => {
    const box = measureBuildingModel(scene as THREE.Object3D);
    return box ? planBuildingPlacement(box, def) : null;
  }, [scene, def]);

  // Gölge bayrakları: caddenin diğer binaları gölge çizip alır, model
  // mesh'leri GLTF'ten kapalı gelir. Gölge geçişi ışığın `castShadow`
  // bayrağıyla zaten kısıtlı (mobilde tamamen kapalı, bkz. GameEngine3D).
  useEffect(() => {
    if (!model) return; // önizleme yer tutucusu
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }, [model]);

  // Saydamlaştırma: malzemeler bu binaya özel klonlanır — sahnedeki diğer
  // binalar/proplar bu geçişten ETKİLENMEZ.
  const occluderRef = useRef<BuildingOccluder | null>(null);
  useEffect(() => {
    const root = groupRef.current;
    if (!root || !placement || !fade) return;
    occluderRef.current = buildOccluder(root);
    return () => {
      if (occluderRef.current) resetOccluders([occluderRef.current]);
      occluderRef.current = null;
    };
  }, [placement, scene, fade]);

  const centerX = def.x;
  const centerZ = def.frontZ - def.d / 2;

  useFrame(({ camera }, dt) => {
    const occluder = occluderRef.current;
    if (!occluder || !playerPosRef) return;
    const p = playerPosRef.current;
    const px = p.x / S - WORLD_WIDTH / 2;
    const pz = WORLD_Z_MAX - p.y / S;

    const far =
      Math.abs(px - centerX) > FADE_NEAR_RADIUS ||
      Math.abs(pz - centerZ) > FADE_NEAR_RADIUS;
    if (far) {
      // Uzakta ışın atılmaz; bina yumuşakça tam opaklığa döner (yarı saydam
      // kalmış bir bina ile "hayalet" görüntü oluşmasın).
      occluder.occluded = false;
      fadeOccluders([occluder], dt);
      return;
    }

    updateCameraOcclusion([occluder], camera.position, { x: px, z: pz }, dt, true);
  });

  if (!placement || !model) return null;

  return (
    <group ref={groupRef} position={[def.x, 0, def.frontZ]} userData={BUILDING_USER_DATA}>
      {/* Ölçekli model: tabanı zemine (y 0), cephesi `frontZ`e, merkezi X'e
          hizalı — offset ÖLÇÜLEN kutuya göre hesaplanır. */}
      <group
        position={[placement.offset.x, placement.offset.y, placement.offset.z]}
        scale={placement.scale}
      >
        <primitive object={model} />
      </group>
      {/* Kapı levhası — binanın tepesinde, cephenin az önünde asılı durur. */}
      {sign ? (
        <Html
          center
          distanceFactor={11}
          position={[0, placement.size.y + 0.42, 0.15]}
          zIndexRange={[20, 10]}
        >
          {sign}
        </Html>
      ) : null}
    </group>
  );
}

/** Model bozuksa/indirilemezse SADECE bu göz düşer. */
class GlbBuildingBoundary extends Component<
  { url: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[bina modeli] ${this.props.url} yüklenemedi:`, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function GlbBuilding({
  def,
  playerPosRef,
  fade = false,
  sign,
}: {
  def: BuildingDef;
  /** `fade` açıkken binanın görüşü kesip kesmediğini ölçmek için gerekir. */
  playerPosRef?: React.RefObject<{ x: number; y: number }>;
  /**
   * Oyuncu binanın İÇİNE girebiliyorsa `true` (görüş kesilince saydamlaşır).
   *
   * Evler artık yürünerek girilen hacimler değil (bkz. `constants.HOUSE_*`),
   * o yüzden hiçbir bina bu bayrağı açmaz: saydamlaşan bir ev, oyuncunun
   * içeride durduğu izlenimini veriyordu (ekran görüntüsü).
   */
  fade?: boolean;
  /** Kapının üstünde asılı levha (ör. oyuncu evinin sahibi). */
  sign?: ReactNode;
}) {
  if (!def.modelUrl) return null;
  return (
    <GlbBuildingBoundary url={def.modelUrl}>
      <Suspense fallback={null}>
        <GlbBuildingModel
          def={def}
          playerPosRef={playerPosRef}
          fade={fade}
          sign={sign}
        />
      </Suspense>
    </GlbBuildingBoundary>
  );
}
