/**
 * CADI DÜKKÂNI — cadde sırasındaki TEK bir binanın yerine geçen GLB modeli
 * (`public/models/witch_shop.glb`) ve o binaya giden görünen giriş yolu.
 *
 * NEDEN AYRI BİR BİLEŞEN: caddenin geri kalanı ilkel geometriyle çizilen
 * `Building` bileşenini kullanır; bu bina ise gerçek bir modeldir ve
 *   · ölçüsü/konumu ÖLÇÜLEREK komşu binalarla hizalanır (bkz. `witchShopPrep.ts`),
 *   · TAMAMEN yürünebilir bir girişi vardır (bkz. `constants.WITCH_SHOP_WALKWAY`
 *     + `lib/shop.ts` → `WITCH_SHOP_WALK_ZONES`),
 *   · oyuncu içeri girdiğinde görüşü keserse SAYDAMLAŞIR — ama yalnızca
 *     kendisi. Caddenin kalanındaki "kamera açısı otomatik açılır" davranışı
 *     (bkz. `cameraFraming.ts`) aynen korunur; oradaki toplu saydamlaştırma
 *     sistemi bilerek kapalıdır ve bu bina onu AÇMAZ. Saydamlaştırma test
 *     edilmiş çekirdeği kullanır (`buildingOcclusion.ts` → `buildOccluder`).
 *
 * Model 26 MB'lık ASCII gömülü JSON glTF olduğu için (bkz. `public/ASSETS.md`)
 * caddenin yükleme kapısına EKLENMEZ: arka planda, kendi suspense sınırında
 * iner; hazır olana kadar satırdaki yer boş kalır, oyunu bloklamaz.
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
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  S,
  WORLD_WIDTH,
  WORLD_Z_MAX,
  WITCH_SHOP_MODEL_URL,
  WITCH_SHOP_WALKWAY,
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
import { measureWitchShop, planWitchShopPlacement } from "./witchShopPrep";

/* ═══════════════════════════════════════════════════════════ */
/*  Kamera — yalnızca bu bina saydamlaşır                      */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Oyuncu binanın merkezinden bu kadar (dünya birimi) uzaktayken ışın testi
 * hiç yapılmaz (kaba eleme). Model ağır olduğu için üçgen düzeyindeki test
 * yalnızca oyuncu dükkânın yanındayken çalışır — mobil kare bütçesi korunur.
 */
const FADE_NEAR_RADIUS = 5;

/* ═══════════════════════════════════════════════════════════ */
/*  Model                                                      */
/* ═══════════════════════════════════════════════════════════ */

function WitchShopModel({
  def,
  playerPosRef,
}: {
  def: BuildingDef;
  playerPosRef: React.RefObject<{ x: number; y: number }>;
}) {
  const { scene } = useGLTF(WITCH_SHOP_MODEL_URL);
  const groupRef = useRef<THREE.Group>(null);

  // Ölçüm + yerleştirme: model kutusu BİNA gövdesinden alınır (önündeki yol ve
  // dökülmüş yapraklar hariç) → cephe hattı `def.frontZ`e tam oturur.
  const placement = useMemo(() => {
    const box = measureWitchShop(scene as THREE.Object3D);
    return box ? planWitchShopPlacement(box, def) : null;
  }, [scene, def]);

  // Gölge bayrakları: caddenin diğer binaları (`Building`) gölge çizip alır,
  // modelin mesh'leri GLTF'ten kapalı gelir — yoksa bu bina satırda düz/ayrık
  // durur. Gölge geçişi ışığın `castShadow` bayrağıyla zaten kısıtlı
  // (mobilde tamamen kapalı, bkz. GameEngine3D › directionalLight).
  useEffect(() => {
    const root = scene as THREE.Object3D;
    if (!root?.isObject3D) return; // önizleme/önizleme yer tutucusu
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }, [scene]);

  // Saydamlaştırma: malzemeler bu binaya özel klonlanır — caddenin diğer
  // binaları ya da propları bu geçişten ETKİLENMEZ.
  const occluderRef = useRef<BuildingOccluder | null>(null);
  useEffect(() => {
    const root = groupRef.current;
    if (!root || !placement) return;
    occluderRef.current = buildOccluder(root);
    return () => {
      if (occluderRef.current) resetOccluders([occluderRef.current]);
      occluderRef.current = null;
    };
  }, [placement, scene]);

  // Kaba (yakınlık) kontrolü için binanın ayak izi merkezi.
  const centerX = def.x;
  const centerZ = def.frontZ - def.d / 2;

  useFrame(({ camera }, dt) => {
    const occluder = occluderRef.current;
    if (!occluder) return;
    const p = playerPosRef.current;
    const px = p.x / S - WORLD_WIDTH / 2;
    const pz = WORLD_Z_MAX - p.y / S;

    const far =
      Math.abs(px - centerX) > FADE_NEAR_RADIUS ||
      Math.abs(pz - centerZ) > FADE_NEAR_RADIUS;
    if (far) {
      // Uzakta: ışın yok, bina yumuşakça tam opaklığa döner (yarı saydam
      // kalmış bir bina ile "hayalet" görüntü oluşmasın).
      occluder.occluded = false;
      fadeOccluders([occluder], dt);
      return;
    }

    updateCameraOcclusion(
      [occluder],
      camera.position,
      { x: px, z: pz },
      dt,
      true,
    );
  });

  if (!placement) return null;

  return (
    <group
      ref={groupRef}
      position={[def.x, 0, def.frontZ]}
      userData={BUILDING_USER_DATA}
    >
      {/* Ölçekli model: tabanı zemine (y 0), cephesi `frontZ`e, merkezi X'e
          hizalı. Offset, ÖLÇÜLEN kutuya göre hesaplanır (bkz. witchShopPrep). */}
      <group
        position={[placement.offset.x, placement.offset.y, placement.offset.z]}
        scale={placement.scale}
      >
        <primitive object={scene} />
      </group>
    </group>
  );
}

/**
 * Model indirilemezse yalnızca bu bina düşer; caddenin geri kalanı çalışmaya
 * devam eder (bitki örtüsü katmanıyla aynı desen).
 */
class WitchShopBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[cadı dükkânı] model yüklenemedi:", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function WitchShopBuilding(props: {
  def: BuildingDef;
  playerPosRef: React.RefObject<{ x: number; y: number }>;
}) {
  return (
    <WitchShopBoundary>
      <Suspense fallback={null}>
        <WitchShopModel {...props} />
      </Suspense>
    </WitchShopBoundary>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  Giriş yolu (görünen)                                       */
/* ═══════════════════════════════════════════════════════════ */

/** Yolun zemin seviyesi — çim (0) ile asfalt (0.008) arasında okunur bir taş. */
const WALKWAY_Y = 0.013;

function Plane({
  westX,
  eastX,
  southZ,
  northZ,
  y,
  color,
  roughness,
}: {
  westX: number;
  eastX: number;
  southZ: number;
  northZ: number;
  y: number;
  color: string;
  roughness: number;
}) {
  const w = eastX - westX;
  const d = southZ - northZ;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[(westX + eastX) / 2, y, (southZ + northZ) / 2]}
      receiveShadow
    >
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

/**
 * GÖRÜNEN GİRİŞ YOLU — yürünebilir şeritle (`WITCH_SHOP_WALK_ZONES`) BİREBİR
 * aynı sınırlardan çizilir, yani oyuncunun yürüdüğü yer ile gördüğü yol
 * ayrışmaz. Ara sokaktan (batı) dükkân cephesi boyunca kapıya uzanan taş bir
 * şerit + kapı eşiği.
 *
 * NOT: Yolun altındaki çim karoları yerinde durur; şerit onların 0.013 birim
 * üstüne oturur (kaldırım 0.005, asfalt 0.008 → yol en üstte, ama binanın
 * eşiği hâlâ görünür biçimde altta kalır).
 */
export function WitchShopWalkway() {
  const { pathWestX, entryEastX, pathSouthZ, pathNorthZ, entryWestX, frontZ } =
    WITCH_SHOP_WALKWAY;

  return (
    <group>
      {/* 1) Cephe boyunca uzanan ana şerit. */}
      <Plane
        westX={pathWestX}
        eastX={entryEastX}
        southZ={pathSouthZ}
        northZ={pathNorthZ}
        y={WALKWAY_Y}
        color="#c9bda2"
        roughness={0.94}
      />
      {/* Kenar bordürü — şeridin caddeye bakan kenarını belirginleştirir. */}
      <Plane
        westX={pathWestX}
        eastX={entryEastX}
        southZ={pathSouthZ}
        northZ={pathSouthZ - 0.12}
        y={WALKWAY_Y + 0.002}
        color="#a8977a"
        roughness={0.9}
      />
      {/* 2) Kapı eşiği — koridorun cepheyle buluştuğu yerde koyu ahşap. */}
      <Plane
        westX={entryWestX}
        eastX={entryEastX}
        southZ={pathNorthZ}
        northZ={frontZ - 0.35}
        y={WALKWAY_Y + 0.004}
        color="#6b4a2e"
        roughness={0.85}
      />
    </group>
  );
}
