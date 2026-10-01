import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, Ref } from "react";
import type { Group, PerspectiveCamera } from "three";
import { DEFAULT_BUBBLE_COLOR, bubbleColorOf } from "@/lib/shop";

/**
 * SANALİKA / HABBO TARZI SOHBET BALONCUĞU
 * ══════════════════════════════════════════════════════════════════
 * Amaç: karakterin başının üstünde, klasik Sanalika konuşma baloncuğuna çok
 * yakın bir görünüm. Bu dosya YALNIZCA görsel sunumu belirler — hareket,
 * kamera, koordinatlar, yürünebilirlik, multiplayer/Convex, sohbet altyapısı
 * ve mağaza sistemlerine DOKUNMAZ. Mevcut sohbet metni (World'den gelen
 * `text` + `name`) bu balona bağlanır.
 *
 * ══════════════════════════════════════════════════════════════════
 * GÖRÜNÜM (Sanalika referansı)
 *   · Gövde: yatay, yuvarlatılmış dikdörtgen; köşe 16px; TAM OPAK, açık krem
 *     (`#F7F9E9`). Modern WhatsApp/iMessage balonu DEĞİL, hafif retro 2D UI.
 *   · Kenarlık: düz yeşil `#72C94A`, 3px, balonun TÜM çevresini takip eder.
 *   · Gölge: çok hafif (`0 2px 4px rgba(0,0,0,0.15)`), gövde + kuyruk TEK
 *     parça gibi (sarmalayıcıda tek `drop-shadow`).
 *   · Kuyruk: alt kenarın ortasında, 45° döndürülmüş küçük bir KARE (≈14px);
 *     gövdeyle aynı krem renkte ve aynı yeşil kenarlıkla bitişir → temiz,
 *     kesintisiz bir üçgen kuyruk. Avatarın kafasını işaret eder.
 *   · Kullanıcı adı `#E53935` (canlı kırmızı, kalın) + mesaj `#202020`, aynı
 *     satırdan başlar (`Sulana: BİZİM ÇOCUKLARR`).
 *   · Yazı tipi eski oyun hissi: Trebuchet MS / Tahoma / Arial.
 *
 * ══════════════════════════════════════════════════════════════════
 * NEDEN DOM (drei `<Html>`)?
 *   Baloncuk METİN taşır: dokuya (canvas texture) çizilen bir baloncuk
 *   kameraya yaklaşınca bulanıklaşır. `<Html>` gerçek DOM çizdiği için yazı
 *   her mesafede keskin kalır ve metin otomatik satır kaydırır.
 *
 * ══════════════════════════════════════════════════════════════════
 * GENİŞLİK (kritik)
 *   drei kapsayıcısının GENİŞLİĞİ YOKTUR. İçerik `display:flex` gibi esneyen
 *   bir kutu olursa kapsayıcı ~0 genişlik hesaplar ve metin HER HARFİ AYRI
 *   SATIRA düşer. Bu yüzden baloncuk `display:inline-block; width:max-content`
 *   ile KENDİ genişliğini alır, yalnızca `maxWidth` sınırında satır kaydırır:
 *   kısa/orta/uzun mesaja göre OTOMATİK büyür (yükseklik de satır sayısına
 *   göre artar).
 *
 * ══════════════════════════════════════════════════════════════════
 * MESAFEYE GÖRE ÖLÇEK (min/max sınırlı)
 *   Baloncuk kameraya yakınken ekranı kaplamamalı, uzaktayken okunamaz kadar
 *   küçülmemeli. drei'nin `distanceFactor`'ı yerine ölçeği BURADA hesaplarız:
 *   `useFrame` her karede kamera↔çapa mesafesini ölçüp perspektif ölçeğini
 *   üretir ve `[minScale, maxScale]` aralığına KISTIRIR; sonuç bir CSS
 *   değişkenine (`--bubble-scale`) yazılır. Böylece ölçek sınırı garanti
 *   edilir ve kamera kodu HİÇ değişmez (`distanceFactor` kullanılmaz).
 *
 * ══════════════════════════════════════════════════════════════════
 * ÖMÜR (5 sn · yeni mesaj YERİNDE günceller · yukarı süzülerek kaybolur)
 *   · Yeni mesaj gelince baloncuk çok hafif bir girişle (opacity 0→1,
 *     scale 0.95→1, ~150ms) belirir; zıplama/bounce YOK.
 *   · Süre tek kaynaktan yönetilir: `CHAT_BUBBLE_MS` (World'deki zamanlayıcı
 *     da bu sabiti kullanır). Aynı oyuncudan yeni mesaj gelirse İKİNCİ balon
 *     açılmaz, mevcut balon güncellenir ve süre sıfırlanır.
 *   · Süre dolunca metin KORUNARAK yukarı doğru süzülüp kaybolur.
 *
 * ══════════════════════════════════════════════════════════════════
 * VIP BALON RENKLERİ (👑 `BUBBLE_COLORS` → `vip: true`)
 *   · Sanalika çerçevesi korunur (köşe/dolgu/kuyruk/gölge), ama VIP oyuncu
 *     kendi rengini görür: gövde renkli, çerçeve kalın beyaz, isimden önce 👑.
 *   · Yumuşak renkli ışıma (nabız) + ışık süpürmesi — keyframes'ler
 *     `src/index.css` içinde (`vaelos-bubble-pulse`, `vaelos-bubble-sheen`).
 */

/** Baloncuk ekranda kaç ms kalır (World'deki zamanlayıcı da bunu kullanır). */
export const CHAT_BUBBLE_MS = 5000;
/** Kaybolma yumuşaklığı (ms): yukarı süzülme + solma; düğüm bundan sonra kalkar. */
export const CHAT_BUBBLE_FADE_MS = 320;
/** Giriş animasyonu süresi (ms) — hafif, zıplama yok. */
export const CHAT_BUBBLE_ENTER_MS = 150;

/** Baş üstü çapası — karakterin tepesinin ~0.28 birim üstü (yükseklik değişmez). */
export const CHAT_BUBBLE_HEIGHT = 2.2;

/** Mesafeye göre ölçek sınırları (ekranı kaplamaz / okunamaz küçülmez). */
export const CHAT_BUBBLE_MIN_SCALE = 0.65;
export const CHAT_BUBBLE_MAX_SCALE = 1.15;

/** Kameradan uzaklaşınca küçülme katsayısı (yakın oyuncuda ölçek ≈ 1). */
const DISTANCE_FACTOR = 12;

/* ── Sanalika paleti ── */
const CREAM = "#F7F9E9";          // gövde zemini (tam opak)
const BORDER_GREEN = "#72C94A";   // düz yeşil çerçeve
const BORDER_WIDTH = 3;           // px
const BORDER_RADIUS = 16;         // px
const TAIL_SIZE = 14;             // döndürülmüş kare kenarı (px)
const USERNAME_RED = "#E53935";   // "İsim:" kırmızı + kalın
const MESSAGE_DARK = "#202020";   // mesaj koyu gri-siyah
const BUBBLE_SHADOW = "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15))";
/** Kısa/uzun mesaja göre otomatik boyutlanmanın üst sınırı (mobil/masaüstü).
 *   · dikey/telefon : ~216-240px (60vw)
 *   · yatay/masaüstü : ~260-290px
 * Metin bu genişliği aşınca otomatik 2-3 satıra kayar; balon yüksekliği
 * satır sayısına göre artar. */
const MAX_WIDTH = "clamp(210px, 60vw, 290px)";

/** Baloncuk yazı tipi — eski oyun hissi, küçük ekranda okunur. */
const BUBBLE_FONT = "'Trebuchet MS', Tahoma, Arial, sans-serif";

/** Yukarı süzülme miktarı (px) — kaybolurken. */
const FADE_RISE_PX = 10;

/** `#rrggbb`(3/6) → {r,g,b}. */
function rgbOf(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** `#rrggbb` + alfa → `rgba(...)`; ışıma tonları için. */
function withAlpha(hex: string, alpha: number): string {
  const c = rgbOf(hex);
  if (!c) return hex;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

/** Rengi beyaza doğru `amount` kadar açar (gövdenin üst kenarı için). */
function lift(hex: string, amount: number): string {
  const c = rgbOf(hex);
  if (!c) return hex;
  const mix = (v: number) => Math.round(v + (255 - v) * amount);
  return `rgb(${mix(c.r)}, ${mix(c.g)}, ${mix(c.b)})`;
}

/** Renk açık mı? (Açık zemine koyu, koyu zemine beyaz yazı gerekir.) */
function isLight(hex: string): boolean {
  const c = rgbOf(hex);
  if (!c) return true;
  return (c.r * 299 + c.g * 587 + c.b * 114) / 1000 > 150;
}

/** CSS değişkenlerini React stil nesnesine çevirir (`--vip-glow` gibi). */
function cssVars(vars: Record<string, string>): CSSProperties {
  return vars as unknown as CSSProperties;
}

/**
 * Baloncuğun GÖVDESİ — saf DOM (3D bağımlılığı yok).
 *
 * Ayrı tutulur: `scripts/preview-ui.tsx` bu bileşeni WebGL olmadan render edip
 * baloncuğun ölçüsünü/stilini/metnini doğrulayabilir.
 */
export function ChatBubbleBody({
  text,
  name,
  colorId = DEFAULT_BUBBLE_COLOR,
  visible = true,
  scaleRef,
}: {
  /** Mesaj metni. */
  text: string;
  /** Gönderen adı (Sanalika düzeni: "İsim: mesaj"). */
  name?: string;
  /** `BUBBLE_COLORS` id'si (beyaz, nane, ...). */
  colorId?: string;
  /** false → kaybolma geçişi (yukarı süzülme + solma). */
  visible?: boolean;
  /** Dıştaki ölçek sarmalayıcısına ref (mesafeye göre ölçek buraya yazılır). */
  scaleRef?: Ref<HTMLDivElement>;
}) {
  const def = bubbleColorOf(colorId);
  const premium = def.vip === true;
  // Standart balon: açık krem + yeşil çerçeve (Sanalika). VIP: oyuncunun seçtiği
  // renk + kalın beyaz çerçeve (ayrıcalık korunur).
  const fill = premium ? def.hex : CREAM;
  const fillTop = premium ? lift(def.hex, 0.28) : CREAM;
  const border = premium ? "#ffffff" : BORDER_GREEN;
  const messageColor = isLight(fill) ? MESSAGE_DARK : "#ffffff";
  // İsim: standart balonda kırmızı; VIP'de okunurluk için zemin kontrastı.
  const nameColor = premium ? def.text : USERNAME_RED;

  return (
    // ── DIŞ: mesafeye göre ölçek (transform-origin = çapa) ──
    // `center` (drei) + içerideki `translateY(-50%)`: baloncuğun ALT KENARI
    // baş üstü çapasına oturur. Ölçek bu kutunun MERKEZİ (çapa) etrafında
    // uygulandığı için alt kenar ölçekten bağımsız çapada kalır.
    <div
      ref={scaleRef}
      style={{
        position: "relative",
        display: "inline-block",
        width: "max-content",
        maxWidth: MAX_WIDTH,
        minWidth: 60,
        pointerEvents: "none",
        userSelect: "none",
        transform: "scale(var(--bubble-scale, 1))",
        transformOrigin: "center",
      }}
    >
      {/* ── GİRİŞ/KAYBOLMA geçişi (opacity + hafif ölçek) ── */}
      <div
        style={{
          position: "relative",
          transform: `translateY(-50%) translateY(${
            visible ? "0px" : `-${FADE_RISE_PX}px`
          }) scale(${visible ? 1 : 0.95})`,
          opacity: visible ? 1 : 0,
          transition: `opacity ${CHAT_BUBBLE_ENTER_MS}ms ease-out, transform ${CHAT_BUBBLE_ENTER_MS}ms ease-out`,
        }}
      >
        {/* Gövde + kuyruk TEK parça gibi gölgelensin diye sarmalayıcıda tek
            `drop-shadow` (ayrı ayrı gölgeler kuyruğun ek yerini belli eder). */}
        <div style={{ position: "relative", filter: BUBBLE_SHADOW }}>
          <div
            // Yazı boyutu sınıftan gelir: mobilde ~13px, masaüstünde ~16px
            // (bkz. src/index.css → `.vaelos-bubble-text`). Kameraya göre ölçek
            // `--bubble-scale` ile ayrıca uygulanır.
            className="vaelos-bubble-text"
            style={{
              position: "relative",
              // Krem düz zemin; VIP'de üst kenar bir ton açık gradyan.
              background: `linear-gradient(180deg, ${fillTop} 0%, ${fill} 100%)`,
              color: messageColor,
              borderRadius: BORDER_RADIUS,
              // İç boşluk: yazı kenarlara yapışmaz (10-12 / 14-16).
              padding: "11px 15px",
              border: `${BORDER_WIDTH}px solid ${border}`,
              fontFamily: BUBBLE_FONT,
              fontWeight: 500, // mesaj normal/medium
              lineHeight: 1.35,
              letterSpacing: 0.1,
              textAlign: "left",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              // 👑 VIP: renkli IŞIMA + (index.css) nabız animasyonu.
              boxShadow: premium
                ? `0 0 14px ${withAlpha(def.hex, 0.5)}`
                : "none",
              animation: premium
                ? "vaelos-bubble-pulse 2.4s ease-in-out infinite"
                : undefined,
              // AÇIK yazıya koyu gölge (renkli/parlak zeminde okunurluk).
              textShadow: isLight(messageColor)
                ? "0 1px 2px rgba(0, 0, 0, 0.35)"
                : "none",
              ...cssVars(
                premium
                  ? {
                      "--vip-glow": withAlpha(def.hex, 0.85),
                      "--vip-glow-soft": withAlpha(def.hex, 0.4),
                    }
                  : {},
              ),
            }}
          >
            {name ? (
              <>
                <strong style={{ color: nameColor, fontWeight: 700 }}>
                  {premium ? "👑 " : ""}
                  {name}:
                </strong>{" "}
              </>
            ) : premium ? (
              "👑 "
            ) : null}
            {text}

            {/* 👑 VIP: baloncuğun üzerinden geçen ışık süpürmesi. */}
            {premium && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "inherit",
                  overflow: "hidden",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: -8,
                    bottom: -8,
                    left: 0,
                    width: "42%",
                    background:
                      "linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)",
                    borderRadius: 999,
                    animation: "vaelos-bubble-sheen 2.6s ease-in-out infinite",
                  }}
                />
              </span>
            )}
          </div>

          {/* ── KUYRUK: 45° döndürülmüş küçük kare ──
              Gövdenin ALT kenarının ortasında, avatarın kafasına bakar.
              Gövdenin üzerine çizilir: kare gövdenin kenarlığını tabanında
              keser, kendi sağ/alt kenarlığı gövdeninkiyle AYNI renk+kalınlıkta
              olduğu için çizgi kesintisiz akar (ek yeri görünmez). */}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              bottom: -TAIL_SIZE / 2,
              width: TAIL_SIZE,
              height: TAIL_SIZE,
              marginLeft: -TAIL_SIZE / 2,
              background: fill,
              borderRight: `${BORDER_WIDTH}px solid ${border}`,
              borderBottom: `${BORDER_WIDTH}px solid ${border}`,
              borderBottomRightRadius: 3,
              transform: "rotate(45deg)",
              zIndex: 1,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Baloncuk ömrü: mesaj gelince görünür, mesaj silinince metni FADE süresince
 * koruyup sonra düğümü kaldırır. Yeni mesajda (görünürken) YERİNDE günceller.
 */
function useBubbleLifecycle(text: string | null | undefined): {
  shown: string | null;
  visible: boolean;
} {
  const [shown, setShown] = useState<string | null>(text ?? null);
  const [visible, setVisible] = useState<boolean>(false);
  const hadText = useRef(false);

  useEffect(() => {
    const wasShowing = hadText.current;
    hadText.current = Boolean(text);

    if (text) {
      setShown(text);
      if (wasShowing) {
        // Baloncuk zaten ekranda: yeni mesajı yerinde değiştir (zıplamasın).
        setVisible(true);
        return;
      }
      // Taze baloncuk: bir kare gizli çiz, sonra hafifçe belirsin.
      setVisible(false);
      const id = setTimeout(() => setVisible(true), 20);
      return () => clearTimeout(id);
    }

    // Mesaj silindi: yumuşakça yukarı süzülüp kaybolsun, sonra düğüm kalksın.
    setVisible(false);
    const id = setTimeout(() => setShown(null), CHAT_BUBBLE_FADE_MS);
    return () => clearTimeout(id);
  }, [text]);

  return { shown, visible };
}

/**
 * Baş üstü sohbet baloncuğu (3D sahne içinde kullanılır).
 *
 * Karakterin grubunun İÇİNE konur; `position` karakterin yerel koordinatıdır
 * (`[0, 2.2, 0]` = başın hemen üstü). Dönen gruplarda bile yazı ters/ayna
 * görünmez: `<Html>` DOM katmanını döndürmez. Ölçek, kamera↔çapa mesafesine
 * göre kıstırılarak uygulanır (kamera kodu değişmez).
 */
export function ChatBubble({
  text,
  name,
  colorId = DEFAULT_BUBBLE_COLOR,
  position = [0, CHAT_BUBBLE_HEIGHT, 0],
}: {
  /** Mesaj metni; null → baloncuk kaybolur. */
  text: string | null | undefined;
  /** Gönderen adı (baloncuk "İsim: mesaj" yazar). */
  name?: string;
  /** Oyuncunun balon rengi (`BUBBLE_COLORS` id'si). */
  colorId?: string;
  /** Karakter yerel koordinatında çapa noktası. */
  position?: [number, number, number];
}) {
  const { shown, visible } = useBubbleLifecycle(text);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const scaleRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<Group | null>(null);

  useFrame(() => {
    const anchor = anchorRef.current;
    const el = scaleRef.current;
    if (!anchor || !el) return;
    anchor.updateWorldMatrix(true, false);
    const m = anchor.matrixWorld.elements;
    const dx = camera.position.x - m[12];
    const dy = camera.position.y - m[13];
    const dz = camera.position.z - m[14];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Perspektif ölçeği: objectScale * distanceFactor (drei ile aynı formül).
    const fov = typeof camera.fov === "number" ? camera.fov : 70;
    const raw =
      dist > 1e-3
        ? DISTANCE_FACTOR / (2 * Math.tan((fov * Math.PI) / 360) * dist)
        : 1;
    const clamped = Math.min(
      CHAT_BUBBLE_MAX_SCALE,
      Math.max(CHAT_BUBBLE_MIN_SCALE, raw),
    );
    el.style.setProperty("--bubble-scale", clamped.toFixed(3));
  });

  if (shown === null) return null;

  return (
    <group>
      {/* Ölçek hesabı için çapanın DÜNYA konumu (görünmez). */}
      <group ref={anchorRef} position={position} />
      <Html
        center
        position={position}
        pointerEvents="none"
        zIndexRange={[10, 0]}
      >
        <ChatBubbleBody
          text={shown}
          name={name}
          colorId={colorId}
          visible={visible}
          scaleRef={scaleRef}
        />
      </Html>
    </group>
  );
}
