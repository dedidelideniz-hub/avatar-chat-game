/**
 * 🧪 AŞAMALI 3D SONDASI — APK çökmesini BÖLEREK bulmak için.
 *
 * `World` sayfası izolasyon aşamasındayken (1–8) gerçek motor
 * (`GameEngine3D`) yerine bu bileşen çizilir. Amaç üretim deneyimi değil,
 * ÖLÇÜM: her aşama bir öncekine TEK bir değişken ekler.
 *
 *   AŞAMA 1  canvas YOK              (bkz. `StageDomOnly`)
 *   AŞAMA 2  boş canvas + ışık       (hiçbir GLB, hiçbir drei yükleyicisi)
 *   AŞAMA 3  + zemin GLB
 *   AŞAMA 4  + karakter GLB
 *   AŞAMA 5  + ağaç        AŞAMA 6  + çim
 *   AŞAMA 7  + cadı dükkânı          AŞAMA 8  + oyuncu skini
 *
 * İki kural:
 *   1. VARLIKLAR SIRAYLA yüklenir (aynı anda tek GLB): aksi halde eşzamanlılık
 *      ölçümü yine kirletir ve "hangi model öldürüyor?" sorusu cevapsız kalır.
 *   2. Eşik AYARLARI KASITLI OLARAK MİNİMUM: `dpr` varsayılan 1, MSAA kapalı,
 *      gölge yok, environment/post-processing yok. Yani buradaki çökme "ağır
 *      ayar" değil, doğrudan varlık/bağlam sorunudur.
 *
 * Bir varlık yüklenemezse oyun DÜŞMEZ: varlık "hata" işaretlenir, sıra
 * devam eder (bkz. `StageAssetBoundary`) ve panelde kırmızı satır kalır.
 */
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CanvasGuard, WebglContextKeeper } from "./WebglCanvas";
import { WITCH_SHOP_MODEL_URL } from "./constants";
import { CHARACTER_MODEL_URL, FALLBACK_MODEL_URL } from "./GlbAvatar3D";
import { GRASS_GROUND_URL } from "./grassGroundPrep";
import { GRASS_CLUMP_MODEL_URL, TREE_MODEL_URL } from "./vegModelPrep";
import {
  attachContextDiagnostics,
  memorySnapshot,
  noStreetAssetsEnabled,
  stageAssets,
  stageDpr,
  stageInfo,
  stageSource,
  traceStep,
  type StageAssetId,
} from "./worldDebug";
import { stageMark } from "./androidProbe";
import { useProbedGltf } from "./probedGltf";

/** Sonda varlık kimliği → gerçek GLB yolu. */
export const STAGE_ASSET_URLS: Record<StageAssetId, string> = {
  ground: GRASS_GROUND_URL,
  character: CHARACTER_MODEL_URL,
  tree: TREE_MODEL_URL,
  grass: GRASS_CLUMP_MODEL_URL,
  witchShop: WITCH_SHOP_MODEL_URL,
  // Oyuncu skini: en ağır karakter varlığı (`skin-savasci`, ~29 MiB GPU dokusu).
  skin: FALLBACK_MODEL_URL,
};

export const STAGE_ASSET_LABELS: Record<StageAssetId, string> = {
  ground: "zemin",
  character: "karakter",
  tree: "ağaç",
  grass: "çim",
  witchShop: "cadı dükkânı",
  skin: "oyuncu skini",
};

export type StageAssetState = "bekliyor" | "iniyor" | "hazır" | "hata";

const STATE_STYLE: Record<StageAssetState, string> = {
  bekliyor: "text-white/45",
  iniyor: "text-amber-300",
  hazır: "text-emerald-300",
  hata: "text-red-400",
};

const STATE_MARK: Record<StageAssetState, string> = {
  bekliyor: "·",
  iniyor: "…",
  hazır: "✔",
  hata: "✘",
};

/* ── Varlık sırası: TEK TEK ─────────────────────────────────────────────── */

interface ChainProps {
  ids: readonly StageAssetId[];
  onState: (id: StageAssetId, state: StageAssetState) => void;
}

/**
 * Varlıkları SIRAYLA yükler: bir sonraki, ancak öncekinin ilk kareleri
 * çizildikten sonra başlar. Sıra bilinçli — amaç eşzamanlılığı ortadan
 * kaldırıp tek tek ölçmek.
 */
function StageAssetChain({ ids, onState }: ChainProps) {
  const [index, setIndex] = useState(0);
  const id = ids[index];
  const advance = useCallback(() => setIndex((value) => value + 1), []);

  if (!id) return null;
  const url = STAGE_ASSET_URLS[id];
  const spread = (index - (ids.length - 1) / 2) * 6;

  return (
    <StageAssetBoundary key={id} id={id} onState={onState} onSettled={advance}>
      <Suspense fallback={<StageAssetPending id={id} onState={onState} />}>
        <StageAssetModel
          id={id}
          url={url}
          position={[spread, 0, 0]}
          onState={onState}
          onSettled={advance}
        />
      </Suspense>
    </StageAssetBoundary>
  );
}

/** İndirme/çözme sürerken sıra bilgisi verir (fallback içinde monte olur). */
function StageAssetPending({
  id,
  onState,
}: {
  id: StageAssetId;
  onState: (id: StageAssetId, state: StageAssetState) => void;
}) {
  useEffect(() => {
    onState(id, "iniyor");
    traceStep(`stage:asset-start:${id}`);
  }, [id, onState]);
  return null;
}

/**
 * Modeli sahneye koyar ve İLK KARELER ÇİZİLDİKTEN sonra "hazır" bildirir.
 *
 * Neden kare bekliyor: GLTFLoader dokuları GPU'ya ancak malzeme ilk kez
 * çizildiğinde yükler. "Parse bitti" demek "GPU'da bu kadar yer kaplıyor"
 * demek DEĞİLDİR — ölçümün anlamlı olması için gerçekten çizilmesi gerekir.
 */
function StageAssetModel({
  id,
  url,
  position,
  onState,
  onSettled,
}: {
  id: StageAssetId;
  url: string;
  position: [number, number, number];
  onState: (id: StageAssetId, state: StageAssetState) => void;
  onSettled: () => void;
}) {
  const { scene } = useProbedGltf(url, id);
  const frames = useRef(0);
  const settled = useRef(false);

  useFrame(() => {
    if (settled.current) return;
    frames.current += 1;
    if (frames.current < 3) return;
    settled.current = true;
    onState(id, "hazır");
    traceStep(`stage:asset-ready:${id}`);
    onSettled();
  });

  // Model önbellekten gelir; konumu KAPSAM grubuna veriyoruz ki paylaşılan
  // sahnenin kendi dönüşümü değişmesin (drei önbelleği tüm uygulama için ortak).
  return (
    <group position={position}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * Tek varlık için hata sınırı: yüklenemeyen model oyunu DÜŞÜRMEZ, "hata"
 * olarak işaretlenir ve sıra bir sonraki varlığa geçer (bkz. istek §13).
 */
class StageAssetBoundary extends Component<
  {
    id: StageAssetId;
    onState: (id: StageAssetId, state: StageAssetState) => void;
    onSettled: () => void;
    children: ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(
      `[STAGE] varlık yüklenemedi: ${this.props.id} (${STAGE_ASSET_URLS[this.props.id]})`,
      error,
    );
    this.props.onState(this.props.id, "hata");
    traceStep(`stage:asset-failed:${this.props.id}`);
    this.props.onSettled();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/* ── Kamera (sabit, ölçüm için) ─────────────────────────────────────────── */

function StageCamera() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 6, 14);
    camera.lookAt(0, 1.5, 0);
  }, [camera]);
  return null;
}

/* ── Panel ─────────────────────────────────────────────────────────────── */

export function WorldStageProbe({
  stage,
  isMobile,
}: {
  stage: number;
  isMobile: boolean;
}) {
  const info = useMemo(() => stageInfo(stage), [stage]);
  // 🎯 TEK TEK MODEL SEÇİMİ: aşamanın kendi listesi ya da `?stageAssets=` /
  // panelden yapılan seçim (madde 7 matrisi — "zemin + ağaç" gibi aradakiler).
  const assets = useMemo(() => stageAssets(stage), [stage]);
  const [states, setStates] = useState<Partial<Record<StageAssetId, StageAssetState>>>({});
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(Date.now());

  const onState = useCallback(
    (id: StageAssetId, state: StageAssetState) => {
      setStates((current) =>
        current[id] === state ? current : { ...current, [id]: state },
      );
    },
    [],
  );

  // Süre sayacı: "kaç saniye sonra düştü?" sorusunun cevabı APK'da kritik.
  useEffect(() => {
    const id = window.setInterval(
      () => setElapsed(Date.now() - startedAt.current),
      500,
    );
    return () => window.clearInterval(id);
  }, []);

  const assetRows = assets.map((id) => ({
    id,
    label: STAGE_ASSET_LABELS[id],
    state: states[id] ?? "bekliyor",
  }));
  const allReady =
    assetRows.length > 0 && assetRows.every((row) => row.state === "hazır");
  const anyFailed = assetRows.some((row) => row.state === "hata");
  const finished = allReady || anyFailed;

  // Aşama tamamlandı: iz bırak (çöküş tespitinde "sağlıklı" adım sayılır).
  // Not: `elapsed` bağımlılıklara BİLEREK eklenmez — eklenirse sayaç her
  // yarım saniyede değişip izi sınırsız kez yeniden yazardı. Süre, satır-içi
  // okunur (iz yalnızca "bitti" anında düşer).
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  useEffect(() => {
    if (!finished) return;
    traceStep("stage:probe-done", `aşama ${stage} · ${elapsedRef.current} ms`);
  }, [finished, stage]);

  const seconds = (elapsed / 1000).toFixed(1);
  const memory = elapsed > 0 && Math.floor(elapsed / 1000) % 4 === 0
    ? memorySnapshot()
    : null;

  return (
    <div className="absolute inset-0 z-[60] overflow-hidden bg-[#0b1220]">
      <CanvasGuard>
        <Canvas
          // ÖLÇÜM AYARLARI (kasıtlı minimum): piksel oranı panelden seçilir,
          // MSAA ve gölge KAPALI, düşük güç tercihi. Üretim ayarları burada
          // DENENMEZ — amaç tek değişkenli ölçüm.
          dpr={stageDpr()}
          shadows={false}
          frameloop="always"
          gl={{ antialias: false, alpha: false, powerPreference: "low-power" }}
          camera={{ position: [0, 6, 14], fov: 50, near: 0.1, far: 300 }}
          className="absolute inset-0"
          style={{ pointerEvents: "none" }}
          onCreated={({ gl }) => {
            stageMark("CANVAS_MOUNTED", `sonda · aşama ${stage} · dpr ${stageDpr()}`);
            // Bağlam kaybı = "renderer/işleyici öldü" imzası. APK'da kesin kanıt.
            attachContextDiagnostics(gl.domElement, `sonda-aşama-${stage}`);
            traceStep("stage:canvas-created", `aşama ${stage} · ${isMobile ? "mobil" : "masaüstü"}`);
          }}
        >
          <WebglContextKeeper
            priority={5}
            onCreated={() => traceStep("stage:context-registered", `aşama ${stage}`)}
          />
          <StageCamera />
          <color attach="background" args={["#0f1b30"]} />
          <ambientLight intensity={1.15} />
          <directionalLight position={[5, 9, 6]} intensity={1.5} />
          <StageAssetChain ids={assets} onState={onState} />
        </Canvas>
      </CanvasGuard>

      {/* Panel: APK'da tek geri bildirim kaynağı — büyük, okunur, kopyalanabilir. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/70 p-3 text-white shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-amber-300">
              {noStreetAssetsEnabled() ? "DEBUG WORLD · " : ""}Aşama {stage} · {info.label}
            </span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold">
              {seconds} sn
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold leading-4 text-white/70">
            {info.content}
          </p>
          {noStreetAssetsEnabled() && (
            <p className="mt-1 rounded-lg bg-amber-300/15 px-2 py-1 text-[10px] font-bold leading-4 text-amber-200">
              DEBUG WORLD — `VITE_ANDROID_NO_STREET_ASSETS` açık: ağaç, çim,
              bina, cadı dükkânı, skin ve zırh YÜKLENMEZ. Yalnızca canvas +
              kamera + ışık. APK bu hâlde açılıyorsa sorun varlık zincirindedir.
            </p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                anyFailed
                  ? "bg-red-500/25 text-red-200"
                  : finished
                    ? "bg-emerald-500/25 text-emerald-200"
                    : "bg-white/10 text-white/70"
              }`}
            >
              {anyFailed
                ? "HATA ✘ (oyun devam eder)"
                : finished
                  ? "TAMAM ✔"
                  : "ÇALIŞIYOR…"}
            </span>
            {assets.length === 0 && (
              <span className="text-[10px] font-bold text-white/50">
                {stage === 2 ? "GLB yok — yalnızca WebGL kurulumu" : "3D motor kapalı"}
              </span>
            )}
          </div>

          {assetRows.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {assetRows.map((row) => (
                <li
                  key={row.id}
                  className={`flex justify-between text-[11px] font-bold ${STATE_STYLE[row.state]}`}
                >
                  <span>{row.label}</span>
                  <span>
                    {STATE_MARK[row.state]} {row.state}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 space-y-0.5 border-t border-white/10 pt-2 text-[10px] font-semibold text-white/45">
            <div>dpr {stageDpr()} · MSAA kapalı · gölge kapalı · post-processing yok</div>
            {memory && <div>bellek {memory}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * AŞAMA 1 — CANVAS YOK.
 *
 * Tek soru: "3D tamamen kapalıyken APK açılıyor mu?" Açılıyorsa sorun
 * kesinlikle canvas/GLTF/WebGL tarafındadır; açılmıyorsa 3D ana sebep değil
 * ve bakılacak yer Convex/WebView/yaşam döngüsüdür.
 */
export function StageDomOnly() {
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 500);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    traceStep("stage:dom-only-alive");
  }, []);
  const memory = memorySnapshot();
  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-[#0b1220] p-6 text-center text-white">
      <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">
        Aşama 1
      </span>
      <h2 className="text-lg font-black">3D TEST BAŞARILI (3D KAPALI)</h2>
      <p className="max-w-xs text-xs font-semibold leading-5 text-white/60">
        Bu ekran görünüyorsa React + yönlendirme + Convex akışı çalışıyor.
        Sorun 3D katmanında. Sırada aşama 2 (boş canvas) var.
      </p>
      {stageSource() === "auto" && (
        <p className="max-w-xs rounded-xl bg-amber-300/15 px-3 py-2 text-[11px] font-bold leading-4 text-amber-200">
          Otomatik güvenli mod: kabuk (APK/WebView) art arda çöktüğü için 3D
          kendiliğinden kapatıldı. 🐞 panelinden aşamaları tek tek deneyin.
        </p>
      )}
      <p className="text-[11px] font-bold text-white/40">
        açık kaldı: {(elapsed / 1000).toFixed(1)} sn
        {memory ? ` · ${memory}` : ""}
      </p>
    </div>
  );
}
