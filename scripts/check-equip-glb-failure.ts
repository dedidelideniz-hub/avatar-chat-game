/**
 * 🛡️ ZIRH GLB HATA KONTROLÜ — başarısız bir ekipman indirmesi sayfaya
 * "unhandled rejection" olarak düşüyor mu?
 *
 * Neden var: `/world` açıldıktan 9 sn sonra zırh modelleri (savaşçı/şövalye)
 * arka planda indirilir. İndirme başarısız olduğunda (ağ el değiştirmesi, dev
 * sunucusunun yeniden başlaması, WebView'de iptal edilen istek) `fetch`
 * `TypeError: Failed to fetch` ile reddediyordu. Bu reddi bekleyen KİMSE
 * olmadığı için "unhandled rejection" doğuyor ve geliştirme katmanı bunu tam
 * ekran **Build Error** olarak gösteriyordu — oysa oyunun kendisi hiçbir şey
 * olmamış gibi devam ediyordu (prosedürel zırh yedeği zaten var).
 *
 * Bu script tarayıcıdaki yolu birebir taklit eder (geçerli/absolute URL +
 * ASENKRON `fetch` reddi) ve ölçer:
 *   1. yakalanmayan red            → 0 olmalı,
 *   2. ilk hata uyarısı            → tam 1,
 *   3. sınırlı yeniden deneme      → 1 tane (4 sn sonra),
 *   4. deneme sınırı               → sonrasında KENDİLİĞİNDEN yeni deneme yok.
 *
 * Kullanım:  bun scripts/check-equip-glb-failure.ts
 */
const g = globalThis as unknown as Record<string, unknown>;

// GLTFLoader/FileLoader tarayıcı API'leri arar; indirme anında yeterli karşılık.
g.window = g;
g.window.setTimeout = setTimeout;
g.window.clearTimeout = clearTimeout;
g.window.addEventListener = () => {};
g.window.navigator = { userAgent: "" };
g.window.location = { search: "" };
g.window.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
g.document = {
  createElement: () => ({ style: {}, getContext: () => null }),
  getElementById: () => null,
  head: { appendChild: () => {} },
  addEventListener: () => {},
};

let unhandled = 0;
process.on("unhandledRejection", () => {
  unhandled += 1;
});

const warnings: string[] = [];
const realWarn = console.warn.bind(console);
const startedAt = Date.now();
console.warn = (...args: unknown[]) => {
  warnings.push(`${Date.now() - startedAt}ms ${args.map(String).join(" ")}`);
};

const { loadEquipmentGlbCached, getCachedEquipmentGlb } = await import(
  "../src/engine/EquipmentBuilders"
);

// Tarayıcıdaki başarısızlık: `fetch` reddeder (FileLoader → onError → red).
g.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
g.self = g;
g.globalThis = g;

// Mutlak URL: tarayıcı `/models/...` yolunu çözer; bu ortamda da geçerli olsun.
const url = "https://example.invalid/models/savasci-zirh.glb";
const attempts = () => warnings.filter((w) => w.includes("yüklenemedi")).length;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

loadEquipmentGlbCached(url);
const placeholderReturned = getCachedEquipmentGlb(url) === undefined;
await wait(900);
const afterFirst = attempts();
await wait(4400);
const afterRetry = attempts();
await wait(1200);
const afterLimit = attempts();

console.warn = realWarn;
for (const warning of warnings) console.warn(`  · ${warning}`);

const ok =
  unhandled === 0 &&
  placeholderReturned &&
  afterFirst === 1 &&
  afterRetry === 2 &&
  afterLimit === 2;

console.log(
  `\n  yakalanmayan red: ${unhandled} (beklenen 0) · deneme sayısı: ` +
    `${afterFirst} → ${afterRetry} → ${afterLimit} (beklenen 1 → 2 → 2) · ` +
    `yer tutucu: ${placeholderReturned ? "döndü" : "DÖNMEDİ"}`,
);
console.log(
  ok
    ? "  zırh GLB hatası İZOLE ✔ (oyun devam eder, sayfaya red düşmez)\n"
    : "  zırh GLB hatası İZOLE EDİLEMEDİ ✘ (yakalanmayan red / deneme sınırı yanlış)\n",
);
process.exit(ok ? 0 : 1);
