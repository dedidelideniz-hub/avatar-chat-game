import { Html } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { DEFAULT_BUBBLE_COLOR, bubbleColorOf } from "@/lib/shop";

/**
 * SANALİKA / HABBO TARZI SOHBET BALONCUĞU
 *
 * ══════════════════════════════════════════════════════════════════
 * NEDEN DOM (drei `<Html>`) ve neden sahne içinde?
 *   · Baloncuk METİN taşır: ölçek ne olursa olsun yazı NET kalmalı.
 *     Dokuya (canvas texture) çizilen bir baloncuk kameraya yaklaşınca
 *     bulanıklaşır; `<Html>` gerçek DOM çizdiği için her mesafede keskin.
 *   · `distanceFactor={10}` ile baloncuk kameradan UZAKLAŞTIKÇA küçülür
 *     (karakterle aynı ölçekte kalır), böylece uzaktaki oyuncunun
 *     baloncuğu da ekranı kaplamaz.
 *   · `center` baloncuğu çapa noktasına ortalar; içerideki sarmalayıcı
 *     `translateY(-50%)` ile baloncuğun ALT KENARI çapaya (karakterin baş
 *     üstü, `[0, 2.2, 0]`) oturur → kuyruk doğrudan kafayı işaret eder.
 *   · `pointerEvents="none"`: `<Html>` canvas'ın KARDEŞİ bir DOM katmanı
 *     açar; bu olmadan baloncuk joystick/yürüme dokunuşlarını yutardı.
 *
 * ══════════════════════════════════════════════════════════════════
 * GENİŞLİK (kritik)
 *   drei'nin kapsayıcısı `position:absolute` ve GENİŞLİĞİ YOKTUR. İçerik
 *   `display:flex` gibi "esneyen" bir kutu olursa kapsayıcı neredeyse sıfır
 *   genişlik hesaplar ve metin HER HARFİ AYRI SATIRA düşer (eski ekran
 *   görüntüsündeki "J / d / j / d / d / j" hatası). Bu yüzden baloncuk
 *   `display:inline-block; width:max-content` ile KENDİ genişliğini alır ve
 *   yalnızca `max-width` sınırına gelince satır kaydırır.
 *
 * ══════════════════════════════════════════════════════════════════
 * ÇERÇEVE KALİTESİ
 *   · Gövde: yumuşak köşe (16px), 1px (VIP'de 2px) kenarlık ve TEK bir
 *     `drop-shadow` — böylece gövde + kuyruk TEK parça gibi gölgelenir.
 *   · Kuyruk: üst üste iki üçgen DEĞİL (eski hâli kenarlıksız, ayrık ve
 *     testere gibi duruyordu), 45° döndürülmüş KARE. Gövdenin ÜSTÜNE
 *     çizilir: kare gövdenin kenarlığını tabanında keser, kendi
 *     `border-right`/`border-bottom` kenarlığı gövdeninkiyle AYNI renk ve
 *     kalınlıkta olduğu için çizgi kesintisiz akar.
 *
 * ══════════════════════════════════════════════════════════════════
 * ÖMÜR (5 sn + YUKARI doğru yumuşak kaybolma)
 *   · Mesaj gelince baloncuk aşağıdan yükselip yerine oturur; süre
 *     dolduğunda METİN KORUNARAK yukarı doğru süzülüp kaybolur
 *     (`translateY(-16px)`), sonra düğüm kaldırılır.
 *   · Süre tek kaynaktan yönetilir: `CHAT_BUBBLE_MS` (World'deki zamanlayıcı
 *     da bu sabiti kullanır).
 *
 * ══════════════════════════════════════════════════════════════════
 * VIP BALON RENKLERİ (👑 `BUBBLE_COLORS` → `vip: true`)
 *   · Kalın beyaz çerçeve (Sanalika'nın renkli balon çerçevesi).
 *   · ANİMASYONLU renkli ışıma (nabız) + üzerinden geçen ışık süpürmesi —
 *     keyframes'ler `src/index.css` içinde (`vaelos-bubble-pulse`,
 *     `vaelos-bubble-sheen`), renk baloncuğun kendi renginden CSS
 *     değişkenleriyle gelir (`--vip-glow*`).
 *   · Renge göre beyaz/koyu yazı + okunurluk gölgesi, isimden önce 👑.
 *   · VIP olmayan oyuncu yalnızca beyaz baloncuğu görür (renk seçimi
 *     çantadaki `ChatPanel`'de, sunucu VIP'i `setBubbleColor` ile doğrular).
 */

/** Baloncuk ekranda kaç ms kalır (World'deki zamanlayıcı da bunu kullanır). */
export const CHAT_BUBBLE_MS = 5000;
/** Kaybolma yumuşaklığı (ms): yukarı süzülme + solma. */
export const CHAT_BUBBLE_FADE_MS = 320;

/** Baş üstü çapası — karakterin tepesinin biraz üstü. */
export const CHAT_BUBBLE_HEIGHT = 2.2;

/** Baloncuğun yazı tipi (Sanalika: kalın, net, sistem fontu). */
const BUBBLE_FONT =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";

/** Kaybolurken yukarı süzülme miktarı (px). */
const FADE_RISE_PX = 16;

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

/** `#rrggbb` + alfa → `rgba(...)`; kenarlık/ışıma tonları için. */
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

/** Renk açık mı? (Açık yazıya koyu gölge gerekir.) */
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
 * Ayrı tutulmasının nedeni: `scripts/preview-ui.tsx` bu bileşeni WebGL
 * olmadan render edip baloncuğun ölçüsünü/stilini/metnini doğrulayabiliyor.
 */
export function ChatBubbleBody({
  text,
  name,
  colorId = DEFAULT_BUBBLE_COLOR,
  visible = true,
}: {
  /** Mesaj metni. */
  text: string;
  /** Gönderen adı (Sanalika düzeni: "İsim: mesaj"). */
  name?: string;
  /** `BUBBLE_COLORS` id'si (beyaz, nane, ...). */
  colorId?: string;
  /** false → kaybolma geçişi (yukarı süzülme + solma). */
  visible?: boolean;
}) {
  const def = bubbleColorOf(colorId);
  const premium = def.vip === true;
  // Kenarlık kalınlığı: VIP renklerinde Sanalika'nın kalın beyaz çerçevesi.
  const strokeWidth = premium ? 2 : 1;
  // Kenarlık, "çerçeve kalitesiz duruyor" geri bildirimiyle belirginleştirildi:
  // beyaz balonda 0.22 alfa neredeyse görünmüyordu (bulanık/ucuz duruyordu),
  // VIP'de zaten beyaz kalın çerçeve var.
  const strokeColor = withAlpha(
    def.stroke,
    premium ? Math.max(def.strokeOpacity, 0.92) : Math.max(def.strokeOpacity, 0.34),
  );
  // Gövde hafif bir gradyan taşır (üst kenar bir ton açık): düz renk
  // "ucuz sticker" gibi duruyordu. Kuyruk gradyanın ALT rengini alır, bu
  // yüzden kuyrukla gövde arasında ton farkı oluşmaz.
  const baseColor = premium ? def.hex : "#f4f5f8";
  const topColor = premium ? lift(def.hex, 0.24) : "#ffffff";
  const tailSize = 15;

  return (
    <div
      style={{
        // ⚠️ `flex` DEĞİL: kapsayıcı genişliği sıfır olduğu için flex içerik
        // metni harf harf sarardı. `inline-block + max-content` baloncuğu
        // içeriğe göre boyutlandırır, `maxWidth` aşılırsa satır kaydırır.
        position: "relative",
        display: "inline-block",
        width: "max-content",
        maxWidth: 230,
        minWidth: 46,
        pointerEvents: "none",
        userSelect: "none",
        // `center` (drei) + bu kaydırma: baloncuğun alt kenarı baş üstüne
        // oturur. Kaybolurken YUKARI doğru süzülür (aşağı değil).
        transform: `translateY(-50%) translateY(${visible ? "0px" : `-${FADE_RISE_PX}px`}) scale(${visible ? 1 : 0.94})`,
        opacity: visible ? 1 : 0,
        transition: `opacity ${CHAT_BUBBLE_FADE_MS}ms ease, transform ${CHAT_BUBBLE_FADE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
      }}
    >
      {/* Tek `drop-shadow`: gövde + kuyruk TEK parça gibi gölgelenir
          (ayrı ayrı gölgeler kuyruğun ek yerini belli ediyordu). */}
      <div
        style={{
          position: "relative",
          filter: premium
            ? "drop-shadow(0 5px 10px rgba(6, 10, 20, 0.34))"
            : "drop-shadow(0 5px 10px rgba(6, 10, 20, 0.26))",
        }}
      >
        <div
          style={{
            position: "relative",
            background: `linear-gradient(180deg, ${topColor} 0%, ${baseColor} 100%)`,
            color: def.text,
            borderRadius: 16,
            padding: "9px 13px",
            border: `${strokeWidth}px solid ${strokeColor}`,
            fontFamily: BUBBLE_FONT,
            // Yazı karakterin ~1/6'sı (Sanalika'da ~1/5): okunur ama
            // caddede çok yer kaplamaz.
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: 0.1,
            textAlign: "left",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            // 👑 VIP: renkli IŞIMA + (index.css) nabız animasyonu.
            boxShadow: premium
              ? `0 0 14px ${withAlpha(def.hex, 0.5)}`
              : "0 2px 4px rgba(6, 10, 20, 0.10)",
            animation: premium
              ? "vaelos-bubble-pulse 2.4s ease-in-out infinite"
              : undefined,
            // Açık yazıyı renkli zeminden ayır (Sanalika'da yazı hep okunur).
            textShadow: isLight(def.text)
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
            <strong style={{ fontWeight: 800 }}>
              {premium ? "👑 " : ""}
              {name}:{" "}
            </strong>
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

        {/* ── Kuyruk: 45° döndürülmüş kare (gövdenin ÜSTÜNE çizilir) ──
            Gövdenin kenarlığını tabanında keser; kendi sağ/alt kenarlığı
            gövdeninkiyle aynı renk+kalınlıkta olduğu için çizgi
            kesintisiz akar, ek yeri görünmez. */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            bottom: -tailSize / 2,
            width: tailSize,
            height: tailSize,
            marginLeft: -tailSize / 2,
            background: baseColor,
            borderRight: `${strokeWidth}px solid ${strokeColor}`,
            borderBottom: `${strokeWidth}px solid ${strokeColor}`,
            borderBottomRightRadius: 4,
            transform: "rotate(45deg)",
            zIndex: 1,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Baloncuk ömrü: mesaj gelince görünür (aşağıdan yükselerek), mesaj
 * silinince metni FADE süresince koruyup sonra düğümü kaldırır.
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
      // Taze baloncuk: bir kare gizli çiz, sonra yükselerek belirsin.
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
 * Karakterin grubunun İÇİNE konur; `position` karakterin yerel
 * koordinatıdır (`[0, 2.2, 0]` = başın hemen üstü). Dönen gruplarda
 * bile yazı ters/ayna görünmez: `distanceFactor` verildiğinde drei
 * `<Html>` yalnızca konum + ölçek uygular, dönüşü DOM'a taşımaz.
 */
export function ChatBubble({
  text,
  name,
  colorId = DEFAULT_BUBBLE_COLOR,
  position = [0, CHAT_BUBBLE_HEIGHT, 0],
  distanceFactor = 10,
}: {
  /** Mesaj metni; null → baloncuk kaybolur. */
  text: string | null | undefined;
  /** Gönderen adı (baloncuk "İsim: mesaj" yazar). */
  name?: string;
  /** Oyuncunun balon rengi (`BUBBLE_COLORS` id'si). */
  colorId?: string;
  /** Karakter yerel koordinatında çapa noktası. */
  position?: [number, number, number];
  /** Kameradan uzaklaşınca küçülme katsayısı (karakterle aynı ölçek). */
  distanceFactor?: number;
}) {
  const { shown, visible } = useBubbleLifecycle(text);
  if (shown === null) return null;
  return (
    <Html
      center
      distanceFactor={distanceFactor}
      position={position}
      pointerEvents="none"
      zIndexRange={[10, 0]}
    >
      <ChatBubbleBody
        text={shown}
        name={name}
        colorId={colorId}
        visible={visible}
      />
    </Html>
  );
}
