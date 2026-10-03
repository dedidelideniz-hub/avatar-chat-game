/**
 * ⚔️ BAHİSLİ DÜELLO SÖZLEŞMESİ (yüksek riskli PvP) — arayüz katmanı.
 *
 * ÜÇ PARÇA:
 *   · `WagerChallengeSheet` — meydan okuyanın "Bahis Kurma / Düello
 *     Sözleşmesi" penceresi: SP kaydırıcısı (min 100) + "Evini iddiaya koy"
 *     onay kutusu (yalnızca iki taraf da ev sahibiyse aktif).
 *   · `WagerInvitePopup` — karşı tarafa düşen şık meydan okuma bildirimi:
 *     "X seninle düello yapmak istiyor! Bahis: [500 SP] + [Ev adı]".
 *   · `WagerWaitingBanner` — davet gönderildi, cevap bekleniyor (iptal edilebilir).
 *   · `WagerAnnouncement` — arena başında geçen devasa kırmızı/altın duyuru.
 */
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/avatar";
import { CURRENCY_EMOJI, formatCoins } from "@/lib/shop";
import { playSound } from "@/lib/sounds";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { Home, Lock, ShieldAlert, Swords, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Sunucudaki alt sınırla aynı olmalı (`wagers.MIN_GOLD`). */
export const WAGER_MIN_GOLD = 100;

interface FighterInfo {
  name: string;
  config: AvatarConfig;
  equipped: string[];
  ability: string;
}

/** Bahis özetini insan okunur metne çevirir: "500 SP + Sokak No:4 Ev". */
export function describeWager(goldAmount: number, houseName?: string): string {
  const parts: string[] = [];
  if (goldAmount > 0) parts.push(`${formatCoins(goldAmount)} SP`);
  if (houseName) parts.push(`${houseName}`);
  return parts.length > 0 ? parts.join(" + ") : "Bahis yok";
}

/* ─────────────────────────────────────────────────────────────
   1) MEYDAN OKUMA FORMU (challenger)
   ───────────────────────────────────────────────────────────── */
export function WagerChallengeSheet({
  opponentName,
  myCoins,
  me,
  mySessionId,
  bot,
  onClose,
  onSent,
  onBotSent,
}: {
  opponentName: string;
  myCoins: number;
  me: FighterInfo;
  mySessionId: string;
  /**
   * BOT RAKİBİ: cadde botları gerçek `users/profiles/houses` satırı değildir —
   * SP-only ve yerel kabul akışı (`onBotSent`). Verilmezse gerçek oyuncu akışı.
   */
  bot?: { id: string; name: string };
  onClose: () => void;
  onSent: (info: {
    wagerId: string;
    opponentName: string;
    goldAmount: number;
    houseName?: string;
  }) => void;
  /** Bot bahsi gönderildi (sunucu çağrısı World'de yapılır). */
  onBotSent?: (info: { opponentName: string; goldAmount: number }) => void;
}) {
  // Bot rakibin profil satırı yok: challengeInfo sorgusu atlanır.
  const info = useQuery(
    api.wagers.challengeInfo,
    bot ? "skip" : { opponentName },
  );
  const createWager = useMutation(api.wagers.create);
  const [gold, setGold] = useState(() =>
    Math.min(myCoins, Math.max(WAGER_MIN_GOLD, 500)),
  );
  const [houseOn, setHouseOn] = useState(false);
  const [sending, setSending] = useState(false);

  const maxGold = Math.max(0, Math.floor(myCoins));
  const canWagerGold = maxGold >= WAGER_MIN_GOLD;
  // EV BAHİSİ: kaybedilirse ev RAKİBE geçer ve bir karakter iki eve sahip
  // olamaz (TEK EV kuralı) — bu yüzden rakip EVSİZ olmalı. Botlara karşı ev
  // bahsi hiç yoktur (devredilecek gerçek sahip yok).
  const myHouse = bot ? null : (info?.myHouse ?? null);
  const canWagerHouse =
    !bot &&
    myHouse !== null &&
    !myHouse.locked &&
    Boolean(info?.opponentCanReceiveHouse);

  const handleSend = async () => {
    if (sending) return;
    const amount = houseOn && !canWagerGold ? 0 : gold;
    if (amount <= 0 && !houseOn) {
      toast.error("En az bir bahis (SP veya ev) seçmelisin.");
      return;
    }
    setSending(true);
    try {
      if (bot) {
        // Bot bahsi: sunucuda yalnızca SP rehini var; kabul/red World'de.
        if (amount < WAGER_MIN_GOLD) {
          toast.error(`En az ${WAGER_MIN_GOLD} SP bahis koyabilirsin.`);
          return;
        }
        playSound("invite");
        onBotSent?.({ opponentName: bot.name, goldAmount: amount });
        return;
      }
      const res = await createWager({
        opponentName,
        goldAmount: amount,
        wageredHouseId:
          houseOn && myHouse ? (myHouse.id as Id<"houses">) : undefined,
        mySessionId,
        me,
      });
      playSound("invite");
      onSent({
        wagerId: res.wagerId,
        opponentName,
        goldAmount: amount,
        houseName: houseOn && myHouse ? myHouse.name : undefined,
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
              {bot && (
                <span className="rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-black tracking-widest text-amber-200">
                  BOT
                </span>
              )}
            </h2>
            <p className="truncate text-[11px] font-semibold text-amber-100/80">
              {opponentName} {bot ? "botuna" : "oyuncusuna"} meydan okuyorsun
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
          {/* ── a) ALTIN BAHİSİ ── */}
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

          {/* ── b) EV BAHİSİ (yalnızca gerçek oyuncular) ── */}
          {bot ? (
            <section className="rounded-2xl border border-amber-400/20 bg-black/25 p-3.5">
              <p className="flex items-start gap-2 text-[11px] font-bold text-amber-200/80">
                <Home className="mt-0.5 size-4 shrink-0 text-amber-300/70" />
                Botların evleri genelde BOŞ EV'dir ve devredilecek gerçek bir
                sahibi yoktur — botlara karşı yalnızca SP bahsi konur.
              </p>
            </section>
          ) : (
          <section className="rounded-2xl border border-amber-400/25 bg-black/25 p-3.5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={houseOn}
                disabled={!canWagerHouse}
                onChange={(e) => setHouseOn(e.target.checked)}
                className="mt-0.5 size-4 accent-rose-500"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-extrabold text-amber-100">
                  <Home className="size-4 text-rose-300" /> Evini İddiaya Koy
                </span>
                <span className="mt-0.5 block text-[11px] font-semibold text-amber-200/70">
                  {canWagerHouse
                    ? `${myHouse?.name} — kaybedersen mülkiyeti rakibe geçer!`
                    : !info
                      ? "Yükleniyor…"
                      : myHouse === null
                        ? "Önce bir evin olmalı (evine gir)."
                        : myHouse.locked
                          ? "Evin şu an süren bir bahiste rehin."
                          : "Rakibin zaten bir evi var — bir karakter en fazla BİR eve sahip olabilir."}
                </span>
              </span>
            </label>
            {houseOn && (
              <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-bold text-rose-200">
                <ShieldAlert className="size-3.5 shrink-0" />
                Kaybedersen evin rakibe devredilir. Bu geri alınamaz.
              </p>
            )}
          </section>
          )}

          {/* Özet */}
          <div className="flex items-center gap-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100">
            <Lock className="size-3.5 shrink-0 text-amber-300" />
            Bahis: {describeWager(gold, houseOn ? myHouse?.name : undefined)}
          </div>

          <div className="flex gap-3">
            <Button
              size="lg"
              disabled={sending || (!canWagerGold && !canWagerHouse)}
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
          {name} cevap veriyor… <span className="text-amber-300">[{summary}]</span>
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
