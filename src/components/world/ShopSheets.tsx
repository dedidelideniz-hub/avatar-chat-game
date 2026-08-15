import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { Check, Coins, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  CURRENCY_EMOJI,
  formatCoins,
  getProduct,
  productsOf,
  type Vendor,
} from "@/lib/shop";

function SheetBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[2px]"
    />
  );
}

const sheetPanel = {
  initial: { y: 40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 40, opacity: 0 },
  transition: { duration: 0.25, ease: "easeOut" as const },
};

/** Vendor stall — browse & buy products with Sanalika Parası. */
export function ShopSheet({
  vendor,
  coins,
  owned,
  onClose,
}: {
  vendor: Vendor;
  coins: number;
  owned: string[];
  onClose: () => void;
}) {
  const buyItem = useMutation(api.profiles.buyItem);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const products = productsOf(vendor.id);

  const handleBuy = async (productId: string) => {
    setBuyingId(productId);
    try {
      await buyItem({ productId });
      const product = getProduct(productId);
      toast.success(`${product?.emoji ?? ""} ${product?.name ?? "Ürün"} çantana eklendi!`);
    } catch (error) {
      console.error("Satın alma hatası:", error);
      toast.error(
        error instanceof Error ? error.message : "Satın alınamadı. Tekrar dene.",
      );
    } finally {
      setBuyingId(null);
    }
  };

  return (
    <>
      <SheetBackdrop onClose={onClose} />
      <motion.div
        {...sheetPanel}
        className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-lg rounded-t-3xl border border-b-0 border-border bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">
              {vendor.emoji} {vendor.name}
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
              Tezgâhtan bir şey al — hepsi çantanda birikir.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-extrabold"
              title="Sanalika Parası"
            >
              {CURRENCY_EMOJI} {formatCoins(coins)} SP
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full"
              onClick={onClose}
              aria-label="Tezgâhı kapat"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mt-5 grid max-h-[46vh] grid-cols-2 gap-3 overflow-y-auto pb-1 sm:grid-cols-3">
          {products.map((product) => {
            const isOwned = owned.includes(product.id);
            const isBuying = buyingId === product.id;
            const cantAfford = coins < product.price;
            return (
              <div
                key={product.id}
                className="flex flex-col rounded-2xl border border-border/70 bg-background p-3"
              >
                <span className="text-3xl leading-none">{product.emoji}</span>
                <p className="mt-2 text-sm font-extrabold leading-tight">
                  {product.name}
                </p>
                <p className="mt-1 line-clamp-2 flex-1 text-[11px] leading-4 text-muted-foreground">
                  {product.description}
                </p>
                {isOwned ? (
                  <span className="mt-2.5 inline-flex w-fit items-center gap-1 rounded-full bg-secondary/60 px-2.5 py-1 text-[11px] font-extrabold text-secondary-foreground">
                    <Check className="size-3" /> Sahipsin
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2.5 w-full rounded-full"
                    disabled={isBuying || cantAfford}
                    onClick={() => handleBuy(product.id)}
                  >
                    {isBuying ? (
                      <span className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    ) : (
                      <>
                        <Coins className="size-3.5" />
                        {product.price} SP
                      </>
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}

/** The player's bag — every owned product. */
export function BagSheet({
  items,
  coins,
  onClose,
  onBrowseStalls,
}: {
  items: string[];
  coins: number;
  onClose: () => void;
  onBrowseStalls: () => void;
}) {
  const owned = items
    .map((id) => getProduct(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  return (
    <>
      <SheetBackdrop onClose={onClose} />
      <motion.div
        {...sheetPanel}
        className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-lg rounded-t-3xl border border-b-0 border-border bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">
              🎒 Çantam{" "}
              <span className="text-sm font-bold text-muted-foreground">
                ({owned.length} ürün)
              </span>
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
              Caddeden topladıkların burada durur.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-extrabold"
              title="Sanalika Parası"
            >
              {CURRENCY_EMOJI} {formatCoins(coins)} SP
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-full"
              onClick={onClose}
              aria-label="Çantayı kapat"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {owned.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="text-5xl">🥺</span>
            <p className="text-base font-extrabold">Çantan şimdilik boş</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Caddedeki tezgâhlara uğra, sevdiğin ürünleri Sanalika Paranla
              topla.
            </p>
            <Button className="mt-1 rounded-full" onClick={onBrowseStalls}>
              Tezgâhlara git
            </Button>
          </div>
        ) : (
          <div className="mt-5 grid max-h-[46vh] grid-cols-2 gap-3 overflow-y-auto pb-1 sm:grid-cols-3">
            {owned.map((product) => (
              <div
                key={product.id}
                className="flex flex-col rounded-2xl border border-border/70 bg-background p-3"
              >
                <span className="text-3xl leading-none">{product.emoji}</span>
                <p className="mt-2 text-sm font-extrabold leading-tight">
                  {product.name}
                </p>
                <p className="mt-1 line-clamp-2 flex-1 text-[11px] leading-4 text-muted-foreground">
                  {product.description}
                </p>
                <span className="mt-2.5 inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-extrabold text-primary">
                  {CURRENCY_EMOJI} {product.price} SP
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </>
  );
}
