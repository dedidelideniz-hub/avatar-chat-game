import { Html } from "@react-three/drei";
import { useEffect, useState } from "react";
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
 *     (karakterle birlikte ölçeklenir), böylece uzaktaki oyuncunun
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
 *   genişlik hesaplar ve metin HER HARFİ AYRI SATIRA düşer (ekran
 *   görüntüsündeki "J / d / j / d / d / j" hatası). Bu yüzden baloncuk
 *   `display:inline-block; width:max-content` ile KENDİ genişliğini alır ve
 *   yalnızca `max-width` sınırına gelince satır kaydırır.
 *
 * ══════════════════════════════════════════════════════════════════
 * ÖMÜR (5 sn + yumuşak kaybolma) — TEK KAYNAK
 *   · Gönderen taraf mesajı `text` prop'una verir (World'de sohbet
 *     girdisi gönderilince `setBubble(...)`).
 *   · Baloncuk `CHAT_BUBBLE_MS` (5 sn) görünür kalır; süre dolduğunda
 *     `text` null'a döner ve DOM `CHAT_BUBBLE_FADE_MS` boyunca yumuşakça
 *     (opacity + hafif kayma) kaybolur.
 *   · Kaybolma sırasında METİN KORUNUR (`shown`), yoksa yazı bir kare
 *     içinde yok olurdu; geçiş bittikten sonra düğüm kaldırılır.
 *
 * ══════════════════════════════════════════════════════════════════
 * SANALİKA DÜZENİ
 *   · Baloncuk `İsim: mesaj` yazar (Sanalika'da gönderen adı baloncuğun
 *     içindedir) — ad kalın, mesaj normal.
 *   · `beyaz` (varsayılan): beyaz gövde + koyu yazı + ince koyu kenarlık.
 *   · 👑 VIP BALON RENKLERİ: `BUBBLE_COLORS` içindeki `vip: true`
 *     renklerdir; beyaz kalın kenarlık (Sanalika'nın renkli baloncuk
 *     görünümü), renkli ışıma (glow) ve renge göre beyaz/koyu yazı —
 *     yani VIP üyeler baloncuğuyla da fark edilir.
 *   · VIP olmayan oyuncu yalnızca beyaz baloncuğu görür (renk seçimi
 *     çantadaki `ChatPanel` ile yapılır, sunucu VIP'i doğrular).
 */

/** Baloncuk ekranda kaç ms kalır (World'deki zamanlayıcı da bunu kullanır). */
export const CHAT_BUBBLE_MS = 5000;
/** Kaybolma yumuşaklığı (ms): opacity + hafif aşağı kayma geçişi. */
export const CHAT_BUBBLE_FADE_MS = 320;

/** Baş üstü çapası — karakterin tepesinin biraz üstü. */
export const CHAT_BUBBLE_HEIGHT = 2.2;

/** Baloncuğun yazı tipi (Sanalika: kalın, net, sistem fontu). */
const BUBBLE_FONT =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";

/** `#rrggbb` + alfa → `rgba(...)`; kenarlık/ışıma tonları için. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Renk açık mı? (Açık yazıya koyu gölge, koyu yazıya gölge gerekmez.) */
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return true;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Kabaca algılanan parlaklık (ITU-R BT.601).
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
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
  /** false → kaybolma geçişi (opacity 0). */
  visible?: boolean;
}) {
  const def = bubbleColorOf(colorId);
  const premium = def.vip === true;
  // Kenarlık kalınlığı: VIP renklerinde Sanalika'nın kalın beyaz çerçevesi.
  const strokeWidth = premium ? 2 : 1;
  const tailHalf = 8;
  const tailOuterHalf = tailHalf + strokeWidth;

  return (
    <div
      style={{
        // ⚠️ `flex` DEĞİL: kapsayıcı genişliği sıfır olduğu için flex içerik
        // metni harf harf sarardı. `inline-block + max-content` baloncuğu
        // içeriğe göre boyutlandırır, `maxWidth` aşılırsa satır kaydırır.
        position: "relative",
        display: "inline-block",
        width: "max-content",
        // Sanalika baloncukları karaktere göre iri ve geniş; dar bir baloncuk
        // metni gereksiz sarar, çok geniş olan caddeyi kapatır.
        maxWidth: 230,
        minWidth: 46,
        pointerEvents: "none",
        userSelect: "none",
        // `center` (drei) + bu kaydırma: baloncuğun alt kenarı baş üstüne oturur.
        transform: `translateY(-50%) translateY(${visible ? "0px" : "6px"}) scale(${visible ? 1 : 0.9})`,
        opacity: visible ? 1 : 0,
        transition: `opacity ${CHAT_BUBBLE_FADE_MS}ms ease, transform ${CHAT_BUBBLE_FADE_MS}ms ease`,
      }}
    >
      <div style={{ position: "relative" }}>
        {/* ── Baloncuk gövdesi (Sanalika stili) ───────────────────── */}
        <div
          style={{
            background: def.hex,
            color: def.text,
            borderRadius: 12,
            padding: "8px 12px",
            border: `${strokeWidth}px solid ${withAlpha(def.stroke, def.strokeOpacity)}`,
            // 👑 VIP balon rengi: renkli IŞIMA (glow) + beyaz çerçeve.
            boxShadow: premium
              ? `0 0 18px ${withAlpha(def.hex, 0.7)}, 0 6px 18px rgba(6, 10, 20, 0.3)`
              : "0 6px 18px rgba(6, 10, 20, 0.28)",
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
            // Açık yazıyı renkli zeminden ayır (Sanalika'da yazı hep okunur).
            textShadow: isLight(def.text)
              ? "0 1px 2px rgba(0, 0, 0, 0.35)"
              : "none",
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
        </div>

        {/* ── Kuyruk (CSS üçgen) — kafayı işaret eder ──────────────
            İki üçgen üst üste: dıştaki kenarlık rengi, içteki gövde
            rengi. İç üçgen `strokeWidth` kadar dar/kısa olduğu için
            kenarlık yalnızca yanlarda ve uçta görünür. */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: "100%",
            width: 0,
            height: 0,
            marginLeft: -tailOuterHalf,
            borderLeft: `${tailOuterHalf}px solid transparent`,
            borderRight: `${tailOuterHalf}px solid transparent`,
            borderTop: `${tailOuterHalf + 1}px solid ${withAlpha(def.stroke, def.strokeOpacity)}`,
            filter: "drop-shadow(0 3px 4px rgba(6, 10, 20, 0.22))",
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: "100%",
            width: 0,
            height: 0,
            marginLeft: -tailHalf,
            borderLeft: `${tailHalf}px solid transparent`,
            borderRight: `${tailHalf}px solid transparent`,
            borderTop: `${tailHalf + 1}px solid ${def.hex}`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Baloncuk ömrü: mesaj gelince görünür, kaybolunca metni FADE süresince
 * koruyup sonra düğümü kaldırır.
 */
function useBubbleLifecycle(text: string | null | undefined): {
  shown: string | null;
  visible: boolean;
} {
  const [shown, setShown] = useState<string | null>(text ?? null);
  const [visible, setVisible] = useState<boolean>(Boolean(text));

  useEffect(() => {
    if (text) {
      setShown(text);
      setVisible(true);
      return;
    }
    // Mesaj silindi: yumuşakça kaybol, sonra düğümü kaldır.
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
