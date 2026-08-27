import { getProduct, wearEmojiOf, type WearSlot, type Product } from "@/lib/shop";

/**
 * Overlays non-hand equipped items (face, head, neck) on the avatar.
 * Hand items are rendered inline inside AvatarPreview arm groups.
 */

interface EquippedItemsProps {
  equipped: string[];
  width?: number;
  height?: number;
  className?: string;
}

interface SlotConfig {
  x: number;
  y: number;
  size: number;
}

/**
 * Avatar head geometry:
 *   center = (70, 56), radius = 36
 *   crown  = y 20,     chin  = y 92
 *   eyes   = y 63
 *   neck   = y ~88-94
 */
const SLOT_POS: Record<WearSlot, SlotConfig> = {
  head: { x: 70, y: 18, size: 38 },   // crown anchor — hat sits on top of head
  face: { x: 70, y: 66, size: 24 },   // between the eyes
  neck: { x: 70, y: 92, size: 22 },   // collar junction
  hand: { x: 0, y: 0, size: 0 },      // unused — in AvatarPreview arm groups
  chest: { x: 70, y: 108, size: 26 }, // torso center
  back: { x: 70, y: 100, size: 24 },  // debug-only front-view approximation
  hands: { x: 38, y: 126, size: 18 }, // left hand (debug shows one glove)
  feet: { x: 70, y: 168, size: 22 },  // between the feet
  legs: { x: 54, y: 145, size: 16 },  // upper leg area
};

/** Per-product overrides for non-hand items. */
const ITEM_SLOT_OVERRIDE: Record<string, Partial<SlotConfig>> = {
  "moda-gozluk": { y: 64, size: 22 },  // glasses — centered between eyes
  // moda-sapka (hat) and moda-atki (scarf) are drawn as precise SVG geometry.
};

/* ─────────────────────────────────────────────────────────────
 * Straw Sun Hat — precise SVG geometry (NOT emoji).
 *
 * Head geometry (AvatarPreview): center (70,56), r=36,
 * crown y=20, head width 72 units.
 *
 * Design targets:
 *   • Brim width = 96 units = 133% of head width
 *   • Horizontally centered on head axis (x=70)
 *   • Brim bottom sits ON the crown — no floating gap
 *   • Pivot/anchor = bottom-center of hat rim (by construction)
 *   • Neutral rotation, correct front/back layering
 *
 * Layer order inside the hat: dome → ribbon → front brim.
 * The front brim overlaps the ribbon's bottom edge, so the
 * rear band reads as BEHIND the rim — no z-fighting.
 * ───────────────────────────────────────────────────────────── */
function HatSvg() {
  return (
    <g>
      {/* Crown dome — straw */}
      <path
        d="M44 30 C44 8 56 2 70 2 C84 2 96 8 96 30 Z"
        fill="#e9c46a"
        stroke="#b8860b"
        strokeWidth={1.5}
      />
      {/* Dome weave shading */}
      <path
        d="M50 26 C50 12 58 7 70 7 C82 7 90 12 90 26 Z"
        fill="none"
        stroke="#d4a943"
        strokeWidth={1}
        opacity={0.6}
      />
      {/* Purple ribbon band across dome base */}
      <path
        d="M44 22 L96 22 L96 30 L44 30 Z"
        fill="#9333ea"
        stroke="#7e22ce"
        strokeWidth={1}
      />
      {/* Front brim — drawn last, overlaps ribbon bottom edge */}
      <ellipse
        cx={70}
        cy={30}
        rx={48}
        ry={9}
        fill="#f0cd6e"
        stroke="#b8860b"
        strokeWidth={1.5}
      />
      {/* Brim inner curve — subtle depth line */}
      <path
        d="M28 32 Q70 24 112 32"
        fill="none"
        stroke="#c9a03a"
        strokeWidth={1}
        opacity={0.5}
      />
    </g>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Knitted Scarf — precise SVG geometry (NOT emoji).
 *
 * Body geometry (AvatarPreview):
 *   • Torso: x=46..94, top y=86 (rx=14)
 *   • Head circle bottom: y=92 at center (chin)
 *   • Mouth: y≈76-82
 *
 * Design targets:
 *   • Wrap band across the collar/shoulders (y=88..102)
 *     — below the mouth, slightly overlapping chin bottom (natural)
 *   • Band width 40 units ≈ shoulder span, centered x=70
 *   • Front tail hangs down over the chest (y=100..124) with fringe
 *   • Pivot/anchor = top-center of band (70, 88) = collarbone point
 *   • Follows whole-sprite movement/flip automatically (overlay)
 * ───────────────────────────────────────────────────────────── */
function ScarfSvg() {
  return (
    <g>
      {/* Wrap band around the neck/collar */}
      <path
        d="M50 90 Q70 84 90 90 L90 102 Q70 108 50 102 Z"
        fill="#dc2626"
        stroke="#b91c1c"
        strokeWidth={1.5}
      />
      {/* Knit stripes on the band */}
      <path d="M51 95 Q70 90 89 95" fill="none" stroke="#b91c1c" strokeWidth={1.5} opacity={0.7} />
      <path d="M51 99 Q70 94 89 99" fill="none" stroke="#b91c1c" strokeWidth={1.5} opacity={0.7} />
      {/* Front tail hanging over the chest */}
      <path
        d="M61 102 L79 102 L81 122 Q70 127 59 122 Z"
        fill="#dc2626"
        stroke="#b91c1c"
        strokeWidth={1.5}
      />
      {/* Tail stripes */}
      <path d="M61 108 L80 108" stroke="#b91c1c" strokeWidth={1.5} opacity={0.7} />
      <path d="M60 114 L80.5 114" stroke="#b91c1c" strokeWidth={1.5} opacity={0.7} />
      {/* Fringe at the tail bottom */}
      <path d="M62 124 L61 130" stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M67 126 L66.5 132" stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M72 126.5 L72 132.5" stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M77 126 L77.5 132" stroke="#dc2626" strokeWidth={2.5} strokeLinecap="round" />
    </g>
  );
}

function slotConfig(product: Product): SlotConfig {
  const base = SLOT_POS[product.slot];
  const override = ITEM_SLOT_OVERRIDE[product.id] ?? {};
  return { ...base, ...override };
}

export function EquippedItems({
  equipped,
  width,
  height,
  className,
}: EquippedItemsProps) {
  const worn = equipped
    .map((id) => getProduct(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined && p.slot !== "hand");

  if (worn.length === 0) {
    return null;
  }

  return (
    <svg
      viewBox="0 0 140 180"
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
      pointerEvents="none"
    >
      {worn.map((product) => {
        // Hat & scarf render as precise SVG geometry — no emoji baseline variance.
        if (product.id === "moda-sapka") {
          return <HatSvg key={product.id} />;
        }
        if (product.id === "moda-atki") {
          return <ScarfSvg key={product.id} />;
        }
        const pos = slotConfig(product);
        return (
          <text
            key={product.id}
            x={pos.x}
            y={pos.y}
            fontSize={pos.size}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {wearEmojiOf(product)}
          </text>
        );
      })}
    </svg>
  );
}
