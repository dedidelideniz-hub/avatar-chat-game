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
};

/** Per-product overrides for non-hand items. */
const ITEM_SLOT_OVERRIDE: Record<string, Partial<SlotConfig>> = {
  "moda-gozluk": { y: 64, size: 22 },  // glasses — centered between eyes
  "moda-atki": { y: 94, size: 24 },    // scarf — at neck base
  // moda-sapka (hat) is drawn as precise SVG geometry — see HatSvg below.
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
        // Hat renders as precise SVG geometry — no emoji baseline variance.
        if (product.id === "moda-sapka") {
          return <HatSvg key={product.id} />;
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
