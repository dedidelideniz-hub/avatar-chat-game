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
  defaultDecorFor,
  furnitureById,
  placeFurniture,
  type FurnitureDef,
  type PlacedItem,
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

/* ════════════════════════════════════════════════════════════
   ODA ORTAMI — oda EKRANI cadde ekranı kadar DOLU dursun

   Sorun: oda tek bir kesit kutusuydu ve çevresi düz koyu kahve bir BOŞLUKTU
   (ekranın yarısına yakını "hiçbir yer"). Cadde ise ekranı dolduruyor: zemin
   ufka kadar uzanıyor, sis ufku gökyüzüne bağlıyor. Oda da AYNI desenle
   kurulur:
     · gökyüzü rengi sahnenin arka planı olur (canvas artık saydam değil),
     · aynı renkte UZAKLIK SİSİ ufku yutar (düz renk bandı oluşmasın),
     · odanın ÇEVRESİ zeminle döşenir (`RoomGround`): oda boşlukta yüzen bir
       kutu değil, bir yerde duran bir mekân olur,
     · kamera çerçeve payını azaltıp odaya biraz DAHA YAKLAŞIR
       (`ROOM_FRAME_FILL`): oda ekranı doldurur, kenarlardan hafifçe taşar.

   Renkler SICAK (alacakaranlık) seçildi: oda ışığı ve turuncu çerçeve sıcak;
   mavi bir gökyüzü sıcak iç mekânı soğuk/kopuk gösteriyordu. Krem duvarlar
   (WALL_WARM) bu zemin ve gökyüzü tonlarının üstünde net okunur.
   ════════════════════════════════════════════════════════════ */
const ROOM_ENV = {
  /** Gökyüzü = arka plan = SİS RENGİ (üçü aynı olmalı, yoksa ufukta bant olur). */
  sky: "#4a3423",
  /** Odanın çevresini döşeyen zemin (gökyüzünden açık: ufuk okunur). */
  ground: "#9a6f45",
  /**
   * Sis başlangıcı. ODA ASLA SİSLENMEZ: en uzak köşenin kameraya uzaklığı bu
   * modelde ~28 birim — bu yüzden 40 seçildi (pay bırakır).
   */
  fogNear: 40,
  /** Sis bitişi: bu mesafeden sonrası tümüyle gökyüzü rengi → zeminin ucu görünmez. */
  fogFar: 130,
  /** Zemin döşemesinin toplam açıklığı (sisin çok ötesinde biter). */
  groundSpan: 260,
  /**
   * Zeminin parkeden alçaklığı (birim): iki yüzey AYNI yükseklikte olursa
   * tam örtüştükleri yerde kırpışır (z-fighting). 1,5 cm ayırmak hem bunu hem
   * de oda zemininin önde kalmasını sağlar (kırpma sınırının İÇİNDE kalır —
   * bkz. `RoomInterior` → `gl.clippingPlanes`).
   */
  groundDrop: -0.015,
} as const;

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
      {/* ORTAM IŞIĞI — Sanalika gibi CIVIL CIVIL, parlak ve SICAK: yüksek
          ambient + sıcak sarı yönlü ışık (spec: “sıcak sarı/beyaz
          DirectionalLight + AmbientLight”). Gölgede kalan yüz kalmıyor. */}
      <ambientLight intensity={1.35} color="#fff1d6" />
      <hemisphereLight args={["#fff5e2", "#8a6644", 0.95]} />
      <directionalLight
        position={[6, height + 6, 6]}
        intensity={1.85}
        color="#ffe3ad"
      />
      {/* Dolgu ışığı: kesitte kalan uzak duvarlar gölgede siyaha düşmesin. */}
      <directionalLight
        position={[-5, height + 3, -5]}
        intensity={0.65}
        color="#d7e6ff"
      />
      <pointLight
        position={[0, height * 0.8, 0]}
        intensity={7}
        distance={reach}
        decay={2}
        color="#ffd99a"
      />
    </>
  );
}

/**
 * Odanın çevresindeki SICAK ÇERÇEVE (Sanalika'daki sarı/turuncu kalın kenar).
 *
 * Dört duvarın üstüne oturan çubuklar + köşe direkleri: izometrik bakışta oda,
 * kendi renginde bir çerçeveyle sarılmış görünür — iç mekân "kutunun içinde
 * kaybolmuş" değil, çerçevelenmiş bir SAHNE olur.
 */
function RoomFrame({ half, y }: { half: { x: number; z: number }; y: number }) {
  const t = 0.22; // çerçeve kalınlığı
  const h = 0.16; // çerçeve yüksekliği
  const bars: [number, number, number, number, number, number][] = [
    [0, y, half.z + t / 2, half.x * 2 + t * 2, h, t],
    [0, y, -half.z - t / 2, half.x * 2 + t * 2, h, t],
    [half.x + t / 2, y, 0, t, h, half.z * 2 + t * 2],
    [-half.x - t / 2, y, 0, t, h, half.z * 2 + t * 2],
  ];
  const posts: [number, number][] = [
    [half.x + t / 2, half.z + t / 2],
    [half.x + t / 2, -half.z - t / 2],
    [-half.x - t / 2, half.z + t / 2],
    [-half.x - t / 2, -half.z - t / 2],
  ];
  return (
    <>
      {bars.map((bar, i) => (
        <mesh key={`bar-${i}`} position={[bar[0], bar[1], bar[2]]}>
          <boxGeometry args={[bar[3], bar[4], bar[5]]} />
          <meshStandardMaterial
            color="#f2a93b"
            emissive="#7a4a12"
            emissiveIntensity={0.3}
            roughness={0.5}
          />
        </mesh>
      ))}
      {posts.map((post, i) => (
        <mesh
          key={`post-${i}`}
          position={[post[0], y / 2, post[1]]}
        >
          <boxGeometry args={[t, y, t]} />
          <meshStandardMaterial
            color="#e09a32"
            emissive="#6b3f10"
            emissiveIntensity={0.3}
            roughness={0.55}
          />
        </mesh>
      ))}
    </>
  );
}

/**
 * Sıcak duvar tonu. Modelin gri/beton duvar kaplaması (baseColorTexture) bu
 * renkle ÇARPILIR: oda “ofis/depo” değil, SICAK EV gibi okunur. Doku korunur
 * (harita değişmez), yalnız ton ısınır. Aynı malzemenin iki kez boyanmaması
 * için `warmedMaterials` kullanılır (yeniden açılışta koyulaşmasın).
 */
const WALL_WARM = new THREE.Color("#e3b183");
const warmedMaterials = new WeakSet<THREE.Material>();

/**
 * Duvar yüksekliği = karakterin bu katı (Sanalika duvarları alçaktır).
 * Modelin tavan yüksekliği (ör. 3.4 birim) tavan tavan yüksek duruyordu.
 */
const WALL_HEIGHT_FACTOR = 1.35;

/**
 * ÇERÇEVE DOLDURMA — kamera odaya bu kadar DAHA YAKLAŞIR (1 = tam sığdırma).
 *
 * "Oda küçük görünmesin" geri bildirimi: oda, ekran oranına tam sığdırıldığında
 * (izometrik eşkenar dörtgen, dikey ekranda) üstte/altta geniş boşluk kalıyordu.
 * 1,08 → odanın sol/sağ köşeleri ekranın birkaç santim dışına taşar; cadde
 * sahnesinde de dünya ekranın kenarlarından taşar. Taşan kısım yalnızca köşe
 * uçlarıdır (zeminin ortası ve duvarlar tam görünür kalır).
 */
const ROOM_FRAME_FILL = 1.08;

/**
 * Odanın kamerası — İZOMETRİK ve SABİT.
 *
 * Kamera `planIsoRoom`un hesapladığı noktaya bir kez konur ve hedefi odanın
 * MERKEZİNE kilitlenir (`ROOM_ISO.origin`). Salınım YOKTUR: eşya dizme
 * (raycaster) ve dokunarak yürütme, kameranın kıpırdamamasını gerektirir —
 * sallanan kamerada ızgara kayar ve dokunulan nokta kayar.
 */
function RoomCamera({ plan, topY }: { plan: IsoRoomPlan; topY: number }) {
  const { camera, size } = useThree();

  useLayoutEffect(() => {
    const shot = plan.camera;
    const center = new THREE.Vector3(
      plan.origin[0],
      plan.origin[1],
      plan.origin[2],
    );
    // Yön (origin → spec pozisyonu) KORUNUR; yalnız mesafe uyarlanır.
    const dir = new THREE.Vector3(
      shot.position[0] - center.x,
      shot.position[1] - center.y,
      shot.position[2] - center.z,
    );
    if (dir.lengthSq() === 0) dir.set(1, 1, 1);
    dir.normalize();

    // Odayı HER EKRAN ORANINDA TAM ÇERÇEVELE (telefonda taşmasın, masaüstünde
    // boşluk kalmasın): kutunun köşelerini kameraya dik iki eksende ölçüp
    // gereken mesafeyi bul. Kamera daha önce sabit uzaklıktaydı; zemin ekranda
    // küçük kalıyordu.
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const camUp = new THREE.Vector3().crossVectors(dir, right).normalize();
    const vFov = THREE.MathUtils.degToRad(shot.fov);
    const aspect = Math.max(0.25, size.width / Math.max(1, size.height));
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

    let distance = 0;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (const y of [plan.origin[1], topY]) {
          const p = new THREE.Vector3(
            sx * plan.half.x,
            y - center.y,
            sz * plan.half.z,
          );
          distance = Math.max(
            distance,
            Math.abs(p.dot(right)) / Math.tan(hFov / 2) + p.dot(dir),
            Math.abs(p.dot(camUp)) / Math.tan(vFov / 2) + p.dot(dir),
          );
        }
      }
    }
    // Pay: oda ekranı DOLDURSUN — köşeler kenara yapışsın, üstte/altta
    // gereksiz boşluk kalmasın (bkz. `ROOM_FRAME_FILL`).
    distance /= ROOM_FRAME_FILL;

    camera.position.copy(center).addScaledVector(dir, distance);
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      (camera as THREE.PerspectiveCamera).fov = shot.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(center);
  }, [camera, plan, topY, size.width, size.height]);

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
  // Hareket bayrağı: avatar (portre) bu ref'e bakıp idle ↔ YÜRÜME geçişi
  // yapar. Ref ile verilir çünkü kare başına React render'ı istemeyiz.
  const moving = useRef(false);

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    const target = moveTarget.current;
    const dx = target.x - group.position.x;
    const dz = target.z - group.position.z;
    const distance = Math.hypot(dx, dz);
    moving.current = distance > 0.06;
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
          movingRef={moving}
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
 * ODA ZEMİNİ (çevre) — odanın DIŞINI döşeyen zemin.
 *
 * Oda, duvarların dışında hiçbir şeyin olmadığı bir boşlukta duruyordu: kesit
 * kutunun etrafı bomboş görünüyordu. Cadde sahnesinde zemin ufka kadar uzanır ve
 * sis ufku gökyüzüne bağlar; oda da öyle olmalı.
 *
 * ZEMİN TEK DÜZLEM DEĞİL, ODANIN AYAK İZİNİ "ÇERÇEVE" GİBİ SARAN DÖRT
 * PARÇADIR: tek büyük düzlem odanın zeminini (parkeyi) kaplar (ikisi aynı
 * yükseklikte, üstteki alttakini gizler). Dört parça, odanın döşemesini açıkta
 * bırakırken çevreyi kesintisiz döşer.
 *
 * KENARDA ÇİZGİ/BOŞLUK OLMASIN: parçalar odanın ayak izinin 5 cm ALTINA kadar
 * sokulur (parkenin altına girer) ve zemin parkeden 1,5 cm AŞAĞIYA konur. Aksi
 * hâlde tam bitişik iki yüzey aynı yükseklikte çakışıp kırpışır (z-fighting),
 * ya da aralarında kalan santimlerden arka plan görünür.
 */
function RoomGround({ half }: { half: { x: number; z: number } }) {
  /** Odanın döşemesiyle ARADA boşluk kalmaması için iç kenarın örtüşmesi. */
  const tuck = 0.05;
  const innerX = Math.max(0.5, half.x - tuck);
  const innerZ = Math.max(0.5, half.z - tuck);
  const reach = ROOM_ENV.groundSpan / 2;
  const sideX = reach - innerX;
  const sideZ = reach - innerZ;
  // [genişlik, derinlik, x, z] — dördü odanın ayak izini ortada bırakır.
  const patches: [number, number, number, number][] = [
    [reach * 2, sideZ, 0, (innerZ + reach) / 2],
    [reach * 2, sideZ, 0, -(innerZ + reach) / 2],
    [sideX, innerZ * 2, (innerX + reach) / 2, 0],
    [sideX, innerZ * 2, -(innerX + reach) / 2, 0],
  ];
  return (
    <>
      {patches.map(([w, d, x, z], i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[x, ROOM_ENV.groundDrop, z]}
          userData={{ roomGround: true }}
        >
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color={ROOM_ENV.ground} roughness={1} />
        </mesh>
      ))}
    </>
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
  onPlan,
  isBuildMode,
  buildItem,
  placed,
  onPlace,
  onRemove,
}: {
  equipped: string[];
  onReady: () => void;
  /**
   * Ölçülen plan sahne DIŞINA bildirilir (bir kez): açılış dekoru odanın
   * gerçek boyutuna göre YERLEŞTİRİLSİN diye (bkz. `RoomStage` → `handlePlan`).
   */
  onPlan: (plan: IsoRoomPlan) => void;
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
        camera: ROOM_ISO.camera,
      });
    }
    const raw = measureRoomModel(scene as THREE.Object3D);
    return raw ? planIsoRoom(raw) : null;
  }, [scene, surfaces]);

  // DUVAR YÜKSEKLİĞİ (kırpma + çerçeve): tavan tavan yüksek duvarlar yerine
  // Sanalika gibi ALÇAK duvarlar — oda "kutu" değil, içine bakılan bir sahne.
  const wallHeight = plan
    ? Math.min(plan.size.y, ROOM_ISO.characterHeight * WALL_HEIGHT_FACTOR)
    : 0;

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

    // SICAK KAPLAMA: gri/beton duvar kaplaması ısıtılır (doku korunur, ton
    // sıcak bej/ahşaba çekilir) → “ofis/depo” hissi yerine “sıcak ev”.
    for (const wall of surfaces?.walls ?? []) {
      if (!wall.mesh.visible) continue;
      const material = wall.mesh.material;
      const list = Array.isArray(material) ? material : [material];
      for (const entry of list) {
        if (!entry || warmedMaterials.has(entry)) continue;
        warmedMaterials.add(entry);
        const standard = entry as THREE.MeshStandardMaterial;
        if (standard.color) standard.color.lerp(WALL_WARM, 0.55);
        if (standard.emissive) {
          standard.emissive.lerp(WALL_WARM, 0.22);
          standard.emissiveIntensity = Math.max(
            standard.emissiveIntensity ?? 0,
            0.14,
          );
        }
        standard.needsUpdate = true;
      }
    }
  }, [scene, surfaces]);

  // DİKEY KIRPMA: duvarların oda dışına taşan gövdesi (bina yüksekliği) odanın
  // yüksekliğinde KESİLİR. Dünya uzayında y ∈ [zemin, zemin + oda yüksekliği]
  // tutulur. Bu canvas'ta başka sahne yok; karakter ve eşyalar da zaten bu
  // aralıkta olduğu için global kırpma güvenlidir.
  useLayoutEffect(() => {
    if (!plan) return;
    const floorY = plan.origin[1];
    const topY = plan.origin[1] + wallHeight;
    // Alt sınır zeminin 1,5 cm altına iner (`ROOM_ENV.groundDrop` orada durur),
    // üst sınır duvarların tepesinde biter.
    gl.clippingPlanes = [
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY + 0.02),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), topY + 0.002),
    ];
    return () => {
      gl.clippingPlanes = [];
    };
  }, [gl, plan, wallHeight]);

  useEffect(() => {
    if (!plan) return;
    onReady();
    onPlan(plan);
  }, [plan, onReady, onPlan]);

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
      <RoomCamera plan={plan} topY={plan.origin[1] + wallHeight} />
      <RoomLights plan={plan} />

      {/* ── İZOLE ODA BÖLGESİ: tek grup, tek merkez (ROOM_ISO.origin) ── */}
      <group position={plan.origin}>
        {/* ÇEVRE ZEMİNİ — oda boşlukta yüzmesin (bkz. `RoomGround`). */}
        <RoomGround half={plan.half} />

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

        {/* Sıcak turuncu çerçeve: duvarların üstünde + köşelerde (Sanalika). */}
        <RoomFrame half={plan.half} y={wallHeight} />

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
  // Açılış dekoru BİR KEZ serilir: model ölçülüp plan çıkınca (o zamana kadar
  // odanın gerçek boyutu bilinmiyor — bkz. `defaultDecorFor`). Ref, StrictMode
  // etkilerinin iki kez çalışmasına ve yeniden kurulumlara karşı kilit.
  const decorSeeded = useRef(false);

  const handleReady = useCallback(() => setReady(true), []);
  /**
   * Oda ölçüldü: AÇILIŞ DEKORUNU yerleştir.
   *
   * Dekor, oyuncunun dizdiği eşya listesine NORMAL parçalar olarak eklenir:
   * düzenleme modunda dokununca kalkar, "🧹 Temizle" hepsini birlikte süpürür,
   * oda kapanınca liste sıfırlanır (kalıcı değil — düzenleme tamamen istemcide).
   * Oyuncu odadan bir şey dizmişse (liste doluysa) dokunulmaz.
   */
  const handlePlan = useCallback((plan: IsoRoomPlan) => {
    if (decorSeeded.current) return;
    decorSeeded.current = true;
    setPlaced((prev) => (prev.length > 0 ? prev : defaultDecorFor(plan.half)));
  }, []);
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
            // İzometrik açı: odanın merkezine göre `ROOM_ISO.camera.offset`
            // (mesafe `RoomCamera` içinde oda ölçüsünden yeniden hesaplanır).
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
          {/* ORTAM — oda ekranı cadde gibi DOLSUN: gökyüzü + ufku yutan sis
              (ikisi de aynı renk olmak zorunda, bkz. `ROOM_ENV`). */}
          <color attach="background" args={[ROOM_ENV.sky]} />
          <fog
            attach="fog"
            args={[ROOM_ENV.sky, ROOM_ENV.fogNear, ROOM_ENV.fogFar]}
          />

          <WebglContextKeeper
            priority={50}
            onCreated={handleCanvasCreated}
          />
          <RoomBoundary onFail={handleFail}>
            <Suspense fallback={null}>
              <RoomInterior
                equipped={equipped}
                onReady={handleReady}
                onPlan={handlePlan}
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
