import { CHARACTER_COLORS, characterColorLabel } from "@/lib/avatar";
import { Crown, Lock } from "lucide-react";
import { toast } from "sonner";

/**
 * KARAKTER RENGİ PALETİ — TEK KAYNAK.
 *
 * Aynı palet İKİ yerde kullanılır ve ikisi de AYNI davranır:
 *   · oyun girişindeki "Karakter Rengi" kartı (`Entry`),
 *   · Avatar Stüdyosu'ndaki "Üst (Kıyafet)" bölümü (`Studio`).
 *
 * Kural (sunucuda da zorlanır, bkz. `profiles.saveProfile`):
 *   · Renk yalnızca VARSAYILAN görünümü boyar. Hazır karakter skini
 *     (Kraliyet Savaşçısı / Samuray / Şövalye) kuşanılmışsa palet kapalıdır.
 *   · Renk hakkı TEK SEFERLİKTİR (`locked`): seçtikten sonra değiştirmek için
 *     👑 VIP üyelik gerekir.
 *   · VIP renkleri parlayan/yari saydam premium renklerdir; VIP olmadan
 *     seçilemez (kilitli gösterilir).
 *
 * Bu bileşen hem seçimi (`onSelect`) hem de açıklama/uyarı satırlarını
 * çizer; iki sayfada farklı davranmasın diye hepsi burada toplandı.
 */
export function CharacterColorPicker({
  color,
  onSelect,
  isVip,
  locked,
  wornSkinName,
}: {
  /** Şu an seçili renk (hex). */
  color: string;
  /** Yeni renk seçildiğinde çağrılır. */
  onSelect: (hex: string) => void;
  isVip: boolean;
  /** Renk hakkı kullanıldı mı? (VIP değilse palet kilitlenir.) */
  locked: boolean;
  /** Kuşanılmış hazır görünümün adı — varsa renk seçimi tamamen kapalıdır. */
  wornSkinName?: string;
}) {
  // Hazır görünüm kuşanılmış: palet yerine bilgi kartı.
  if (wornSkinName) {
    return (
      <>
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-3 py-2.5 text-[11px] font-bold leading-5 text-amber-100">
          <Crown className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong>{wornSkinName}</strong> görünümü orijinal renklerini
            kullanır — hazır karakter modelleri boyanmaz. Kendi rengini seçmek
            için <strong>varsayılan</strong> görünüme geç.
          </span>
        </p>
        <p className="mt-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold leading-4 text-white/55">
          🎨 Renk hakkın harcanmadı: renk seçimi yalnızca varsayılan görünümde
          yapılır.
        </p>
        <p className="mt-3 flex items-center justify-between text-[11px] font-bold text-white/50">
          <span>Görünüm</span>
          <span className="text-amber-200">{wornSkinName}</span>
        </p>
      </>
    );
  }

  return (
    <>
      <div className="mt-3 grid grid-cols-6 gap-2">
        {CHARACTER_COLORS.map((c) => {
          const selected = c.hex === color;
          const premium = c.vip === true;
          const vipLocked = premium && !isVip;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                if (vipLocked) {
                  // VIP'ye özel premium renk: kilitliyken seçilemez,
                  // nereden alınacağı söylenir.
                  toast.info(
                    `👑 ${c.label} VIP üyeliğe özel — VIP alınca çantana eklenir.`,
                  );
                  return;
                }
                // Renk hakkı kullanıldıysa palet kilitlidir.
                if (locked && c.hex !== color) {
                  toast.info(
                    "🎨 Rengini bir kez seçtin — değiştirmek için 👑 VIP üyelik gerekiyor.",
                  );
                  return;
                }
                onSelect(c.hex);
              }}
              aria-label={c.label}
              aria-pressed={selected}
              title={vipLocked ? `${c.label} — VIP üyeliğe özel` : c.label}
              className={`group relative aspect-square w-full overflow-hidden rounded-2xl border transition-transform active:scale-95 ${
                selected
                  ? "border-white/80 ring-2 ring-amber-300 ring-offset-2 ring-offset-[#0a0f1c]"
                  : vipLocked
                    ? "border-amber-300/40"
                    : "border-white/15 hover:border-white/40"
              } ${vipLocked ? "opacity-60" : locked ? "opacity-70" : ""}`}
              style={
                premium
                  ? {
                      // Premium renkler düz değil: parlayan ve yarı saydam
                      // görünen bir küre (oyun içindeki parlama +
                      // şeffaflık efektinin palet hali).
                      background: `radial-gradient(circle at 32% 28%, #ffffff 0%, ${c.hex} 58%)`,
                      boxShadow: `0 0 16px ${c.hex}, inset 0 0 12px rgba(255,255,255,0.35)`,
                      borderColor: c.hex,
                      opacity: vipLocked ? 0.6 : 0.9,
                    }
                  : { backgroundColor: c.hex }
              }
            >
              {premium && (
                <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded-full bg-black/55 px-1 py-0.5 text-[7px] font-black tracking-wider text-amber-200 backdrop-blur">
                  {vipLocked ? (
                    <Lock className="size-2" />
                  ) : (
                    <Crown className="size-2" />
                  )}
                  VIP
                </span>
              )}
              {selected && (
                <span className="entry-color-pop absolute inset-0 rounded-2xl shadow-[0_0_22px_rgba(255,255,255,0.35)]" />
              )}
            </button>
          );
        })}
      </div>

      {locked ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-amber-300/25 bg-amber-300/10 px-2.5 py-1.5 text-[10px] font-bold leading-4 text-amber-100">
          <Lock className="mt-0.5 size-3 shrink-0" />
          Renk hakkını kullandın! Karakter rengi tek sefer seçilir —
          değiştirmek için 👑 VIP üyelik gerekiyor.
        </p>
      ) : (
        <p className="mt-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold leading-4 text-white/55">
          ⚠️ Renk hakkın <strong>tek seferlik</strong>: seçtiğin renk kalıcı
          olur (VIP üyeler serbestçe değiştirir).
        </p>
      )}

      <p className="mt-2 text-[10px] font-bold leading-4 text-amber-200/70">
        👑 VIP renkleri parlar ve yarı saydam boyanır — VIP alınca çantana
        düşer.
      </p>

      <p className="mt-3 flex items-center justify-between text-[11px] font-bold text-white/50">
        <span>Seçilen renk</span>
        <span className="text-amber-200">{characterColorLabel(color)}</span>
      </p>
    </>
  );
}
