/**
 * 🛒 MOBİLYA STANTI — ev eşyalarının Vaelos Parası (SP) ile alındığı yer.
 *
 * OYUN AKIŞI (ekonomi): oyuncu buradan eşya SATIN ALIR (SP düşer, eşya
 * DOLABINA girer — `convex/furniture.ts` → `buy`) ve satın aldığı eşyaları
 * evinde "Evi Düzenle" ile yerleştirir (`place`). Yani bu panel YALNIZCA satın
 * alma yapar; dizme odaya aittir (`RoomStage`). Aynı stant hem caddeden
 * (Tezgâhlar listesi) hem evin içinden (düzenleme tepsisindeki "🛒 Stant"
 * düğmesi) açılabilir: oyuncu "eşyam yok" durumunda kilitli bir eşyaya
 * dokunduğunda da buraya gelir.
 *
 * FİYAT İSTEMCİDE GÖSTERİLİR AMA DOĞRULANMAZ: satın alma sırasında fiyatı
 * sunucu katalogdan okur (`engine/roomBuild.FURNITURE`), yani buradaki tutar
 * yalnızca görüntüdür.
 */
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Coins, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  FURNITURE_CATEGORY_LABELS,
  countFree,
  countPlaced,
  furnitureById,
  furnitureOf,
  type FurnitureCategory,
} from "@/engine/roomBuild";
import { CURRENCY_EMOJI, formatCoins } from "@/lib/shop";
import { playSound } from "@/lib/sounds";

const CATEGORIES: FurnitureCategory[] = [
  "oturma",
  "yatak",
  "mutfak",
  "eğlence",
  "dekor",
];

export function FurnitureStandSheet({
  coins,
  onClose,
}: {
  /** Oyuncunun Vaelos Parası (SP) — alım gücü göstergesi. */
  coins: number;
  onClose: () => void;
}) {
  const owned = useQuery(api.furniture.myFurniture) ?? [];
  const buy = useMutation(api.furniture.buy);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [category, setCategory] = useState<FurnitureCategory>("oturma");
  const items = furnitureOf(category);

  const handleBuy = async (itemId: string) => {
    const def = furnitureById(itemId);
    setBusyId(itemId);
    try {
      await buy({ itemId });
      playSound("buy");
      toast.success(
        `${def.emoji} ${def.label} dolabına eklendi — evinde “Evi Düzenle” ile yerleştir.`,
      );
    } catch (error) {
      playSound("error");
      toast.error(
        error instanceof Error ? error.message : "Satın alınamadı. Tekrar dene.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[3px]"
      />

      <motion.div
        initial={{ y: 80, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 80, opacity: 0, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 360, damping: 28 }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg rounded-t-3xl border border-b-0 border-[#c8ab7d] bg-[#fdf3e0] p-4 shadow-2xl sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-[#3d2f2a]">
              🛋️ Mobilya Stantı
            </h2>
            <p className="mt-0.5 text-[11px] font-semibold text-[#7a5a37]">
              Eşyalar Vaelos Parası ile alınır ve dolabına girer; yerleştirmeyi
              evinde yaparsın.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1.5 rounded-full border border-[#d9a53b]/60 bg-[#f0c987]/40 px-3 py-1.5 text-[13px] font-extrabold text-[#7a4a12]"
              title="Vaelos Parası"
            >
              <Coins className="size-3.5" />
              {formatCoins(coins)} SP
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full text-[#3d2f2a] hover:bg-[#e6d2ae]"
              onClick={onClose}
              aria-label="Stantı kapat"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Gruplar: oturma / yatak / mutfak / eğlence / dekor. */}
        <div className="mt-3 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                playSound("click");
                setCategory(key);
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold transition-colors ${
                key === category
                  ? "bg-[#3d2f2a] text-[#fdf3e0]"
                  : "bg-[#e6d2ae] text-[#5c4326] hover:bg-[#dcc9a6]"
              }`}
            >
              {FURNITURE_CATEGORY_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="mt-2 grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto pb-1 sm:grid-cols-3">
          {items.map((item) => {
            const total =
              countPlaced(owned, item.id) + countFree(owned, item.id);
            const free = countFree(owned, item.id);
            const cantAfford = coins < item.price;
            const isBusy = busyId === item.id;
            return (
              <div
                key={item.id}
                className="flex flex-col rounded-2xl border border-[#d9c3a1] bg-white/70 p-2.5"
              >
                <span className="text-2xl leading-none">{item.emoji}</span>
                <p className="mt-1.5 text-[12.5px] font-extrabold leading-tight text-[#3d2f2a]">
                  {item.label}
                </p>
                <p className="mt-0.5 text-[10px] font-bold text-[#7a5a37]">
                  {total > 0
                    ? free > 0
                      ? `Dolabında ×${free}`
                      : "Hepsi odanda"
                    : "Henüz sende yok"}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-extrabold text-[#7a4a12]">
                    {CURRENCY_EMOJI} {formatCoins(item.price)}
                  </span>
                  <Button
                    size="sm"
                    disabled={isBusy || cantAfford}
                    onClick={() => void handleBuy(item.id)}
                    className="h-7 rounded-full px-3 text-[11px] font-extrabold"
                  >
                    {isBusy ? "Alınıyor…" : cantAfford ? "SP yok" : "Al"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}
