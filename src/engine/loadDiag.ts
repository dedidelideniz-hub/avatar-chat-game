/**
 * 🔍 YÜKLEME TEŞHİSİ — "cadde yüklemesi neden %16'da takılıyor?"
 *
 * NEDEN VAR: mobilde (tarayıcı ya da APK) yükleme ekranı ilerlemiyor, ekranda
 * hata da YOK. Bu durumda yalnızca üç soru sorulabilir:
 *   1. Yüzde gerçekten duruyor mu, yoksa ANA İŞ PARÇACIĞI mı bloke? (Nabız)
 *   2. Model dosyaları sunucudan gerçekten geliyor mu? (`/models/*.glb`)
 *   3. Kapı yeniden yeniden mi kuruluyor (sayaç sıfırlanıp 14'e dönüyor)?
 *      (Montaj sayacı)
 *
 * Bu modül üçünü de ÖLÇER ve tek bir kopyalanabilir rapora çevirir. Ayrıca
 * kaçan hataları toplar: kaynak yükleme hataları (`error`, capture), reddedilen
 * promise'ler ve Resource Timing'de 0 durumlu (başarısız) istekler. Global
 * `fetch` YAMALANMAZ — ölçüm için bile olsa uygulamanın ağ davranışına
 * dokunulmaz; onun yerine gerçek `fetch` ile istek atan bir PROBE vardır.
 *
 * Hafiftir: three/drei/Convex içe aktarmaz, yalnızca tarayıcı API'leri +
 * kalıcı iz (`worldDebug.traceStep`).
 *
 * ⏱ TAKILMA ANI KALICI OLARAK YAZILIR (bkz. `persistSnapshot`): telefonda
 * yükleme ekranı DONDUĞUNDA kullanıcı panele DOKUNAMAZ — bu yüzden kanıtın
 * dokunmaya değil diske bağlı olması gerekir. Kapı görünürken canlı değerler
 * (yüzde, adım, nabız, montaj) periyodik olarak diske yazılır; donma anında
 * yazım da durur ve dosyada DONMA ANININ satırları kalır. Bir sonraki açılışta
 * yükleme ekranı bu satırları kendiliğinden (tek dokunuş istemeden) gösterir.
 */
import { safeGetItem, safeRemoveItem, safeSetItem } from "@/lib/safeStorage";
import { bootCount, describeTrace, traceStep } from "./worldDebug";

/* ── 1) HATA TOPLAMA + NABIZ ──────────────────────────────────────────── */

export interface DiagError {
  kind: "resource" | "promise" | "runtime" | "note";
  detail: string;
  /** İlk olaydan bu yana geçen süre (ms). */
  at: number;
}

const startedAt = Date.now();
const errors: DiagError[] = [];
const MAX_ERRORS = 40;

function record(kind: DiagError["kind"], detail: string): void {
  if (errors.length >= MAX_ERRORS) return;
  errors.push({ kind, detail: detail.slice(0, 300), at: Date.now() - startedAt });
}

/** Nabız: ana iş parçacığı ne kadar süre bloke kaldı? */
const BEAT_MS = 250;
let beats = 0;
let beatLastGap = 0;
let beatMaxGap = 0;
let lastBeatAt = 0;
let installed = false;

function heartbeatTick(): void {
  const now = Date.now();
  const gap = lastBeatAt === 0 ? BEAT_MS : now - lastBeatAt;
  lastBeatAt = now;
  beats += 1;
  beatLastGap = gap;
  if (gap > beatMaxGap) beatMaxGap = gap;
}

/**
 * Ölçümü kur (idempotent). `World` yüklenirken çağrılır: nabız, kaynak
 * hataları ve reddedilen promise'ler bu andan itibaren kaydedilir.
 */
export function installLoadDiagnostics(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  lastBeatAt = Date.now();
  window.setInterval(heartbeatTick, BEAT_MS);

  window.addEventListener(
    "error",
    (event: Event) => {
      const target = event.target as (HTMLElement & { src?: string; href?: string }) | null;
      const url = target?.src ?? target?.href;
      if (url) {
        // Kaynak yükleme hatası (script/link/img/fetch ile açılan GLB).
        record("resource", `${url} — kaynak yüklenemedi`);
        return;
      }
      const message = (event as ErrorEvent).message ?? "bilinmeyen hata";
      record("runtime", message);
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason = event.reason as { message?: string } | string | undefined;
    record(
      "promise",
      typeof reason === "string" ? reason : (reason?.message ?? "reddedilen promise"),
    );
  });
}

export function diagErrors(): DiagError[] {
  return [...errors];
}

export function heartbeat(): { beats: number; lastGap: number; maxGap: number } {
  return { beats, lastGap: beatLastGap, maxGap: beatMaxGap };
}

/* ── 2) MONTAJ SAYACI (kapı sıfırlanıyor mu?) ─────────────────────────── */

const mounts = new Map<string, { count: number; firstAt: number; lastAt: number }>();

export function noteMount(label: string): number {
  const now = Date.now();
  const entry = mounts.get(label);
  if (!entry) {
    mounts.set(label, { count: 1, firstAt: now, lastAt: now });
    return 1;
  }
  entry.count += 1;
  entry.lastAt = now;
  return entry.count;
}

export function mountInfo(label: string): { count: number; firstAt: number; lastAt: number } {
  return mounts.get(label) ?? { count: 0, firstAt: 0, lastAt: 0 };
}

/* ── 3) MODEL PROBE: dosya sunucudan geliyor mu? ──────────────────────── */

export interface ProbeItem {
  label: string;
  url: string;
}

/**
 * Cadde için beklenen model listesi. Yollar bilerek DÜZ METİN yazıldı:
 * bu modülün hafif kalması (three/drei içe aktarmaması) gerekiyor, ayrıca
 * probe'un gerçekten sunucudan istediği yol bu olmalı.
 * (Eşleşme `preview-ui` kontrolüyle doğrulanır.)
 */
export const MODEL_PROBE_LIST: readonly ProbeItem[] = [
  { label: "zemin (kritik)", url: "/models/grass_ground.glb" },
  { label: "karakter (kritik)", url: "/models/character.glb" },
  { label: "ağaç", url: "/models/maple_tree.glb" },
  { label: "çim öbeği", url: "/models/grass_clump.glb" },
  { label: "cadı dükkânı", url: "/models/witch_shop.glb" },
  { label: "oyuncu skini", url: "/models/skin-savasci.glb" },
  { label: "oda", url: "/models/empty_office_space.glb" },
  { label: "zırh", url: "/models/savasci-zirh.glb" },
];

export interface ProbeResult {
  label: string;
  url: string;
  ok: boolean;
  /** HTTP durumu (0/ağ hatasında null). */
  status: number | null;
  ms: number;
  /** Sunucunun bildirdiği toplam boyut (varsa). */
  bytes: number | null;
  note: string;
}

const PROBE_TIMEOUT_MS = 8000;

function parseTotal(header: string | null): number | null {
  if (!header) return null;
  const total = header.includes("/") ? header.split("/").pop() : header;
  const value = Number(total);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function probeOne(item: ProbeItem): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const t0 = performance.now();
  try {
    // Önce HEAD: dosyayı indirmeden durum + boyut.
    let response = await fetch(item.url, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    // HEAD desteklenmiyorsa ilk baytları iste (Range) — 43 MiB dosyayı indirme.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(item.url, {
        method: "GET",
        headers: { Range: "bytes=0-1" },
        cache: "no-store",
        signal: controller.signal,
      });
    }
    const ms = Math.round(performance.now() - t0);
    const bytes = parseTotal(
      response.headers.get("content-range") ?? response.headers.get("content-length"),
    );
    return {
      ...item,
      ok: response.ok,
      status: response.status,
      ms,
      bytes,
      note: response.ok ? "" : `HTTP ${response.status}`,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ...item,
      ok: false,
      status: null,
      ms: Math.round(performance.now() - t0),
      bytes: null,
      note: aborted ? `${PROBE_TIMEOUT_MS} ms zaman aşımı` : String(error),
    };
  } finally {
    window.clearTimeout(timer);
  }
}

/** Tüm modelleri AYNI ANDA test eder (önbelleği de ısıtır — zararsız). */
export async function probeModelUrls(
  list: readonly ProbeItem[] = MODEL_PROBE_LIST,
): Promise<ProbeResult[]> {
  if (typeof window === "undefined") return [];
  return Promise.all(list.map((item) => probeOne(item)));
}

/* ── 4) BAŞARISIZ İSTEKLER (Resource Timing, yamasız) ─────────────────── */

interface FailedResource {
  name: string;
  status: number;
  ms: number;
}

function failedResources(): FailedResource[] {
  if (typeof performance === "undefined" || !performance.getEntriesByType) return [];
  try {
    return (
      performance.getEntriesByType("resource") as PerformanceResourceTiming[]
    )
      .filter((entry) => (entry as unknown as { responseStatus?: number }).responseStatus === 0)
      .slice(-12)
      .map((entry) => ({
        name: entry.name.replace(window.location.origin, ""),
        status: (entry as unknown as { responseStatus?: number }).responseStatus ?? 0,
        ms: Math.round(entry.duration),
      }));
  } catch {
    return [];
  }
}

/* ── 5) RAPOR ─────────────────────────────────────────────────────────── */

export interface LoadSnapshot {
  /** Kapının canlı değerleri (World'den gelir). */
  pct: number;
  target: number;
  forced: boolean;
  sceneReady: boolean;
  step: string;
  stepIndex: number;
  /** Kapı sürecinin başlangıcından bu yana geçen süre (ms). */
  elapsedMs: number;
  stageMode: boolean;
  glbTest: boolean;
  [key: string]: string | number | boolean | null;
}

function mib(bytes: number | null): string {
  return bytes === null ? "?" : `${(bytes / 1048576).toFixed(2)} MiB`;
}

function formatErrors(): string[] {
  if (errors.length === 0) return ["  (yakalanan hata yok)"];
  return errors.map((error) => `  · [${error.kind}] +${error.at} ms — ${error.detail}`);
}

/**
 * Tek kopyalanabilir metin: kapı durumu + nabız + ağ + bellek + hatalar +
 * model probe sonuçları. Panelde "📋 Raporu kopyala" bunu verir.
 */
export function buildLoadReport(
  snapshot: LoadSnapshot,
  probes: readonly ProbeResult[] | null,
): string {
  const beat = heartbeat();
  const mount = mountInfo("World");
  const lines: string[] = [];
  lines.push("VAELOS — YÜKLEME TEŞHİSİ (cadde kapısı)");
  lines.push(`sayfa yaşı: ${((Date.now() - startedAt) / 1000).toFixed(1)} sn`);
  lines.push(
    `kapı: %${snapshot.pct.toFixed(1)} (hedef %${snapshot.target.toFixed(1)}) · ` +
      `zorlandı=${snapshot.forced} · sahne hazır=${snapshot.sceneReady}`,
  );
  lines.push(
    `adım ${snapshot.stepIndex}: ${snapshot.step} · kapı süresi ${(snapshot.elapsedMs / 1000).toFixed(1)} sn`,
  );
  lines.push(`izolasyon modu: ${snapshot.stageMode} · glbTest: ${snapshot.glbTest}`);
  lines.push(
    `World montajı: ${mount.count} kez (ilk +${mount.firstAt - startedAt} ms, ` +
      `son +${mount.lastAt - startedAt} ms)` +
      (mount.count > 2 ? "  ⚠️ YENİDEN MONTAJ DÖNGÜSÜ" : ""),
  );
  lines.push(
    `nabız (${BEAT_MS} ms): son ${beat.lastGap} ms · EN UZUN BLOKE ${beat.maxGap} ms` +
      (beat.maxGap > 1000
        ? "  ⚠️ ANA İŞ PARÇACIĞI DONDU (yüzde bu yüzden ilerlemiyor)"
        : ""),
  );
  lines.push(
    `sekme: ${typeof document === "undefined" ? "?" : document.visibilityState}` +
      (typeof document !== "undefined" && document.visibilityState === "hidden"
        ? "  ⚠️ arka plan sekmesi — tarayıcı zamanlayıcıları kısılır"
        : ""),
  );
  const nav = navigator as unknown as {
    onLine?: boolean;
    connection?: { effectiveType?: string; downlink?: number };
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
  lines.push(
    `ağ: onLine=${nav.onLine ?? "?"} · tip=${nav.connection?.effectiveType ?? "?"} · ` +
      `downlink=${nav.connection?.downlink ?? "?"} Mb/s`,
  );
  lines.push(
    `cihaz: çekirdek=${nav.hardwareConcurrency ?? "?"} · deviceMemory=${nav.deviceMemory ?? "?"} GB`,
  );
  lines.push(`ekran: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`);
  lines.push(`ua: ${navigator.userAgent}`);
  lines.push("");
  lines.push("MODEL ERİŞİM TESTİ (HEAD/Range)");
  if (!probes) {
    lines.push("  (test çalıştırılmadı)");
  } else {
    for (const probe of probes) {
      lines.push(
        `  ${probe.ok ? "✔" : "✘"} ${probe.url} · ${probe.status ?? "ağ hatası"} · ` +
          `${probe.ms} ms · ${mib(probe.bytes)}${probe.note ? ` · ${probe.note}` : ""}`,
      );
    }
  }
  lines.push("");
  lines.push("BAŞARISIZ İSTEKLER (Resource Timing)");
  const failed = failedResources();
  if (failed.length === 0) lines.push("  (başarısız istek kaydı yok)");
  else for (const item of failed) lines.push(`  · ${item.name} (${item.ms} ms)`);
  lines.push("");
  lines.push("HATALAR (kaynak + promise)");
  lines.push(...formatErrors());
  lines.push("");
  lines.push("KALICI İZ (localStorage)");
  lines.push(`  ${snapshot.trace ?? "(okunamadı)"}`);
  return lines.join("\n");
}

/* ── 6) TAKILMA ANININ KALICI KAYDI ───────────────────────────────────── */

/** Kaydın anahtarı — test/araç kodunun da okuduğu tek kaynak. */
export const PERSIST_KEY = "vaelos:loadingDiag";

/** Donma anında diskte kalan kayıt — bir sonraki açılışta okunur. */
export interface PersistedSnapshot {
  /** Yazıldığı an (epoch ms). */
  wall: number;
  /** Yazının ait olduğu sayfa açılışı (`worldDebug.bootCount`) — aynı açılışta
   *  yazılan kayıt "önceki oturum" sayılmaz (React StrictMode çift montajı). */
  boot: number;
  snapshot: LoadSnapshot;
  heartbeat: { beats: number; lastGap: number; maxGap: number };
  mounts: number;
  probes: ProbeResult[] | null;
  errors: DiagError[];
}

/** En son probe sonuçları — her yazımda diske taşınır (probe sonda gelir). */
let rememberedProbes: ProbeResult[] | null = null;

export function rememberProbes(probes: readonly ProbeResult[] | null): void {
  rememberedProbes = probes ? [...probes] : null;
}

/**
 * Canlı anlık görüntüyü diske yaz (kapı görünürken periyodik çağrılır).
 * Donma anından SONRA hiçbir şey yazılamadığı için dosyada kalan son satır
 * tam olarak "nerede donduk" sorusunun cevabıdır.
 */
export function persistSnapshot(snapshot: LoadSnapshot): PersistedSnapshot {
  const record: PersistedSnapshot = {
    wall: Date.now(),
    boot: bootCount(),
    // İz HER yazımda canlı kaynaktan alınır: donmadan önce diske yazılmış son
    // "iz" satırı (ör. `son adım: render:Ground`) donma noktasının kanıtıdır.
    snapshot: { ...snapshot, trace: describeTrace() },
    heartbeat: heartbeat(),
    mounts: mountInfo("World").count,
    probes: rememberedProbes,
    errors: errors.slice(-8),
  };
  try {
    safeSetItem(PERSIST_KEY, JSON.stringify(record));
  } catch {
    /* depolama kapalı: kayıt tutulamaz, teşhis yine de ekranda yaşar */
  }
  return record;
}

/** Diskte kalan takılma kaydı (yoksa null). */
export function readPersistedSnapshot(): PersistedSnapshot | null {
  const raw = safeGetItem(PERSIST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSnapshot>;
    if (!parsed?.snapshot || typeof parsed.wall !== "number") return null;
    return {
      wall: parsed.wall,
      boot: Number(parsed.boot) || 0,
      snapshot: parsed.snapshot as LoadSnapshot,
      heartbeat: parsed.heartbeat ?? { beats: 0, lastGap: 0, maxGap: 0 },
      mounts: Number(parsed.mounts) || 0,
      probes: parsed.probes ?? null,
      errors: parsed.errors ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Kaydı sil: kapı AÇILDIĞINDA çağrılır. Böylece dosyanın VARLIĞI tek başına
 * "önceki oturum yükleme ekranını geçemedi" demektir (yanlış alarm olmaz).
 */
export function clearPersistedSnapshot(): void {
  rememberedProbes = null;
  safeRemoveItem(PERSIST_KEY);
}

/** Kaybolan oturumun KENDİLİĞİNDEN gösterilen satırları (dokunuş gerekmez). */
export function describePersisted(record: PersistedSnapshot): string[] {
  const s = record.snapshot;
  const age = Math.max(0, Math.round((Date.now() - record.wall) / 60000));
  const lines = [
    `son an: %${s.pct.toFixed(0)} · adım ${s.stepIndex}/4 (${s.step}) · ${(s.elapsedMs / 1000).toFixed(1)} sn`,
    `nabız: en uzun bloke ${record.heartbeat.maxGap} ms` +
      (record.heartbeat.maxGap > 1000 ? " ⚠️ ana iş parçacığı dondu" : ""),
    `World montajı: ${record.mounts} kez` +
      (record.mounts > 2 ? " ⚠️ YENİDEN MONTAJ DÖNGÜSÜ" : "") +
      ` · hedef %${s.target.toFixed(0)} · sahne hazır=${s.sceneReady}`,
  ];
  if (record.probes) {
    const ok = record.probes.filter((p) => p.ok).length;
    lines.push(
      `model erişimi: ${ok}/${record.probes.length} geliyor` +
        (ok < record.probes.length
          ? ` · ✘ ${record.probes.filter((p) => !p.ok).map((p) => p.url).join(" ")}`
          : ""),
    );
  }
  if (record.errors.length > 0) {
    lines.push(`hatalar: ${record.errors.slice(-2).map((e) => e.detail).join(" | ")}`);
  }
  lines.push(`iz: ${s.trace ?? "?"} · ${age} dk önce`);
  return lines;
}

/* ── 7) İLK RENDER İŞARETİ (donma noktasını daraltır) ─────────────────── */

const renderMarks = new Set<string>();

/**
 * Bir sahne bileşeninin İLK render'ı başlarken çağrılır (oturumda bir kez,
 * kalıcı iz). Donma sırasında diske yazılmış SON işaret, donmanın hangi
 * bileşenin kurulumunda olduğunu doğrudan gösterir.
 */
export function renderMark(name: string): void {
  if (renderMarks.has(name)) return;
  renderMarks.add(name);
  traceStep(`render:${name}`);
}

/**
 * KAPI TAKILDI: probe'u kendiliğinden çalıştır, raporu konsola (APK'da
 * logcat'e) ve kalıcı ize bas. Kullanıcı panele dokunamasa da kanıt oluşur.
 */
export async function reportLoadStall(snapshot: LoadSnapshot): Promise<string> {
  const results = await probeModelUrls();
  rememberProbes(results);
  persistSnapshot(snapshot);
  const report = buildLoadReport(snapshot, results);
  const summary =
    `kapı %${snapshot.pct.toFixed(1)} · adım ${snapshot.stepIndex} (${snapshot.step}) · ` +
    `montaj ${mountInfo("World").count} · nabız max ${heartbeat().maxGap} ms`;
  traceStep("stall:gate", summary);
  try {
    console.warn(`[VAELOS_STALL] ${summary}\n${report}`);
  } catch {
    /* konsol yoksa yok sayılır */
  }
  return report;
}
