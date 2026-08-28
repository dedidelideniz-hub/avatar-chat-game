import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { Check, Coins, Crown as CrownIcon, Shirt, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  BUBBLE_COLORS,
  CURRENCY_EMOJI,
  formatCoins,
  getProduct,
  productsOf,
  VIP_DURATION_DAYS,
  VIP_PRICE,
  WEAR_SLOT_LABELS,
  type Vendor,
} from "@/lib/shop";
import { playSound } from "@/lib/sounds";

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

/** Market sheets pop up quickly with a soft spring — opens in a moment. */
const sheetPanel = {
  initial: { y: 70, opacity: 0, scale: 0.96 },
  animate: { y: 0, opacity: 1, scale: 1 },
  exit: { y: 70, opacity: 0, scale: 0.96 },
  transition: { type: "spring" as const, stiffness: 380, damping: 27, mass: 0.85 },
};

/* ── Smoke particle system for gaming-style preview ────────── */

const SMOKE_COUNT = 40;

function SmokeParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(
    () =>
      Array.from({ length: SMOKE_COUNT }, (_, i) => ({
        x: (Math.random() - 0.5) * 1.2,
        baseY: Math.random() * 0.3 - 0.5,
        z: (Math.random() - 0.5) * 1.2,
        speed: 0.15 + Math.random() * 0.25,
        scale: 0.08 + Math.random() * 0.15,
        phase: Math.random() * Math.PI * 2,
        drift: (Math.random() - 0.5) * 0.3,
      })),
    [],
  );

  useFrame((_, dt) => {
    if (!meshRef.current) return;
    const t = performance.now() / 1000;
    particles.forEach((p, i) => {
      const y = p.baseY + ((t * p.speed) % 2.0);
      const opacity = Math.max(0, 1 - y * 0.8);
      dummy.position.set(
        p.x + Math.sin(t * 0.5 + p.phase) * p.drift,
        y,
        p.z + Math.cos(t * 0.4 + p.phase) * p.drift,
      );
      dummy.scale.setScalar(p.scale * (1 + y * 0.3));
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      const color = new THREE.Color(0x8888aa).multiplyScalar(0.4 + opacity * 0.6);
      meshRef.current!.setColorAt(i, color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SMOKE_COUNT]}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial transparent opacity={0.35} depthWrite={false} />
    </instancedMesh>
  );
}

/* ── Glowing floor ring ───────────────────────────────────── */

function GlowRing() {
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ringRef.current) {
      const t = performance.now() / 1000;
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.3 + Math.sin(t * 2) * 0.15;
      ringRef.current.rotation.y = t * 0.5;
    }
  });
  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]}>
      <ringGeometry args={[0.35, 0.6, 32]} />
      <meshBasicMaterial color="#6366f1" transparent opacity={0.3} side={THREE.DoubleSide} />
    </mesh>
  );
}

/* ── Rising energy particles (tiny sparks) ─────────────────── */

const SPARK_COUNT = 20;

function EnergySparks() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const sparks = useMemo(
    () =>
      Array.from({ length: SPARK_COUNT }, () => ({
        x: (Math.random() - 0.5) * 0.8,
        z: (Math.random() - 0.5) * 0.8,
        speed: 0.4 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        size: 0.015 + Math.random() * 0.02,
      })),
    [],
  );

  useFrame(() => {
    if (!meshRef.current) return;
    const t = performance.now() / 1000;
    sparks.forEach((s, i) => {
      const rawY = ((t * s.speed + s.phase) % 1.5);
      const y = rawY - 0.4;
      dummy.position.set(
        s.x + Math.sin(t * 2 + s.phase) * 0.1,
        y,
        s.z + Math.cos(t * 1.5 + s.phase) * 0.1,
      );
      dummy.scale.setScalar(s.size * (1 - rawY / 1.5));
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SPARK_COUNT]}>
      <sphereGeometry args={[1, 6, 4]} />
      <meshBasicMaterial color="#a78bfa" transparent opacity={0.8} depthWrite={false} />
    </instancedMesh>
  );
}

/* ── 3D character model for preview (idle + slow turntable) ── */

function PreviewCharacter({ url }: { url: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, groupRef);

  const normScale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = Math.max(size.y, 0.001);
    return 2.2 / h;
  }, [scene]);

  // Play idle
  useMemo(() => {
    for (const k of Object.keys(actions)) {
      if (k.toLowerCase().includes("idle")) {
        actions[k]?.reset().play();
        break;
      }
    }
  }, [actions]);

  useFrame((_, dt) => {
    if (groupRef.current) groupRef.current.rotation.y += dt * 0.4;
  });

  return (
    <group ref={groupRef} scale={normScale} position={[0, -0.2, 0]}>
      <primitive object={clone} />
    </group>
  );
}

/* ── Full preview scene ────────────────────────────────────── */

function SkinPreviewScene({ url }: { url: string }) {
  return (
    <>
      {/* Dramatic lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 5, 4]} intensity={1.8} color="#e0e7ff" />
      <pointLight position={[-2, 2, -2]} intensity={0.8} color="#818cf8" />
      <pointLight position={[2, 0.5, 2]} intensity={0.6} color="#c4b5fd" />
      <spotLight
        position={[0, 4, 0]}
        angle={0.5}
        penumbra={0.8}
        intensity={1.5}
        color="#6366f1"
        castShadow
      />
      {/* Dark floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]} receiveShadow>
        <circleGeometry args={[1.5, 32]} />
        <meshStandardMaterial color="#0f0f1a" roughness={0.9} />
      </mesh>
      <GlowRing />
      <SmokeParticles />
      <EnergySparks />
      <Suspense fallback={null}>
        <PreviewCharacter url={url} />
      </Suspense>
    </>
  );
}

/* ── Skin preview modal ────────────────────────────────────── */

export function SkinPreviewModal({
  product,
  coins,
  owned,
  onBuy,
  onClose,
}: {
  product: { id: string; name: string; emoji: string; price: number; description: string; skinUrl?: string };
  coins: number;
  owned: boolean;
  onBuy: (id: string) => void;
  onClose: () => void;
}) {
  const cantAfford = coins < product.price;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 30 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="fixed inset-x-2 bottom-2 top-[12%] z-50 mx-auto max-w-md overflow-hidden rounded-3xl border border-indigo-500/30 bg-gradient-to-b from-[#0c0c1e] to-[#1a1033] shadow-2xl shadow-indigo-500/20"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-white/10 p-2 text-white/70 backdrop-blur-sm hover:bg-white/20"
        >
          <X className="size-5" />
        </button>

        {/* 3D Canvas */}
        <div className="relative h-[55%] w-full">
          {product.skinUrl && (
            <Canvas
              dpr={[1, 1.5]}
              camera={{ position: [0, 0.5, 3], fov: 35 }}
              gl={{ alpha: true }}
              style={{ background: "transparent" }}
            >
              <SkinPreviewScene url={product.skinUrl} />
            </Canvas>
          )}
          {/* Vignette overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c0c1e] via-transparent to-transparent" />
          {/* Glow effect at bottom */}
          <div className="pointer-events-none absolute bottom-0 left-1/2 h-24 w-48 -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl" />
        </div>

        {/* Info section */}
        <div className="flex flex-col items-center gap-3 px-6 pb-5 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{product.emoji}</span>
            <h3 className="text-xl font-extrabold text-white">{product.name}</h3>
          </div>
          <p className="text-center text-sm leading-5 text-white/60">{product.description}</p>

          {owned ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-4 py-2 text-sm font-bold text-green-400">
              <Check className="size-4" /> Zaten Sahipsin!
            </span>
          ) : (
            <Button
              onClick={() => onBuy(product.id)}
              disabled={cantAfford}
              className="w-full rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 py-6 text-base font-bold text-white shadow-lg shadow-indigo-500/30 hover:from-indigo-500 hover:to-purple-500"
            >
              <Coins className="size-5" />
              {product.price} SP — Satın Al
            </Button>
          )}
        </div>
      </motion.div>
    </>
  );
}

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
  const [previewId, setPreviewId] = useState<string | null>(null);
  const products = productsOf(vendor.id);

  const handleBuy = async (productId: string) => {
    setBuyingId(productId);
    try {
      await buyItem({ productId });
      const product = getProduct(productId);
      playSound("buy");
      toast.success(
        `${product?.emoji ?? ""} ${product?.name ?? "Ürün"} çantana eklendi! Çantandan giyebilirsin.`,
      );
    } catch (error) {
      console.error("Satın alma hatası:", error);
      playSound("error");
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

      {/* Skin preview modal */}
      <AnimatePresence>
        {previewId && (() => {
          const prod = products.find((p) => p.id === previewId);
          if (!prod || !prod.skinUrl) return null;
          return (
            <SkinPreviewModal
              key={previewId}
              product={prod}
              coins={coins}
              owned={owned.includes(prod.id)}
              onBuy={handleBuy}
              onClose={() => setPreviewId(null)}
            />
          );
        })()}
      </AnimatePresence>

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
                className={`flex flex-col rounded-2xl border border-border/70 bg-background p-3 ${product.skinUrl ? "cursor-pointer transition hover:border-indigo-500/40 hover:shadow-md hover:shadow-indigo-500/10" : ""}`}
                onClick={() => {
                  if (product.skinUrl) setPreviewId(product.id);
                }}
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
                    onClick={(e) => { e.stopPropagation(); handleBuy(product.id); }}
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

/** The player's bag — every owned product, with wear/take-off controls. */
export function BagSheet({
  items,
  equipped,
  coins,
  onClose,
  onBrowseStalls,
}: {
  items: string[];
  equipped: string[];
  coins: number;
  onClose: () => void;
  onBrowseStalls: () => void;
}) {
  const setEquipped = useMutation(api.profiles.setEquipped);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const owned = items
    .map((id) => getProduct(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  const handleToggle = async (productId: string, equip: boolean) => {
    setTogglingId(productId);
    try {
      await setEquipped({ productId, equip });
      const product = getProduct(productId);
      toast.success(
        equip
          ? `${product?.wearEmoji ?? product?.emoji ?? ""} ${product?.name ?? "Ürün"} giyildi! Avatarda görünüyor.`
          : `${product?.emoji ?? ""} ${product?.name ?? "Ürün"} çıkarıldı.`,
      );
    } catch (error) {
      console.error("Giy/çıkar hatası:", error);
      toast.error(
        error instanceof Error ? error.message : "Değiştirilemedi. Tekrar dene.",
      );
    } finally {
      setTogglingId(null);
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
            {owned.map((product) => {
              const isEquipped = equipped.includes(product.id);
              const isToggling = togglingId === product.id;
              return (
                <div
                  key={product.id}
                  className={`flex flex-col rounded-2xl border p-3 ${
                    isEquipped
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/70 bg-background"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-3xl leading-none">
                      {product.emoji}
                    </span>
                    {isEquipped && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground">
                        <Check className="size-2.5" /> Giyili
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-extrabold leading-tight">
                    {product.name}
                  </p>
                  <p className="mt-1 line-clamp-2 flex-1 text-[11px] leading-4 text-muted-foreground">
                    {product.description}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-extrabold text-primary">
                      {CURRENCY_EMOJI} {product.price} SP
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {WEAR_SLOT_LABELS[product.slot]}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className={`mt-2.5 w-full rounded-full ${
                      isEquipped ? "" : "bg-primary/10 text-primary hover:bg-primary/20"
                    }`}
                    variant={isEquipped ? "outline" : "ghost"}
                    disabled={isToggling}
                    onClick={() => handleToggle(product.id, !isEquipped)}
                  >
                    {isToggling ? (
                      <span className="size-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                    ) : isEquipped ? (
                      <>
                        <X className="size-3.5" /> Çıkar
                      </>
                    ) : (
                      <>
                        <Shirt className="size-3.5" /> Kullan
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </>
  );
}

/** VIP membership — the Kraliyet VIP Köşesi stand. Unlocks every bubble color. */
export function VipSheet({
  coins,
  isVip,
  vipUntil,
  onClose,
}: {
  coins: number;
  isVip: boolean;
  vipUntil: number;
  onClose: () => void;
}) {
  const buyVip = useMutation(api.profiles.buyVip);
  const [buying, setBuying] = useState(false);
  const cantAfford = coins < VIP_PRICE;

  const daysLeft = Math.max(
    0,
    Math.ceil((vipUntil - Date.now()) / (24 * 60 * 60 * 1000)),
  );

  const handleBuy = async () => {
    setBuying(true);
    try {
      await buyVip();
      playSound("vip");
      toast.success(
        "👑 VIP üyelik aktif! Tüm balon renkleri artık senin — sohbetten seç.",
      );
    } catch (error) {
      console.error("VIP satın alma hatası:", error);
      playSound("error");
      toast.error(
        error instanceof Error ? error.message : "Satın alınamadı. Tekrar dene.",
      );
    } finally {
      setBuying(false);
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
              👑 Kraliyet VIP Köşesi
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
              Cadderin en ayrıcalıklı üyeliği — tüm balon renkleri kapıda.
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
              aria-label="VIP köşesini kapat"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {isVip ? (
          <div className="mt-6 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-center dark:bg-amber-950/40">
            <span className="text-4xl">👑</span>
            <p className="mt-2 text-base font-extrabold text-amber-700 dark:text-amber-300">
              VIP üyeliğin aktif!
            </p>
            <p className="mt-1 text-sm font-semibold text-amber-700/80 dark:text-amber-300/80">
              {daysLeft} gün kaldı — tüm balon renklerini sohbetten seçebilirsin.
            </p>
            <Button
              className="mt-4 w-full rounded-full"
              variant="outline"
              onClick={handleBuy}
              disabled={buying || cantAfford}
            >
              {buying ? (
                <span className="size-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
              ) : (
                <>
                  <CrownIcon className="size-4" /> Süreyi uzat ({VIP_PRICE} SP)
                </>
              )}
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-5 space-y-2.5">
              {[
                {
                  emoji: "🎨",
                  title: "9 balon rengi",
                  desc: "Kırmızı, turuncu, siyah, pembe... hepsi senin.",
                },
                {
                  emoji: "👑",
                  title: "Altın VIP rozeti",
                  desc: "Karakterinin üstünde ve isminin yanında parlar.",
                },
                {
                  emoji: "💎",
                  title: `${VIP_DURATION_DAYS} gün ayrıcalık`,
                  desc: "Tek ödeme, bir ay boyunca tüm renkler açık.",
                },
              ].map((benefit) => (
                <div
                  key={benefit.title}
                  className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background p-3"
                >
                  <span className="text-2xl">{benefit.emoji}</span>
                  <div>
                    <p className="text-sm font-extrabold">{benefit.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {benefit.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* preview of the VIP colors */}
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-border/70 bg-background p-3">
              <span className="text-xs font-extrabold">Renkler</span>
              <div className="flex gap-1.5">
                {BUBBLE_COLORS.slice(1).map((c) => (
                  <span
                    key={c.id}
                    className="size-5 rounded-full border border-black/10"
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <Button
              className="mt-5 w-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-lg hover:from-amber-600 hover:to-yellow-600"
              onClick={handleBuy}
              disabled={buying || cantAfford}
            >
              {buying ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <CrownIcon className="size-4" />
                  {VIP_PRICE} SP ile VIP ol
                </>
              )}
            </Button>
            {cantAfford && (
              <p className="mt-2 text-center text-[11px] font-bold text-muted-foreground">
                {formatCoins(coins)} SP'n var — günlük hediye kutusu +150 SP
                veriyor, tezgâhlara uğramayı unutma.
              </p>
            )}
          </>
        )}
      </motion.div>
    </>
  );
}
