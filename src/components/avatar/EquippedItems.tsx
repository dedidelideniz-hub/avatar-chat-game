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
  "moda-sapka": { y: 16, size: 40 },   // hat — larger, sits on crown
  "moda-gozluk": { y: 64, size: 22 },  // glasses — centered between eyes
  "moda-atki": { y: 94, size: 24 },    // scarf — at neck base
};

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
