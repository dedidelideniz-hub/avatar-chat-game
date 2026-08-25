import { getProduct, wearEmojiOf, type WearSlot } from "@/lib/shop";

/**
 * Overlays the player's equipped items on top of the AvatarPreview.
 * Uses the same 140x180 space as the avatar; slot positions were chosen to
 * line up with the character's head, face, neck and hands.
 */

interface EquippedItemsProps {
  /** Product ids currently worn (order matters: first hand item = left hand). */
  equipped: string[];
  /** Explicit pixel dimensions — required when nested inside another SVG. */
  width?: number;
  height?: number;
  className?: string;
}

/** Hand items are rendered inline inside AvatarPreview arm groups (for animation).
 *  Only face, head, and neck items are rendered here as an overlay. */
const SLOT_POS: Record<WearSlot, { x: number; y: number; size: number }> = {
  head: { x: 70, y: 24, size: 36 },
  face: { x: 70, y: 68, size: 24 },
  neck: { x: 70, y: 90, size: 22 },
  hand: { x: 0, y: 0, size: 0 }, // unused — hand items are in AvatarPreview
};

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
        const { slot } = product;
        const base = SLOT_POS[slot];
        return (
          <text
            key={product.id}
            x={base.x}
            y={base.y}
            fontSize={base.size}
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
