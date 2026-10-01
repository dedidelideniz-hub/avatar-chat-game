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
 *
 * ══════════════════════════════════════════════════════════════════
 * ÖMÜR (5 sn + yumuşak kaybolma) — TEK KAYNAK
 *   · Gönderen taraf mesajı `text` prop'una verir (World'de sohbet
 *     girdisi gönderilince `setBubble(...)`).
 *   · Baloncuk `CHAT_BUBBLE_MS` (5 sn) boyunca görünür kalır; süre
 *     dolduğunda `text` null'a döner ve DOM `CHAT_BUBBLE_FADE_MS`
 *     boyunca yumuşakça (opacity + hafif kayma) kaybolur.
 *   · Kaybolma sırasında METİN KORUNUR (`shown`), yoksa yazı bir kare
 *     içinde yok olurdu; geçiş bittikten sonra düğüm kaldırılır.
 *
 * ══════════════════════════════════════════════════════════════════
 * RENK
 *   · Varsayılan `beyaz` = beyaz gövde + koyu yazı + ince kenarlık
 *     (Sanalika/Habbo görünümü).
 *   · VIP balon renkleri (`BUBBLE_COLORS`) zaten gövde/yazı/kenarlık
 *     üçlüsünü tanımlar; bu yüzden burada renk SABİTLENMEZ, oyuncunun
 *     seçtiği balon rengi kullanılır (`bubbleColorOf`).
 *
 * Baloncuk METNİ World tarafından kısaltılır (uzun mesaj `…` ile kesilir).
 */

/** Baloncuk ekranda kaç ms kalır (World'deki zamanlayıcı da bunu kullanır). */
export const CHAT_BUBBLE_MS = 5000;
/** Kaybolma yumuşaklığı (ms): opacity + hafif aşağı kayma geçişi. */
export const CHAT_BUBBLE_FADE_MS = 320;

/** Baş üstü çapası — karakterin tepesinin biraz üstü. */
export const CHAT_BUBBLE_HEIGHT = 2.2;

/** `#rrggbb` + alfa → `rgba(...)`; kenarlığın şeffaf tonları için. */
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

/**
 * Baloncuğun GÖVDESİ — saf DOM (3D bağımlılığı yok).
 *
 * Ayrı tutulmasının nedeni: `scripts/preview-ui.tsx` bu bileşeni WebGL
 * olmadan render edip baloncuğun stilini/metnini/kaybolma durumunu
 * doğrulayabiliyor.
 */
export function ChatBubbleBody({
  text,
  colorId = DEFAULT_BUBBLE_COLOR,
  visible = true,
}: {
  text: string;
  /** `BUBBLE_COLORS` id'si (beyaz, nane, ...). */
  colorId?: string;
  /** false → kaybolma geçişi (opacity 0). */
  visible?: boolean;
}) {
  const def = bubbleColorOf(colorId);
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        userSelect: "none",
        // `center` + bu kaydırma: baloncuğun alt kenarı kafanın üstüne oturur.
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
            border: `1px solid ${withAlpha(def.stroke, def.strokeOpacity)}`,
            boxShadow: "0 6px 18px rgba(6, 10, 20, 0.28)",
            fontFamily:
              "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.35,
            letterSpacing: 0.1,
            textAlign: "center",
            maxWidth: 150,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            textShadow: "0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          {text}
        </div>

        {/* ── Kuyruk (CSS üçgen) — kafayı işaret eder ──────────────
            İki üçgen üst üste: dıştaki kenarlık rengi, içteki gövde
            rengi. İç üçgen 1px dar/kısa olduğu için kenarlık yalnızca
            yanlarda ve uçta görünür. */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: "100%",
            width: 0,
            height: 0,
            marginLeft: -9,
            borderLeft: "9px solid transparent",
            borderRight: "9px solid transparent",
            borderTop: `10px solid ${withAlpha(def.stroke, def.strokeOpacity)}`,
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
            marginLeft: -8,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: `9px solid ${def.hex}`,
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
  colorId = DEFAULT_BUBBLE_COLOR,
  position = [0, CHAT_BUBBLE_HEIGHT, 0],
  distanceFactor = 10,
}: {
  /** Mesaj metni; null → baloncuk kaybolur. */
  text: string | null | undefined;
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
      // Baloncuk katmanını oyun girdisini yakalamaz yapar: drei `<Html>`
      // canvas'ın KARDEŞİ bir DOM katmanı oluşturur, `pointerEvents="none"`
      // olmadan baloncuğun kapladığı alan dokunmatik joystick/yürüme
      // dokunuşlarını yutardı.
      pointerEvents="none"
      zIndexRange={[10, 0]}
    >
      <ChatBubbleBody text={shown} colorId={colorId} visible={visible} />
    </Html>
  );
}
