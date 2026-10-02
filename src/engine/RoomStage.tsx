/**
 * 🏠 ODA SAHNESİ — oyuncu evinin İÇİ gerçek bir GLB modelidir
 * (`constants.ROOM_MODEL_URL` → `public/models/empty_office_space.glb`).
 *
 * Kapıdaki "Evine gir" düğmesine basınca açılan oda bu bileşenle kurulur:
 *   · model İNDİRİLİR, ÖLÇÜLÜR ve ana haritadan İZOLE bir bölgeye yerleştirilir
 *     (`ROOM_ISO.origin` = X/Z 2000 — caddeden 2000 birim uzak, hiçbir şeye
 *     çarpmaz), `roomModelPrep.ts` → `planIsoRoom`,
 *   · kamera odayı üstten İZOMETRİK görür, hedefi odanın merkezine sabittir,
 *   · karakter tam odanın merkezine doğar ve zeminin neresine dokunursan oraya
 *     yürür; DUVAR SINIRLARINDAN dışarı çıkamaz (odanın dışında zemin yoktur),
 *   · modelin "Floor"/"Zemin" mesh'i `placementZone` olarak işaretlenir ve
 *     düzenleme modunda eşyalar bu zeminin üstüne 0,5 m ızgaraya oturur.
 *
 * ⚠️ WEBGL BAĞLAM SAYISI — bu dosyanın en kritik kuralı:
 * Caddede ana sahne zaten bir WebGL bağlamı tutuyor ve cihazlar (özellikle
 * mobil) çok az sayıda bağlama izin veriyor. Üçüncü bir bağlam açılmaya
 * çalışıldığında oyun `Error creating WebGL context` ile çöktü. Bu yüzden:
 *   · oda açıkken caddeye EN FAZLA BİR bağlam eklenir — 3D oda canvas'ı
 *     AÇIKKEN yedek odanın avatar canvas'ı hiç çizilmez (`avatar: false`),
 *   · bağlam açılamıyorsa (`webglSupport.webglPowerPreference`) 3D sahne HİÇ
 *     kurulmaz ve bağlam, denemeyle SEÇİLEN `powerPreference` ile açılır,
 *   · sahne bağlamı kurulamazsa bağlam kendini BIRAKIR (`WebglContextKeeper`)
 *     ve sahne yeniden denenir (`useWebglRetry`) — denemeler biterse yedek
 *     oda kalır; oyun çökmez,
 *   · sahne kurulumu/indirme hata verirse sahne sökülür ve yedek oda kalır.
 *
 * NEDEN YEDEK VAR: model ağır olabilir ya da dosya eksik/bozuk olabilir.
 * Böyle bir durumda oyuncuyu boş bir ekranla bırakmak yoktur: `fallback`
 * (kodla çizilen oda) gösterilir; model hazır olduğunda 3D oda yumuşakça
 * ÜSTÜNE açılır. Yani oyun her koşulda odayı gösterir.
 *
 * HATA SINIRI NEDEN SAHNENİN İÇİNDE: `useGLTF` yükleme hatasını render
 * sırasında fırlatır ve WebGL sahnesinin içindeki hatalar yalnızca sahnenin
 * içindeki bir sınırla yakalanır (cadde tarafında `GlbBuildingBoundary` ile
 * aynı desen).
 */
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CanvasGuard, WebglContextKeeper, useWebglRetry } from "./WebglCanvas";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ROOM_ISO, ROOM_MODEL_URL } from "./constants";
import {
  analyzeRoomSurfaces,
  clampToRoom,
  cutRoomForInterior,
  findFloorMesh,
  markPlacementZone,
  measureRoomModel,
  planIsoRoom,
  roomInteriorBox,
  toRoomLocal,
  type IsoRoomPlan,
} from "./roomModelPrep";
import {
  FURNITURE,
  furnitureById,
  placeFurniture,
  type FurnitureDef,
} from "./roomBuild";
import { GlbCharacterPortrait } from "./GlbAvatar3D";
import { releaseCanvasContext, webglPowerPreference } from "./webglSupport";

/**
 * İzometrik bakışı kapatan parçaların ADI.
 *
 * Kamera odanın dışından, üstten baktığı için tavan/çatı varsa iç mekân
 * görünmez. Desen bilinçli olarak DAR tutuldu: yalnızca adı tavanı/çatıyı
 * açıkça söyleyen parçalar gizlenir (ör. "solid" gibi araya kaçabilecek
 * parçalar için `lid` gibi kısa desenler KULLANILMAZ).
 */
const CEILING_PARTS = /ceiling|roof|tavan|çatı|cati|plafon/i;

/** Odada dizilmiş tek bir eşya (yalnızca istemci belleğinde). */
interface PlacedItem {
  key: string;
  id: string;
  /** Odanın merkezine göre YEREL konum (ızgaraya oturmuş). */
  x: number;
  z: number;
}

/** Oda modelini indirmeye başla (kapı açılırken çağrılır — bkz. `World`). */
export function preloadRoomModel(): void {
  if (!ROOM_MODEL_URL) return;
  useGLTF.preload(ROOM_MODEL_URL);
}

/**
 * Odanın ışıkları.
 *
 * Modelin kendi ışığı yoktur (Sketchfab sahneleri ışıksız gelir); oda yumuşak
 * bir gündüz ışığı + tepeden sıcak bir ampulle aydınlatılır. Yoğunluklar odanın
 * ÖLÇÜLEN boyutuna göre kurulur: küçük modelin içinde patlamış parlaklık, büyük
 * modelde karanlık olmasın.
 */
function RoomLights({ plan }: { plan: IsoRoomPlan }) {
  const height = Math.max(1.8, plan.size.y);
  const reach = Math.max(4, plan.size.x + plan.size.z);
  return (
    <>
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#fff3e2", "#4c3a2b", 0.55]} />
      <directionalLight position={[6, height + 6, 6]} intensity={1.15} />
      <pointLight
        position={[0, height * 0.9, 0]}
        intensity={7}
        distance={reach}
        decay={2}
        color="#ffe7c2"
      />
    </>
  );
}

/**
 * Odanın kamerası — İZOMETRİK ve SABİT.
 *
 * Kamera `planIsoRoom`un hesapladığı noktaya bir kez konur ve hedefi odanın
 * MERKEZİNE kilitlenir (`ROOM_ISO.origin`). Salınım YOKTUR: eşya dizme
 * (raycaster) ve dokunarak yürütme, kameranın kıpırdamamasını gerektirir —
 * sallanan kamerada ızgara kayar ve dokunulan nokta kayar.
 */
function RoomCamera({ plan }: { plan: IsoRoomPlan }) {
  const { camera } = useThree();

  useLayoutEffect(() => {
    const shot = plan.camera;
    camera.position.set(shot.position[0], shot.position[1], shot.position[2]);
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      (camera as THREE.PerspectiveCamera).fov = shot.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(shot.target[0], shot.target[1], shot.target[2]);
  }, [camera, plan]);

  return null;
}

/**
 * GÖRÜNMEZ DUVAR ÇARPIŞMASI — odanın ölçülen ayak izinin çevresine konan
 * engeller.
 *
 * SAHİBİ `clampToRoom`dur: bu kutular fizik motoru olmadığı için kendiliğinden
 * hiçbir şeyi durdurmaz; asıl sınır matematiktir (karakter ve eşya sınırın
 * dışına ÇIKARILAMAZ). Kutular ileride raycast/fizik eklenirse hazır dursun ve
 * sahnenin gerçekten kapalı bir hacim olduğunu okutsun diye çizilir —
 * `visible={false}` oldukları için raycast onları ATLAR: zemine dokunuşu
 * engellemezler.
 */
function WallColliders({ half }: { half: { x: number; z: number } }) {
  const t = 0.12;
  const h = 3;
  const walls: [number, number, number, number, number, number][] = [
    [
      half.x + t,
      h / 2,
      0,
      t,
      h,
      half.z * 2 + t * 2,
    ],
    [-half.x - t, h / 2, 0, t, h, half.z * 2 + t * 2],
    [0, h / 2, half.z + t, half.x * 2 + t * 2, h, t],
    [0, h / 2, -half.z - t, half.x * 2 + t * 2, h, t],
  ];
  return (
    <>
      {walls.map((wall, i) => (
        <mesh
          key={i}
          position={[wall[0], wall[1], wall[2]]}
          visible={false}
          userData={{ roomWall: true }}
        >
          <boxGeometry args={[wall[3], wall[4], wall[5]]} />
          <meshBasicMaterial />
        </mesh>
      ))}
    </>
  );
}

/**
 * Odadaki karakter — sokaktaki avatarla AYNI model ve kuşam.
 *
 * Zeminin neresine dokunulursa oraya yürür (`moveTarget`) ve yürürken gittiği
 * yöne döner. Hareket hedefi `clampToRoom`dan geçmiş olduğu için karakter
 * odanın dışına — zemini olmayan boşluğa — çıkamaz.
 */
function RoomCharacter({
  plan,
  equipped,
  moveTarget,
}: {
  plan: IsoRoomPlan;
  equipped: string[];
  moveTarget: { current: { x: number; z: number } };
}) {
  const root = useRef<THREE.Group>(null);
  const yaw = useRef(0);

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const target = moveTarget.current;
    const dx = target.x - group.position.x;
    const dz = target.z - group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.03) {
      const step = Math.min(distance, 2.4 * Math.min(delta, 0.05));
      group.position.x += (dx / distance) * step;
      group.position.z += (dz / distance) * step;
      yaw.current = Math.atan2(dx, dz);
    }
    // Yumuşak dönüş: ani sıçrama yok.
    group.rotation.y += (yaw.current - group.rotation.y) * Math.min(1, delta * 9);
  });

  const radius = ROOM_ISO.characterHeight * 0.42;
  return (
    <group ref={root}>
      {/* Temas gölgesi: havada duruyor izlenimi vermesin. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[radius, 32]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>
      {/* Portre bileşeni karakteri kendi ekseninde ortalar; bu yüzden yarım boy
          yukarı alınarak AYAKLARI zemine (y 0) bastırılır. */}
      <group position={[0, ROOM_ISO.characterHeight / 2, 0]}>
        <GlbCharacterPortrait
          equipped={equipped}
          height={ROOM_ISO.characterHeight}
          spin={false}
        />
      </group>
    </group>
  );
}

/** Dizilmiş bir eşya — basit prizmalarla çizilir (harici varlık yok). */
function FurniturePiece({
  def,
  position,
  canRemove,
  onRemove,
}: {
  def: FurnitureDef;
  position: [number, number, number];
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <group
      position={position}
      onPointerDown={(event) => {
        // Yalnızca düzenleme modunda: eşyaya dokunmak onu KALDIRIR. Normal
        // modda eşya sadece dekor.
        if (!canRemove) return;
        event.stopPropagation();
        onRemove();
      }}
    >
      <mesh position={[0, def.h / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[def.w, def.h, def.d]} />
        <meshStandardMaterial color={def.color} roughness={0.85} />
      </mesh>
      {def.accent && (
        <mesh position={[0, def.h - 0.03, 0]} castShadow>
          <boxGeometry args={[def.w * 0.9, 0.06, def.d * 0.9]} />
          <meshStandardMaterial color={def.accent} roughness={0.6} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Odanın içi: izole bölge grubu + model + zemin + duvarlar + karakter + eşyalar.
 *
 * BÜTÜN ODA TEK BİR `origin` GRUBUNUN İÇİNDE durur: model, zemin, duvar
 * engelleri, karakter ve eşyalar aynı yerel uzayı paylaşır (merkez = odanın
 * merkezi, y 0 = zemin). Böylece "2000'e taşıma" tek satırdır ve oda içi
 * matematik temiz kalır.
 */
function RoomInterior({
  equipped,
  onReady,
  isBuildMode,
  buildItem,
  placed,
  onPlace,
  onRemove,
}: {
  equipped: string[];
  onReady: () => void;
  isBuildMode: boolean;
  buildItem: string;
  placed: PlacedItem[];
  onPlace: (x: number, z: number) => void;
  onRemove: (key: string) => void;
}) {
  const { scene } = useGLTF(ROOM_MODEL_URL);
  const { gl } = useThree();
  const moveTarget = useRef({ x: 0, z: 0 });

  // Yüzeyler geometriden okunur (zemin/tavan/duvarlar) — isim varsayımı YOK.
  const surfaces = useMemo(
    () => analyzeRoomSurfaces(scene as THREE.Object3D),
    [scene],
  );

  // Plan İÇ hacimden kurulur: zeminin ayak izi + tavan yüksekliği. DIŞ ölçü
  // kullanılırsa 8 birimlik bina gövdesi odayı yutar, karakter zemine basmaz
  // (taban, duvarların altına düşer). Kamera dış mekâna göre biraz yaklaşır
  // (`distanceScale`) ki oda ekranı doldursun.
  const plan = useMemo(() => {
    if (surfaces) {
      const interior = roomInteriorBox(surfaces);
      const box = interior.isEmpty() ? surfaces.box : interior;
      return planIsoRoom(box, {
        origin: ROOM_ISO.origin,
        scale: ROOM_ISO.scale,
        span: ROOM_ISO.span,
        fitBand: ROOM_ISO.fitBand,
        camera: { ...ROOM_ISO.camera, distanceScale: 0.7 },
      });
    }
    const raw = measureRoomModel(scene as THREE.Object3D);
    return raw ? planIsoRoom(raw) : null;
  }, [scene, surfaces]);

  // ZEMİN: adından/seklinden bulunur ve `placementZone` işaretlenir. Hiçbir
  // parça zemin sayılamıyorsa (tek mesh'e sıkışmış model) ölçülen kutudan
  // kodla bir düzlem kurulur → eşya dizme yine çalışır.
  const { floorMesh, fallbackFloor } = useMemo(() => {
    const found = findFloorMesh(scene as THREE.Object3D);
    return {
      floorMesh: markPlacementZone(found),
      fallbackFloor: found === null,
    };
  }, [scene]);

  // Gölge bayrakları: oda iç mekân olduğu için yalnızca ALIR (dışarıdan güneş
  // gelmez); karakter ve eşyalar gölge düşürür.
  //
  // İÇ MEKÂN KESİTİ (Sanalika/Habbo): model KAPALI bir kutudur — zemin, tavan
  // ve dört duvar (duvarlar binanın tüm gövdesi kadar yüksek olabilir). Kesit
  // alınmazsa oyuncu odanın içini değil kutunun DIŞINI görür. Bu yüzden
  // GEOMETRİDEN tavan ve kameraya BAKAN duvarlar gizlenir
  // (`roomModelPrep.cutRoomForInterior`). ADI tavanı söyleyen parçalar da ek
  // güvence olarak gizlenir.
  useEffect(() => {
    const root = scene as THREE.Object3D;
    if (!root?.isObject3D) return;
    cutRoomForInterior(root, {
      x: ROOM_ISO.camera.offset[0],
      z: ROOM_ISO.camera.offset[2],
    });
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (CEILING_PARTS.test(mesh.name ?? "")) {
        mesh.visible = false;
        return;
      }
      if (!mesh.visible) return; // kesitte gizlenen parçalara dokunma
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    });
  }, [scene]);

  // DİKEY KIRPMA: duvarların oda dışına taşan gövdesi (bina yüksekliği) odanın
  // yüksekliğinde KESİLİR. Dünya uzayında y ∈ [zemin, zemin + oda yüksekliği]
  // tutulur. Bu canvas'ta başka sahne yok; karakter ve eşyalar da zaten bu
  // aralıkta olduğu için global kırpma güvenlidir.
  useLayoutEffect(() => {
    if (!plan) return;
    const floorY = plan.origin[1];
    const topY = plan.origin[1] + plan.size.y;
    gl.clippingPlanes = [
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY + 0.002),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), topY + 0.002),
    ];
    return () => {
      gl.clippingPlanes = [];
    };
  }, [gl, plan]);

  useEffect(() => {
    if (plan) onReady();
  }, [plan, onReady]);

  /**
   * Zemine dokunuş: raycast sonuçları arasından `placementZone` işaretli ilk
   * kesişim seçilir. NEDEN TÜM KESİŞİMLER TARANIR: izometrik bakışta öndeki bir
   * duvar/tavan zeminden önce kesilebilir; ilk kesişime bakmak dokunuşu
   * "ölü" bırakırdı. Yüzeyi YİNE zemin seçiyoruz — duvara dokunmak eşya
   * yerleştirmez.
   */
  const handleFloorPress = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!plan) return;
      const hit = event.intersections.find(
        (i) => i.object.userData?.placementZone === true,
      );
      if (!hit) return;
      event.stopPropagation();
      const local = toRoomLocal(hit.point, plan);
      if (isBuildMode) {
        const def = furnitureById(buildItem);
        const spot = placeFurniture(local, def, plan.half);
        onPlace(spot.x, spot.z);
      } else {
        moveTarget.current = clampToRoom(
          local,
          plan.half,
          ROOM_ISO.characterRadius,
        );
      }
    },
    [plan, isBuildMode, buildItem, onPlace],
  );

  if (!plan) return null;

  const gridSpan = Math.max(plan.size.x, plan.size.z);
  const gridDivisions = Math.max(2, Math.round(gridSpan / ROOM_ISO.grid));

  return (
    <>
      <RoomCamera plan={plan} />
      <RoomLights plan={plan} />

      {/* ── İZOLE ODA BÖLGESİ: tek grup, tek merkez (ROOM_ISO.origin) ── */}
      <group position={plan.origin}>
        {/* Model: merkez X/Z'de, taban y 0'da — ölçülen kutuya göre. */}
        <group
          position={[plan.offset.x, plan.offset.y, plan.offset.z]}
          scale={plan.scale}
          onPointerDown={handleFloorPress}
        >
          <primitive object={scene} />
        </group>

        {/* Zemin yedeği: model kendi zeminini ayırt ettirmediğinde. */}
        {fallbackFloor && (
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.005, 0]}
            userData={{ placementZone: true }}
            onPointerDown={handleFloorPress}
          >
            <planeGeometry args={[plan.size.x, plan.size.z]} />
            <meshBasicMaterial
              color="#c9a06a"
              transparent
              opacity={0.12}
              depthWrite={false}
            />
          </mesh>
        )}

        {/* Duvarlar: karakter/eşya bu ölçülmüş ayak izinin dışına çıkamaz. */}
        <WallColliders half={plan.half} />

        {/* Düzenleme modunda 0,5 m ızgarası: eşyanın nereye oturacağı görünür. */}
        {isBuildMode && (
          <gridHelper
            args={[gridSpan, gridDivisions, "#f0c987", "#8a5a34"]}
            position={[0, 0.02, 0]}
          />
        )}

        {placed.map((item) => (
          <FurniturePiece
            key={item.key}
            def={furnitureById(item.id)}
            position={[item.x, 0, item.z]}
            canRemove={isBuildMode}
            onRemove={() => onRemove(item.key)}
          />
        ))}

        <RoomCharacter plan={plan} equipped={equipped} moveTarget={moveTarget} />
      </group>
    </>
  );
}

/** Oda modeli yüklenemezse sahnenin İÇİ sökülür (yedek oda kalır). */
class RoomBoundary extends Component<
  { children: ReactNode; onFail?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(`[oda modeli] ${ROOM_MODEL_URL} yüklenemedi:`, error);
    this.props.onFail?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface RoomStageProps {
  /** Karakterin kuşandığı eşyalar (sokattakiyle aynı görünüm). */
  equipped: string[];
  /**
   * Düzenleme (eşya dizme) araçları gösterilsin mi?
   *
   * Yalnızca odanın SAHİBİ için `true` gelir: komşunun odasına misafir olarak
   * giren oyuncu eşya dizmez (odayı yalnızca gezer).
   */
  canBuild?: boolean;
  /**
   * Model hazır değilken/hazırlanamazken gösterilen yedek oda.
   *
   * `avatar`: yedek odanın KENDİ WebGL canvas'ı (avatar) çizilsin mi?
   * 3D oda canvas'ı AÇIKKEN `false` gelir — böylece oda, caddeye tek
   * bağlam ekler (üç bağlam açılmaya çalışılınca oyun çöküyordu).
   */
  fallback: (opts: { avatar: boolean }) => ReactNode;
}

/**
 * Oda sahnesi: yedek oda altta durur, 3D oda hazır olduğunda üstüne açılır.
 * 3D oda hiç kurulamazsa/yüklenemezse sahne sökülür ve yedek oda (avatarıyla
 * birlikte) kalıcı olur.
 *
 * DÜZENLEME DURUMU (eşya listesi, seçili eşya) burada tutulur ve HİÇBİR YERE
 * YAZILMAZ: oda kapanınca (bileşen sökülünce) liste kendiliğinden sıfırlanır.
 * İstenen davranış bu: düzenleme istemci tarafı ve kalıcı değil.
 */
export function RoomStage({ equipped, canBuild = false, fallback }: RoomStageProps) {
  // Bağlam açılabiliyor mu ve hangi `powerPreference` ile? Açılamıyorsa 3D
  // sahneyi hiç denemeyiz; seçilen ayar gerçek sahneye aynen geçirilir
  // (`webglSupport.ts` → deneme ile sahne AYNI şeyi ister).
  const [power] = useState(webglPowerPreference);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showFallback, setShowFallback] = useState(true);
  // Bağlam kurulamazsa feda edilebilir bir bağlam bırakıp YENİ canvas ile
  // yeniden dener; denemeler biterse (`exhausted`) yedek oda kalıcı olur.
  const { attempt, exhausted, handleCreated } = useWebglRetry(2);
  // Bu odanın canlı renderer'ı. Sahne çöktüğünde bağlamı HEMEN bırakmak için
  // tutulur (bkz. `handleFail`).
  const roomGl = useRef<THREE.WebGLRenderer | null>(null);

  // ── Düzenleme modu (yalnızca istemci belleği) ──
  const [isBuildMode, setBuildMode] = useState(false);
  const [buildItem, setBuildItem] = useState(FURNITURE[0].id);
  const [placed, setPlaced] = useState<PlacedItem[]>([]);

  const handleReady = useCallback(() => setReady(true), []);
  /**
   * 3D oda çöktü (bağlam kurulamadı / model yüklenemedi): yedeğe düş.
   *
   * BAĞLAMI BURADA HEMEN BIRAKMAK ZORUNLUDUR. Oda canvas'ının kendi sökülme
   * yolu `WebglContextKeeper` üzerinden bırakmayı 400 ms GECİKTİRİR
   * (StrictMode'un aynı canvas'ı yeniden kurmasına dayanıklılık için). Ama
   * yedek oda, avatarı için YENİ bir bağlam ister; gecikme sürerken eski bağlam
   * hâlâ yuvayı tutar ve cihaz (özellikle mobil) üçüncü bağlamı reddeder →
   * `Error creating WebGL context.` Oyunun çökmemesi için oda bağlamı, yedeğin
   * avatar canvas'ı açılmadan ÖNCE serbest bırakılır.
   */
  const handleFail = useCallback(() => {
    if (roomGl.current) {
      releaseCanvasContext(roomGl.current);
      roomGl.current = null;
    }
    setFailed(true);
  }, []);
  const handleCanvasCreated = useCallback(() => {
    handleCreated();
  }, [handleCreated]);

  const handlePlace = useCallback(
    (x: number, z: number) => {
      setPlaced((prev) => [
        ...prev,
        { key: `f${prev.length}_${buildItem}`, id: buildItem, x, z },
      ]);
    },
    [buildItem],
  );
  const handleRemove = useCallback(
    (key: string) => setPlaced((prev) => prev.filter((item) => item.key !== key)),
    [],
  );

  // Yedek oda, 3D oda açıldıktan SONRA sökülür: geçiş yumuşak olur ve
  // gereksiz bir WebGL bağlamı açık kalmaz.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setShowFallback(false), 900);
    return () => window.clearTimeout(timer);
  }, [ready]);

  // Bağlam HİÇ açılamıyor: 3D sahne kurulmaz. Yedek odanın avatar canvas'ı da
  // AÇILMAZ — açılmaya çalışılsa tarayıcı yeni bir bağlam veremez ve oyun
  // `Error creating WebGL context` ile çökerdi. Oda, avatarsız da okunur.
  if (!power) {
    return <div className="absolute inset-0">{fallback({ avatar: false })}</div>;
  }
  // 3D sahne kurulamadı/denemeler tükendi: yedek oda kalıcı olur. `power`
  // dolu olduğu için ikinci bağlam (cadde + avatar) açılabilir; oda bağlamı da
  // `handleFail` içinde bırakıldı. Düzenleme araçları anlamsız → gösterilmez.
  if (failed || exhausted) {
    return <div className="absolute inset-0">{fallback({ avatar: true })}</div>;
  }

  const selected = furnitureById(buildItem);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {showFallback && (
        <div
          className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: ready ? 0 : 1 }}
        >
          {/* 3D oda canvas'ı canlı → yedek oda AVATARSIZ çizilir. */}
          {fallback({ avatar: false })}
        </div>
      )}
      {/* Model inerken dürüst bilgi: oyuncu "odam neden değişti" demesin. */}
      {!ready && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] font-bold text-white/85 backdrop-blur-sm">
          🚪 Oda yerleştiriliyor…
        </div>
      )}

      {/* ── DÜZENLEME PANELİ (yalnızca odanın sahibi) ── */}
      {canBuild && ready && (
        <div className="absolute inset-x-0 bottom-0 z-20 space-y-1.5 px-2 pb-2">
          {isBuildMode && (
            <p className="rounded-full bg-black/45 px-3 py-1 text-center text-[10px] font-bold text-white/85 backdrop-blur-sm">
              Zemine dokun → “{selected.label}” 0,5 m ızgaraya oturur · eşyaya
              dokun → kaldır
            </p>
          )}
          <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/45 p-1.5 backdrop-blur">
            <button
              type="button"
              onClick={() => setBuildMode((v) => !v)}
              className={`shrink-0 rounded-xl px-3 py-2 text-[11px] font-extrabold transition-colors ${
                isBuildMode
                  ? "bg-[#f0c987] text-[#3d2f2a]"
                  : "bg-white/10 text-white/90 hover:bg-white/20"
              }`}
            >
              {isBuildMode ? "✅ Bitti" : "🛠️ Düzenle"}
            </button>
            {isBuildMode && (
              <>
                <div className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {FURNITURE.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      onClick={() => setBuildItem(item.id)}
                      className={`shrink-0 rounded-xl px-2.5 py-2 text-base transition-colors ${
                        item.id === buildItem
                          ? "bg-[#f0c987]"
                          : "bg-white/10 hover:bg-white/20"
                      }`}
                    >
                      {item.emoji}
                    </button>
                  ))}
                </div>
                {placed.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPlaced([])}
                    className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-[11px] font-extrabold text-white/90 hover:bg-white/20"
                  >
                    🧹 Temizle
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <CanvasGuard onFail={handleFail} resetKey={attempt}>
        <Canvas
          key={attempt}
          style={{
            position: "absolute",
            inset: 0,
            opacity: ready ? 1 : 0,
            transition: "opacity 700ms ease",
          }}
          dpr={[1, 1.6]}
          shadows
          camera={{
            fov: ROOM_ISO.camera.fov,
            // İzometrik açı: odanın merkezine göre (12, 15, 12).
            position: [
              ROOM_ISO.origin[0] + ROOM_ISO.camera.offset[0],
              ROOM_ISO.origin[1] + ROOM_ISO.camera.offset[1],
              ROOM_ISO.origin[2] + ROOM_ISO.camera.offset[2],
            ],
            near: ROOM_ISO.near,
            far: ROOM_ISO.far,
          }}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: power,
            failIfMajorPerformanceCaveat: false,
          }}
          onCreated={({ gl }) => {
            // Renderer'ı tut: sahne çökerse `handleFail` bağlamı hemen bırakır.
            roomGl.current = gl;
            // Sokaktaki ana sahne gibi bu ikinci bağlam da kaybolursa sessizce
            // geri gelsin (mobilde bağlam baskısı altında oda siyah kalmasın).
            gl.domElement.addEventListener("webglcontextlost", (event) => {
              event.preventDefault();
            });
          }}
        >
          {/* Bağlamı kayıt defterine yazar, sökülünce BIRAKIR ve sahnenin
              gerçekten kurulduğunu `useWebglRetry`ye bildirir. */}
          <WebglContextKeeper
            priority={50}
            onCreated={handleCanvasCreated}
          />
          <RoomBoundary onFail={handleFail}>
            <Suspense fallback={null}>
              <RoomInterior
                equipped={equipped}
                onReady={handleReady}
                isBuildMode={isBuildMode}
                buildItem={buildItem}
                placed={placed}
                onPlace={handlePlace}
                onRemove={handleRemove}
              />
            </Suspense>
          </RoomBoundary>
        </Canvas>
      </CanvasGuard>
    </div>
  );
}
