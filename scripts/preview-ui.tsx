#!/usr/bin/env bun
/**
 * scripts/preview-ui.tsx — KENDİ TARAYICI/ÖNİZLEME ARACI (headless "tarayıcı").
 *
 * NEDEN: Bu ortamda gerçek bir tarayıcı/önizleme paneli yok; bu yüzden ekranda
 * ne çizildiğini görmek için happy-dom tabanlı bir DOM ortamı kurup React
 * bileşenlerini GERÇEKTEN render ediyoruz, sonra:
 *   · `--dump`   → çizilen ağacı terminalde okunur biçimde yazdırır
 *                  (etiket + sınıf + metin + satır içi renk + tıklanabilir öğeler),
 *   · varsayılan → senaryoların KENDİ KONTROLLERİNİ çalıştırır (tıklama
 *                  simülasyonu dahil) ve PASS/FAIL raporlar.
 *
 * Kullanım:
 *   bun scripts/preview-ui.tsx                       # tüm senaryoların kontrolleri
 *   bun scripts/preview-ui.tsx --dump                # tüm senaryoların DOM dökümü
 *   bun scripts/preview-ui.tsx --scenario renk-kilitli --dump
 *   bun scripts/preview-ui.tsx --scenario renk-kilitli
 *
 * Not: Bu bir DOM simülasyonudur, piksel çizmez. CSS sınıfları, metin, yapı ve
 * etkileşim (tıklama) doğrulanır — gözle görülen sonucun mantığı budur.
 */

import type { ReactElement } from "react";

const argv = process.argv.slice(2);
const DUMP = argv.includes("--dump");
const onlyIdx = argv.indexOf("--scenario");
const ONLY = onlyIdx >= 0 ? argv[onlyIdx + 1] : undefined;

/* ────────────────────────── DOM ortamı (mini tarayıcı) ───────────────────── */

type Ctx = {
  document: Document;
  window: Window & typeof globalThis;
};

async function openBrowser(): Promise<Ctx> {
  const { Window } = await import("happy-dom");
  const win = new Window({
    url: "http://localhost/",
    width: 430,
    height: 932,
  });
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = win;
  g.document = win.document;
  g.navigator = win.navigator;
  g.location = win.location;
  g.HTMLElement = win.HTMLElement;
  g.HTMLAnchorElement = win.HTMLAnchorElement;
  g.Element = win.Element;
  g.Node = win.Node;
  g.Event = win.Event;
  g.MouseEvent = win.MouseEvent;
  g.PointerEvent = win.PointerEvent ?? win.MouseEvent;
  g.KeyboardEvent = win.KeyboardEvent;
  g.getComputedStyle = win.getComputedStyle.bind(win);
  g.requestAnimationFrame = (cb: (t: number) => void) =>
    win.setTimeout(() => cb(Date.now()), 16) as unknown as number;
  g.cancelAnimationFrame = (id: number) => win.clearTimeout(id);
  if (typeof g.matchMedia !== "function") {
    g.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // `react-use-measure` (drei `Html`/ölçüm kancaları) global `screen`e bakıyor;
  // happy-dom penceresinde var ama Node globalinde yok → sayfa çizimi patlıyor.
  if (!g.screen) g.screen = win.screen ?? { width: 430, height: 932 };
  g.IntersectionObserver = class {
    root = null;
    rootMargin = "";
    thresholds = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  g.IS_REACT_ACT_ENVIRONMENT = true;
  return { document: win.document as unknown as Document, window: win };
}

/* ─────────────────────────────── Önizleme API'si ─────────────────────────── */

type Snapshot = {
  /** Görünen metin (boşluklar sadeleştirilmiş). */
  text: string;
  /** Tıklanabilir öğeler. */
  interactive: Element[];
  /** Tıklanabilir öğelerin kısa envanteri. */
  inventory: string[];
  html: string;
};

class Preview {
  readonly document: Document;
  readonly window: Window & typeof globalThis;
  root: HTMLElement;
  private reactRoot: { unmount: () => void } | null = null;

  constructor(ctx: Ctx) {
    this.document = ctx.document;
    this.window = ctx.window;
    this.root = this.document.createElement("div");
    this.document.body.appendChild(this.root);
  }

  /** Bileşeni gerçek React ile render eder (act ile, uyarı sızdırmadan). */
  async render(node: ReactElement): Promise<void> {
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    
    this.root.innerHTML = "";
    const container = this.document.createElement("div");
    this.root.appendChild(container);
    this.reactRoot = createRoot(container as unknown as HTMLElement);
    await React.act(async () => {
      this.reactRoot!.render(node);
    });
  }

  /** Gerçek DOM tıklaması (React'in sentetik olayına kadar gider). */
  async click(el: Element): Promise<void> {
    const React = await import("react");
    await React.act(async () => {
      el.dispatchEvent(
        new this.window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
  }

  snapshot(): Snapshot {
    const text = (this.root.textContent ?? "").replace(/\s+/g, " ").trim();
    const interactive = Array.from(
      this.root.querySelectorAll(
        "button, a[href], input, select, textarea, [role='button'], [tabindex]",
      ),
    );
    const inventory = interactive.map((el, i) => {
      const label = (
        el.getAttribute("aria-label") ??
        el.textContent ??
        el.getAttribute("title") ??
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 34);
      const disabled =
        el.hasAttribute("disabled") ||
        el.getAttribute("aria-disabled") === "true" ||
        (el as HTMLElement).style.opacity === "0"
          ? " [devre dışı]"
          : "";
      return `#${i + 1} <${el.tagName.toLowerCase()}> "${label}"${disabled}`;
    });
    return {
      text,
      interactive,
      inventory,
      html: this.root.innerHTML,
    };
  }

  /** Ağacı terminalde okunur biçimde döker. */
  dump(): string {
    const lines: string[] = [];
    const walk = (el: Element, depth: number) => {
      const tag = el.tagName.toLowerCase();
      if (
        ["script", "style", "defs", "path", "circle", "rect", "line", "polygon", "g", "use", "title"].includes(
          tag,
        )
      ) {
        return;
      }
      const pad = "  ".repeat(depth);
      let head = tag;
      const cls = (el.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4)
        .join(" ");
      if (cls) head += ` .${cls.replace(/\s+/g, " .")}`;
      // Satır içi stil (renk/parlama): kısaltılmış `background` de dahil.
      const inline = (el.getAttribute("style") ?? "").replace(/\s+/g, " ").trim();
      if (inline) head += ` [style: ${inline.slice(0, 78)}]`;
      if (tag === "button" && el.hasAttribute("aria-pressed")) {
        head += el.getAttribute("aria-pressed") === "true" ? " ✓SEÇİLİ" : "";
      }
      lines.push(pad + head);

      // Yalnızca yaprak metni yaz (iç içe metin tekrarını önlemek için).
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 3) {
          const t = (node.textContent ?? "").replace(/\s+/g, " ").trim();
          if (t) lines.push(`${pad}  "${t.slice(0, 96)}"`);
        } else if (node.nodeType === 1) {
          walk(node as Element, depth + 1);
        }
      }
    };
    for (const child of Array.from(this.root.children)) walk(child, 0);
    const snap = this.snapshot();
    lines.push("");
    lines.push(
      `▶ tıklanabilir öğe: ${snap.interactive.length}${
        snap.inventory.length ? ` → ${snap.inventory.join(" | ")}` : ""
      }`,
    );
    return lines.join("\n");
  }
}

/* ─────────────────────────────── Kontroller ──────────────────────────────── */

type Check = { name: string; ok: boolean; detail?: string };
const check = (name: string, ok: boolean, detail = ""): Check => ({
  name,
  ok,
  detail,
});

type Scenario = {
  id: string;
  title: string;
  handles: string;
  run: (p: Preview) => Promise<Check[]>;
};

/* ─────────────────── Sayfa senaryoları için sahte (mock) uygulama katmanı ── */

/**
 * Studio/Entry sayfalarını Convex + router + 3D sahne olmadan çizebilmek için
 * o katmanları taklit eder. 3D sahne (EntryCharacterStage) gerçek WebGL
 * istediği için boş bir kutuyla değiştirilir — geri kalan HER ŞEY (kartlar,
 * metinler, renk paneli, kilit mantığı) sayfanın gerçek kodu.
 */
type MockProfile = {
  username: string;
  avatar: {
    skin: string;
    hair: string;
    hairColor: string;
    shirt: string;
    pants: string;
    shoes: string;
  };
  coins: number;
  battleWins: number;
  level: number;
  vip: boolean;
  vipUntil: number;
  colorChosen: boolean;
  items: string[];
  equipped: string[];
};

export const defaultProfile = (over: Partial<MockProfile> = {}): MockProfile => ({
  username: "Dkdkdkk",
  avatar: {
    skin: "#ffd1a3",
    hair: "short",
    hairColor: "#6b4423",
    shirt: "#eab308",
    pants: "#1e293b",
    shoes: "#111827",
  },
  coins: 650,
  battleWins: 1,
  level: 1,
  vip: false,
  vipUntil: 0,
  colorChosen: false,
  items: [],
  equipped: [],
  ...over,
});

let profileStub: MockProfile = defaultProfile();
/** 🏠 `api.houses.enter/rename` taklidi — oyuncunun KENDİ odası (instance kimlikli). */
let houseStub = {
  roomId: "room_dkddkk0001",
  ownerName: "Dkdkdkk",
  name: "Dkdkdkk Odası",
  visits: 4,
  visitors: ["Ali", "Zeynep"],
  isMine: true,
};
/** 🏠 `api.houses.visit` taklidi — KOMŞUNUN odası (misafir görünümü). */
let guestStub = {
  roomId: "room_ali00000002",
  ownerName: "Ali",
  name: "Ali Odası",
  visits: 2,
  visitors: ["Dkdkdkk"],
  isMine: false,
};

async function mockAppLayer() {
  const { mock } = await import("bun:test");
  const React = await import("react");

  /**
   * Convex fonksiyon referansının adını okur (`"houses:list"` gibi).
   * `makeFunctionReference`, adı SEMBOL anahtarlı bir alanda taşır — bu yüzden
   * semboller taranır. Böylece sorgu taklidi, hangi sorgu çağrıldığını
   * ayırt edebilir ve her sorguya profil döndürüp sayfayı bozmaz.
   */
  const refName = (ref: unknown): string => {
    if (ref === null || typeof ref !== "object") return "";
    // Convex, adı GLOBAL bir sembolde taşır (`Symbol.for("functionName")`).
    const global = (ref as Record<symbol, unknown>)[
      Symbol.for("functionName")
    ];
    if (typeof global === "string") return global;
    for (const sym of Object.getOwnPropertySymbols(ref)) {
      const value = (ref as Record<symbol, unknown>)[sym];
      if (typeof value === "string") return value;
    }
    return "";
  };
  mock.module("convex/react", () => ({
    useQuery: (ref: unknown) => {
      const name = refName(ref);
      if (name === "profiles:getMyProfile") return profileStub;
      if (name === "chat:list" || name === "battles:listInvites") return [];
      return null;
    },
    // 🏠 Ev mutation'ları gerçek oda verisi döndürür: böylece "Evim" düğmesi
    // önizlemede GERÇEKTEN odayı açıyor (uçtan uca DOM kontrolü).
    useMutation: (ref: unknown) => {
      const name = refName(ref);
      if (name === "houses:enter") return async () => houseStub;
      if (name === "houses:rename") {
        return async (args: { name?: string } = {}) => ({
          ...houseStub,
          name: args.name ?? houseStub.name,
        });
      }
      if (name === "houses:visit") return async () => guestStub;
      return async () => null;
    },
    useAction: () => async () => null,
    useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
    ConvexProvider: ({ children }: { children: React.ReactNode }) => children,
    ConvexReactClient: class {},
  }));
  mock.module("@/hooks/use-auth", () => ({
    useAuth: () => ({
      signOut: async () => {},
      user: { isAnonymous: false, name: "Dkdkdkk" },
    }),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  }));
  mock.module("react-router", () => ({
    useNavigate: () => () => {},
    useLocation: () => ({ pathname: "/", search: "", hash: "", state: null, key: "x" }),
    Link: ({ children }: { children: React.ReactNode }) => children,
  }));
  // 3D sahne: happy-dom'da WebGL yok → boş bir yer tutucu.
  mock.module("@/components/entry/EntryCharacterStage", () => ({
    EntryCharacterStage: () => <div data-stub="3d-sahne" />,
    default: () => <div data-stub="3d-sahne" />,
  }));
  // Model indirme zinciri: sunucu yok → indirme tamamlanmış varsay.
  //
  // ⚠️ Dışa aktarım listesi `src/`deki GERÇEK drei importlarıyla birebir
  // olmalı (`grep -r "@react-three/drei" src/`). Eksik tek bir isim
  // "Export named 'X' not found" ile modül yüklemesini tümden düşürüyor ve
  // o zaman World modülü hiç import edilemediği için modül başlatma (TDZ)
  // hatalarını göremiyoruz. Proxy burada İŞE YARAMAZ: bun `mock.module`
  // fabrikasının kendi numaralı anahtarlarını okur, `get` tuzağını kullanmaz.
  mock.module("@react-three/drei", () => {
    const passthrough = ({ children }: { children?: React.ReactNode }) => (
      <div>{children}</div>
    );
    return {
      // drei'nin DOM katmanı: sahne olmadan yalnızca çocukları çiz.
      Html: passthrough,
      // Sahne süsleri — WebGL yok, çocuklarını geçir.
      Environment: passthrough,
      Lightformer: passthrough,
      RoundedBox: passthrough,
      useProgress: () => ({
        progress: 100,
        active: false,
        loaded: 4,
        total: 4,
        errors: [],
      }),
      useGLTF: Object.assign(
        () => ({ scene: {}, nodes: {}, materials: {}, animations: [] }),
        { preload: () => {}, clear: () => {} },
      ),
      useAnimations: () => ({ actions: {}, mixer: null, names: [], clips: [] }),
    };
  });
  // Ekipman/bomba modelleri `three-stdlib`in GERÇEK GLTFLoader'ıyla ağdan
  // indirmeye çalışır; happy-dom'da göreli URL `Request`e giremediği için
  // "Invalid URL" ile patlar ve TÜM SAYFA düşer. Sahte yükleyici, boş bir
  // grup döndürerek zinciri tamamlar (model içeriği önizlemede önemsiz).
  const THREE = await import("three");
  class FakeGLTFLoader {
    load(
      _url: string,
      onLoad: (gltf: { scene: unknown }) => void,
      _onProgress?: unknown,
      _onError?: unknown,
    ) {
      setTimeout(() => onLoad({ scene: new THREE.Group() }), 0);
    }
    setMeshoptDecoder() {}
    setDRACOLoader() {}
  }
  mock.module("three-stdlib", () => ({
    GLTFLoader: FakeGLTFLoader,
    DRACOLoader: class {
      setDecoderPath() {}
      setDecoderConfig() {}
      preload() {}
    },
    MeshoptDecoder: () => ({ ready: Promise.resolve(), supported: false }),
    SkeletonUtils: {
      clone: <T,>(object: T): T =>
        (object as unknown as { clone: (deep: boolean) => T }).clone(true),
    },
  }));

  mock.module("@/engine/streetPreload", () => ({
    preloadStreetModels: () => {},
    STREET_MODELS: {},
    STREET_BUILDING_MODELS: [],
    STREET_TIPS: ["Önizleme"],
    StreetAssetsProbe: () => null,
  }));
}

/* ──────────────────────────────── Senaryolar ─────────────────────────────── */

/** En dıştaki (stil taşıyan) sarmalayıcı div'in satır içi stili. */
function wrapperStyle(p: Preview): string {
  const first = Array.from(p.root.querySelectorAll("div")).find((d) =>
    d.getAttribute("style"),
  );
  return first?.getAttribute("style") ?? "";
}

const scenarios: Scenario[] = [
  {
    id: "renk-ilk-secim",
    title: "Karakter rengi · İLK seçim (VIP değil, hak kullanılmamış)",
    handles: "CharacterColorPicker locked=false",
    run: async (p) => {
      const { CharacterColorPicker } = await import(
        "../src/components/entry/CharacterColorPicker"
      );
      const picked: string[] = [];
      await p.render(
        <CharacterColorPicker
          color="#eab308"
          onSelect={(hex) => picked.push(hex)}
          isVip={false}
          locked={false}
        />,
      );
      const snap = p.snapshot();
      // Premium renkler "VIP" rozetini taşır (rozeti olan 2 renk).
      const premium = snap.interactive.filter((el) =>
        (el.textContent ?? "").includes("VIP"),
      );
      await p.click(snap.interactive[0]);
      const afterNormal = picked.length;
      if (premium[0]) await p.click(premium[0]);
      return [
        check("14 renk düğmesi çizildi", snap.interactive.length === 14, `bulunan ${snap.interactive.length}`),
        check("tek seferlik uyarısı görünüyor", snap.text.includes("tek seferlik")),
        check("normal renk seçimi çalışıyor", afterNormal === 1, `onSelect ${afterNormal} kez`),
        check(
          "VIP rengi VIP olmadan SEÇİLEMİYOR",
          picked.length === 1,
          `onSelect ${picked.length} kez`,
        ),
      ];
    },
  },
  {
    id: "renk-kilitli",
    title: "Karakter rengi · HAK KULLANILDI (VIP değil) → ikinci seçim YOK",
    handles: "CharacterColorPicker locked=true",
    run: async (p) => {
      const { CharacterColorPicker } = await import(
        "../src/components/entry/CharacterColorPicker"
      );
      const picked: string[] = [];
      await p.render(
        <CharacterColorPicker
          color="#eab308"
          onSelect={(hex) => picked.push(hex)}
          isVip={false}
          locked={true}
        />,
      );
      const snap = p.snapshot();
      // Palette yerine kart çizildiği için tıklanacak hiçbir şey olmamalı.
      for (const el of snap.interactive.length ? snap.interactive : []) {
        await p.click(el);
      }
      const after = p.snapshot();
      return [
        check("palet yerine kilit kartı çizildi", snap.text.includes("Kilitli renk")),
        check("kilitli renk adı gösteriliyor", snap.text.includes("Altın")),
        check(
          "hiçbir tıklanabilir renk hedefi yok",
          snap.interactive.length === 0,
          `tıklanabilir ${snap.interactive.length}`,
        ),
        check("aria-pressed (seçili renk) düğmesi yok", after.html.includes("aria-pressed") === false),
        check(
          "tıklama hiçbir seçim üretmiyor",
          picked.length === 0,
          `onSelect ${picked.length} kez`,
        ),
        check(
          "kilit açıklaması VIP'e yönlendiriyor",
          snap.text.includes("ikinci bir renk seçimi yapılamaz") &&
            snap.text.includes("VIP"),
        ),
        check("VIP premium renkleri tanıtılıyor", snap.text.includes("premium renk")),
      ];
    },
  },
  {
    id: "renk-vip",
    title: "Karakter rengi · VIP üye (hak kullanılmış olsa da serbest)",
    handles: "CharacterColorPicker isVip=true, locked=false",
    run: async (p) => {
      const { CharacterColorPicker } = await import(
        "../src/components/entry/CharacterColorPicker"
      );
      const picked: string[] = [];
      await p.render(
        <CharacterColorPicker
          color="#ffd76e"
          onSelect={(hex) => picked.push(hex)}
          isVip={true}
          locked={false}
        />,
      );
      const snap = p.snapshot();
      const premium = snap.interactive.filter((el) =>
        (el.textContent ?? "").includes("VIP"),
      );
      if (premium[1]) await p.click(premium[1]);
      return [
        check("14 renk düğmesi çizildi", snap.interactive.length === 14, `bulunan ${snap.interactive.length}`),
        check("kilit kartı YOK", snap.text.includes("Kilitli renk") === false),
        check("VIP premium renk seçilebiliyor", picked.length === 1, `onSelect ${picked.length} kez`),
      ];
    },
  },
  {
    id: "renk-skin",
    title: "Karakter rengi · hazır görünüm kuşanılmış (Samuray)",
    handles: "CharacterColorPicker wornSkinName",
    run: async (p) => {
      const { CharacterColorPicker } = await import(
        "../src/components/entry/CharacterColorPicker"
      );
      const picked: string[] = [];
      await p.render(
        <CharacterColorPicker
          color="#eab308"
          onSelect={(hex) => picked.push(hex)}
          isVip={false}
          locked={false}
          wornSkinName="Samuray"
        />,
      );
      const snap = p.snapshot();
      return [
        check("palet yerine bilgi kartı var", snap.text.includes("Samuray")),
        check("hiç tıklanabilir hedef yok", snap.interactive.length === 0, `tıklanabilir ${snap.interactive.length}`),
        check("renk hakkının harcanmadığı yazıyor", snap.text.includes("harcanmadı")),
        check("tıklama seçim üretmiyor", picked.length === 0),
      ];
    },
  },
  {
    id: "sayfa-studio-kilitli",
    title: "SAYFA: /studio · renk hakkı kullanılmış standart üye",
    handles: "src/pages/Studio.tsx (Convex + router + 3D taklit)",
    run: async (p) => {
      profileStub = defaultProfile({ colorChosen: true, vip: false });
      await mockAppLayer();
      const { default: Studio } = await import("../src/pages/Studio");
      await p.render(<Studio />);
      const snap = p.snapshot();
      const labels = snap.inventory.join(" | ");
      return [
        check("sayfa çizildi (kullanıcı adı görünüyor)", snap.text.includes("Dkdkdkk")),
        check("Karakter Rengi kartı var", snap.text.includes("Karakter Rengi")),
        check("kilit kartı görünüyor", snap.text.includes("Kilitli renk")),
        check(
          "renk paleti ÇİZİLMİYOR",
          !/aria-label=\\?"Kızıl/.test(snap.html) && !labels.includes("Kızıl"),
        ),
        check(
          "diğer kontroller (kaydet/rastgele) hâlâ çalışır",
          snap.interactive.length > 5,
          `tıklanabilir ${snap.interactive.length}`,
        ),
      ];
    },
  },
  {
    id: "sayfa-studio-vip",
    title: "SAYFA: /studio · VIP üye (renk serbest)",
    handles: "src/pages/Studio.tsx (Convex + router + 3D taklit)",
    run: async (p) => {
      profileStub = defaultProfile({ colorChosen: true, vip: true, vipUntil: Date.now() + 86400000 });
      await mockAppLayer();
      const { default: Studio } = await import("../src/pages/Studio");
      await p.render(<Studio />);
      const snap = p.snapshot();
      return [
        check("sayfa çizildi", snap.text.includes("Dkdkdkk")),
        check("kilit kartı YOK", !snap.text.includes("Kilitli renk")),
        check("14 renk düğmesi palet olarak çizildi", snap.inventory.filter((i) => /button/.test(i)).length >= 14),
        check("kullanıcı VIP olarak etiketli", snap.text.includes("VIP")),
      ];
    },
  },
  {
    id: "sayfa-entry-kilitli",
    title: "SAYFA: /entry · giriş ekranı (yükleme biter → lobi)",
    handles: "src/pages/Entry.tsx (Convex + router + 3D taklit)",
    run: async (p) => {
      profileStub = defaultProfile({ colorChosen: true, vip: false });
      await mockAppLayer();
      const React = await import("react");
      const { default: Entry } = await import("../src/pages/Entry");
      await p.render(<Entry />);
      // Yükleme tavanı ~3 sn'de dolar; lobiye geçişi gerçek zamanla bekle.
      // İki act penceresi: React zamanlayıcı geri çağrılarını aralarında
      // işler (tarayıcıdaki olay döngüsüne benzer).
      for (let i = 0; i < 4; i++) {
        await React.act(async () => {
          await new Promise((r) => setTimeout(r, 1200));
        });
      }
      const snap = p.snapshot();
      return [
        check("lobi çizildi (üyelik durumu görünüyor)", snap.text.includes("Üyelik Durumu")),
        check("Karakter Rengi kartı var", snap.text.includes("Karakter Rengi")),
        check("kilit kartı görünüyor", snap.text.includes("Kilitli renk")),
        check("renk paleti ÇİZİLMİYOR (Kızıl seçeneği yok)", !snap.inventory.join("|").includes("Kızıl")),
        check("OYUNA GİR düğmesi duruyor", /OYUNA GİR|BAĞLANIYOR/.test(snap.text)),
      ];
    },
  },
  {
    id: "balon-gorunum",
    title: "SOHBET BALONCUĞU · Sanalika stili görünüm (beyaz / kaybolma / VIP)",
    handles: "src/engine/ChatBubble3D.tsx → ChatBubbleBody",
    run: async (p) => {
      const {
        ChatBubbleBody,
        CHAT_BUBBLE_MS,
        CHAT_BUBBLE_FADE_MS,
        CHAT_BUBBLE_HEIGHT,
        CHAT_BUBBLE_MIN_SCALE,
        CHAT_BUBBLE_MAX_SCALE,
      } = await import("../src/engine/ChatBubble3D");
      await p.render(
        <ChatBubbleBody
          text="Merhaba Vaelos!"
          name="Dkdkdkk"
          colorId="beyaz"
          visible
        />,
      );
      // Baloncuk GÖVDESİ = border-radius taşıyan div (sarmalayıcılar da aynı
      // metni içerdiği için en içteki eşleşme alınır).
      const findBody = () =>
        Array.from(p.root.querySelectorAll("div")).find((d) =>
          (d.getAttribute("style") ?? "").includes("border-radius"),
        );
      const bubble = findBody();
      const style = bubble?.getAttribute("style") ?? "";
      const wrapper = wrapperStyle(p);
      const text = (p.root.textContent ?? "").replace(/\s+/g, " ").trim();
      // Kuyruk artık 45° döndürülmüş bir KARE (eski "üst üste iki üçgen"
      // testere gibi ve ayrık duruyordu).
      const tailStyle =
        Array.from(p.root.querySelectorAll("span"))
          .map((s) => s.getAttribute("style") ?? "")
          .find((s) => s.includes("rotate(45deg)")) ?? "";
      // Gövde + kuyruk TEK parça gibi gölgelensin diye sarmalayıcıda
      // `filter: drop-shadow` (ayrı box-shadow'lar ek yeri belli ediyordu).
      const shellStyle =
        Array.from(p.root.querySelectorAll("div"))
          .map((d) => d.getAttribute("style") ?? "")
          .find((s) => s.includes("filter: drop-shadow")) ?? "";
      const nameStyle =
        p.root.querySelector("strong")?.getAttribute("style") ?? "";
      const divStyles = () =>
        Array.from(p.root.querySelectorAll("div")).map(
          (d) => d.getAttribute("style") ?? "",
        );
      // happy-dom hex'i bazen rgb(...)'ye çevirir → iki gösterimi de kabul et.
      const isCream = (s: string) => /#F7F9E9|247, ?249, ?233/i.test(s);
      const isGreen = (s: string) => /#72C94A|114, ?201, ?74/i.test(s);
      const isRedName = (s: string) => /#E53935|229, ?57, ?53/i.test(s);
      const checks: Check[] = [
        check("mesaj metni çizildi", bubble !== undefined),
        check(
          "krem, tam opak gövde (#F7F9E9)",
          style.includes("linear-gradient(180deg") && isCream(style),
          style.slice(0, 80),
        ),
        check("yuvarlatılmış köşe 14px", style.includes("border-radius: 14px")),
        check(
          "düz yeşil kenarlık 3px (#72C94A)",
          /border: 3px solid/.test(style) && isGreen(style),
          (style.match(/border: [^;]+/) ?? [""])[0],
        ),
        check("iç boşluk 9px 12px", style.includes("padding: 9px 12px")),
        check("metin sola hizalı", style.includes("text-align: left")),
        check("satır kaydırma açık (overflow-wrap)", style.includes("overflow-wrap: anywhere")),
        check(
          "mesaj rengi koyu (#202020)",
          /color: (rgb\(32, 32, 32\)|#202020)/.test(style),
        ),
        check(
          "eski oyun yazı tipi (Trebuchet/Tahoma/Arial)",
          style.includes("Trebuchet MS") &&
            style.includes("Tahoma") &&
            style.includes("Arial"),
        ),
        check(
          "mobil-masaüstü arası ölçeklenen yazı (clamp sınıfı)",
          (bubble?.getAttribute("class") ?? "").includes("vaelos-bubble-text"),
          bubble?.getAttribute("class") ?? "",
        ),
        // Gövde + kuyruk TEK parça gibi gölgelensin diye sarmalayıcıda tek
        // `drop-shadow` (Sanalika'nın çok hafif gölgesi).
        check(
          "çok hafif gölge (0 2px 4px rgba(0,0,0,0.15))",
          /drop-shadow\(0 2px 4px rgba\(0, 0, 0, 0\.15\)\)/.test(shellStyle),
          shellStyle.slice(0, 70),
        ),
        check(
          "kuyruk döndürülmüş kare (45°) ve gövdenin ÜSTÜNDE",
          tailStyle.includes("rotate(45deg)") && tailStyle.includes("z-index: 1"),
          tailStyle.slice(0, 90),
        ),
        check(
          "kuyruk gövdeyle aynı krem renkte",
          isCream(tailStyle),
          tailStyle.slice(0, 80),
        ),
        check(
          "kuyruk kenarlığı gövdeyle AYNI yeşil (kesintisiz çizgi)",
          /border-right-width: 3px/.test(tailStyle) &&
            /border-right-color: (#72C94A|rgb\(114, 201, 74\))/i.test(tailStyle) &&
            isGreen(style),
          tailStyle.slice(0, 120),
        ),
        check(
          "tıklamayı yakalamaz (pointer-events none)",
          /pointer-events: none/.test(wrapper),
        ),
        // ⛔ REGRESYON: esneyen (flex) sarmalayıcı + genişliksiz kapsayıcı
        // metni HER HARFİ AYRI SATIRA düşürüyordu. Baloncuk kendi genişliğini
        // almalı.
        check(
          "metin harf harf SARMAZ (flex değil)",
          !/display: flex/.test(wrapper),
          wrapper.slice(0, 70),
        ),
        check(
          "içeriğe göre OTOMATİK genişlik (inline-block + max-content)",
          wrapper.includes("display: inline-block") &&
            wrapper.includes("width: max-content"),
        ),
        check(
          "kısa/uzun mesaja göre boyut sınırı (clamp 190-260px)",
          /max-width: clamp\(190px, 56vw, 260px\)/.test(wrapper),
          (wrapper.match(/max-width: [^;]+/) ?? [""])[0],
        ),
        check(
          "mesafeye göre kıstırılmış ölçek (--bubble-scale)",
          wrapper.includes("scale(var(--bubble-scale, 1))"),
          (wrapper.match(/transform: [^;]+/) ?? [""])[0],
        ),
        // Sanalika düzeni: gönderen adı baloncuğun İÇİNDE, KIRMIZI ve kalın.
        check(
          "gönderen adı baloncukta yazıyor (İsim: mesaj)",
          text === "Dkdkdkk: Merhaba Vaelos!",
          text,
        ),
        check("ad kalın (strong) yazılıyor", p.root.querySelector("strong") !== null),
        check(
          "kullanıcı adı KIRMIZI + kalın (#E53935)",
          isRedName(nameStyle) && /font-weight: 700/.test(nameStyle),
          nameStyle.slice(0, 60),
        ),
        check("5 saniye ekranda kalır", CHAT_BUBBLE_MS === 5000, `${CHAT_BUBBLE_MS} ms`),
        check("yumuşak kaybolma süresi tanımlı", CHAT_BUBBLE_FADE_MS > 0, `${CHAT_BUBBLE_FADE_MS} ms`),
        check("baş üstü çapası 2.2", CHAT_BUBBLE_HEIGHT === 2.2),
        check(
          "ölçek min/max sınırlı (0.6 / 1.0)",
          CHAT_BUBBLE_MIN_SCALE === 0.6 && CHAT_BUBBLE_MAX_SCALE === 1.0,
          `${CHAT_BUBBLE_MIN_SCALE} / ${CHAT_BUBBLE_MAX_SCALE}`,
        ),
      ];

      // Kaybolma hali: giriş/kaybolma sarmalayıcısı opacity 0 + yukarı süzülür.
      await p.render(
        <ChatBubbleBody text="Merhaba Vaelos!" colorId="beyaz" visible={false} />,
      );
      const fading =
        divStyles().find((s) => s.includes("transition")) ?? "";
      const enterMs = Number((fading.match(/opacity (\d+)ms/) ?? [])[1] ?? "0");
      checks.push(
        check("giriş/kaybolma geçişi (transition) var", fading.includes("transition")),
        check("giriş animasyonu 120-180ms", enterMs >= 120 && enterMs <= 180, `${enterMs}ms`),
        check("kaybolurken opacity 0", /opacity: 0/.test(fading), fading.slice(0, 70)),
        // "Mesajlar YUKARI doğru kaybolsun": gizli hâl negatif Y taşır.
        check(
          "kaybolma YUKARI doğru (negatif translateY)",
          /translateY\(-\d+px\)/.test(fading),
          (fading.match(/translateY\([^)]*\)[^;]*/) ?? [""])[0],
        ),
      );

      // 👑 VIP balon rengi: Sanalika'nın renkli + kalın beyaz çerçeveli +
      // ışıyan baloncuğu; yazı rengi zemine göre beyaz/koyu seçilir.
      await p.render(
        <ChatBubbleBody
          text="VIP balon"
          name="VIPOyuncu"
          colorId="nane"
          visible
        />,
      );
      const vipStyle = findBody()?.getAttribute("style") ?? "";
      const vipText = (p.root.textContent ?? "").replace(/\s+/g, " ").trim();
      const vipTail =
        Array.from(p.root.querySelectorAll("span"))
          .map((s) => s.getAttribute("style") ?? "")
          .find((s) => s.includes("rotate(45deg)")) ?? "";
      const isTeal = (s: string) => /#14b8a6|20, ?184, ?166/i.test(s);
      const isWhite = (s: string) => /#ffffff|255, ?255, ?255/i.test(s);
      checks.push(
        check("VIP renk zemine uygulanıyor", isTeal(vipStyle), vipStyle.slice(0, 60)),
        check("VIP renkte yazı beyaz", /color: (rgb\(255, 255, 255\)|#ffffff)/.test(vipStyle)),
        check(
          "VIP renkte kalın beyaz çerçeve (3px)",
          /border: 3px solid/.test(vipStyle) && isWhite(vipStyle),
        ),
        check("VIP baloncuğunda taç işareti var", vipText.includes("👑")),
        // 👑 VIP ANİMASYONU: nabız gibi salınan renkli ışıma + ışık süpürmesi.
        check(
          "VIP renkte NABIZ animasyonu (ışıma)",
          vipStyle.includes("animation: vaelos-bubble-pulse"),
        ),
        check(
          "ışıma rengi baloncuğun kendi renginden (CSS değişkenleri)",
          /--vip-glow:/.test(vipStyle) &&
            /--vip-glow-soft:/.test(vipStyle) &&
            isTeal(vipStyle),
          (vipStyle.match(/--vip-glow[^;]*/) ?? [""])[0],
        ),
        check(
          "VIP renkte ışık süpürmesi (sheen) var",
          Array.from(p.root.querySelectorAll("span")).some((s) =>
            (s.getAttribute("style") ?? "").includes(
              "animation: vaelos-bubble-sheen",
            ),
          ),
        ),
        check(
          "VIP kuyruğu da beyaz çerçeveli ve balon renginde",
          /border-right-width: 3px/.test(vipTail) &&
            /border-right-color: (#ffffff|rgb\(255, 255, 255\))/i.test(vipTail) &&
            isTeal(vipTail),
          vipTail.slice(0, 120),
        ),
      );
      // Kırmızı (koyu zemin / beyaz yazı) ve sarı (açık zemin / koyu yazı)
      // renkleri: yazı renkleri veriden gelir, kontrast otomatik ayarlanır.
      await p.render(
        <ChatBubbleBody text="Kırmızı balon" colorId="kirmizi" visible />,
      );
      const redStyle = findBody()?.getAttribute("style") ?? "";
      checks.push(
        check(
          "kırmızı VIP balon zemini (gradyanın alt rengi)",
          /background: linear-gradient\(180deg, rgb\([^)]*\) 0%, #ef4444 100%\)/.test(
            redStyle,
          ),
          redStyle.slice(0, 70),
        ),
        check(
          "VIP olmayan (beyaz) balonda animasyon YOK",
          !style.includes("vaelos-bubble-pulse") &&
            !style.includes("--vip-glow"),
        ),
        check(
          "kırmızı balonda beyaz yazı + koyu gölge",
          /color: (rgb\(255, 255, 255\)|#ffffff)/.test(redStyle) &&
            redStyle.includes("rgba(0, 0, 0, 0.35)"),
        ),
      );
      await p.render(
        <ChatBubbleBody text="Sarı balon" colorId="sari" visible />,
      );
      const yellowStyle = findBody()?.getAttribute("style") ?? "";
      checks.push(
        check(
          "sarı VIP balonda koyu yazı",
          /color: (rgb\(32, 32, 32\)|#202020)/.test(yellowStyle),
        ),
      );
      return checks;
    },
  },
  {
    id: "balon-baglanti",
    title: "SOHBET BALONCUĞU · kablolama (gönderince görünür, her karakterde)",
    handles: "World → GameEngine3D → GlbAvatar3D → ChatBubble",
    run: async () => {
      const { readFileSync } = await import("node:fs");
      const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
      const world = read("../src/pages/World.tsx");
      const engine = read("../src/engine/GameEngine3D.tsx");
      const avatar = read("../src/engine/GlbAvatar3D.tsx");
      const bubble = read("../src/engine/ChatBubble3D.tsx");
      const css = read("../src/index.css");
      return [
        check(
          "VIP animasyon keyframes'leri global CSS'te",
          /@keyframes vaelos-bubble-pulse/.test(css) &&
            /@keyframes vaelos-bubble-sheen/.test(css),
        ),
        check(
          "animasyonlar azaltılmış hareket tercihinde kapanır",
          /prefers-reduced-motion: reduce[\s\S]{0,400}animation-duration: 0\.01ms !important/.test(
            css,
          ),
        ),
        check(
          "balon yazısı clamp ile ölçeklenir (13-15px)",
          /\.vaelos-bubble-text\s*\{[^}]*font-size:\s*clamp\(13px, 3\.5vw, 15px\)/.test(
            css,
          ),
        ),
        check(
          "drei <Html center> kullanılıyor (ölçek elle kıstırılıyor)",
          /<Html[\s\S]*?center/.test(bubble) &&
            !/distanceFactor=\{/.test(bubble),
        ),
        check(
          "ölçek min/max sınırlı ve her karede kameraya göre hesaplanır",
          /CHAT_BUBBLE_MIN_SCALE = 0\.6/.test(bubble) &&
            /CHAT_BUBBLE_MAX_SCALE = 1\.0/.test(bubble) &&
            /useFrame\(/.test(bubble) &&
            /--bubble-scale/.test(bubble),
        ),
        check(
          "baloncuk oyun girdisini yakalamaz (pointerEvents none)",
          /pointerEvents="none"/.test(bubble),
        ),
        check(
          "çapa başın üstünde: [0, 2.2, 0]",
          /CHAT_BUBBLE_HEIGHT = 2\.2/.test(bubble) &&
            /position = \[0, CHAT_BUBBLE_HEIGHT, 0\]/.test(bubble),
        ),
        check(
          "avatar, baloncuğu kendi grubunda çiziyor",
          /<ChatBubble\s+text=\{speech\}/.test(avatar),
        ),
        check(
          "yerel oyuncuya baloncuğu bağlı",
          /speech=\{speech\}/.test(engine) && /speechColorId=\{speechColorId\}/.test(engine),
        ),
        check(
          "baloncukta gönderen adı yazılıyor (Sanalika düzeni)",
          /speechName=\{speechName\}/.test(engine) &&
            /speechName=\{data\.name\}/.test(engine) &&
            /speechName=\{bot\?\.def\.name\}/.test(engine) &&
            /speechName=\{username\}/.test(world),
        ),
        check("botların baloncuğu bağlı", /botSpeech\?\./.test(engine)),
        check("karşı oyuncunun baloncuğu bağlı (varlık yayını)", /speech=\{data\.speech/.test(engine)),
        check(
          "World, mesajı baloncuğa veriyor",
          /speech=\{bubble\}/.test(world) && /botSpeech=\{botBubbles\}/.test(world),
        ),
        check("World, 5 sn'lik süreyi tek kaynaktan kullanıyor", /CHAT_BUBBLE_MS/.test(world)),
        check(
          "mesaj gönderilince varlık yayınına ekleniyor (diğer telefonlar)",
          /publishSpeech\(shown\)/.test(world) && /publishSpeech\(null\)/.test(world),
        ),
      ];
    },
  },
  {
    id: "sayfa-entry-ilk-secim",
    title: "SAYFA: /entry · ilk kez giren oyuncu (renk hakkı açık)",
    handles: "src/pages/Entry.tsx (Convex + router + 3D taklit)",
    run: async (p) => {
      profileStub = defaultProfile({ colorChosen: false, vip: false });
      await mockAppLayer();
      const React = await import("react");
      const { default: Entry } = await import("../src/pages/Entry");
      await p.render(<Entry />);
      for (let i = 0; i < 4; i++) {
        await React.act(async () => {
          await new Promise((r) => setTimeout(r, 1200));
        });
      }
      const snap = p.snapshot();
      const labels = snap.inventory.join(" | ");
      return [
        check("lobi çizildi", snap.text.includes("Üyelik Durumu")),
        check("kilit kartı YOK", !snap.text.includes("Kilitli renk")),
        check("renk paleti çizildi (Kızıl seçeneği var)", labels.includes("Kızıl")),
        check("tek seferlik uyarısı görünüyor", snap.text.includes("tek seferlik")),
      ];
    },
  },
  {
    id: "ev-paneli",
    title: "🏠 EV PANELİ · \"Evim\" düğmesi açılıyor, boş arsada ev kurmayı öneriyor",
    handles: "src/pages/World.tsx (HouseSheet) + src/engine/houseDoor.ts",
    run: async (p) => {
      profileStub = defaultProfile({ colorChosen: true, vip: false });
      await mockAppLayer();
      const React = await import("react");
      const { default: World } = await import("../src/pages/World");
      const checks: Check[] = [];
      let rendered = false;
      let err = "";
      try {
        await p.render(<World />);
        for (let i = 0; i < 3; i++) {
          await React.act(async () => {
            await new Promise((r) => setTimeout(r, 1200));
          });
        }
        rendered = true;
      } catch (e) {
        // React birden fazla hatayı AggregateError içinde toplar: TAMAMINI
        // göster ki ilk satır asıl nedeni gizlemesin.
        const list =
          e instanceof AggregateError && e.errors.length > 0
            ? e.errors
            : [e];
        err = list
          .map((sub) =>
            sub instanceof Error
              ? (sub.stack ?? sub.message)
              : String(sub),
          )
          .join("\n  ├─ ");
      }
      checks.push(check("caddede World çizildi", rendered, err));
      if (!rendered) return checks;

      const before = p.snapshot();
      checks.push(
        check(
          "alt barda \"Evim\" düğmesi var",
          before.inventory.some((l) => l.includes("Evim")),
        ),
      );
      // BarBtn etiketi `aria-label`da taşınır (düğme içinde yalnızca ikon var).
      const button = Array.from(p.root.querySelectorAll("button")).find(
        (b) =>
          (b.getAttribute("aria-label") ?? "").includes("Evim") ||
          (b.textContent ?? "").includes("Evim"),
      );
      checks.push(check("Evim düğmesi bulundu", !!button));
      if (!button) return checks;

      await p.click(button);

      // ── 2) ODAYA GİRİŞ: "Evim" düğmesi DOĞRUDAN oyuncunun KENDİ odasını
      //       açmalı — arada TAM EKRAN yükleme ekranı yok, oda üstünde de
      //       "Oda yerleştiriliyor…" şeridi çıkmaz (karakter odada durur).
      await React.act(async () => {
        await new Promise((r) => setTimeout(r, 400));
      });
      const gateSnap = p.snapshot();
      checks.push(
        check(
          "odaya girişte ARA EKRAN yok (tam ekran yükleme ekranı / şerit çıkmaz)",
          !gateSnap.text.includes("Kapı açılıyor") &&
            !gateSnap.text.includes("Evine giriliyor") &&
            !gateSnap.text.includes("Oda yerleştiriliyor"),
          gateSnap.text.slice(0, 80),
        ),
      );
      for (let i = 0; i < 3; i++) {
        await React.act(async () => {
          await new Promise((r) => setTimeout(r, 700));
        });
      }
      const roomSnap = p.snapshot();
      return [
        ...checks,
        check(
          "oda açıldı: oda adı + giriş sayısı + sahiplik",
          roomSnap.text.includes("Dkdkdkk Odası") &&
            roomSnap.text.includes("4 giriş") &&
            roomSnap.text.includes("senin evin"),
          roomSnap.text.slice(0, 120),
        ),
        check(
          "ziyaretçi defteri odada görünüyor",
          roomSnap.text.includes("Ali") && roomSnap.text.includes("Zeynep"),
        ),
        check(
          "odanın ÖRNEK KİMLİĞİ görünüyor (room instance id)",
          roomSnap.text.includes("dkddkk0001"),
          roomSnap.text.slice(0, 90),
        ),
        check(
          "oda adı düzenlenebiliyor (sahibi)",
          // Ad düzenleme düğmesi kompakt şeritte İKON olarak durur; erişilebilir
          // adı (`aria-label`) kontrol edilir.
          roomSnap.inventory.some((l) => l.includes("Oda adını değiştir")),
        ),
        check(
          "kapıdan çıkma düğmesi var",
          roomSnap.inventory.some((l) => l.includes("Çık")),
        ),
        check(
          "oda BOŞ EKRAN değil: 3D sahne ya da yedek oda çizilir",
          p.root.querySelectorAll("canvas").length > 0 ||
            p.root.querySelector("[data-room-fallback]") !== null,
          `${p.root.querySelectorAll("canvas").length} canvas`,
        ),
      ];
    },
  },

  {
    id: "carpisma",
    title: "ÇARPIŞMA · karakterler hiçbir prop'un içinden geçmez + 'donk' sesi",
    handles:
      "src/lib/shop.ts (OBSTACLES/pushOutOfObstacles) + src/pages/World.tsx + src/lib/sounds.ts",
    run: async () => {
      const { readFileSync } = await import("node:fs");
      const read = (path: string) =>
        readFileSync(new URL(path, import.meta.url), "utf8");
      const world = read("../src/pages/World.tsx");
      const sounds = read("../src/lib/sounds.ts");
      const pathing = read("../src/lib/pathfinding.ts");

      const {
        OBSTACLES,
        inWalkable,
        nearestWalkable,
        pushOutOfObstacles,
        svgX,
        svgY,
        PLAYER_RADIUS,
      } = await import("../src/lib/shop");
      const { findPath } = await import("../src/lib/pathfinding");
      const K = await import("../src/engine/constants");
      const checks: Check[] = [];

      // ── 1) Sokak mobilyasının TAMAMI artık katı cisim ──
      const expected =
        K.STALLS.length +
        K.LAMPS.length +
        K.TRASH_CANS.length +
        K.DIRECTION_SIGNS.length +
        K.BENCHES.length +
        K.BUS_STOPS.length;
      checks.push(
        check(
          "OBSTACLES tezgâh + lamba + bank + durak + çöp + tabelayı kapsıyor",
          OBSTACLES.length === expected,
          `${OBSTACLES.length} engel (beklenen ${expected})`,
        ),
      );

      const props: [string, number, number][] = [
        ...K.STALLS.map((s) => ["tezgâh", s.x, s.z] as [string, number, number]),
        ...K.LAMPS.map((l) => ["lamba", l.x, l.z] as [string, number, number]),
        ...K.TRASH_CANS.map((t) => ["çöp", t.x, t.z] as [string, number, number]),
        ...K.DIRECTION_SIGNS.map(
          (d) => ["tabela", d.x, d.z] as [string, number, number],
        ),
        ...K.BENCHES.map((b) => ["bank", b.x, b.z] as [string, number, number]),
        ...K.BUS_STOPS.map((b) => ["durak", b.x, b.z] as [string, number, number]),
      ];
      const penetrable = props.filter(([, x, z]) =>
        inWalkable(svgX(x), svgY(z)),
      );
      checks.push(
        check(
          "hiçbir prop'un merkezine girilemiyor (üstüne çıkılamaz)",
          penetrable.length === 0,
          penetrable.length
            ? `${penetrable.length} geçirgen: ${[...new Set(penetrable.map((p) => p[0]))].join(", ")}`
            : `${props.length} prop katı`,
        ),
      );

      // ── 2) A* engelleri gövde yarıçapı kadar şişirip yaktığı için yollar
      //       engelin İÇİNDEN değil ÇEVRESİNDEN dolaşır. Prop merkezine tıklansa
      //       bile varış noktası yürünebilir bir komşu hücreye çözülür ve orası
      //       KARARLI olmalı (prop dışına itme + caddeye kırpma kare kare
      //       titretmemeli).
      //
      //       World.tsx'teki sıra birebir: pushOutOfObstacles → yürünebilir
      //       değilse nearestWalkable(son geçerli konum).
      const settle = (x: number, y: number, from: { x: number; y: number }) => {
        const e = pushOutOfObstacles(x, y, PLAYER_RADIUS);
        if (inWalkable(e.x, e.y)) return e;
        return nearestWalkable(e.x, e.y, from);
      };
      const spawn = { x: 1200, y: 460 };
      let unreachable = 0;
      let unstable = 0;
      let dragged = 0;
      for (const [, px0, pz0] of props) {
        const path = findPath(spawn.x, spawn.y, svgX(px0), svgY(pz0));
        if (path.length <= 1) {
          unreachable++;
          continue;
        }
        // Izgara hücre merkezi bant kenarını birkaç px aşabilir → caddeye çek.
        let stand = path[path.length - 1];
        if (!inWalkable(stand.x, stand.y)) {
          stand = nearestWalkable(stand.x, stand.y, { x: spawn.x, y: spawn.y });
        }
        if (!inWalkable(stand.x, stand.y)) {
          unstable++;
          continue;
        }
        // Prop merkezinden oraya itilse bile konum caddeye döner...
        let cur = settle(svgX(px0), svgY(pz0), stand);
        if (!inWalkable(cur.x, cur.y)) {
          unstable++;
          continue;
        }
        // ...ve orada YAKINSAYARAK durur: her karedeki itme küçülür, sonsuz
        // titreşim (iki nokta arasında gidip gelme) oluşmaz.
        let lastStep = 0;
        for (let i = 0; i < 40; i++) {
          const next = settle(cur.x, cur.y, cur);
          if (!inWalkable(next.x, next.y)) {
            unstable++;
            break;
          }
          lastStep = Math.hypot(next.x - cur.x, next.y - cur.y);
          cur = next;
          if (lastStep < 0.05) break;
        }
        if (lastStep >= 0.5) dragged++;
      }
      checks.push(
        check(
          "tüm proplara yol var (engel etrafından dolaşarak)",
          unreachable === 0,
          unreachable ? `${unreachable} hedefe yol yok` : `${props.length} hedef erişilebilir`,
        ),
        check(
          "prop dışına itme sonrası konum daima caddede kalır",
          unstable === 0,
          unstable ? `${unstable} prop'ta geçersiz konum` : `${props.length} prop test edildi`,
        ),
        check(
          "itme sonrası konum kararlı (kare kare titreme yok)",
          dragged === 0,
          dragged ? `${dragged} prop'ta sürüklenme` : "tüm proplar sabit",
        ),
      );
      checks.push(
        check(
          "A* ızgarası engelleri PLAYER_RADIUS kadar şişiriyor",
          /const pad = PLAYER_RADIUS/.test(pathing),
        ),
      );

      // ── 4) World.tsx: her karede ayrıştırma + prop dışına itme, çarpma sesi ──
      checks.push(
        check(
          "World: konum her karede prop dışına itiliyor (duran oyuncu dahil)",
          /pushOutOfObstacles\(px, py, PLAYER_RADIUS\)/.test(world) &&
            /!inBattle &&[\s\S]{0,200}seatBenchRef\.current === null/.test(world),
        ),
        check(
          "World: karakter-karakter ayrıştırma mesafesi tek kaynaktan",
          /const CHAR_MIN_DIST = PLAYER_RADIUS \* 2\.2/.test(world) &&
            (world.match(/CHAR_MIN_DIST/g) ?? []).length >= 3,
        ),
        check(
          "World: engel yüzünden ilerleme engellenince çarpma işaretlenir",
          /advanced < intended \* 0\.35\) bumped = true/.test(world),
        ),
        check(
          "World: 'donk' sesi KENAR tetiklemeli (duvara yaslıyken tekrarlamaz)",
          /if \(!blockedRef\.current && bumpNow - bumpAtRef\.current > 200\)/.test(
            world,
          ) && /playSound\("bump"\)/.test(world),
        ),
        check(
          "World: botlar da birbirinden ayrışır (deterministik taban konumlardan)",
          /botBaseRef/.test(world) &&
            /bot \u2194 bot ayr\u0131\u015Ft\u0131rma/i.test(world),
        ),
        check(
          "World: bank katı olduğu için kısa çözülen durağa varışta da oturur",
          /const targetDone =/.test(world) &&
            /targetDone &&[\s\S]{0,240}BENCH_RADIUS_PX/.test(world),
        ),
        check(
          "World: bot yolları GÖVDE YARIÇAPIYLA doğrulanıyor (L-bacak + kapanış)",
          /const BOT_RADIUS = PLAYER_RADIUS/.test(world) &&
            /function botLegClear/.test(world) &&
            /botLegClear\(draft\[draft\.length - 1\], start\)/.test(world) &&
            /segmentClear\(a\.x, a\.y, b\.x, b\.y, BOT_RADIUS\)/.test(world),
        ),
      );

      // ── 5) 'donk' sesi tanımlı, çalınabilir ve throttle'ı kenar
      //       tetiklemesinden KISA (yoksa gerçek ikinci çarpma yutulur).
      const sounds2 = await import("../src/lib/sounds");
      const bumpSpec = sounds.match(
        /bump:\s*\{([\s\S]*?)\n  \},\n/,
      )?.[1];
      const throttle = bumpSpec
        ? Number(/throttleMs:\s*(\d+)/.exec(bumpSpec)?.[1] ?? NaN)
        : NaN;
      let plays = true;
      try {
        sounds2.playSound("bump");
      } catch {
        plays = false;
      }
      checks.push(
        check(
          "'donk' sesi tanımlı: thud kaydı + thump/crack katmanı",
          /variants:\s*\[\{ key: "thud"/.test(bumpSpec ?? "") &&
            /layers:\s*\["thump", "crack"\]/.test(bumpSpec ?? "") &&
            plays,
          bumpSpec ? "SPECS.bump var" : "SPECS.bump yok",
        ),
        check(
          "'bump' throttle'ı kenar tetiklemesinden kısa (< 200ms)",
          Number.isFinite(throttle) && throttle < 200,
          Number.isFinite(throttle) ? `throttle ${throttle}ms` : "throttleMs bulunamadı",
        ),
      );

      // ── 6) World modülü GERÇEKTEN yüklenebiliyor mu?
      //       Modül yüklenirken bir kez kurulan değerler (`BOT_PATHS`, bot
      //       yolları ve `BOT_RADIUS` gibi) yalnızca ÇALIŞMA ZAMANINDA patlar:
      //       yanlışlıkla aşağıda tanımlanan bir `const`a dokunulursa
      //       "Cannot access 'X' before initialization" verir. `tsc` bunu
      //       GÖREMEZ (sözdizimsel olarak geçerlidir) — bu yüzden modülü
      //       burada gerçekten import edip başlatma yolunu çalıştırıyoruz.
      let worldLoaded = false;
      let worldErr = "";
      try {
        await mockAppLayer();
        const mod = (await import("../src/pages/World")) as { default?: unknown };
        worldLoaded = typeof mod.default === "function";
        if (!worldLoaded) worldErr = "default export bir bileşen değil";
      } catch (e) {
        worldErr = e instanceof Error ? e.message : String(e);
      }
      checks.push(
        check(
          "World modülü hatasız yükleniyor (modül başlatma / TDZ hatası yok)",
          worldLoaded,
          worldErr,
        ),
      );

      return checks;
    },
  },
  {
    id: "cadi-dukkani",
    title:
      "CADI DÜKKÂNI · satır boş, tek model dikili; kapı yolu avluya kadar yürünebilir, evin içi KATI, kapıda \"Evine gir\"",
    handles:
      "src/engine/constants.ts + src/lib/shop.ts + src/engine/buildingModelPrep.ts + src/engine/GlbBuilding.tsx + src/engine/houseDoor.ts + src/convex/houses.ts + src/pages/World.tsx",
    run: async () => {
      const { readFileSync } = await import("node:fs");
      const read = (path: string) =>
        readFileSync(new URL(path, import.meta.url), "utf8");
      const THREE = await import("three");
      const K = await import("../src/engine/constants");
      const { inWalkable, nearestWalkable, svgX, svgY, WITCH_SHOP_WALK_ZONES } =
        await import("../src/lib/shop");
      const { findPath } = await import("../src/lib/pathfinding");
      const { measureBuildingModel, planBuildingPlacement } = await import(
        "../src/engine/buildingModelPrep"
      );
      const checks: Check[] = [];

      const W = K.WITCH_SHOP_WALKWAY;
      const def = K.WITCH_SHOP_DEF;

      // ── 1) Satır artık BOŞ GÖZLERDEN oluşur: yalnızca `modelUrl` atanmış
      //       gözler dikilir. Bu turda tek model var (cadı dükkânı).
      const engine = read("../src/engine/GameEngine3D.tsx");
      const withModel = K.BUILDINGS.filter((b) => b.modelUrl);
      checks.push(
        check(
          "BUILDINGS listesi bozulmadı (12 dükkan + 8 arka bina = 20 göz)",
          K.BUILDINGS.length === 20,
          `${K.BUILDINGS.length} göz`,
        ),
      );
      checks.push(
        check(
          "satırdaki TEK model cadı dükkânı; diğer 19 göz boş",
          withModel.length === 1 && withModel[0] === K.WITCH_SHOP_DEF,
          `${withModel.length} dolu göz (${withModel.map((b) => b.signText).join(", ") || "-"})`,
        ),
      );
      checks.push(
        check(
          "boş gözler HİÇBİR ŞEY çizmiyor (yerleri boş kalıyor)",
          engine.includes("<GlbBuilding") &&
            /def\.modelUrl \? \([\s\S]*?\) : null,/.test(engine),
        ),
      );
      checks.push(
        check(
          "tek bina bileşeni modeli ölçüp dikiyor (ortak GlbBuilding)",
          read("../src/engine/GlbBuilding.tsx").includes(
            "planBuildingPlacement",
          ) &&
            read("../src/engine/buildingModelPrep.ts").includes(
              "export function measureBuildingModel",
            ),
        ),
      );
      checks.push(
        check(
          "seçilen bina kaldırım mobilyalarının bıraktığı boşlukta",
          def.x === W.x && W.pathHalfW > 0,
          `X ${def.x}`,
        ),
      );
      checks.push(
        check(
          "görünen yol (WitchShopWalkway) sahnede çiziliyor",
          engine.includes("<WitchShopWalkway />") &&
            read("../src/engine/WitchShop.tsx").includes(
              "export function WitchShopWalkway",
            ),
        ),
      );
      // Görünen yol ile yürünebilir şerit AYNI sınırları kullanmalı: oyuncunun
      // yürüdüğü yerle gördüğü yol ayrılırsa "havada yürüme" hissi doğar.
      const walkZone = WITCH_SHOP_WALK_ZONES[0];
      checks.push(
        check(
          "görünen yol ↔ yürünebilir şerit sınırları birebir",
          Math.abs(walkZone.x - svgX(W.x - W.pathHalfW)) < 1e-6 &&
            Math.abs(walkZone.y - svgY(W.pathSouthZ)) < 1e-6 &&
            Math.abs(walkZone.w - W.pathHalfW * 2 * K.S) < 1e-6 &&
            Math.abs(walkZone.h - (W.pathSouthZ - W.pathNorthZ) * K.S) < 1e-6,
        ),
      );
      // Yol KUZEY KALDIRIMINA kadar gelir ve orada biter (ana caddeye inmez),
      // ama kaldırımın İÇİNDE bitmeli ki caddeye kaldırım üzerinden kesintisiz
      // bağlansın.
      checks.push(
        check(
          "yol KUZEY KALDIRIMINDA bitiyor (ana caddeye inmiyor)",
          W.pathSouthZ <= K.ZONE.northSidewalkBot &&
            W.pathSouthZ >= K.ZONE.northSidewalkTop &&
            // Caddenin kuzey kenarından (roadTop = −5.2) DAHA KUZEYDE kalmalı.
            W.pathSouthZ < K.ZONE.roadTop,
          `bitiş Z ${W.pathSouthZ} (kaldırım ${K.ZONE.northSidewalkTop}..${K.ZONE.northSidewalkBot})`,
        ),
      );

      // ── 2) Kuzey sınır çiti yolun geçtiği yerde bölündü (görünen çit yolun
      //       ortasından geçmesin). Ölçüt: Z = northGrassBot hattının parça
      //       sayısı ve yolun X'inde çit OLMAMASI.
      const northLine = K.FENCE_LINES.filter(
        (l) => Math.abs(l.z - K.ZONE.northGrassBot) < 1e-9 && l.enabled,
      );
      const covered = (x: number) =>
        northLine.some((l) => x >= l.startX - 1e-6 && x <= l.endX + 1e-6);
      checks.push(
        check(
          "kuzey sınır çiti yolun X'inde BOŞLUK bırakıyor (yolun üstünden geçmiyor)",
          !covered(W.x) &&
            !covered(W.x - W.pathHalfW) &&
            !covered(W.x + W.pathHalfW) &&
            northLine.length === 5,
          `hat Z ${K.ZONE.northGrassBot}, parça ${northLine.length}`,
        ),
      );

      // ── 3) Yürünebilirlik: yolun HER AŞAMASI yürünebilir olmalı — kuzey
      //       kaldırımı (propların arasından), çim ve kapı önü avlusu.
      //       AVLUNUN ÖTESİ (binanın gövdesi) yürünemez.
      const at = (z: number) => ({ x: svgX(W.x), y: svgY(z) });
      // Yolun güney ucu kaldırımda biter; hemen güneyi (kaldırımın cadde
      // kenarına doğru) de yürünebilir olmalı — yani yol kaldırımdan kopuk
      // bir çıkıntı değil, kaldırıma bitişik.
      const justSouth = at(W.pathSouthZ + 0.15);
      const onNorthWalk = at((K.ZONE.northSidewalkTop + K.ZONE.northSidewalkBot) / 2);
      const onGrass = at(W.pathNorthZ + 0.5);
      const onCourt = at((W.pathNorthZ + W.frontZ) / 2);
      const door = { x: svgX(W.x), y: svgY(W.frontZ) };
      // 🏠 Evin İÇİ artık YÜRÜNEMEZ: cephe hattının (`frontZ`) KUZEYİ binanın
      // gövdesidir ve hiçbir yürünebilir bölgeye girmez — oyuncu eve yürüyerek
      // girip saydam evin içinde durmaz (ekran görüntüsündeki durum).
      const inside = { x: svgX(W.x), y: svgY(W.frontZ - 0.6) };
      const wallSide = {
        x: svgX(W.x + W.foreHalfW + 0.6),
        y: svgY(W.frontZ - 0.6),
      };
      checks.push(
        check(
          "yolun güneyi kaldırım (caddeden kopuk değil)",
          inWalkable(justSouth.x, justSouth.y),
        ),
        check(
          "yol kuzey kaldırımını propların ARASINDAN geçebiliyor",
          inWalkable(onNorthWalk.x, onNorthWalk.y),
        ),
        check("yol çimde yürünebilir", inWalkable(onGrass.x, onGrass.y)),
        check("kapı önü avlu yürünebilir", inWalkable(onCourt.x, onCourt.y)),
        check("kapı (cephe hattı) yürünebilir", inWalkable(door.x, door.y)),
        check(
          "binanın İÇİ YÜRÜNEMEZ — eve yürüyerek girilmez (düğmeyle girilir)",
          !inWalkable(inside.x, inside.y),
        ),
        check(
          "binanın yanı (duvar hattı) yürünemez — duvarlar geçirgen değil",
          !inWalkable(wallSide.x, wallSide.y),
        ),
      );
      // Yolun iki yanındaki proplar yerinde duruyor olmalı: yol onları
      // "yutmuş" olamaz (lamba −14 ve yön tabelası −12 hâlâ katı cisim).
      const lamp = K.LAMPS.find((l) => Math.abs(l.x + 14) < 1e-9);
      const sign = K.DIRECTION_SIGNS.find((d) => Math.abs(d.x + 12) < 1e-9);
      checks.push(
        check(
          "yolun iki yanındaki proplar hâlâ katı (lamba −14 · tabela −12)",
          !!lamp &&
            !!sign &&
            !inWalkable(svgX(lamp.x), svgY(lamp.z)) &&
            !inWalkable(svgX(sign.x), svgY(sign.z)),
        ),
      );
      checks.push(
        check(
          "yol şeridi yalnızca cadı dükkânı için tanımlı (2 dikdörtgen)",
          WITCH_SHOP_WALK_ZONES.length === 2,
          `${WITCH_SHOP_WALK_ZONES.length} bölge`,
        ),
      );

      // ── 4) A*: caddeden (doğuş noktası) dükkânın İÇİNE yol var ve bu yol
      //       KALDIRIMI YOL ŞERİDİNDEN geçiyor — etrafından dolaşmıyor.
      //       (Kaldırım mobilyası yolu kapatsaydı A* engeli dolaşırdı ve yol
      //       şeridinin X'inden çıkardı.)
      const spawn = { x: 1200, y: 460 };
      const toDoor = findPath(spawn.x, spawn.y, door.x, door.y);
      const corridorX = {
        west: svgX(W.x - W.foreHalfW),
        east: svgX(W.x + W.foreHalfW),
      };
      // Yolun doğuş noktası caddededir (yol şeridinin DIŞINDA); ölçüt, kaldırıma
      // ve ötesine geçen düğümlerin HEPSİNİN yol şeridinde olması.
      // DİKKAT: px katmanında kuzey = BÜYÜK y (`svgY` ters çevirir).
      const roadNorthEdge = svgY(K.ZONE.roadTop);
      const crossing = toDoor.filter((p) => p.y > roadNorthEdge + 8);
      const strayed = crossing.filter(
        (p) => p.x < corridorX.west - 16 || p.x > corridorX.east + 16,
      );
      checks.push(
        check(
          "A* yolu kaldırımı yol şeridinden geçiyor (engelleri dolaşmıyor)",
          crossing.length > 0 && strayed.length === 0,
          `şerit X ${corridorX.west.toFixed(0)}..${corridorX.east.toFixed(0)} px · ` +
            `kaldırım/çim düğümü ${crossing.length} · dışarı sapan ${strayed.length}`,
        ),
      );
      const arrival = toDoor[toDoor.length - 1];
      checks.push(
        check(
          "caddeden kapıya A* yolu var",
          toDoor.length > 1,
          `${toDoor.length} düğüm`,
        ),
        check(
          "yol KAPIDA BİTİYOR — binanın içine taşmıyor",
          !!arrival &&
            Math.abs(arrival.y - door.y) < 48 &&
            // px katmanında kuzey = BÜYÜK y: cephenin 0.5 birim (25 px)
            // kuzeyine geçen düğüm olmamalı.
            arrival.y <= door.y + 25,
          arrival
            ? `varış ${arrival.x.toFixed(0)},${arrival.y.toFixed(0)} · kapı ${door.x.toFixed(0)},${door.y.toFixed(0)}`
            : "yol yok",
        ),
      );

      // Yolun SON noktası da yürünebilir olmalı (ızgara hücresi bant kenarını
      // birkaç px aşabilir; `World` orada `nearestWalkable`e düşer).
      const last = arrival;
      const settled = inWalkable(last.x, last.y)
        ? last
        : nearestWalkable(last.x, last.y, { x: spawn.x, y: spawn.y });
      checks.push(
        check(
          "yolun varış noktası yürünebilir bölgeye oturuyor (takılma yok)",
          inWalkable(settled.x, settled.y),
        ),
      );

      // ── 5) Ölçüm/yerleştirme matematiği GERÇEK three.js nesneleriyle:
      //       modelin önündeki `Road` ölçüme girmemeli; sonuç binanın
      //       genişliği/cephe hizası ile birebir olmalı.
      const radio = new THREE.Mesh(
        new THREE.BoxGeometry(4, 2, 4),
        new THREE.MeshStandardMaterial(),
      );
      radio.name = "Road_Road_0";
      radio.position.set(0, 1, 40);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(10, 20, 12),
        new THREE.MeshStandardMaterial(),
      );
      body.name = "Wall_Wall_0";
      body.position.set(1, 10, 0);
      const fake = new THREE.Group();
      fake.add(radio, body);

      const box = measureBuildingModel(fake);
      checks.push(
        check(
          "ölçüm `Road` parçasını dışlıyor (bina gövdesi 10 birim geniş)",
          !!box && Math.abs(box.max.x - box.min.x - 10) < 1e-6,
          box ? `${(box.max.x - box.min.x).toFixed(2)} geniş` : "kutu yok",
        ),
      );
      const place = box ? planBuildingPlacement(box, def) : null;
      checks.push(
        check(
          "model gözün genişliğine ölçekleniyor",
          !!place && Math.abs(place.size.x - def.w) < 1e-6,
          place ? `genişlik ${place.size.x.toFixed(2)} (hedef ${def.w})` : "plan yok",
        ),
        check(
          "bina ALTTAN oturuyor (taban y 0) ve cephe `frontZ`e hizalı",
          !!place &&
            Math.abs(place.offset.y + box!.min.y * place.scale) < 1e-6 &&
            Math.abs(place.offset.z + box!.max.z * place.scale) < 1e-6,
          place ? `ölçek ${place.scale.toFixed(4)}, yükseklik ${place.size.y.toFixed(2)}` : "plan yok",
        ),
      );
      // Modelin EN ALT noktası ölçülen kutunun `min.y`i olmalı — yani bina
      // hiçbir parçası zemine gömülmeden/havada kalmadan tabanından oturur.
      checks.push(
        check(
          "ölçüm modelin en alt noktasını (tabanı) veriyor",
          !!box && Math.abs(box.min.y - (body.position.y - 10)) < 1e-6,
          box ? `taban y ${box.min.y.toFixed(2)}` : "kutu yok",
        ),
      );

      // ── 6) Model dosyası: bu depoda binary GLB bozuluyor (bkz.
      //       public/ASSETS.md) → dosya ASCII gömülü JSON glTF olmalı.
      const raw = readFileSync(
        new URL("../public/models/witch_shop.glb", import.meta.url),
      );
      const head = raw.subarray(0, 4).toString("latin1");
      checks.push(
        check(
          "witch_shop.glb ASCII gömülü JSON glTF (binary glTF değil)",
          head !== "glTF" && head.trimStart().startsWith("{"),
          `${(raw.length / 1048576).toFixed(1)}MiB, ilk 4 bayt "${head.trim()}"`,
        ),
      );

      // ── 6b) MODEL ÖN YÜKLEME + YÜKLEME KAPISI: bina modeli ağır olduğu için
      //        cadde açıldıktan SONRA inmeye başlarsa oyuncu boş arsaya bakar.
      //        İndirme giriş ekranında başlamalı ve kapı onu beklemeli.
      const preload = read("../src/engine/streetPreload.ts");
      const world = read("../src/pages/World.tsx");
      checks.push(
        check(
          "bina modelleri ön yüklemeye dahil (indirme giriş ekranında başlar)",
          preload.includes("STREET_BUILDING_MODELS") &&
            preload.includes("...STREET_BUILDING_MODELS") &&
            read("../src/pages/Entry.tsx").includes("preloadStreetModels()"),
        ),
        check(
          "yükleme kapısı bina modelini bekliyor (cadde boş açılmasın)",
          world.includes("STREET_BUILDING_MODELS") &&
            /gateModelUrls[\s\S]{0,400}STREET_BUILDING_MODELS/.test(world) &&
            world.includes("readyModelUrls={gateModelUrls}"),
        ),
        check(
          "ön yükleme listesi gerçekten cadı dükkânı modelini içeriyor",
          K.BUILDING_MODEL_URLS.includes(K.WITCH_SHOP_MODEL_URL) &&
            K.BUILDING_MODEL_URLS.length === withModel.length,
          K.BUILDING_MODEL_URLS.join(", "),
        ),
      );

      // ── 7) Saydamlaştırma yalnızca bir binayı hedefleyebilir: çekirdek tek
      //       binadan occluder kurabiliyor. HİÇBİR bina `fade` İSTEMEZ artık:
      //       evlere yürünerek girilmediği için görüşü kesen saydamlaşan bina
      //       yoktur (eskiden oyuncu saydam evin içinde duruyordu).
      const glb = read("../src/engine/GlbBuilding.tsx");
      checks.push(
        check(
          "tek bina saydamlaştırması (buildOccluder) — caddenin kalanı etkilenmez",
          glb.includes("buildOccluder") &&
            glb.includes("resetOccluders") &&
            glb.includes("!root || !placement || !fade") &&
            read("../src/engine/buildingOcclusion.ts").includes(
              "export function buildOccluder",
            ),
        ),
        check(
          "hiçbir bina saydamlaşmıyor (ev yürünerek girilen hacim değil)",
          !/fade=\{/.test(engine),
        ),
      );

      // ── 8) 🏠 EV / ODA: kapı düğmesi, menzil deposu ve ONLINE oda kaydı.
      //       Oda KURULMAZ (arsa yok): ilk girişte sunucuda otomatik açılır.
      const {
        HOUSE_ENTER_LABEL,
        setHouseNear,
        getHouseNear,
        requestHouseEnter,
        consumeHouseEnterRequest,
      } = await import("../src/engine/houseDoor");
      checks.push(
        check(
          "kapı düğmesi \"Evine gir\" diyor",
          HOUSE_ENTER_LABEL.label === "Evine gir" &&
            HOUSE_ENTER_LABEL.emoji === "🏠",
        ),
      );

      setHouseNear(true);
      const nearNow = getHouseNear();
      requestHouseEnter();
      const consumed = consumeHouseEnterRequest();
      const empty = consumeHouseEnterRequest();
      setHouseNear(false);
      checks.push(
        check(
          "menzil deposu + TEK seferlik giriş isteği (çift oda açılmaz)",
          nearNow === true &&
            consumed &&
            !empty &&
            getHouseNear() === false,
        ),
      );

      // Menzil, KAPININ ÖNÜNÜ (cadı dükkânının kapı yolu + önündeki kaldırım)
      // kapsar: oyuncu ancak yürünebilir yerden düğmeyi görebilir.
      const onSidewalk = {
        x: svgX(W.x),
        y: svgY((K.ZONE.northSidewalkTop + K.ZONE.northSidewalkBot) / 2),
      };
      const onCourtTrigger = { x: svgX(W.x), y: svgY(W.frontZ + 0.3) };
      const bounds = K.houseTriggerBounds(W.x);
      const triggerCovers = (p: { x: number; y: number }) =>
        p.x >= svgX(bounds.west) &&
        p.x <= svgX(bounds.east) &&
        p.y >= svgY(K.HOUSE_TRIGGER.southZ) &&
        p.y <= svgY(K.HOUSE_TRIGGER.northZ);
      checks.push(
        check(
          "kapı menzili YÜRÜNEBİLİR kaldırımı kapsıyor",
          inWalkable(onSidewalk.x, onSidewalk.y) && triggerCovers(onSidewalk),
        ),
        check(
          "menzil CEPHE HATTINA kadar uzanıyor (avlu/kapı önü dahil)",
          K.HOUSE_TRIGGER.southZ === K.ZONE.northSidewalkBot &&
            K.HOUSE_TRIGGER.northZ >= W.frontZ &&
            triggerCovers(onCourtTrigger),
          `Z ${K.HOUSE_TRIGGER.southZ}…${K.HOUSE_TRIGGER.northZ} (cephe ${W.frontZ})`,
        ),
      );

      // Avlu bölgesi cephe hattında bitiyor → iç koridor kaynaktan kaldırıldı.
      const fore = WITCH_SHOP_WALK_ZONES[1];
      checks.push(
        check(
          "avlu bölgesi cephe hattında bitiyor (iç koridor yok)",
          Math.abs(fore.y + fore.h - svgY(W.frontZ)) < 1e-6 &&
            !("insideZ" in W),
        ),
      );

      // 3D + px katmanı bağlantısı: düğme sahnede, oda sunucudan (online) ve
      // HUD'da "Evim" kısayolu var. Oda sahnesi ayrı bileşende.
      const housesSrc = read("../src/convex/houses.ts");
      const room = read("../src/components/world/HouseRoom.tsx");
      checks.push(
        check(
          "kapı düğmesi 3D sahnede çiziliyor (HouseEnterButton)",
          engine.includes("<HouseEnterButton />") &&
            engine.includes("HOUSE_ENTER_LABEL") &&
            engine.includes("requestHouseEnter"),
        ),
        check(
          "oda sunucuda OTOMATİK açılıyor (arsa/kurulum yok)",
          world.includes("api.houses.enter") &&
            housesSrc.includes("export const enter") &&
            !housesSrc.includes("plotIndex") &&
            !world.includes("api.houses.place"),
        ),
        check(
          "ziyaret + oda adı sunucuda (online)",
          world.includes("api.houses.visit") &&
            world.includes("api.houses.rename") &&
            housesSrc.includes("export const visit") &&
            housesSrc.includes("export const rename") &&
            housesSrc.includes("by_ownerName"),
        ),
        check(
          "her oda DB'de KİMLİKLİ bir örnek (instance / room id)",
          housesSrc.includes("export const ROOM_ID_PREFIX") &&
            housesSrc.includes("export function roomIdFor") &&
            housesSrc.includes("export const byRoom") &&
            housesSrc.includes('withIndex("by_roomId"') &&
            room.includes("view.roomId") &&
            room.includes("shortRoomId"),
        ),
        check(
          "menzil px katmanında kapı menzilinden türetiliyor",
          world.includes("HOUSE_DOOR_PX") &&
            world.includes("consumeHouseEnterRequest") &&
            world.includes("setHouseNear"),
        ),
        check(
          "odaya giriş DOĞRUDAN: \"gir\"e basılınca oda açılır, arada tam ekran yükleme ekranı yok",
          world.includes("enterMyRoom") &&
            !world.includes("roomGate") &&
            !world.includes("HOUSE_GATE_MIN_MS") &&
            !world.includes("HOUSE_STEPS") &&
            !room.includes("HOUSE_STEPS") &&
            world.includes("preloadRoomModel"),
        ),
        check(
          "oda içeriği GLB modeliyle kuruluyor + yedek oda hazır (RoomStage)",
          room.includes("GlbProfileAvatar") &&
            room.includes("<RoomStage") &&
            room.includes("showAvatar={avatar}") &&
            world.includes("<HouseRoom") &&
            world.includes("equipped={equipped}"),
        ),
        check(
          "HUD'da \"Evim\" kısayolu var",
          world.includes('label="Evim"') &&
            world.includes("enterMyRoom"),
        ),
      );

      return checks;
    },
  },
  {
    id: "oda-modeli",
    title:
      "🏠 ODA MODELİ · odanın içi GLB ile kurulur: ölçülür, izole bölgeye kurulur, duvar sınırı + 0,5 m ızgara",
    handles:
      "src/engine/constants.ts (ROOM_ISO/ROOM_MODEL_URL) + src/engine/roomModelPrep.ts + src/engine/roomBuild.ts + src/engine/RoomStage.tsx + src/components/world/HouseRoom.tsx + src/pages/World.tsx",
    run: async () => {
      const { readFileSync } = await import("node:fs");
      const read = (path: string) =>
        readFileSync(new URL(path, import.meta.url), "utf8");
      const THREE = await import("three");
      const K = await import("../src/engine/constants");
      const {
        measureRoomModel,
        findFloorMesh,
        planIsoRoom,
        clampToRoom,
        markPlacementZone,
        analyzeRoomSurfaces,
        roomInteriorBox,
        cutRoomForInterior,
        findRoomDoor,
        roomEntryPoint,
      } = await import("../src/engine/roomModelPrep");
      const {
        FURNITURE,
        placeFurniture,
        snapToGrid,
        furnitureById,
        defaultDecorFor,
      } = await import("../src/engine/roomBuild");

      const checks: Check[] = [];

      // ── 1) ÖLÇÜM: odanın TAMAMI ölçülür — bina modelinin aksine hiçbir
      //       parça elenmez (merdiven/kapı/pencere de mekânın parçasıdır;
      //       elenirse model odanın dışına taşar).
      const group = new THREE.Group();
      const shell = new THREE.Mesh(
        new THREE.BoxGeometry(120, 90, 300),
        new THREE.MeshBasicMaterial(),
      );
      shell.position.set(10, 45, -20);
      const stair = new THREE.Mesh(
        new THREE.BoxGeometry(30, 60, 40),
        new THREE.MeshBasicMaterial(),
      );
      stair.position.set(-40, 30, 80);
      group.add(shell, stair);

      const box = measureRoomModel(group);
      checks.push(
        check(
          "oda modeli ölçülebiliyor (model uzayında kutu)",
          !!box,
          box
            ? box
                .getSize(new THREE.Vector3())
                .toArray()
                .map((n) => n.toFixed(1))
                .join(" × ")
            : "kutu yok",
        ),
      );
      if (!box) return checks;

      checks.push(
        check(
          "boş/yer tutucu sahne çökmüyor (ölçüm null döner)",
          measureRoomModel({} as THREE.Object3D) === null,
        ),
      );

      const rawSize = box.getSize(new THREE.Vector3());
      const plan = planIsoRoom(box);
      const prep = read("../src/engine/roomModelPrep.ts");
      const build = read("../src/engine/roomBuild.ts");
      const stage = read("../src/engine/RoomStage.tsx");
      const house = read("../src/components/world/HouseRoom.tsx");
      const world = read("../src/pages/World.tsx");
      const furniture = read("../src/convex/furniture.ts");
      const stand = read("../src/components/world/FurnitureStandSheet.tsx");

      // ── 2) İZOLE YERLEŞİM: oda ana haritadan uzakta (X/Z 2000) durur. Formül
      //       tekrarı yerine dönüşüm GERÇEKTEN uygulanıp kutunun nereye
      //       düştüğü ölçülür.
      const placedWorld = box
        .clone()
        .applyMatrix4(
          new THREE.Matrix4()
            .makeScale(plan.scale, plan.scale, plan.scale)
            .setPosition(plan.offset.x, plan.offset.y, plan.offset.z),
        )
        .translate(new THREE.Vector3(...plan.origin));
      const worldSize = placedWorld.getSize(new THREE.Vector3());
      const worldCenter = placedWorld.getCenter(new THREE.Vector3());

      checks.push(
        check(
          "oda ana haritadan İZOLE bir bölgeye yerleşiyor (X/Z 2000)",
          plan.origin[0] === K.ROOM_ISO.origin[0] &&
            plan.origin[2] === K.ROOM_ISO.origin[2] &&
            plan.origin[0] > K.WORLD_WIDTH,
          `origin ${plan.origin.join(", ")}`,
        ),
      );
      checks.push(
        check(
          "oda merkezi TAM origin'de (oyuncu/kamera odanın ortasını paylaşır)",
          Math.abs(worldCenter.x - plan.origin[0]) < 1e-6 &&
            Math.abs(worldCenter.z - plan.origin[2]) < 1e-6,
          `merkez ${worldCenter.x.toFixed(4)}, ${worldCenter.z.toFixed(4)}`,
        ),
      );
      checks.push(
        check(
          "oda ALTTAN oturuyor (taban y 0) — zemine gömülmez, havada kalmaz",
          Math.abs(placedWorld.min.y) < 1e-6,
          `taban y ${placedWorld.min.y.toFixed(4)}`,
        ),
      );
      checks.push(
        check(
          "duvar sınırları ÖLÇÜLEN kutudan türüyor (elle yazılmamış)",
          Math.abs(plan.half.x - worldSize.x / 2) < 1e-9 &&
            Math.abs(plan.half.z - worldSize.z / 2) < 1e-9 &&
            Math.abs(plan.bounds.maxX - (plan.origin[0] + plan.half.x)) < 1e-9,
          `yarı açıklık ${plan.half.x.toFixed(2)} × ${plan.half.z.toFixed(2)}`,
        ),
      );

      // ── 3) ÖLÇEK: test kutusu dünya biriminde DEĞİL (125×90×300) → otomatik
      //       ölçek. Normal ölçekli modelde varsayılan (scale 1) korunur.
      checks.push(
        check(
          "ham model dünya biriminde değilse oda otomatik ölçekleniyor",
          plan.autoScaled &&
            Math.abs(Math.max(plan.size.x, plan.size.z) - K.ROOM_ISO.span) < 1e-6,
          `${Math.max(plan.size.x, plan.size.z).toFixed(2)} (ham ${Math.max(rawSize.x, rawSize.z).toFixed(0)})`,
        ),
      );
      const normalPlan = planIsoRoom(
        new THREE.Box3(new THREE.Vector3(-5, 0, -4), new THREE.Vector3(5, 3, 4)),
      );
      checks.push(
        check(
          "normal ölçekli model `scale: 1` ile yerleşiyor (spesifikasyon)",
          normalPlan.autoScaled === false && normalPlan.scale === K.ROOM_ISO.scale,
          `ölçek ${normalPlan.scale}`,
        ),
      );
      checks.push(
        check(
          "ölçek TEK TİP: odanın oranları bozulmuyor",
          Math.abs(worldSize.y / worldSize.x - rawSize.y / rawSize.x) < 1e-9 &&
            Math.abs(worldSize.z / worldSize.x - rawSize.z / rawSize.x) < 1e-9,
        ),
      );

      // ── 4) KAMERA: izometrik, hedefi odanın MERKEZİNDE sabit. Spec yönü
      //       (12, 15, 12); oda büyükse mesafe AÇILIR (yakınlaşmaz).
      const camOffset = new THREE.Vector3(
        plan.camera.position[0] - plan.camera.target[0],
        plan.camera.position[1] - plan.camera.target[1],
        plan.camera.position[2] - plan.camera.target[2],
      );
      const camDir = camOffset.clone().normalize();
      const specDir = new THREE.Vector3(...K.ROOM_ISO.camera.offset).normalize();
      checks.push(
        check(
          "kamera hedefi odanın merkezine sabit (lookAt → origin)",
          plan.camera.target[0] === plan.origin[0] &&
            plan.camera.target[1] === plan.origin[1] &&
            plan.camera.target[2] === plan.origin[2],
          `hedef ${plan.camera.target.join(", ")}`,
        ),
      );
      checks.push(
        check(
          "kamera İZOMETRİK: spec yönü (`ROOM_ISO.camera.offset`) korunuyor",
          Math.abs(camDir.x - specDir.x) < 1e-6 &&
            Math.abs(camDir.y - specDir.y) < 1e-6 &&
            Math.abs(camDir.z - specDir.z) < 1e-6,
        ),
      );
      checks.push(
        check(
          "varsayılan odada kamera `origin + izometrik offset` noktasında",
          Math.abs(
            plan.camera.position[0] -
              (K.ROOM_ISO.origin[0] + K.ROOM_ISO.camera.offset[0]),
          ) < 1e-6 &&
            Math.abs(
              plan.camera.position[1] -
                (K.ROOM_ISO.origin[1] + K.ROOM_ISO.camera.offset[1]),
            ) < 1e-6 &&
            Math.abs(
              plan.camera.position[2] -
                (K.ROOM_ISO.origin[2] + K.ROOM_ISO.camera.offset[2]),
            ) < 1e-6,
          `kamera ${plan.camera.position.map((n) => n.toFixed(1)).join(", ")}`,
        ),
      );
      const bigPlan = planIsoRoom(
        new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 4, 10)),
      );
      checks.push(
        check(
          "büyük odada kamera geri çekiliyor (oda yine de çerçevede)",
          bigPlan.camera.position[1] > plan.camera.position[1],
          `göz y ${bigPlan.camera.position[1].toFixed(1)} > ${plan.camera.position[1].toFixed(1)}`,
        ),
      );

      // ── 5) KARAKTER: odanın KAPISINDAN doğar (odanın ortasından değil) ve
      //       duvar sınırından DIŞARI çıkamaz (dışarıda zemin yoktur).
      const escaped = clampToRoom(
        { x: 9999, z: -9999 },
        normalPlan.half,
        K.ROOM_ISO.characterRadius,
      );
      checks.push(
        check(
          "karakter odanın ortasına değil KAPISINDAN doğuyor (eşikte başlar)",
          stage.includes("findRoomDoor") &&
            stage.includes("roomEntryPoint") &&
            stage.includes("spawn={spawn}") &&
            stage.includes("group.position.set(spawn.x, 0, spawn.z)") &&
            prep.includes("export function findRoomDoor") &&
            prep.includes("export function roomEntryPoint"),
        ),
      );
      // Kapı bulunamayan modelde de oda ORTADAN değil ÖN KENARDAN girilir
      // (kesitin açıldığı taraf) — oyuncu her koşulda eşikte başlar.
      const noDoorEntry = roomEntryPoint(
        null,
        normalPlan,
        K.ROOM_ISO.characterRadius,
      );
      checks.push(
        check(
          "kapı yoksa oda ön kenardan girilir (yine eşik, yine ortada değil)",
          Math.abs(noDoorEntry.x) < 1e-9 &&
            Math.abs(
              noDoorEntry.z - (normalPlan.half.z - K.ROOM_ISO.characterRadius),
            ) < 1e-9,
          `eşik ${noDoorEntry.x.toFixed(2)}, ${noDoorEntry.z.toFixed(2)}`,
        ),
      );
      checks.push(
        check(
          "karakter duvar sınırından DIŞARI çıkamıyor (boşluğa düşmez)",
          Math.abs(escaped.x) <=
            normalPlan.half.x - K.ROOM_ISO.characterRadius + 1e-9 &&
            Math.abs(escaped.z) <=
              normalPlan.half.z - K.ROOM_ISO.characterRadius + 1e-9,
          `kırpılmış ${escaped.x.toFixed(2)}, ${escaped.z.toFixed(2)} (yarı ${normalPlan.half.x.toFixed(2)} × ${normalPlan.half.z.toFixed(2)})`,
        ),
      );
      checks.push(
        check(
          "karakter odanın yüksekliğine sığıyor",
          K.ROOM_ISO.characterHeight < plan.size.y,
          `karakter ${K.ROOM_ISO.characterHeight} < oda ${plan.size.y.toFixed(2)}`,
        ),
      );
      checks.push(
        check(
          "karakter zemine basıyor (portre yarım boy yukarı alınıyor)",
          stage.includes("ROOM_ISO.characterHeight / 2"),
        ),
      );

      // ── 6) ZEMİN (placementZone): ad/sekil sezgisi + yedek düzlem + ızgara.
      const floored = new THREE.Group();
      const floorSlab = new THREE.Mesh(
        new THREE.BoxGeometry(8, 0.2, 8),
        new THREE.MeshBasicMaterial(),
      );
      floorSlab.name = "Floor";
      const wallSlab = new THREE.Mesh(
        new THREE.BoxGeometry(8, 3, 0.2),
        new THREE.MeshBasicMaterial(),
      );
      wallSlab.name = "Wall";
      floored.add(floorSlab, wallSlab);
      const foundFloor = findFloorMesh(floored);
      checks.push(
        check(
          "adında 'Floor' geçen mesh zemin olarak bulunuyor",
          foundFloor === floorSlab,
          foundFloor ? foundFloor.name : "bulunamadı",
        ),
      );
      checks.push(
        check(
          "zemin `placementZone` olarak işaretleniyor (raycaster tespiti)",
          markPlacementZone(foundFloor)?.userData.placementZone === true &&
            prep.includes("export function markPlacementZone"),
        ),
      );
      const anon = new THREE.Group();
      const anonSlab = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.15, 6),
        new THREE.MeshBasicMaterial(),
      );
      anon.add(
        anonSlab,
        new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), new THREE.MeshBasicMaterial()),
      );
      checks.push(
        check(
          "ad yoksa en GENİŞ ve en İNCE parça zemin sayılıyor",
          findFloorMesh(anon) === anonSlab,
        ),
      );
      const solid = new THREE.Group();
      solid.add(
        new THREE.Mesh(new THREE.BoxGeometry(10, 4, 10), new THREE.MeshBasicMaterial()),
      );
      checks.push(
        check(
          "zemin ayırt edilemezse null döner ve ÖLÇÜLEN kutudan yedek zemin kurulur",
          findFloorMesh(solid) === null &&
            stage.includes("findFloorMesh") &&
            stage.includes("fallbackFloor"),
        ),
      );
      checks.push(
        check(
          "zemin dokunuşu TÜM kesişimler taranıp placementZone'dan seçiliyor",
          stage.includes("placementZone === true") &&
            stage.includes("event.intersections.find"),
        ),
      );

      // ── 7) DÜZENLEME (BUILD MODE): 0,5 m ızgara, duvar sınırı dışına taşmaz.
      const sofa = FURNITURE.find((f) => f.id === "sofa") ?? FURNITURE[0];
      const onGrid = (v: number) =>
        Math.abs(v / K.ROOM_ISO.grid - Math.round(v / K.ROOM_ISO.grid)) < 1e-9;
      checks.push(
        check(
          "ızgara adımı 0,5 m × 0,5 m (spesifikasyon)",
          K.ROOM_ISO.grid === 0.5,
          `${K.ROOM_ISO.grid} m`,
        ),
      );
      checks.push(
        check(
          "eşya en yakın ızgara çizgisine yuvarlanıyor",
          Math.abs(snapToGrid(1.24) - 1.0) < 1e-9 &&
            Math.abs(snapToGrid(1.26) - 1.5) < 1e-9,
          `1.24→${snapToGrid(1.24)} · 1.26→${snapToGrid(1.26)}`,
        ),
      );
      const centered = placeFurniture({ x: 1.24, z: -2.7 }, sofa, normalPlan.half);
      checks.push(
        check(
          "dizilen eşya oda içinde ve ızgaraya oturuyor",
          onGrid(centered.x) && onGrid(centered.z),
          `${centered.x}, ${centered.z}`,
        ),
      );
      const overflow = placeFurniture({ x: 9999, z: -9999 }, sofa, normalPlan.half);
      const limitX = normalPlan.half.x - sofa.w / 2 - K.ROOM_ISO.wallMargin;
      const limitZ = normalPlan.half.z - sofa.d / 2 - K.ROOM_ISO.wallMargin;
      checks.push(
        check(
          "eşya DUVAR SINIRI dışına çıkamıyor (ızgara sınırı ezemez)",
          overflow.x <= limitX + 1e-9 && overflow.z >= -limitZ - 1e-9,
          `x ${overflow.x} ≤ ${limitX.toFixed(2)} · z ${overflow.z} ≥ ${(-limitZ).toFixed(2)}`,
        ),
      );
      checks.push(
        check(
          "eşya kataloğu ve yerleştirme matematiği ayrı modülde (roomBuild.ts)",
          build.includes("export const FURNITURE") &&
            build.includes("export function placeFurniture") &&
            build.includes("export function snapToGrid"),
        ),
      );

      // ── 6) KAYNAK: sabit → sahne → ekran zinciri gerçekten bağlı mı?
      checks.push(
        check(
          "oda modeli tek yerden yönetiliyor (ROOM_MODEL_URL → /models/)",
          K.ROOM_MODEL_URL === "/models/empty_office_space.glb",
          K.ROOM_MODEL_URL,
        ),
        check(
          "oda sahnesi modeli ÖLÇÜP kuruyor (sabit ölçek/konum yok)",
          stage.includes("measureRoomModel") &&
            stage.includes("planIsoRoom") &&
            prep.includes("export function measureRoomModel") &&
            prep.includes("export function planIsoRoom"),
        ),
        check(
          "oda ana haritadan İZOLE bölgeye kuruluyor (tek origin grubu)",
          stage.includes("position={plan.origin}") &&
            stage.includes("ROOM_ISO.origin"),
        ),
        check(
          "kamera izometrik kuruluyor, oda merkezine kilitli ve HER ekran oranında çerçeveliyor",
          stage.includes("const shot = plan.camera") &&
            // Hedef, odanın merkezidir; alt pay bırakılınca aynı kadar KAYAR
            // (`target`), yön yine de bozulmaz.
            stage.includes("const target = center.clone().add(shift)") &&
            stage.includes("camera.lookAt(target)") &&
            stage.includes("ROOM_ISO.camera.offset") &&
            stage.includes("shot.fov") &&
            stage.includes("hFov"),
        ),
        check(
          "ışık SICAK ve parlak (sıcak AmbientLight + DirectionalLight)",
          stage.includes("<ambientLight intensity={1.35}") &&
            /color="#ffe3ad"/.test(stage),
        ),
        check(
          "duvarlar SICAK kaplamaya çekiliyor (gri/beton → sıcak ev)",
          stage.includes("WALL_WARM") &&
            stage.includes("warmedMaterials") &&
            /color\.lerp\(WALL_WARM/.test(stage),
        ),
        check(
          "duvarlar ALÇAK (tavan tavan değil) + turuncu çerçeve",
          stage.includes("WALL_HEIGHT_FACTOR") &&
            stage.includes("ROOM_ISO.characterHeight * WALL_HEIGHT_FACTOR") &&
            stage.includes("RoomFrame") &&
            /#f2a93b/.test(stage) &&
            house.includes("border-[#f2a93b]"),
        ),
        check(
          "duvar çarpışması ölçülen sınırlardan geliyor (clampToRoom + WallColliders)",
          stage.includes("clampToRoom") &&
            stage.includes("WallColliders") &&
            prep.includes("export function clampToRoom"),
        ),
        check(
          "odadaki karakter sokaktakiyle AYNI avatar + YÜRÜYOR (idle↔walk, kaymıyor)",
          stage.includes("GlbCharacterPortrait") &&
            stage.includes("equipped={equipped}") &&
            stage.includes("spin={false}") &&
            stage.includes("movingRef={moving}") &&
            read("../src/engine/GlbAvatar3D.tsx").includes("movingRef"),
        ),
        check(
          "DÜZENLEME MODU: 0,5 m ızgara görünür + eşya ızgaraya oturuyor",
          stage.includes("isBuildMode") &&
            stage.includes("gridHelper") &&
            stage.includes("placeFurniture"),
        ),
        check(
          "EKONOMİ: eşya stanttan SP ile alınır (fiyat SUNUCUDA doğrulanır)",
          furniture.includes("export const buy = mutation") &&
            furniture.includes('import { FURNITURE } from "../engine/roomBuild"') &&
            furniture.includes("if (coins < def.price)") &&
            // Fiyat istemciden GELMEZ: yalnızca itemId taşınır.
            !furniture.includes("args: { itemId: v.string(), price") &&
            stand.includes("api.furniture.buy") &&
            stand.includes("item.price"),
        ),
        check(
          "YERLEŞİM KALICI: oda kapanıp açılsa da düzen aynı kalır (sunucu)",
          furniture.includes("export const place = mutation") &&
            furniture.includes("export const lift = mutation") &&
            furniture.includes('query("furniture")') &&
            stage.includes("placedFurniture(owned") &&
            stage.includes("onPlaceItem") &&
            stage.includes("onLiftItem") &&
            house.includes("owned={furniture}") &&
            world.includes("api.furniture.myFurniture") &&
            world.includes("api.furniture.place"),
        ),
        check(
          "DOLAP ↔ ODA: dizilmeyen eşya dolapta bekler (oransal konum, ızgara+sınır korunur)",
          build.includes("export function countFree") &&
            build.includes("export function firstFree") &&
            build.includes("export function furnitureRatios") &&
            build.includes("export function placedFurniture") &&
            furniture.includes("fx: undefined,") &&
            furniture.includes("fz: undefined,") &&
            // Sunucu METRE kabul etmez: konum -1…1 ORANINA kırpılır.
            furniture.includes("function clampRatio") &&
            furniture.includes("Math.min(1, Math.max(-1, value))"),
        ),
        check(
          "eşya dizme yalnızca odanın SAHİBİNE açık (misafir dekoru değiştirmez)",
          house.includes("canBuild={view.isMine}") &&
            furniture.includes("row.userId !== userId") &&
            world.includes("api.furniture.byOwnerName") &&
            world.includes("neighborFurniture"),
        ),
        check(
          "düzenleyici YALNIZCA sahip olduğun eşyayı dizer (kilitli eşya → stant)",
          stage.includes("const locked = total === 0") &&
            stage.includes("firstFree(owned, buildItem)") &&
            stage.includes("onOpenStand()") &&
            stage.includes("countFree(owned, item.id)") &&
            house.includes("onOpenStand={onOpenStand}"),
        ),
        check(
          "stant hem caddeden hem evin içinden açılabiliyor (SP ile alım)",
          world.includes("setStandOpen(true)") &&
            world.includes("<FurnitureStandSheet") &&
            world.includes("onOpenFurniture") &&
            stand.includes("Mobilya Stantı") &&
            stand.includes("furnitureOf(category)"),
        ),
        check(
          "izometrik bakışı kapatan tavan/çatı parçaları gizleniyor (dar desen)",
          stage.includes("const CEILING_PARTS") &&
            /ceiling\|roof\|tavan/.test(stage),
        ),
        check(
          'oda üstünde "Oda yerleştiriliyor…" şeridi YOK (banner silindi)',
          !stage.includes("Oda yerleştiriliyor") &&
            !house.includes("Oda yerleştiriliyor") &&
            !world.includes("Oda yerleştiriliyor"),
        ),
        check(
          "💬 SOHBET BALONCUĞU evin içinde de caddeden AYNEN geçer (kısıt yok)",
          world.includes("speech={bubble}") &&
            world.includes("speechColorId={bubbleColorId}") &&
            house.includes("speech={speech}") &&
            house.includes("ChatBubbleBody") &&
            house.includes("colorId={speechColorId}") &&
            stage.includes("<ChatBubble") &&
            stage.includes("text={speech}") &&
            stage.includes("speechColorId={speechColorId}") &&
            !house.includes("chatDisabled") &&
            !house.includes("hideHud"),
        ),
      );

      // ── İÇ MEKÂN KESİTİ (Sanalika/Habbo): model KAPALI bir kutudur;
        //    dışarıdan bakınca oyuncu odanın içini değil kutunun dışını görür.
        //    Kesit tavanı + kameraya bakan duvarları gizler, duvarlar oda
        //    yüksekliğine kırpılır. Model adları jenerik olsa da GEOMETRİDEN.
        (() => {
          const mk = (
            w: number,
            h: number,
            d: number,
            x: number,
            y: number,
            z: number,
          ) => {
            const m = new THREE.Mesh(
              new THREE.BoxGeometry(w, h, d),
              new THREE.MeshBasicMaterial(),
            );
            m.position.set(x, y, z);
            return m;
          };
          const roomBox = new THREE.Group();
          const floor = mk(8, 0.1, 8, 0, 0, 0);
          const ceil = mk(8, 0.1, 8, 0, 3.2, 0);
          const nearZ = mk(8, 8, 0.1, 0, 0, 4); // +Z duvarı (kameraya BAKAN)
          const farZ = mk(8, 8, 0.1, 0, 0, -4);
          const nearX = mk(0.1, 8, 8, 4, 0, 0); // +X duvarı (kameraya BAKAN)
          const farX = mk(0.1, 8, 8, -4, 0, 0);
          roomBox.add(floor, ceil, nearZ, farZ, nearX, farX);

          const surfaces = analyzeRoomSurfaces(roomBox);
          checks.push(
            check(
              "kapalı kutu modelde zemin ve tavan GEOMETRİDEN bulunuyor (isim yok)",
              !!surfaces &&
                surfaces.floor === floor &&
                surfaces.ceiling === ceil &&
                surfaces.walls.length === 4,
              surfaces
                ? `zemin ${surfaces.floor === floor} · tavan ${surfaces.ceiling === ceil} · duvar ${surfaces.walls.length}`
                : "yüzey yok",
            ),
          );
          const interior = surfaces ? roomInteriorBox(surfaces) : null;
          const interiorPlan = interior ? planIsoRoom(interior) : null;
          checks.push(
            check(
              "oda İÇ hacminden planlanıyor: yükseklik ≈ tavan (bina gövdesi değil)",
              !!interiorPlan && Math.abs(interiorPlan.size.y - 3.1) < 0.25,
              interiorPlan
                ? `yükseklik ${interiorPlan.size.y.toFixed(2)} (kutu 8)`
                : "plan yok",
            ),
          );
          cutRoomForInterior(roomBox, { x: 1, z: 1 });
          checks.push(
            check(
              "kesit: tavan + kameraya BAKAN iki duvar gizlenir, UZAK duvarlar kalır",
              !ceil.visible &&
                !nearZ.visible &&
                !nearX.visible &&
                farZ.visible &&
                farX.visible &&
                floor.visible,
              `tavan ${ceil.visible} · yakın ${nearZ.visible}/${nearX.visible} · uzak ${farZ.visible}/${farX.visible}`,
            ),
          );
          // İkinci kesit: önceki gizlemeler SIFIRLANIP yeniden uygulanmalı
          // (model `useGLTF` ile önbellekte paylaşılır).
          farZ.visible = false;
          ceil.visible = false;
          cutRoomForInterior(roomBox, { x: 1, z: 1 });
          checks.push(
            check(
              "kesit idempotent: her kurulumda gizlemeler baştan uygulanıyor",
              farZ.visible && !nearZ.visible && !ceil.visible,
              `uzak ${farZ.visible} · yakın ${nearZ.visible} · tavan ${ceil.visible}`,
            ),
          );
          checks.push(
            check(
              "RoomStage kesiti + dikey kırpmayı gerçekten uyguluyor (içeri bakış)",
              stage.includes("cutRoomForInterior") &&
                stage.includes("roomInteriorBox") &&
                stage.includes("gl.clippingPlanes"),
            ),
          );
        })();

      // ── KAPI (eşik): karakter odanın kapısından doğar. Kapı modelin JENERİK
        //    adlarından değil GEOMETRİDEN bulunur (kanat: dar + zeminden başlar);
        //    kesitte GİZLENEN (kameraya bakan) duvarın kapısı seçilmez.
        (() => {
          const mk = (
            w: number,
            h: number,
            d: number,
            x: number,
            y: number,
            z: number,
          ) => {
            const m = new THREE.Mesh(
              new THREE.BoxGeometry(w, h, d),
              new THREE.MeshBasicMaterial(),
            );
            m.position.set(x, y, z);
            return m;
          };
          const g = new THREE.Group();
          const floor = mk(8, 0.1, 8, 0, 0, 0);
          const ceil = mk(8, 0.1, 8, 0, 3.2, 0);
          const nearZ = mk(8, 3, 0.1, 0, 1.5, 4); // kameraya BAKAN duvar
          const farZ = mk(8, 3, 0.1, 0, 1.5, -4);
          const nearX = mk(0.1, 3, 8, 4, 1.5, 0);
          const farX = mk(0.1, 3, 8, -4, 1.5, 0);
          const nearDoor = mk(1.9, 2, 0.2, 0, 1, 4); // kesitte GİZLENECEK kapı
          const farDoor = mk(1.9, 2, 0.2, 0, 1, -4); // görünen kapı
          const skirting = mk(0.2, 0.2, 8, 3.9, 0.1, 0); // süpürgelik
          g.add(floor, ceil, nearZ, farZ, nearX, farX, nearDoor, farDoor, skirting);

          const door = findRoomDoor(analyzeRoomSurfaces(g), { x: 1, z: 1 });
          checks.push(
            check(
              "oda kapısı GEOMETRİDEN bulunuyor (duvar/süpürgelik değil, eşik paneli)",
              door !== null &&
                Math.abs(door.x - farDoor.position.x) < 1e-9 &&
                Math.abs(door.z - farDoor.position.z) < 1e-9,
              door
                ? `${door.x.toFixed(2)}, ${door.z.toFixed(2)}`
                : "kapı bulunamadı",
            ),
          );
          const surfaces = analyzeRoomSurfaces(g);
          const interior = surfaces ? roomInteriorBox(surfaces) : null;
          const doorPlan = interior
            ? planIsoRoom(interior, {
                origin: K.ROOM_ISO.origin,
                scale: K.ROOM_ISO.scale,
                span: K.ROOM_ISO.span,
                fitBand: K.ROOM_ISO.fitBand,
                camera: K.ROOM_ISO.camera,
              })
            : null;
          const entry =
            doorPlan && door
              ? roomEntryPoint(door, doorPlan, K.ROOM_ISO.characterRadius)
              : null;
          checks.push(
            check(
              "doğuş noktası kapının ÖNÜ, duvardan içeride ve oda sınırı içinde",
              !!entry &&
                !!doorPlan &&
                Math.abs(entry.x) < 1e-9 &&
                Math.abs(entry.z + doorPlan.half.z) <
                  K.ROOM_ISO.characterRadius + 1e-9 &&
                Math.abs(entry.z) < doorPlan.half.z,
              entry
                ? `eşik ${entry.x.toFixed(2)}, ${entry.z.toFixed(2)} (yarı ${doorPlan?.half.z.toFixed(2)})`
                : "doğuş noktası yok",
            ),
          );
        })();

      // ── ODA ORTAMI: oda ekranı ANA CADDE gibi DOLSUN.
      //    Sorun: oda tek bir kesit kutusuydu ve çevresi (ekranın yarısına
      //    yakını) düz koyu kahve bir BOŞLUKTU — oda "küçük ve değersiz"
      //    okunuyordu. Cadde sahnesinin deseni odaya da uygulanır: gökyüzü
      //    rengi + ufku yutan SİS + odanın çevresini döşeyen ZEMİN + odaya
      //    biraz daha yaklaşan kamera.
      checks.push(
        check(
          "oda ekranı da CADDE gibi dolu: gökyüzü + sis + çevre zemin",
          /<color attach="background"/.test(stage) &&
            /<fog[\s\S]{0,40}attach="fog"/.test(stage) &&
            stage.includes("RoomGround") &&
            stage.includes("roomGround"),
        ),
        check(
          "sis rengi arka planla AYNI (ufukta renk bandı oluşmaz — cadde kuralı)",
          stage.includes('sky: "#4a3423"') &&
            /args=\{\[ROOM_ENV\.sky, ROOM_ENV\.fogNear, ROOM_ENV\.fogFar\]\}/.test(
              stage,
            ),
        ),
        (() => {
          const ground = stage.slice(
            stage.indexOf("function RoomGround"),
            stage.indexOf("function RoomInterior"),
          );
          return check(
            "çevre zemin odanın ayak izini ORTADA bırakır (parke kaplanmaz)",
            ground.includes("half.x - tuck") &&
              ground.includes("half.z - tuck") &&
              ground.includes("ROOM_ENV.groundSpan") &&
              ground.includes("ROOM_ENV.groundDrop") &&
              (ground.match(/<mesh\b/g) ?? []).length === 1 &&
              ground.includes("patches.map"),
            `${(ground.match(/<mesh\b/g) ?? []).length} parça (dört kenar) + ${ground.includes("planeGeometry")}`,
          );
        })(),
        check(
          "kamera odaya ODAKLANIR: dikey dolgunluk hedefi + yatay taşma sınırı",
          /const ROOM_FRAMING = \{/.test(stage) &&
            stage.includes("targetHeightFill") &&
            stage.includes("maxWidthFill") &&
            stage.includes("fitH / ROOM_FRAMING.targetHeightFill") &&
            stage.includes("fitW / ROOM_FRAMING.maxWidthFill") &&
            stage.includes("Math.min(distance, fit)"),
        ),
        check(
          "odayı SIĞDIRMAKLA kalmıyor: dolgunluk hedefi sığdırmadan YAKIN",
          (() => {
            const framing = stage.slice(
              stage.indexOf("const ROOM_FRAMING"),
              stage.indexOf("const ROOM_FRAMING") + 700,
            );
            const fill = Number(
              /targetHeightFill: ([0-9.]+)/.exec(framing)?.[1] ?? "0",
            );
            const overflow = Number(
              /maxWidthFill: ([0-9.]+)/.exec(framing)?.[1] ?? "0",
            );
            return fill > 0.8 && fill < 1 && overflow > 1 && overflow <= 1.4;
          })(),
        ),
        check(
          "oda, alt payın düşüldüğü alana DENGELİ ortalanır (hedef kayar)",
          stage.includes("bottomReserve") &&
            stage.includes("camera.lookAt(target)") &&
            stage.includes("camera.position.copy(target)"),
        ),
        check(
          "düzenleme tepsisi açıkken oda YUKARI kayar (tepsi odayı kapatmaz)",
          stage.includes(
            "bottomReserve={isBuildMode ? ROOM_FRAMING.buildReserve : 0}",
          ) &&
            /buildReserve: 0\.[0-9]+/.test(stage),
        ),
        check(
          "canvasta boşluk yok: RoomGround sahnenin İÇİNDE çiziliyor",
          stage.includes("<RoomGround half={plan.half} />"),
        ),
        check(
          "çevre zemini vinyetle sakinleşiyor (oda öne çıkar)",
          // Satır içi CSS: Tailwind'in `_` kısaltması DEĞİL gerçek boşluk
          // beklenir — yoksa gradyan sessizce geçersiz olur.
          stage.includes("ROOM_VIGNETTE") &&
            /radial-gradient\(circle at 50% 45%, transparent 34%/.test(stage) &&
            !/circle_at_50%/.test(stage) &&
            stage.includes("pointer-events-none absolute inset-0 z-10"),
        ),
      );

      // ── ARAYÜZ BÜTÜNLÜĞÜ: oda artık BAĞIMSIZ bir ekran değil.
      //    Oyunun ortak kabuğunun (üst şerit + alt kontrol çubuğu + sohbet)
      //    İÇİNDE, caddenin yerine geçen bir katmandır; HUD evde de kalır.
      checks.push(
        check(
          "oda TAM EKRAN DEĞİL: ana oyun alanının içinde yaşıyor (HUD kalkmaz)",
          house.includes("absolute inset-0 z-30") &&
            !house.includes("fixed inset-0 z-[60]") &&
            world.includes("<HouseRoom") &&
            world.indexOf("<HouseRoom") < world.indexOf("</main>"),
        ),
        check(
          "üst HUD (cüzdan/oyuncu) + alt kontrol çubuğu + SOHBET evde de görünür",
          // Oda katmanı yalnızca `<main>`ın içinde: üst şerit ve alt çubuk
          // odanın KARDEŞİ olduğu için odanın onları kapatması MÜMKÜN DEĞİL.
          (() => {
            const mainEnd = world.indexOf("</main>");
            const bottomBar = world.indexOf("bottom control bar");
            const chatInput = world.indexOf("Sohbet mesajı");
            const topBar = world.indexOf("top bar — wallet & player");
            return (
              mainEnd > 0 &&
              bottomBar > mainEnd &&
              chatInput > mainEnd &&
              topBar > 0 &&
              topBar < mainEnd
            );
          })(),
        ),
        check(
          "DÜZENLEME KATMANI: 'Evi Düzenle' → mobilya karuseli + ızgara düğmesi",
          stage.includes("Evi Düzenle") &&
            stage.includes("setBuildMode(true)") &&
            stage.includes("setBuildMode(false)") &&
            stage.includes("FURNITURE.map") &&
            stage.includes("Grid3x3") &&
            stage.includes("showGrid") &&
            stage.includes("gridSpan"),
        ),
        check(
          "tepsi YUMUŞAK animasyonla açılıp kapanıyor (framer-motion + AnimatePresence)",
          /import \{ AnimatePresence, motion \} from "framer-motion"/.test(stage) &&
            stage.includes("<AnimatePresence mode=\"wait\"") &&
            stage.includes("<motion.button") &&
            stage.includes("initial={{ opacity: 0, y: 56 }}") &&
            stage.includes("<AnimatePresence"),
        ),
        check(
          "tepsi KAPALIYKEN mobilya araçları çizilmez (ana arayüz bozulmaz)",
          // `!isBuildMode` dalı yalnızca "Evi Düzenle" düğmesini basar.
          /\{!isBuildMode \? \(/.test(stage) &&
            stage.indexOf("<Hammer className=\"size-4\" /> Evi Düzenle") <
              stage.indexOf("FURNITURE.map"),
        ),
      );

      // ── AÇILIŞ DEKORU: oda modeli BOŞ geliyor; dekor olmadan oyuncu çıplak
      //    bir kutu görüyordu. Dekor, oyuncunun dizdiği eşyalarla AYNI
      //    listede durur (kaldırılabilir, "Temizle" ile silinir).
      checks.push(
        check(
          "oda AÇILIŞ DEKORUYLA geliyor (boş kutu değil, hediye GERÇEK sahiplik satırı)",
          build.includes("export const DEFAULT_DECOR") &&
            build.includes("export function starterFurniture") &&
            build.includes("export function defaultDecorFor") &&
            world.includes("starterFurniture()") &&
            world.includes("api.furniture.seedStarter") &&
            // Hediye YALNIZCA bir kez verilir: hepsini kaldıran oyuncuya geri gelmez.
            furniture.includes("house.furnitureSeeded") &&
            furniture.includes("if (house.furnitureSeeded) return"),
        ),
      );
      (() => {
        const half = { x: 4, z: 4 };
        const decor = defaultDecorFor(half);
        const onGrid = (v: number) =>
          Math.abs(v / K.ROOM_ISO.grid - Math.round(v / K.ROOM_ISO.grid)) < 1e-9;
        const inside = decor.every((item) => {
          const def = furnitureById(item.id);
          return (
            onGrid(item.x) &&
            onGrid(item.z) &&
            Math.abs(item.x) + def.w / 2 <= half.x + 1e-9 &&
            Math.abs(item.z) + def.d / 2 <= half.z + 1e-9
          );
        });
        // Çıkış kapısı ARKA duvarın tam ortasında: o duvarın ortası boş kalmalı.
        const doorClear = decor.every((item) => {
          const def = furnitureById(item.id);
          const atBackWall = item.z + def.d / 2 < -half.z * 0.6;
          return !atBackWall || Math.abs(item.x) - def.w / 2 > 1.1;
        });
        checks.push(
          check(
            "açılış dekoru odanın İÇİNDE, ızgarada ve kapı önünü kapatmıyor",
            decor.length >= 5 && inside && doorClear,
            `${decor.length} eşya · sınır/ızgara ${inside} · kapı önü ${doorClear}`,
          ),
        );
        const again = defaultDecorFor(half);
        checks.push(
          check(
            "dekor yerleşimi KARARLI (her açılışta aynı) + anahtarları oyuncununkiyle çakışmaz",
            JSON.stringify(again) === JSON.stringify(decor) &&
              decor.every((item) => item.key.startsWith("d")) &&
              build.includes('rowId: `d${i}_${decor.id}`'),
          ),
        );
        checks.push(
          check(
            "oda büyüse/küçülse de dekor DUVARLARIN İÇİNDE kalır (oransal konum)",
            (() => {
              for (const scale of [0.5, 2]) {
                const h = { x: half.x * scale, z: half.z * scale };
                for (const item of defaultDecorFor(h)) {
                  const def = furnitureById(item.id);
                  if (
                    Math.abs(item.x) + def.w / 2 > h.x + 1e-9 ||
                    Math.abs(item.z) + def.d / 2 > h.z + 1e-9
                  ) {
                    return false;
                  }
                }
              }
              return true;
            })(),
          ),
        );
      })();

      checks.push(
        check(
          "odaya girişte ARA KATMAN yok: model hazırlanırken yedek oda EKRANA GELMEZ",
          house.includes("<RoomStage") &&
            house.includes("showAvatar={avatar}") &&
            // Oda alanı, 3D sahne hazır olana kadar ŞEFFAF kalır (`stageReady`):
            // arkada cadde görünür, oyuncuya uydurma bir oda basılmaz.
            house.includes(
              "const [stageReady, setStageReady] = useState(false)",
            ) &&
            house.includes("onReadyChange={setStageReady}") &&
            house.includes('stageReady ? "bg-[#4a3423]" : "bg-transparent"') &&
            !stage.includes("showFallback") &&
            stage.includes("onReadyChange?.(ready)"),
        ),
        check(
          "yedek oda artık yalnızca SON ÇARE (yalnızca iki erken dönüşte çizilir)",
          (stage.match(/fallback\(\{ avatar:/g) ?? []).length === 2 &&
            stage.includes("if (notEnoughGpu)") &&
            stage.includes("if (failed || exhausted)"),
        ),
        check(
          "3D oda açıkken yedek odanın avatar canvas'ı çizilmiyor (TEK ekstra bağlam)",
          stage.includes("fallback({ avatar: false })") &&
            stage.includes("fallback({ avatar: true })") &&
            /\{showAvatar &&/.test(house),
        ),
        check(
          "bağlam açılamıyorsa 3D sahne HİÇ kurulmuyor (çökmek yerine yedeğe düşer)",
          stage.includes("webglPowerPreference") &&
            stage.includes("onUnavailable={() => setNotEnoughGpu(true)}") &&
            read("../src/engine/webglSupport.ts").includes(
              "export function webglPowerPreference",
            ) &&
            read("../src/engine/WebglCanvas.tsx").includes(
              "export function useCanvasGate",
            ),
        ),
        check(
          "bağlam yoksa yedek odanın avatar canvas'ı da hiç açılmıyor",
          (() => {
            const noGpu = stage.indexOf("if (notEnoughGpu)");
            const noAvatar = stage.indexOf(
              "fallback({ avatar: false })",
              noGpu,
            );
            return noGpu >= 0 && noAvatar > noGpu && noAvatar - noGpu < 220;
          })(),
        ),
        check(
          "oda sahnesi çökünce bağlam HEMEN bırakılıyor (yedek avatar yuvası açılır)",
          stage.includes("roomGl.current = gl") &&
            stage.includes("releaseCanvasContext(roomGl.current)") &&
            read("../src/engine/webglSupport.ts").includes(
              "export function releaseCanvasContext",
            ),
        ),
        check(
          "bağlam kurulamayınca yeniden deneme GECİKMELİ (forceContextLoss asenkron)",
          /window\.setTimeout\(\(\) => \{[\s\S]{0,80}setAttempt\(\(n\) => n \+ 1\)/.test(
            read("../src/engine/WebglCanvas.tsx"),
          ),
        ),
        check(
          "profil avatarı da bağlam hatasına dayanıklı (retry + kapı + `onCreated`)",
          (() => {
            const avatar = read("../src/engine/GlbAvatar3D.tsx");
            return (
              avatar.includes("useWebglRetry(2)") &&
              avatar.includes("noGpuSlot") &&
              avatar.includes("onUnavailable={() => setNoGpuSlot(true)}") &&
              avatar.includes("if (exhausted || noGpuSlot) return null;") &&
              avatar.includes("<WebglContextKeeper priority={10} onCreated={handleCreated} />")
            );
          })(),
        ),
        (() => {
          const support = read("../src/engine/webglSupport.ts");
          const lowFirst = support.indexOf('probe("default")');
          const highFirst = support.indexOf('probe("high-performance")');
          return check(
            "oda bağlamı SEÇİLEN `powerPreference` ile açılıyor (deneme = sahne)",
            stage.includes(
              'powerPreference: webglPowerPreference() ?? "default"',
            ) &&
              // İkinci bağlam için önce en uyumlu ayar denenir.
              lowFirst >= 0 &&
              highFirst > lowFirst,
            `deneme sırası: default → high-performance`,
          );
        })(),
        // ── DENEME ↔ CANVAS YARIŞI (kök neden: "Error creating WebGL context") ──
        //    `webglPowerPreference()` bir deneme bağlamı açar ve HEMEN bırakır;
        //    ama `WEBGL_lose_context` ASENKRONdur — yuva bir süre daha dolu kalır.
        //    Deneme ile oda canvas'ı aynı karede kurulursa cihaz üçüncü bağlamı
        //    ister gibi görünür ve reddeder; bu hata R3F'ın asenkron
        //    `configure()`ından geldiği için React sınırına uğramaz, SAYFAYI
        //    düşürür. İki kilit: (1) deneme bağlamı boyutları sıfırlanarak TAM
        //    bırakılır, (2) oda canvas'ı denemeden SONRA kısa gecikmeyle kurulur.
        check(
          "deneme bağlamı TAM bırakılıyor (yuva sahne kurulmadan boşalsın)",
          (() => {
            const probe = read("../src/engine/webglSupport.ts");
            const loseAt = probe.indexOf("loseContext?.()");
            const clearAt = probe.indexOf("canvas.width = 0", loseAt);
            return loseAt >= 0 && clearAt > loseAt;
          })(),
        ),
        check(
          "canvas'lar SIRAYA giriyor: yerleşim kuyruğu + zamanlayıcılı hazırlık",
          (() => {
            const canvas = read("../src/engine/WebglCanvas.tsx");
            const support = read("../src/engine/webglSupport.ts");
            const reserve = canvas.indexOf("const wait = reserveContextSlot()");
            const timer = canvas.indexOf("window.setTimeout", reserve);
            const ready = canvas.indexOf("setState({ ready: true", timer);
            return (
              reserve >= 0 &&
              timer > reserve &&
              ready > timer &&
              support.includes("export function reserveContextSlot") &&
              support.includes("CONTEXT_STAGGER_MS")
            );
          })(),
        ),
        check(
          "kapı GEÇİLMEDEN 3D canvas HİÇ kurulmuyor (asenkron red sayfayı düşürmesin)",
          (() => {
            const canvas = read("../src/engine/WebglCanvas.tsx");
            return (
              canvas.includes("if (!gate.ready) return null;") &&
              canvas.includes("export function CanvasGuard") &&
              canvas.includes("export function useCanvasGate")
            );
          })(),
        ),
        check(
          "sahne kurulum hatası da yakalanıyor (CanvasGuard + RoomBoundary)",
          /export function CanvasGuard/.test(
            read("../src/engine/WebglCanvas.tsx"),
          ) &&
            /class CanvasErrorBoundary/.test(
              read("../src/engine/WebglCanvas.tsx"),
            ) &&
            /class RoomBoundary/.test(stage) &&
            /<CanvasGuard/.test(stage) &&
            /onFail={handleFail}/.test(stage),
        ),
        check(
          "bağlam reddi SAYFAYA DÜŞMEZ: supap açılışta kurulur (koşulsuz)",
          read("../src/main.tsx").includes("ensureWebglFailureGuard()") &&
            read("../src/engine/webglSupport.ts").includes(
              "export function ensureWebglFailureGuard",
            ) &&
            !read("../src/engine/webglSupport.ts").includes(
              "if (watchedCanvases === 0) return;",
            ),
        ),
        check(
          "feda edilebilir önizleme/arena sahneleri de kapıdan geçiyor",
          read("../src/components/world/ShopSheets.tsx").includes(
            "<CanvasGuard>",
          ) &&
            read("../src/components/world/Arena3D.tsx").includes(
              "<CanvasGuard>",
            ),
        ),
        check(
          "ASENKRON bağlam hatası oyunu düşürmüyor (supap → yeniden denenir)",
          read("../src/engine/webglSupport.ts").includes("unhandledrejection") &&
            read("../src/engine/webglSupport.ts").includes(
              "export function watchCanvasFailures",
            ) &&
            stage.includes("useWebglRetry") &&
            read("../src/engine/WebglCanvas.tsx").includes(
              "export function useWebglRetry",
            ),
        ),
        check(
          "supap aboneliği LAYOUT etkisinde (asenkron reddin ÖNÜNE geçer)",
          /useLayoutEffect\(\s*\(\) =>\s*watchCanvasFailures/.test(
            read("../src/engine/WebglCanvas.tsx").replace(/\n\s+/g, " "),
          ),
        ),
        // ── 7) BAĞLAM BÜTÇESİ: sökülen canvas bağlamını BIRAKIR, yer gerekirse
        //       feda edilebilir bağlam bırakılır, cadde bağlamı KORUNUR.
        check(
          "sökülen canvas WebGL bağlamını BIRAKIYOR (forceContextLoss — dispose yetmez)",
          read("../src/engine/webglSupport.ts").includes("forceContextLoss") &&
            read("../src/engine/WebglCanvas.tsx").includes(
              "scheduleCanvasRelease(gl)",
            ) &&
            read("../src/engine/WebglCanvas.tsx").includes(
              "registerCanvasContext(gl, priority)",
            ),
        ),
        (() => {
          const canvases = [
            "../src/engine/GameEngine3D.tsx",
            "../src/engine/RoomStage.tsx",
            "../src/engine/GlbAvatar3D.tsx",
            "../src/components/entry/EntryCharacterStage.tsx",
            "../src/components/world/ShopSheets.tsx",
            "../src/components/game3d/GameScene3D.tsx",
            "../src/components/world/Arena3D.tsx",
          ];
          const missing = canvases.filter(
            (path) => !read(path).includes("<WebglContextKeeper"),
          );
          return check(
            "her 3D canvas bağlam defterine kaydoluyor (bağlamlar birikmez)",
            missing.length === 0,
            missing.length
              ? `eksik: ${missing.join(", ")}`
              : `${canvases.length} sahne`,
          );
        })(),
        check(
          "cadde bağlamı ASLA feda edilmez (protected priority)",
          read("../src/engine/GameEngine3D.tsx").includes(
            "priority={PROTECTED_PRIORITY}",
          ) &&
            read("../src/engine/webglSupport.ts").includes(
              "export function releaseExpendableContext",
            ),
        ),
        check(
          "oda açıkken cadde sahnesi DURDURULUR (GPU/yuva boşa tüketilmez)",
          read("../src/engine/GameEngine3D.tsx").includes(
            'frameloop={paused ? "never" : "always"}',
          ) &&
            world.includes("paused={room !== null}"),
        ),
        check(
          "odaya girerken arkadaki katmanlar kapatılıyor (bağlam sınırı)",
          /const closeOverlays/.test(world) &&
            (world.match(/closeOverlays\(\)/g) ?? []).length >= 2,
        ),
        check(
          "model yüklenemezse sahne sökülür (boşa WebGL bağlamı açık kalmaz)",
          /class RoomBoundary/.test(stage) &&
            /onFail/.test(stage) &&
            /setFailed/.test(stage),
        ),
        check(
          "oda modeli kapı MENZİLİNE girince önceden iniyor (odaya giriş beklemesin)",
          stage.includes("export function preloadRoomModel") &&
            stage.includes("useGLTF.preload(ROOM_MODEL_URL)") &&
            // Biri "Evine gir"e basılınca, biri kapıya YAKLAŞINCA: oda anında
            // açılsın diye indirme tıklamadan önce başlar.
            (world.match(/preloadRoomModel\(\)/g) ?? []).length >= 2,
        ),
        check(
          "oda modeli cadde HAZIR OLUR OLMAZ önceden iniyor (oda açılırken bekleme yok)",
          /if \(!gateSceneReady\) return;/.test(world) &&
            world.includes("window.setTimeout(() => preloadRoomModel()"),
        ),
        check(
          "oda modeli cadde ön yüklemesine EKLENMEDİ (ağır iç mekân caddeyi geciktirmez)",
          !K.BUILDING_MODEL_URLS.includes(K.ROOM_MODEL_URL),
        ),
      );

      return checks;
    },
  },
];

/* ─────────────────────────────────── Çalıştır ────────────────────────────── */

async function main() {
  const ctx = await openBrowser();
  const preview = new Preview(ctx);
  const selected = ONLY ? scenarios.filter((s) => s.id === ONLY) : scenarios;
  if (selected.length === 0) {
    console.error(
      `Bilinmeyen senaryo: ${ONLY}\nMevcut: ${scenarios.map((s) => s.id).join(", ")}`,
    );
    process.exit(1);
  }

  let failed = 0;
  for (const scenario of selected) {
    console.log(`\n═══ ${scenario.title}\n    (${scenario.handles})`);
    const checks = await scenario.run(preview);
    // Döküm, senaryonun son çizili halini gösterir (tıklamalar dahil).
    if (DUMP) console.log(preview.dump());
    for (const c of checks) {
      const mark = c.ok ? "PASS" : "FAIL";
      if (!c.ok) failed++;
      console.log(
        `  ${mark}  ${c.name}${c.detail ? `  — ${c.detail}` : ""}`,
      );
    }
  }

  console.log(
    `\n${failed === 0 ? "TÜM ÖNİZLEME KONTROLLERİ GEÇTİ ✔" : `${failed} KONTROL BAŞARISIZ ✘`}`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

await main();
