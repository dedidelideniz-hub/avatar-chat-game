/**
 * 📡 ANDROID LOGCAT İŞARETLERİ — "APK hangi adımda, hangi modelde öldü?"
 *
 * NEDEN VAR: WebView'ın render işleyicisi bellek/GPU yüzünden öldüğünde
 * JavaScript HİÇBİR hata GÖRMEZ (Android tarafında `onRenderProcessGone` düşer,
 * bizim tarafta ne `error` ne `unhandledrejection`). Bu yüzden tek işe yarayan
 * kanıt SIRA: çökmeden hemen önce hangi adım/işaret basılmıştı?
 *
 * Bu işaretler iki yere yazılır:
 *   1) `console.log/error` → WebView `WebChromeClient.onConsoleMessage` ile
 *      Android logcat'e düşer (madde 2 — `VAELOS_WEB_`/`VAELOS_WEBVIEW` tag'i),
 *   2) `traceStep` → `localStorage` (çökse bile kalır; 🐞 panel "son adım" der).
 *
 * İşaret adları:
 *   `[VAELOS_STAGE] WORLD_MOUNT` / `CANVAS_BEFORE` / `CANVAS_MOUNTED` /
 *   `STREET_PRELOAD_START` / `STREET_PROBE_START` / `FIRST_MODEL_READY` /
 *   `SCENE_READY`
 *   `[VAELOS_MODEL_START] <url>` · `[VAELOS_MODEL_OK] <url>` ·
 *   `[VAELOS_MODEL_ERROR] <url> <hata>`
 *
 * GÜRÜLTÜ KONTROLÜ: işaretler YALNIZCA şu durumlarda konuşur —
 * cihaz APK/WebView kabuğunda (logcat zaten topluyor), URL'de `?androidProbe`,
 * `localStorage: vaеlos:androidProbe=1` ya da derlemede `VITE_ANDROID_PROBE=1`.
 * Masaüstü tarayıcıda konsol temiz kalır.
 *
 * Aynı isim birden fazla kez basılmaz (React StrictMode/çift render gürültüsü
 * olmasın): aşama işaretleri isimle, model işaretleri URL ile tekilleştirilir.
 */
import { safeGetItem, safeRemoveItem, safeSetItem } from "@/lib/safeStorage";
import { isAppShell, traceStep } from "./worldDebug";

const PROBE_KEY = "vaelos:androidProbe";

function search(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.location.search;
  } catch {
    return "";
  }
}

function envFlag(name: string): boolean {
  try {
    const env = import.meta.env as unknown as Record<string, string | undefined>;
    const raw = env[name];
    return raw === "1" || raw === "true" || raw === "yes";
  } catch {
    return false;
  }
}

/**
 * İşaretler açık mı? APK/WebView kabuğunda KENDİLİĞİNDEN açıktır: orada konsolu
 * görmenin tek yolu logcat olduğu için ek bayrak istemek anlamsız olurdu.
 */
export function androidProbeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (search().includes("androidProbe")) return true;
  if (envFlag("VITE_ANDROID_PROBE")) return true;
  if (safeGetItem(PROBE_KEY) === "1") return true;
  return isAppShell();
}

export function setAndroidProbe(on: boolean): void {
  if (on) safeSetItem(PROBE_KEY, "1");
  else safeRemoveItem(PROBE_KEY);
}

/* ── Aşama işaretleri ─────────────────────────────────────────────────── */

const stageMarks = new Set<string>();

/**
 * Adım işareti: `[VAELOS_STAGE] <ADIM>`. Aynı adım oturumda bir kez basılır
 * (React yeniden render'ları logcat'i doldurmasın).
 */
export function stageMark(name: string, note?: string): void {
  // ⚠️ Tekilleştirme EN BAŞTA: bu fonksiyon bileşen gövdesinden (her render'da)
  // çağrılabiliyor; hem konsolu hem `localStorage`ı oturumda BİR kez meşgul eder.
  if (stageMarks.has(name)) return;
  stageMarks.add(name);
  traceStep(`mark:${name}`, note);
  if (!androidProbeEnabled()) return;
  console.log(`[VAELOS_STAGE] ${name}${note ? ` · ${note}` : ""}`);
}

/* ── Model işaretleri ─────────────────────────────────────────────────── */

const modelStarted = new Set<string>();
const modelFinished = new Set<string>();

/** Model indirme/çözme BAŞLIYOR (suspense'ten hemen önce). */
export function modelStart(id: string, url: string): void {
  if (modelStarted.has(id)) return;
  modelStarted.add(id);
  traceStep(`model:start:${id}`, url);
  if (!androidProbeEnabled()) return;
  console.log(`[VAELOS_MODEL_START] ${url}`);
}

/** Model sahneye girdi (suspense çözüldü / loader callback'i döndü). */
export function modelOk(id: string, url: string): void {
  if (modelFinished.has(id)) return;
  modelFinished.add(id);
  traceStep(`model:ok:${id}`, url);
  if (!androidProbeEnabled()) return;
  console.log(`[VAELOS_MODEL_OK] ${url}`);
}

/** Model yüklenemedi — oyun DEVAM eder, yedek görsel kullanılır. */
export function modelError(id: string, url: string, error: unknown): void {
  modelFinished.add(id);
  traceStep(`model:error:${id}`, url);
  if (!androidProbeEnabled()) return;
  console.error(`[VAELOS_MODEL_ERROR] ${url}`, error);
}

/** Test/gözlem: hangi işaretler basıldı? */
export function probeMarks(): { stages: string[]; started: string[]; ok: string[] } {
  return {
    stages: [...stageMarks],
    started: [...modelStarted],
    ok: [...modelFinished],
  };
}
