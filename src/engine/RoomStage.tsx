/**
 * 🏠 ODA SAHNESİ — oyuncu evinin İÇİ gerçek bir GLB modelidir.
 *
 * Kapıdaki "Evine gir" düğmesine basınca açılan odanın içi bu bileşenle
 * kurulur: `constants.ROOM_MODEL_URL` modeli indirilir, ÖLÇÜLÜR ve odaya
 * oturtulur (`roomModelPrep.ts`), ortada da sokaktaki karakterin TA KENDİSİ
 * durur (aynı GLB avatarlar — `GlbCharacterPortrait`).
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
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { ROOM_CAMERA, ROOM_FIT, ROOM_MODEL_URL } from "./constants";
import {
  measureRoomModel,
  planRoomCamera,
  planRoomPlacement,
  roomStandPoint,
  type RoomPlacement,
} from "./roomModelPrep";
import { GlbCharacterPortrait } from "./GlbAvatar3D";
import { webglPowerPreference } from "./webglSupport";

/** Oda modelini indirmeye başla (kapı açılırken çağrılır — bkz. `World`). */
export function preloadRoomModel(): void {
  if (!ROOM_MODEL_URL) return;
  useGLTF.preload(ROOM_MODEL_URL);
}

/**
 * Odanın ışıkları.
 *
 * Modelin kendi ışığı yoktur (Sketchfab sahneleri ışıksız gelir); oda
 * yumuşak bir gündüz ışığı + tepeden sıcak bir ampulle aydınlatılır.
 * Yoğunluklar odanın ÖLÇÜLEN boyutuna göre kurulur: küçük modelin içinde
 * patlamış parlaklık, büyük modelde karanlık olmasın.
 */
function RoomLights({ plan }: { plan: RoomPlacement }) {
  const height = Math.max(1.8, plan.size.y);
  const reach = Math.max(4, plan.size.x + plan.size.z);
  return (
    <>
      <ambientLight intensity={0.8} />
      <hemisphereLight args={["#fff3e2", "#4c3a2b", 0.5]} />
      <directionalLight position={[2.5, height + 1, 2.5]} intensity={1.1} />
      <pointLight
        position={[0, height * 0.86, 0]}
        intensity={7}
        distance={reach}
        decay={2}
        color="#ffe7c2"
      />
    </>
  );
}

/**
 * Odanın kamerası — dikiz açı: odanın ön kenarında, göz hizasında durur.
 *
 * Kamera, model yüklendiğinde BİR KEZ yerleştirilir (`roomModelPrep.
 * planRoomCamera`); ardından çok hafif bir salınım (nefes) eklenir. Salınım
 * sahneyi canlı tutar ve gerçek bir 3D hacim olduğunu okutur — abartılı
 * hareket, odada duran oyuncuyu rahatsız eder.
 */
function RoomCamera({ plan }: { plan: RoomPlacement }) {
  const { camera } = useThree();
  const base = useRef(new THREE.Vector3());

  useLayoutEffect(() => {
    const shot = planRoomCamera(plan);
    base.current.set(shot.position[0], shot.position[1], shot.position[2]);
    camera.position.copy(base.current);
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      (camera as THREE.PerspectiveCamera).fov = shot.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(shot.target[0], shot.target[1], shot.target[2]);
  }, [camera, plan]);

  useFrame(({ camera: cam, clock }) => {
    const t = clock.elapsedTime;
    cam.position.set(
      base.current.x + Math.sin(t * 0.33) * 0.07,
      base.current.y + Math.sin(t * 0.51) * 0.025,
      base.current.z,
    );
    const shot = planRoomCamera(plan);
    cam.lookAt(shot.target[0], shot.target[1], shot.target[2]);
  });

  return null;
}

/** Odanın içi: model + karakter + ışık/kamera. */
function RoomInterior({
  equipped,
  onReady,
}: {
  equipped: string[];
  onReady: () => void;
}) {
  const { scene } = useGLTF(ROOM_MODEL_URL);

  const plan = useMemo(() => {
    const box = measureRoomModel(scene as THREE.Object3D);
    return box ? planRoomPlacement(box, ROOM_FIT.span) : null;
  }, [scene]);

  // Gölge bayrakları: oda iç mekân olduğu için yalnızca ALIR (dışarıdan güneş
  // gelmez); karakterin altına ayrıca yumuşak bir temas gölgesi çizilir.
  useEffect(() => {
    const root = scene as THREE.Object3D;
    if (!root?.isObject3D) return;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    });
  }, [scene]);

  useEffect(() => {
    if (plan) onReady();
  }, [plan, onReady]);

  if (!plan) return null;

  const stand = roomStandPoint(plan);

  return (
    <>
      <RoomCamera plan={plan} />
      <RoomLights plan={plan} />

      {/* Oda: tabanı zemine (y 0), merkezi orijinde — ölçülen kutuya göre. */}
      <group
        position={[plan.offset.x, plan.offset.y, plan.offset.z]}
        scale={plan.scale}
      >
        <primitive object={scene} />
      </group>

      {/* Karakterin altındaki temas gölgesi: havada duruyor izlenimi vermesin. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[stand.x, 0.012, stand.z]}>
        <circleGeometry args={[ROOM_FIT.characterHeight * 0.42, 32]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>

      {/* Ortadaki karakter: sokaktakiyle AYNI model ve kuşam. Portre
          bileşeni karakteri kendi ekseninde ortalar; bu yüzden yarım boy
          yukarı alınarak AYAKLARI zemine (y 0) bastırılır. */}
      <group position={[stand.x, ROOM_FIT.characterHeight / 2, stand.z]}>
        <GlbCharacterPortrait
          equipped={equipped}
          height={ROOM_FIT.characterHeight}
          spin={false}
        />
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
  /** Karakterin kuşandığı eşyalar (sokaktakiyle aynı görünüm). */
  equipped: string[];
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
 */
export function RoomStage({ equipped, fallback }: RoomStageProps) {
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

  const handleReady = useCallback(() => setReady(true), []);
  const handleFail = useCallback(() => setFailed(true), []);
  const handleCanvasCreated = useCallback(() => {
    handleCreated();
  }, [handleCreated]);

  // Yedek oda, 3D oda açıldıktan SONRA sökülür: geçiş yumuşak olur ve
  // gereksiz bir WebGL bağlamı açık kalmaz.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setShowFallback(false), 900);
    return () => window.clearTimeout(timer);
  }, [ready]);

  // 3D sahne yok: yedek oda kalıcı ve avatarını kendi çizebilir (başka
  // bağlam yok).
  if (!power || failed || exhausted) {
    return <div className="absolute inset-0">{fallback({ avatar: true })}</div>;
  }

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
          camera={{
            fov: ROOM_CAMERA.fov,
            position: [0, ROOM_CAMERA.eyeY, 2.4],
            near: 0.05,
            far: 300,
          }}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: power,
            failIfMajorPerformanceCaveat: false,
          }}
          onCreated={({ gl }) => {
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
              <RoomInterior equipped={equipped} onReady={handleReady} />
            </Suspense>
          </RoomBoundary>
        </Canvas>
      </CanvasGuard>
    </div>
  );
}
