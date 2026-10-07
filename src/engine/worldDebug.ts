/**
 * 🧪 3D İZOLASYON TEŞHİSİ — "APK tam olarak NEREDE ölüyor?" sorusunu
 * ÖLÇEREK yanıtlamak için.
 *
 * NEDEN VAR: Texture küçültme, preload azaltma, sıralı yükleme — hepsi
 * uygulandı ve APK hâlâ "Cadde verileri alınıyor" adımında kapanıyor. Bu
 * noktadan sonra tahminle değil BÖLEREK ilerlemek gerekir:
 *
 *   AŞAMA 0  normal oyun (üretim davranışı)
 *   AŞAMA 1  World DOM, 3D YOK      → React/dışa aktarma zinciri mi?
 *   AŞAMA 2  boş Canvas             → WebGL/GPU kurulumu mu?
 *   AŞAMA 3  + zemin GLB            → zemin modeli mi?
 *   AŞAMA 4  + karakter             → karakter modeli mi?
 *   AŞAMA 5  + ağaç                 → ağaç modeli mi?
 *   AŞAMA 6  + çim öbekleri         → çim mi?
 *   AŞAMA 7  + cadı dükkânı         → bina (43 MiB doku) mı?
 *   AŞAMA 8  + oyuncu skini         → skin/zırh modeli mi?
 *   AŞAMA 9  tam dünya (0 ile aynı, teşhis panelleri zorla açık)
 *
 * APK'da konsol/geliştirici araçları YOK; bu yüzden her adım `localStorage`a
 * YAZILIR (`traceStep`). Uygulama çökerse WebView kapanır ama kayıt kalır:
 * bir sonraki açılışta teşhis paneli "önceki oturum şu adımda bitti" diye
 * gösterir. Çöküş sayacı da otomatik artar (sağlıklı bir kapanış izi
 * bırakılmadıysa).
 *
 * AŞAMA SEÇİMİ (yeniden derleme GEREKMEZ, öncelik sırası):
 *   1. URL          `?worldStage=7` (veya `?stage=7`, `?debugStage=7`)
 *   2. localStorage `vaelos:worldStage`  ← uygulama içi panel bunu yazar
 *   3. derleme      `VITE_DEBUG_WORLD_STAGE=7`
 *   4. varsayılan   0 (üretim)
 *
 * Bu modül BİLEREK hafiftir: yalnızca `lib/safeStorage` kullanır, three/drei
 * içe aktarmaz — böylece her yerden güvenle çağrılabilir.
 */
import {
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
  storagePersistent,
} from "@/lib/safeStorage";

/* ── 1) AŞAMA TABLOSU ─────────────────────────────────────────────────── */

/** Sondaya eklenebilen varlık kimlikleri (URL eşlemesi `WorldStageProbe`ta). */
export type StageAssetId =
  | "ground"
  | "character"
  | "tree"
  | "grass"
  | "witchShop"
  | "skin";

export interface WorldStageInfo {
  stage: number;
  /** Kısa ad (panel düğmesi). */
  label: string;
  /** Sonda/teşhis panelinde görünen "İçerik" açıklaması. */
  content: string;
  /** Bu aşamada yüklenecek GLB'ler — SIRAYLA, TEK TEK. */
  assets: readonly StageAssetId[];
}

export const WORLD_STAGES: readonly WorldStageInfo[] = [
  {
    stage: 0,
    label: "Normal",
    content: "Tam oyun (üretim davranışı)",
    assets: [],
  },
  {
    stage: 1,
    label: "3D YOK",
    content: "World DOM — canvas yok, hiçbir model yok",
    assets: [],
  },
  {
    stage: 2,
    label: "Boş canvas",
    content: "Canvas + ışık — hiçbir GLB, hiçbir drei yükleyicisi",
    assets: [],
  },
  {
    stage: 3,
    label: "+ Zemin",
    content: "Canvas + zemin GLB (grass_ground)",
    assets: ["ground"],
  },
  {
    stage: 4,
    label: "+ Karakter",
    content: "Zemin + karakter GLB (character)",
    assets: ["ground", "character"],
  },
  {
    stage: 5,
    label: "+ Ağaç",
    content: "Zemin + karakter + ağaç (maple_tree)",
    assets: ["ground", "character", "tree"],
  },
  {
    stage: 6,
    label: "+ Çim",
    content: "Zemin + karakter + çim öbeği (grass_clump)",
    assets: ["ground", "character", "grass"],
  },
  {
    stage: 7,
    label: "+ Cadı dükkânı",
    content: "Zemin + karakter + cadı dükkânı (witch_shop)",
    assets: ["ground", "character", "witchShop"],
  },
  {
    stage: 8,
    label: "+ Skin",
    content: "Zemin + karakter + oyuncu skini (skin-savasci)",
    assets: ["ground", "character", "skin"],
  },
  {
    stage: 9,
    label: "Tam dünya",
    content: "Tam oyun + zorla açık teşhis paneli",
    assets: [],
  },
];

export function stageInfo(stage: number): WorldStageInfo {
  return WORLD_STAGES.find((info) => info.stage === stage) ?? WORLD_STAGES[0];
}

/* ── 2) AŞAMA ÇÖZÜMLEME ───────────────────────────────────────────────── */

const STAGE_KEY = "vaelos:worldStage";
const DEBUG_KEY = "vaelos:worldDebug";
const DPR_KEY = "vaelos:worldDpr";

function parseStage(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const text = raw.trim();
  const exact = WORLD_STAGES.find(
    (info) =>
      info.label.toLocaleLowerCase("tr") === text.toLocaleLowerCase("tr"),
  );
  if (exact) return exact.stage;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  const stage = Math.trunc(value);
  return stage >= 0 && stage <= 9 ? stage : null;
}

/** URL'deki aşama (`?worldStage=`, `?stage=`, `?debugStage=`). */
function urlStage(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return parseStage(
      params.get("worldStage") ??
        params.get("stage") ??
        params.get("debugStage"),
    );
  } catch {
    return null;
  }
}

/** Derleme zamanı bayrağı (`VITE_DEBUG_WORLD_STAGE=7`). */
function envStage(): number | null {
  try {
    const env = import.meta.env as unknown as Record<string, string | undefined>;
    return parseStage(
      env.VITE_DEBUG_WORLD_STAGE ?? env.VITE_DEBUG_STAGE ?? null,
    );
  } catch {
    return null;
  }
}

let stageCache: number | null = null;
let stageCacheSource: StageSource = "default";

export type StageSource = "url" | "stored" | "env" | "auto" | "default";

/** Aşamanın nereden geldiği (panelde gösterilir: "bunu kim seçti?"). */
export function stageSource(): StageSource {
  worldStage();
  return stageCacheSource;
}

/**
 * 🔁 OTOMATİK GÜVENLİ MOD — APK'da ilk ekrana ULAŞMANIN garantisi.
 *
 * Çökme tam da yükleme kapısının arkasında olduğu için kullanıcı "🔧/🐞"ye
 * basacak zamanı bulamayabilir. Bu yüzden: cihaz bir APK/WebView kabuğundaysa
 * VE uygulama art arda İKİ kez sağlıksız kapandıysa, hiçbir seçim yapılmamışsa
 * 3D kendiliğinden kapanır (aşama 1). Böylece APK açılır, kullanıcı da açılan
 * ekrandaki 🐞 panelinden merdiveni (2 → 3 → …) tırmanabilir.
 *
 * Üretim web sitesini ETKİLEMEZ: kabuk şartı (APK/WebView) ve iki çöküş şartı
 * birlikte aranır; masaüstü tarayıcıda asla devreye girmez.
 */
function autoSafeStage(): { stage: number; source: StageSource } {
  if (typeof window === "undefined") return { stage: 0, source: "default" };
  if (!isAppShell() || crashCount() < 2) return { stage: 0, source: "default" };
  return { stage: 1, source: "auto" };
}

/**
 * Bu oturumun 3D aşaması. Öncelik: URL → localStorage → derleme bayrağı →
 * otomatik güvenli mod → 0.
 * (localStorage, panelden seçilen aşamayı derleme bayrağının ÜSTÜNE çıkarır:
 * teşhis derlemesinde bile panel serbestçe aşama değiştirebilir.)
 */
export function worldStage(): number {
  if (stageCache !== null) return stageCache;
  // Açılış sayacı/çöküş tespiti ÖNCE kurulur: otomatik güvenli mod çöküş
  // sayısını okur. `bootstrap` başında bayrağı kaldırdığı için özyineleme yok.
  bootstrap();
  const fromUrl = urlStage();
  const fromStore = parseStage(safeGetItem(STAGE_KEY));
  const fromEnv = envStage();
  if (fromUrl !== null) {
    stageCache = fromUrl;
    stageCacheSource = "url";
  } else if (fromStore !== null) {
    stageCache = fromStore;
    stageCacheSource = "stored";
  } else if (fromEnv !== null) {
    stageCache = fromEnv;
    stageCacheSource = "env";
  } else {
    const auto = autoSafeStage();
    stageCache = auto.stage;
    stageCacheSource = auto.source;
  }
  return stageCache;
}

/**
 * Aşamayı kalıcı olarak seç (teşhis paneli). Varsayılan olarak sayfayı
 * yeniler: WebView'da çökme sonrası temiz bir başlangıç en doğru ölçümü verir.
 */
export function setWorldStage(stage: number, reload = true): void {
  const safe = parseStage(String(stage)) ?? 0;
  safeSetItem(STAGE_KEY, String(safe));
  stageCache = safe;
  stageCacheSource = "stored";
  if (safe !== 0) {
    // Teşhis modunda uygulama içi panel de görünsün (kanıt toplanabilsin).
    safeSetItem(DEBUG_KEY, "1");
  }
  if (reload && typeof window !== "undefined") window.location.reload();
}

/** AŞAMA 1–8: gerçek 3D motoru DEVREDEN ÇIKARILIR (izolasyon ölçümü). */
export function isStageIsolation(): boolean {
  const stage = worldStage();
  return stage >= 1 && stage <= 8;
}

/** AŞAMA 2–8: motorun yerine minimal sonda canvas'ı çizilir. */
export function usesStageCanvas(): boolean {
  const stage = worldStage();
  return stage >= 2 && stage <= 8;
}

/**
 * İzolasyon sırasında HİÇBİR ön yükleme/arka plan yüklemesi çalışmasın.
 *
 * Aksi halde "boş canvas" aşamasında bile modül düzeyindeki bir `useGLTF.preload`
 * (ör. `GrassGround`) zemini indirir ve ölçüm kirlenir — testin tek anlamı
 * budur: aşamaya YALNIZCA o aşamanın varlıkları girer.
 */
export function assetPreloadingSuppressed(): boolean {
  return isStageIsolation();
}

/* ── 3) TEŞHİS PANELİ GÖRÜNÜRLÜĞÜ ─────────────────────────────────────── */

/**
 * Cihaz bir APK/WebView kabuğunda mı çalışıyor? (Capacitor köprüsü,
 * Android WebView "wv" işareti ya da tam ekran PWA.) Teşhis paneli bu
 * ortamlarda KENDİLİĞİNDEN görünür: APK'da URL parametresi eklemek ya da
 * konsol açmak mümkün değildir, panel tek erişim yoludur.
 */
export function isAppShell(): boolean {
  if (typeof window === "undefined") return false;
  const bridge = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  try {
    if (bridge.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    /* köprü yoksa işaretlere düş */
  }
  const ua = window.navigator?.userAgent ?? "";
  if (/; wv\)|Android.*Version\/\d+\.\d+/.test(ua)) return true;
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  } catch {
    /* matchMedia yoksa yok say */
  }
  return false;
}

function diagnosticsFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const search = window.location.search;
    if (search.includes("worldDebug") || search.includes("assetDebug")) {
      return true;
    }
  } catch {
    /* sorgu okunamadı */
  }
  return safeGetItem(DEBUG_KEY) === "1";
}

/** Teşhis paneli gösterilsin mi? (izolasyon aşaması, URL bayrağı, APK kabuğu) */
export function worldDiagnosticsEnabled(): boolean {
  return worldStage() !== 0 || diagnosticsFlag() || isAppShell();
}

export function setWorldDiagnostics(on: boolean): void {
  if (on) safeSetItem(DEBUG_KEY, "1");
  else safeRemoveItem(DEBUG_KEY);
}

/* ── 4) ÇÖKME İZİ (breadcrumb) ────────────────────────────────────────── */

const TRACE_KEY = "vaelos:worldTrace";
const BOOTS_KEY = "vaelos:worldBoots";
const CRASH_KEY = "vaelos:worldCrashes";

/**
 * "Sağlıklı" adımlar: son kayıt bunlardan biriyse uygulama kendi isteğiyle
 * kapanmış/işini bitirmiş sayılır. Aksi halde bir sonraki açılışta çöküş
 * sayacı artar — böylece kaç kez ve hangi adımda öldüğünü tahmin etmeyiz.
 */
export const HEALTHY_STEPS: ReadonlySet<string> = new Set([
  "world:gate-open",
  "engine:first-frame",
  "stage:probe-done",
]);

export interface WorldTrace {
  boot: number;
  stage: number;
  step: string;
  /** Oturum başından bu yana geçen süre (ms) — "ne kadar sonra öldü?" */
  elapsedMs: number;
  wall: number;
  note?: string;
}

let sessionBoot = 0;
let sessionCrashes = 0;
let sessionStartMs = 0;
let lastStep = "boot";
let bootstrapped = false;

function parseTrace(raw: string | null): WorldTrace | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WorldTrace>;
    if (typeof parsed.step !== "string") return null;
    return {
      boot: Number(parsed.boot) || 0,
      stage: Number(parsed.stage) || 0,
      step: parsed.step,
      elapsedMs: Number(parsed.elapsedMs) || 0,
      wall: Number(parsed.wall) || 0,
      note: typeof parsed.note === "string" ? parsed.note : undefined,
    };
  } catch {
    return null;
  }
}

/** Modül yüklenirken: açılış sayacı + önceki oturumun izinden çöküş tespiti. */
function bootstrap(): void {
  if (bootstrapped || typeof window === "undefined") return;
  // Bayrak EN BAŞTA: `writeTrace` → `worldStage()` → `bootstrap()` çağrı
  // zinciri burada kesilir (aşama çözümlemesi açılış kaydını beklemez).
  bootstrapped = true;
  sessionStartMs = Date.now();
  const boots = (Number(safeGetItem(BOOTS_KEY)) || 0) + 1;
  sessionBoot = boots;
  safeSetItem(BOOTS_KEY, String(boots));

  const previous = parseTrace(safeGetItem(TRACE_KEY));
  let crashes = Number(safeGetItem(CRASH_KEY)) || 0;
  if (previous && !HEALTHY_STEPS.has(previous.step)) {
    crashes += 1;
    safeSetItem(CRASH_KEY, String(crashes));
  }
  sessionCrashes = crashes;

  // İlk iz: panelin "önceki oturum" satırını besler.
  writeTrace("boot", previous
    ? `önceki oturum: ${previous.step} (+${previous.elapsedMs} ms)`
    : "ilk açılış");
}

function writeTrace(step: string, note?: string): void {
  const record: WorldTrace = {
    boot: sessionBoot,
    stage: worldStage(),
    step,
    elapsedMs: Date.now() - sessionStartMs,
    wall: Date.now(),
    note,
  };
  safeSetItem(TRACE_KEY, JSON.stringify(record));
}

/**
 * İz bırak: her önemli adımda çağrılır (uygulama çökse bile kalır).
 * Konsola YAZMAZ — APK'da konsol yok, ayrıca üretimi kirletmek istemiyoruz.
 */
export function traceStep(step: string, note?: string): void {
  bootstrap();
  if (typeof window === "undefined") return;
  lastStep = step;
  writeTrace(step, note);
}

export function lastTrace(): WorldTrace | null {
  return parseTrace(safeGetItem(TRACE_KEY));
}

export function bootCount(): number {
  return sessionBoot || Number(safeGetItem(BOOTS_KEY)) || 0;
}

export function crashCount(): number {
  return sessionCrashes || Number(safeGetItem(CRASH_KEY)) || 0;
}

/** Tek satırlık insan-okur özet: "boot #4 · aşama 7 · son adım: ...". */
export function describeTrace(): string {
  const trace = lastTrace();
  if (!trace) return `boot #${bootCount()} · henüz iz yok`;
  const info = stageInfo(trace.stage);
  const crash = crashCount() > 0 ? ` · çöküş: ${crashCount()}` : "";
  return (
    `boot #${trace.boot} · aşama ${trace.stage} (${info.label}) · ` +
    `son adım: ${trace.step} (+${trace.elapsedMs} ms)` +
    (trace.note ? ` · ${trace.note}` : "") +
    crash
  );
}

/** Kayıtları sil (temiz bir ölçüm turu başlatmak için). */
export function clearDiagnostics(): void {
  safeRemoveItem(TRACE_KEY);
  safeRemoveItem(BOOTS_KEY);
  safeRemoveItem(CRASH_KEY);
  safeRemoveItem(STAGE_KEY);
  sessionCrashes = 0;
}

/* ── 5) WEBGL / BELLEK ÖLÇÜMÜ ─────────────────────────────────────────── */

let webglCache: string | null = null;

/** GPU/sürücü künyesi — "hangi cihazda deniyoruz?" sorusunun cevabı. */
export function webglInfo(): string {
  if (webglCache) return webglCache;
  if (typeof document === "undefined") return "WebGL yok (SSR)";
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null);
    if (!gl) {
      webglCache = "WebGL bağlamı AÇILAMADI";
      return webglCache;
    }
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debug
      ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    const vendor = debug
      ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL))
      : String(gl.getParameter(gl.VENDOR));
    const version = String(gl.getParameter(gl.VERSION));
    const maxTexture = String(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    webglCache = `${vendor} / ${renderer} · ${version} · maxTex ${maxTexture}`;
    // Deneme bağlamını HEMEN bırak: mobilde bağlam yuvası tükenmesin
    // (bkz. `engine/webglSupport` → `probeWebglContext`).
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return webglCache;
  } catch (error) {
    webglCache = `ölçülemedi: ${String(error)}`;
    return webglCache;
  }
}

/** JS yığını (`performance.memory`, Chromium/WebView'da var). */
export function memorySnapshot(): string | null {
  const memory = (
    performance as unknown as {
      memory?: {
        usedJSHeapSize?: number;
        totalJSHeapSize?: number;
        jsHeapSizeLimit?: number;
      };
    }
  ).memory;
  if (!memory?.usedJSHeapSize) return null;
  const mib = (value?: number) =>
    value ? `${(value / 1048576).toFixed(1)} MiB` : "?";
  return (
    `heap ${mib(memory.usedJSHeapSize)} / toplam ${mib(memory.totalJSHeapSize)}` +
    ` / sınır ${mib(memory.jsHeapSizeLimit)}`
  );
}

export interface RuntimeDiagnostics {
  stage: number;
  stageLabel: string;
  trace: string;
  boots: number;
  crashes: number;
  webgl: string;
  memory: string;
  storage: string;
  screen: string;
  ua: string;
  dpr: number;
}

export function runtimeDiagnostics(): RuntimeDiagnostics {
  const stage = worldStage();
  const screen =
    typeof window === "undefined"
      ? "?"
      : `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio ?? 1}x`;
  const memory = memorySnapshot();
  return {
    stage,
    stageLabel: stageInfo(stage).label,
    trace: describeTrace(),
    boots: bootCount(),
    crashes: crashCount(),
    webgl: webglInfo(),
    memory: memory ?? "performance.memory yok",
    storage: storagePersistent ? "kalıcı" : "bellek yedeği (localStorage kapalı)",
    screen,
    ua: typeof navigator === "undefined" ? "?" : navigator.userAgent,
    dpr: typeof window === "undefined" ? 1 : window.devicePixelRatio ?? 1,
  };
}

/* ── 6) ÖLÇÜM SONUCU PANOSU (APK için tek çıktı) ──────────────────────── */

/**
 * Kullanıcının doldurması gereken tablo: her aşamanın APK sonucu.
 * Panodan kopyalanıp paylaşılabilir — konsol gerektirmez.
 */
export function diagnosticsReport(): string {
  const diag = runtimeDiagnostics();
  const lines: string[] = [];
  lines.push("VAELOS — 3D İZOLASYON RAPORU");
  lines.push(`aşama: ${diag.stage} (${diag.stageLabel})`);
  lines.push(`izin: ${diag.trace}`);
  lines.push(`açılış: ${diag.boots} · çöküş: ${diag.crashes}`);
  lines.push(`ekran: ${diag.screen} · dpr: ${diag.dpr}`);
  lines.push(`webgl: ${diag.webgl}`);
  lines.push(`bellek: ${diag.memory}`);
  lines.push(`depolama: ${diag.storage}`);
  lines.push(`ua: ${diag.ua}`);
  lines.push("");
  lines.push("Test | İçerik | APK sonucu");
  for (const info of WORLD_STAGES) {
    if (info.stage === 0) continue;
    lines.push(`${info.stage} | ${info.content} | ?`);
  }
  return lines.join("\n");
}

/* ── 7) BAĞLAM KAYBI TEŞHİSİ ──────────────────────────────────────────── */

/**
 * `webglcontextlost / webglcontextrestored` olaylarını bağlar.
 *
 * Kamuflajı kaldırır: GPU/işleyici belleği tükendiğinde Android WebView çoğu
 * zaman JS hatası VERMEZ, önce bağlamı düşürür. Bu iki olay, "çökme renderer
 * tarafında mı?" sorusunun en net kanıtıdır; hem konsola (nadir olay, spam
 * değil) hem KALICI İZE yazılır.
 */
export function attachContextDiagnostics(
  target: HTMLCanvasElement | { domElement?: HTMLCanvasElement },
  label = "sahne",
): () => void {
  const element =
    (target as { domElement?: HTMLCanvasElement }).domElement ??
    (target as HTMLCanvasElement);
  if (!element || typeof element.addEventListener !== "function") return () => {};

  let lostCount = 0;
  const onLost = () => {
    lostCount += 1;
    traceStep("webgl:context-lost", `${label} — ${lostCount}. kez`);
    console.warn(`[WEBGL] CONTEXT LOST — ${label} (${lostCount}. kez)`);
  };
  const onRestored = () => {
    traceStep("webgl:context-restored", label);
    console.warn(`[WEBGL] CONTEXT RESTORED — ${label}`);
  };

  element.addEventListener("webglcontextlost", onLost);
  element.addEventListener("webglcontextrestored", onRestored);
  return () => {
    element.removeEventListener("webglcontextlost", onLost);
    element.removeEventListener("webglcontextrestored", onRestored);
  };
}

/* ── 8) SONDA PİKSEL ORANI ────────────────────────────────────────────── */

/**
 * Sondanın `dpr` değeri. Mobilde `dpr=2` ile canvas 1920×1080×4 → ~33 MiB'lık
 * bir framebuffer demektir; "boş canvas bile düşüyor mu?" sorusunun cevabı
 * çoğu zaman burada saklıdır. Panelden 1 / 1.5 / cihaz olarak seçilebilir.
 */
export function stageDpr(): number {
  const raw = safeGetItem(DPR_KEY);
  if (raw === "device") return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function setStageDpr(value: number | "device"): void {
  safeSetItem(DPR_KEY, String(value));
}
