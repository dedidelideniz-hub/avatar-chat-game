/**
 * ⚔️ BAHİSLİ DÜELLO & 🏠 TAKAS — arayüz katmanı.
 *
 * PARÇALAR:
 *   · `WagerChallengeSheet` — "Düello Sözleşmesi": YALNIZCA SP (altın) bahsi.
 *     Ev bahsi buradan KALDIRILDI; ev/servet alışverişi artık ayrı TAKAS
 *     sayfasında yapılır (bkz. `TradeSheet`).
 *   · `TradeSheet` — TAKAS: iki karakter ortaya EV ve/veya PARA koyar;
 *     "Takası Onayla" → "Savaşa hazır ol" → takas maçı arenaya geçer.
 *   · `HousePreview` — bir karakterin evini izometrik (3B görünümlü) çizer;
 *     profil kartında evin adı/boyutu görünür.
 *   · `WagerInvitePopup` / `WagerWaitingBanner` / `WagerAnnouncement` —
 *     gelen meydan okuma, bekleyiş şeridi ve arena duyurusu.
 *
 * ⚠️ RAKİP TÜRÜ GÖRÜNMEZ: cadde sakinlerinin bir kısmı istemcide yaşayan
 * NPC'lerdir, ama form İKİ DURUMDA DA BİREBİR AYNIDIR; ayrım yalnızca `local`
 * prop'unda (hangi akışın çağrılacağı) kalır. Arayüzde "NPC/bot" izi yoktur.
 */
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/avatar";
import { CURRENCY_EMOJI, formatCoins } from "@/lib/shop";
import { playSound } from "@/lib/sounds";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRightLeft, Lock, Swords, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** Sunucudaki alt sınırla aynı olmalı (`wagers.MIN_GOLD`). */
export const WAGER_MIN_GOLD = 100;

interface FighterInfo {
  name: string;
  config: AvatarConfig;
  equipped: string[];
  ability: string;
}

/** Bahis özetini insan okunur metne çevirir: "500 SP". */
export function describeWager(goldAmount: number, houseName?: string): string {
  const parts: string[] = [];
  if (goldAmount > 0) parts.push(`${formatCoins(goldAmount)} SP`);
  if (houseName) parts.push(`${houseName}`);
  return parts.length > 0 ? parts.join(" + ") : "Bahis yok";
}

/* ─────────────────────────────────────────────────────────────
   🏠 EV ÖNİZLEMESİ — izometrik (3B görünümlü) ev / 🪑 boş oda
   ───────────────────────────────────────────────────────────── */

/**
 * 🪑 BOŞ ODA — cadde sakinlerinin (NPC) evi: mobilyasız, sade bir oda.
 * `tone` zemin rengini belirler; böylece her karakterin odası farklı görünür.
 */
function EmptyRoom({ tone }: { tone: string }) {
  return (
    <svg viewBox="0 0 120 104" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="hpWallL" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5ecda" />
          <stop offset="100%" stopColor="#e6d5b6" />
        </linearGradient>
        <linearGradient id="hpFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e7d3ad" />
          <stop offset="100%" stopColor="#c9ac7d" />
        </linearGradient>
        <radialGradient id="hpWin" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#bae6fd" />
        </radialGradient>
      </defs>
      {/* tavan + arka duvarlar */}
      <rect width="120" height="104" fill="#f8f0e1" />
      <polygon points="12,52 60,28 60,50 12,74" fill="url(#hpWallL)" />
      <polygon points="108,52 60,28 60,50 108,74" fill="#dcc8a4" />
      {/* zemin (izometrik elmas) — karaktere göre tonlanır */}
      <polygon points="60,50 108,74 60,98 12,74" fill="url(#hpFloor)" />
      <polygon points="60,50 108,74 60,98 12,74" fill={tone} opacity="0.22" />
      {/* parke çizgisi + eteklik */}
      <polygon points="60,62 84,74 60,86 36,74" fill="none" stroke="#00000018" strokeWidth="0.8" />
      <polyline points="12,74 60,50 108,74" fill="none" stroke="#00000022" strokeWidth="1" />
      {/* arka duvarda boş kapı */}
      <polygon points="26.4,44.8 36,40 36,62 26.4,66.8" fill="#3d2f2a" />
      <polygon points="28,46 34,42.2 34,60 28,63.8" fill="#5a453c" />
      {/* pencereden gün ışığı */}
      <polygon points="81.6,38.8 91.2,43.6 91.2,65.6 81.6,60.8" fill="url(#hpWin)" />
      <polyline points="81.6,38.8 91.2,43.6 91.2,65.6 81.6,60.8" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.8" />
      {/* tavan lambası */}
      <circle cx="60" cy="31" r="3" fill="#fff4cf" />
      <circle cx="60" cy="31" r="6" fill="#fff4cf" opacity="0.3" />
    </svg>
  );
}

export function HousePreview({
  name,
  tone = "#c98a5a",
  sizeLabel = "3B · 1 oda",
  image,
  empty,
  hint = "🏠 Karakterin evini göster",
  className,
}: {
  /** Evin adı (levhada yazar). Yoksa "Ev yok". */
  name?: string;
  /** Çatı/duvar tonu — sahibinin rengine göre değişebilir. */
  tone?: string;
  /** Boyut etiketi (ör. "3B · 1 oda"). */
  sizeLabel?: string;
  /**
   * 📸 GERÇEK EV FOTOĞRAFI (data-URL) — oda canvas'ından yakalanır ve odanın
   * İÇİNDEKİ EŞYALARA KADAR birebir görünür. Yoksa izometrik çizim gösterilir.
   */
  image?: string | null;
  /** 🪑 Cadde sakinleri (NPC): mobilyasız BOŞ ODA çiz (gerçek fotoğraf yok). */
  empty?: boolean;
  /** Kapalı hâldeki "göster" düğmesinin yazısı. */
  hint?: string;
  className?: string;
}) {
  const hasHouse = Boolean(name);
  // 🏠 Ev PROFİLDE DOĞRUDAN görünmez: yalnızca "Karakterin evini göster"
  // yazısına dokununca açılır.
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex w-full items-center justify-center gap-1.5 rounded-2xl border border-[#3d2f2a]/15 bg-gradient-to-b from-[#fdf6e3] to-[#f0e4cb] px-3 py-2.5 text-[11px] font-extrabold text-[#3d2f2a] shadow-sm transition-colors hover:from-[#faf0da] hover:to-[#e9d9ba] ${className ?? ""}`}
      >
        {hint}
      </button>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-[#3d2f2a]/15 bg-gradient-to-b from-sky-100 to-emerald-100 p-2 ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Evi gizle"
        className="absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-full bg-black/30 text-white transition-colors hover:bg-black/50"
      >
        <X className="size-3.5" />
      </button>
      <div className="relative aspect-[6/5] w-full overflow-hidden rounded-xl bg-gradient-to-b from-sky-100 to-emerald-100">
        {image ? (
          <img
            src={image}
            alt={name ?? "Ev"}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : empty ? (
          <EmptyRoom tone={tone} />
        ) : (
          <svg viewBox="0 0 120 104" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="hpSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dbeeff" />
            <stop offset="100%" stopColor="#effbe9" />
          </linearGradient>
          <linearGradient id="hpRoof" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#c2620f" />
            <stop offset="100%" stopColor="#7c2d12" />
          </linearGradient>
          <radialGradient id="hpGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#fff7d6" />
            <stop offset="100%" stopColor="#fde68a" />
          </radialGradient>
        </defs>
        {/* gökyüzü + güneş + bulutlar */}
        <rect width="120" height="104" fill="url(#hpSky)" />
        <circle cx="100" cy="20" r="12" fill="#fde68a" opacity="0.3" />
        <circle cx="100" cy="20" r="8" fill="#fde68a" opacity="0.9" />
        <ellipse cx="27" cy="23" rx="11" ry="4" fill="#ffffff" opacity="0.8" />
        <ellipse cx="36" cy="26" rx="7" ry="3" fill="#ffffff" opacity="0.7" />
        {/* zemin */}
        <ellipse cx="60" cy="88" rx="50" ry="14" fill="#8fdd83" />
        <ellipse cx="60" cy="90" rx="38" ry="9" fill="#6dc763" opacity="0.55" />
        {/* kapı yolu */}
        <polygon points="60,72 70,77 60,83 50,78" fill="#e7d6b8" opacity="0.9" />
        {/* gövde (izometrik kutu) */}
        <polygon points="60,34 96,52 60,70 24,52" fill={tone} />
        <polygon points="24,52 60,70 60,92 24,74" fill="#8a5a34" />
        <polygon points="96,52 60,70 60,92 96,74" fill="#a9703f" />
        {/* çatı */}
        <polygon points="60,18 100,40 60,36 20,40" fill="#7f1d1d" />
        <polygon points="60,18 100,40 60,50 20,40" fill="url(#hpRoof)" />
        {/* kapı */}
        <polygon points="60,62 69,66.5 60,71 51,66.5" fill="#3d2f2a" />
        <polygon points="66,65.8 66,71 62,72.7 62,67" fill="#5a453c" opacity="0.85" />
        {/* pencereler (sıcak ışıklı) — duvar yüzeylerine oturan eğik dörtgenler */}
        <polygon points="87,62 74.4,68.3 74.4,78.2 87,71.9" fill="url(#hpGlow)" />
        <polygon points="33,62 45.6,68.3 45.6,78.2 33,71.9" fill="url(#hpGlow)" />
        {/* ağaç */}
        <rect x="13" y="72" width="3" height="12" fill="#8b5a3c" />
        <circle cx="14.5" cy="66" r="10" fill="#4ea152" />
        <circle cx="9" cy="70" r="6" fill="#57b45c" />
        <circle cx="16" cy="72" r="5" fill="#3f8f46" opacity="0.7" />
          </svg>
        )}
        {!hasHouse && !image && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-[11px] font-extrabold text-[#3d2f2a]/70">
            Ev yok
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-extrabold text-[#2b2320]">
          {name ?? "Henüz ev yok"}
        </p>
        <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-bold text-[#3d2f2a]/70">
          {sizeLabel}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   1) MEYDAN OKUMA FORMU (challenger) — YALNIZ SP
   ───────────────────────────────────────────────────────────── */
export function WagerChallengeSheet({
  opponentName,
  myCoins,
  me,
  mySessionId,
  local,
  onClose,
  onSent,
  onLocalSent,
}: {
  opponentName: string;
  myCoins: number;
  me: FighterInfo;
  mySessionId: string;
  /**
   * Rakibin `profiles` satırı YOK (cadde sakini) → davet yerel akışla yürür
   * (`onLocalSent`). ArayüzDE HİÇBİR FARK YOKTUR.
   */
  local?: boolean;
  onClose: () => void;
  onSent: (info: {
    wagerId: string;
    opponentName: string;
    goldAmount: number;
    houseName?: string;
  }) => void;
  /** Yerel rakip için bahis gönderildi (sunucu çağrısı World'de yapılır). */
  onLocalSent?: (info: {
    opponentName: string;
    goldAmount: number;
    houseId?: string;
    houseName?: string;
  }) => void;
}) {
  const createWager = useMutation(api.wagers.create);
  const [gold, setGold] = useState(() =>
    Math.min(myCoins, Math.max(WAGER_MIN_GOLD, 500)),
  );
  const [sending, setSending] = useState(false);

  const maxGold = Math.max(0, Math.floor(myCoins));
  const canWagerGold = maxGold >= WAGER_MIN_GOLD;

  const handleSend = async () => {
    if (sending) return;
    if (gold <= 0) {
      toast.error("En az bir bahis (SP) seçmelisin.");
      return;
    }
    setSending(true);
    try {
      if (local) {
        playSound("invite");
        onLocalSent?.({ opponentName, goldAmount: gold });
        return;
      }
      const res = await createWager({
        opponentName,
        goldAmount: gold,
        mySessionId,
        me,
      });
      playSound("invite");
      onSent({
        wagerId: res.wagerId,
        opponentName,
        goldAmount: gold,
      });
    } catch (error) {
      console.error("Bahis daveti hatası:", error);
      toast.error(
        error instanceof Error ? error.message : "Davet gönderilemedi.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 80, opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 360, damping: 27 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-t-3xl border-2 border-amber-400/50 bg-gradient-to-b from-[#241a12] to-[#160f0a] text-amber-50 shadow-2xl sm:rounded-3xl"
      >
        {/* Başlık şeridi */}
        <div className="relative flex items-center gap-3 border-b border-amber-400/25 bg-[linear-gradient(90deg,#7f1d1d,#b45309)] px-5 py-4">
          <Swords className="size-6 shrink-0 text-amber-200" />
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-base font-black tracking-wide">
              DÜELLO SÖZLEŞMESİ
            </h2>
            <p className="truncate text-[11px] font-semibold text-amber-100/80">
              {opponentName} oyuncusuna meydan okuyorsun
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex size-8 items-center justify-center rounded-full bg-black/25 text-amber-100 transition-colors hover:bg-black/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* ── ALTIN BAHİSİ ── */}
          <section>
            <div className="flex items-center justify-between">
              <label
                htmlFor="wager-gold"
                className="text-sm font-extrabold text-amber-100"
              >
                {CURRENCY_EMOJI} Para / Altın Bahsi
              </label>
              <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-sm font-black text-amber-200">
                {formatCoins(gold)} SP
              </span>
            </div>
            {canWagerGold ? (
              <>
                <input
                  id="wager-gold"
                  type="range"
                  min={WAGER_MIN_GOLD}
                  max={maxGold}
                  step={50}
                  value={Math.min(gold, maxGold)}
                  onChange={(e) => setGold(Number(e.target.value))}
                  className="mt-3 w-full accent-amber-400"
                />
                <div className="mt-1 flex justify-between text-[10px] font-bold text-amber-200/60">
                  <span>min {WAGER_MIN_GOLD} SP</span>
                  <span>kasan: {formatCoins(maxGold)} SP</span>
                </div>
              </>
            ) : (
              <p className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-200">
                Altın bahsi için en az {WAGER_MIN_GOLD} SP gerekiyor — kasanda{" "}
                {formatCoins(maxGold)} SP var.
              </p>
            )}
          </section>

          {/* Ev / servet alışverişi ayrı TAKAS sayfasında yapılır. */}
          <p className="flex items-center gap-1.5 rounded-xl bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-100/80">
            <ArrowRightLeft className="size-3.5 shrink-0 text-amber-300" />
            Evinizi ortaya koymak için profilinden <b>Takas Et</b>'i kullan.
          </p>

          {/* Özet */}
          <div className="flex items-center gap-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100">
            <Lock className="size-3.5 shrink-0 text-amber-300" />
            Bahis: {describeWager(gold)}
          </div>

          <div className="flex gap-3">
            <Button
              size="lg"
              disabled={sending || !canWagerGold}
              className="flex-1 rounded-full bg-gradient-to-r from-red-600 to-amber-500 font-black text-white shadow-lg hover:from-red-500 hover:to-amber-400"
              onClick={handleSend}
            >
              <Swords className="size-4" /> {sending ? "Gönderiliyor…" : "Meydan Oku"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full border-amber-300/40 bg-transparent text-amber-100 hover:bg-amber-400/10"
              onClick={onClose}
            >
              Vazgeç
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   1b) 🏠 TAKAS SAYFASI — iki karakter ev ve/veya para koyar
   ───────────────────────────────────────────────────────────── */
export const TRADE_MIN_GOLD = 100;

export function TradeSheet({
  opponentName,
  myCoins,
  myHouse,
  opponentHouseName,
  onClose,
  onConfirm,
}: {
  opponentName: string;
  myCoins: number;
  /** Benim evim (yoksa ev koyamam). */
  myHouse: { id: string; name: string } | null;
  /** Rakibin ortaya koyacağı evin adı (yerel rakipte değersiz/boş ev). */
  opponentHouseName?: string;
  onClose: () => void;
  onConfirm: (info: {
    goldAmount: number;
    houseId?: string;
    houseName?: string;
    houseStaked: boolean;
    opponentGoldAmount: number;
  }) => void;
}) {
  const [houseOn, setHouseOn] = useState(false);
  const [goldOn, setGoldOn] = useState(true);
  const [gold, setGold] = useState(() =>
    Math.min(myCoins, Math.max(TRADE_MIN_GOLD, 500)),
  );
  const [ready, setReady] = useState(false);

  const maxGold = Math.max(0, Math.floor(myCoins));
  const canWagerGold = maxGold >= TRADE_MIN_GOLD;
  const houseStaked = houseOn && myHouse !== null;
  const goldAmount = goldOn && canWagerGold ? Math.min(gold, maxGold) : 0;
  const valid = houseStaked || goldAmount > 0;

  // Rakip ortaya eşit değerde bir servet koyar (yerel rakipte boş ev + eşit SP).
  const opponentGoldAmount = goldAmount;

  // "Takası onayla" → kısa bir "savaşa hazır ol" perdesi → arena.
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => {
      onConfirm({
        goldAmount,
        houseId: houseStaked ? myHouse?.id : undefined,
        houseName: houseStaked ? myHouse?.name : undefined,
        houseStaked,
        opponentGoldAmount,
      });
    }, 900);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 80, opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 360, damping: 27 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl border-2 border-emerald-400/50 bg-gradient-to-b from-[#12241a] to-[#0a160f] text-emerald-50 shadow-2xl sm:rounded-3xl"
      >
        {/* Başlık şeridi */}
        <div className="relative flex items-center gap-3 border-b border-emerald-400/25 bg-[linear-gradient(90deg,#064e3b,#0f766e)] px-5 py-4">
          <ArrowRightLeft className="size-6 shrink-0 text-emerald-200" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black tracking-wide">TAKAS</h2>
            <p className="truncate text-[11px] font-semibold text-emerald-100/80">
              {opponentName} ile ev/para takası — kazanan hepsini alır
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex size-8 items-center justify-center rounded-full bg-black/25 text-emerald-100 transition-colors hover:bg-black/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* İki sütun: SEN / RAKİP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-emerald-400/25 bg-black/25 p-3">
              <p className="text-[10px] font-black tracking-widest text-emerald-300">
                SEN
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-extrabold">
                {houseStaked ? "🏠 " + (myHouse?.name ?? "Ev") : "🏠 Ev yok"}
              </p>
              <p className="mt-0.5 text-xs font-extrabold text-amber-200">
                {CURRENCY_EMOJI} {formatCoins(goldAmount)} SP
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-400/25 bg-black/25 p-3">
              <p className="text-[10px] font-black tracking-widest text-emerald-300">
                {opponentName.toUpperCase()}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-extrabold">
                🏠 {opponentHouseName ?? "Boş Ev"}
              </p>
              <p className="mt-0.5 text-xs font-extrabold text-amber-200">
                {CURRENCY_EMOJI} {formatCoins(opponentGoldAmount)} SP
              </p>
            </div>
          </div>

          {/* Ev koy */}
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-400/20 bg-black/20 p-3">
            <input
              type="checkbox"
              checked={houseOn}
              disabled={myHouse === null}
              onChange={(e) => setHouseOn(e.target.checked)}
              className="mt-0.5 size-4 accent-emerald-500"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-extrabold">
                🏠 Evini Takasa Koy
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold text-emerald-200/70">
                {myHouse === null
                  ? "Önce bir evin olmalı (evine gir)."
                  : houseOn
                    ? "Kaybedersen evin rakibe geçer!"
                    : "Evin: " + myHouse.name}
              </span>
            </span>
          </label>

          {/* Para koy */}
          <section className="rounded-2xl border border-emerald-400/20 bg-black/20 p-3">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={goldOn}
                disabled={!canWagerGold}
                onChange={(e) => setGoldOn(e.target.checked)}
                className="size-4 accent-emerald-500"
              />
              <span className="text-sm font-extrabold">
                {CURRENCY_EMOJI} Para Ekle
              </span>
              <span className="ml-auto rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-black text-amber-200">
                {formatCoins(goldAmount)} SP
              </span>
            </label>
            {goldOn && canWagerGold && (
              <>
                <input
                  type="range"
                  min={TRADE_MIN_GOLD}
                  max={maxGold}
                  step={50}
                  value={Math.min(gold, maxGold)}
                  onChange={(e) => setGold(Number(e.target.value))}
                  className="mt-3 w-full accent-emerald-400"
                />
                <div className="mt-1 flex justify-between text-[10px] font-bold text-emerald-200/60">
                  <span>min {TRADE_MIN_GOLD} SP</span>
                  <span>kasan: {formatCoins(maxGold)} SP</span>
                </div>
              </>
            )}
          </section>

          <div className="flex items-center gap-2 rounded-xl bg-emerald-400/10 px-3 py-2 text-xs font-bold">
            <Lock className="size-3.5 shrink-0 text-emerald-300" />
            Takas: {describeWager(goldAmount, houseStaked ? myHouse?.name : undefined)}
          </div>

          <Button
            size="lg"
            disabled={!valid || ready}
            className="w-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 font-black text-white shadow-lg hover:from-emerald-500 hover:to-teal-400"
            onClick={() => {
              playSound("invite");
              setReady(true);
            }}
          >
            <ArrowRightLeft className="size-4" /> Takası Onayla
          </Button>
          <p className="text-center text-[11px] font-bold text-emerald-200/70">
            Savaşa hazır ol ⚔️ — 3 raunt
          </p>
        </div>

        {/* Savaşa hazır ol perdesi */}
        <AnimatePresence>
          {ready && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/80"
            >
              <motion.p
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="text-center text-xl font-black tracking-widest text-emerald-200"
              >
                ⚔️ SAVAŞA HAZIR OL
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   2) GELEN MEYDAN OKUMA BİLDİRİMİ (target)
   ───────────────────────────────────────────────────────────── */
export interface IncomingWager {
  wagerId: string;
  challengerName: string;
  challenger: FighterInfo;
  goldAmount: number;
  wageredHouseName?: string;
  createdAt: number;
}

export function WagerInvitePopup({
  invite,
  busy,
  onAccept,
  onDecline,
}: {
  invite: IncomingWager;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const hasHouse = Boolean(invite.wageredHouseName);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.82, y: 26, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 12, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        className="w-full max-w-sm overflow-hidden rounded-3xl border-2 border-amber-400/60 bg-gradient-to-b from-[#241a12] to-[#150e09] text-center text-amber-50 shadow-2xl"
      >
        <div className="bg-[linear-gradient(90deg,#7f1d1d,#b45309)] px-5 py-2.5">
          <p className="text-[11px] font-black tracking-[0.28em] text-amber-100">
            ⚔️ MEYDAN OKUMA
          </p>
        </div>
        <div className="px-6 pb-6 pt-5">
          <div className="mx-auto flex w-fit items-center justify-center gap-4">
            <div className="relative shrink-0">
              <AvatarPreview
                config={invite.challenger.config ?? DEFAULT_AVATAR}
                className="block h-20 w-auto"
              />
              <EquippedItems
                equipped={invite.challenger.equipped ?? []}
                className="pointer-events-none absolute inset-0 h-20 w-auto"
              />
            </div>
            <Swords className="size-9 animate-bounce text-amber-400" />
          </div>
          <h2 className="mt-4 text-base font-black leading-snug">
            {invite.challengerName} seninle düello yapmak istiyor!
          </h2>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {invite.goldAmount > 0 && (
              <span className="rounded-full bg-amber-400/20 px-3 py-1 text-sm font-black text-amber-200">
                {CURRENCY_EMOJI} {formatCoins(invite.goldAmount)} SP
              </span>
            )}
            {hasHouse && (
              <span className="rounded-full bg-rose-500/20 px-3 py-1 text-sm font-black text-rose-200">
                🏠 {invite.wageredHouseName}
              </span>
            )}
          </div>
          {hasHouse && (
            <p className="mt-3 text-[11px] font-bold text-rose-200/90">
              Kazanan hepsini alır — ev de el değiştirir!
            </p>
          )}
          <div className="mt-5 flex gap-3">
            <Button
              size="lg"
              disabled={busy}
              className="flex-1 rounded-full bg-gradient-to-r from-red-600 to-amber-500 font-black text-white shadow-lg hover:from-red-500 hover:to-amber-400"
              onClick={onAccept}
            >
              <Swords className="size-4" /> {busy ? "…" : "Kabul Et"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={busy}
              className="flex-1 rounded-full border-amber-300/40 bg-transparent text-amber-100 hover:bg-amber-400/10"
              onClick={onDecline}
            >
              Reddet
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   3) BEKLEME ŞERİDİ (challenger)
   ───────────────────────────────────────────────────────────── */
export function WagerWaitingBanner({
  name,
  summary,
  onCancel,
}: {
  name: string;
  summary: string;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border-2 border-amber-400/50 bg-[#241a12] px-4 py-2.5 shadow-xl">
        <span className="size-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        <p className="text-xs font-extrabold text-amber-100">
          {name} cevap veriyor…{" "}
          <span className="text-amber-300">[{summary}]</span>
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="flex size-7 items-center justify-center rounded-full bg-white/10 text-amber-100 transition-colors hover:bg-white/20"
          aria-label="Bahsi iptal et"
        >
          <X className="size-4" />
        </button>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   4) ARENA DUYURUSU (high-stakes)
   ───────────────────────────────────────────────────────────── */
export function WagerAnnouncement({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="pointer-events-none absolute inset-x-0 top-1/3 z-40 flex justify-center px-4"
        >
          <motion.div
            animate={{
              boxShadow: [
                "0 0 24px rgba(239,68,68,0.5)",
                "0 0 44px rgba(245,158,11,0.75)",
                "0 0 24px rgba(239,68,68,0.5)",
              ],
            }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="rounded-2xl border-2 border-amber-400/70 bg-[linear-gradient(90deg,#7f1d1d,#b45309,#7f1d1d)] px-5 py-3 text-center"
          >
            <p className="text-sm font-black tracking-wider text-amber-50 sm:text-base">
              YÜKSEK BAHİSLİ DÜELLO: KAZANAN HEPSİNİ ALIR!
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
