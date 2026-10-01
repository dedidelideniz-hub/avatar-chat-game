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
  mock.module("@react-three/drei", () => ({
    // drei'nin DOM katmanı: sahne olmadan yalnızca çocukları çiz (baloncuk
    // bileşeni bu modülü import ediyor).
    Html: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    useProgress: () => ({ progress: 100, active: false, loaded: 4, total: 4, errors: [] }),
    useGLTF: Object.assign(() => ({ scene: {}, nodes: {}, materials: {} }), {
      preload: () => {},
      clear: () => {},
    }),
  }));
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
