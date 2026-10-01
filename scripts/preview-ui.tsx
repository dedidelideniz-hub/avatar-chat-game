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

async function mockAppLayer() {
  const { mock } = await import("bun:test");
  const React = await import("react");

  mock.module("convex/react", () => ({
    useQuery: () => profileStub,
    useMutation: () => async () => null,
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
  mock.module("@/engine/streetPreload", () => ({
    preloadStreetModels: () => {},
    STREET_MODELS: {},
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
      "CADI DÜKKÂNI · satır boş, tek model dikili; kapı yolu ve içerisi yürünebilir",
    handles:
      "src/engine/constants.ts + src/lib/shop.ts + src/engine/buildingModelPrep.ts + src/engine/GlbBuilding.tsx + src/engine/WitchShop.tsx",
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
          "seçilen bina kaldırım mobilyalarına çarpmayan bir X'te",
          def.x === W.x && Number.isFinite(W.pathWestX),
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
          Math.abs(walkZone.x - svgX(W.pathWestX)) < 1e-6 &&
            Math.abs(walkZone.y - svgY(W.pathSouthZ)) < 1e-6 &&
            Math.abs(walkZone.w - (W.entryEastX - W.pathWestX) * K.S) < 1e-6 &&
            Math.abs(walkZone.h - (W.pathSouthZ - W.pathNorthZ) * K.S) < 1e-6,
        ),
      );

      // ── 2) Çit, yolun geçtiği yerde bölündü (görünen çit yolun ortasından
      //       geçmesin). Ölçüt: sokak kenarındaki (X −14.6) Z bandı DİKİŞSİZ.
      const edgeX = W.pathWestX + 0.6;
      const edge = K.FENCE_EDGES.filter((e) => Math.abs(e.x - edgeX) < 0.01).sort(
        (a, b) => b.startZ - a.startZ,
      );
      const covered = (z: number) =>
        edge.some((e) => z <= e.startZ + 1e-6 && z >= e.endZ - 1e-6);
      // Yol bandının tamamı (yürünebilir şerit) çitsiz olmalı.
      const steps = 12;
      let blockedZ = 0;
      for (let i = 0; i <= steps; i++) {
        const z = W.pathSouthZ + ((W.pathNorthZ - W.pathSouthZ) * i) / steps;
        // Uçlar çit parçalarının bittiği noktalardır; 1e-3 pay bırakılır.
        const edgeTouch =
          Math.abs(z - W.pathSouthZ) < 1e-3 || Math.abs(z - W.pathNorthZ) < 1e-3;
        if (!edgeTouch && covered(z)) blockedZ++;
      }
      checks.push(
        check(
          "ara sokak çiti yolun Z bandında BOŞLUK bırakıyor (çit yolun ortasından geçmiyor)",
          blockedZ === 0 && edge.length === 3,
          `kenar X ${edgeX}, parça ${edge.length}, bloke örnek ${blockedZ}`,
        ),
      );

      // ── 3) Yürünebilirlik: yol bandı + kapı koridoru gerçekten yürünebilir,
      //       koridorun DIŞI (binanın içi ama duvar tarafı) yürünemez kalır.
      const pathMid = {
        x: svgX(W.pathWestX + 0.4),
        y: svgY((W.pathSouthZ + W.pathNorthZ) / 2),
      };
      const door = { x: svgX(W.x), y: svgY(W.frontZ) };
      const inside = { x: svgX(W.x), y: svgY(W.insideZ + 0.25) };
      const wallSide = { x: svgX(W.entryEastX + 0.6), y: svgY(W.insideZ + 0.25) };
      checks.push(
        check("yol bandı yürünebilir", inWalkable(pathMid.x, pathMid.y)),
        check("kapı (cephe hattı) yürünebilir", inWalkable(door.x, door.y)),
        check("binanın İÇİ yürünebilir", inWalkable(inside.x, inside.y)),
        check(
          "koridorun dışı (duvar tarafı) yürünemez — duvarlar geçirgen değil",
          !inWalkable(wallSide.x, wallSide.y),
        ),
      );
      checks.push(
        check(
          "yol şeridi yalnızca cadı dükkânı için tanımlı (2 dikdörtgen)",
          WITCH_SHOP_WALK_ZONES.length === 2,
          `${WITCH_SHOP_WALK_ZONES.length} bölge`,
        ),
      );

      // ── 4) A*: caddeden (doğuş noktası) dükkânın İÇİNE yol var. Kapının
      //       önündeki cadde kapalı olsaydı (kaldırım mobilyası) yol
      //       bulunamazdı — ara sokağa bağlılık bu testle doğrulanır.
      const spawn = { x: 1200, y: 460 };
      const toDoor = findPath(spawn.x, spawn.y, door.x, door.y);
      const toInside = findPath(spawn.x, spawn.y, inside.x, inside.y);
      checks.push(
        check(
          "caddeden kapıya A* yolu var",
          toDoor.length > 1,
          `${toDoor.length} düğüm`,
        ),
        check(
          "caddeden binanın İÇİNE A* yolu var",
          toInside.length > 1 &&
            Math.abs(toInside[toInside.length - 1].y - inside.y) < 48,
          `${toInside.length} düğüm, varış ${toInside[toInside.length - 1] ? `${toInside[toInside.length - 1].x.toFixed(0)},${toInside[toInside.length - 1].y.toFixed(0)}` : "yok"}`,
        ),
      );

      // Yolun SON noktası da yürünebilir olmalı (ızgara hücresi bant kenarını
      // birkaç px aşabilir; `World` orada `nearestWalkable`e düşer).
      const last = toInside[toInside.length - 1];
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

      // ── 7) Saydamlaştırma yalnızca bu binayı hedefliyor: çekirdek tek
      //       binadan occluder kurabiliyor ve bina onu `fade` ile kullanıyor.
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
