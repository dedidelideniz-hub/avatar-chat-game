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

const SLOT_POS: Record<WearSlot, { x: number; y: number; size: number }> = {
  head: { x: 70, y: 24, size: 32 },
  face: { x: 70, y: 68, size: 24 },
  neck: { x: 70, y: 106, size: 26 },
  hand: { x: 34, y: 90, size: 26 },
};

/** Position used for the Nth item worn in a hand slot (left, right, ...).
 *  Aligned with the avatar arm rects which span y=42..98. */
const HAND_OFFSETS = [
  { x: 34, y: 90 },
  { x: 106, y: 90 },
];

export function EquippedItems({
  equipped,
  width,
  height,
  className,
}: EquippedItemsProps) {
  const worn = equipped
    .map((id) => getProduct(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

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
        const handIndex = worn
          .filter((p) => p.slot === "hand")
          .findIndex((p) => p.id === product.id);
        const pos =
          slot === "hand" && handIndex >= 0
            ? { ...base, ...HAND_OFFSETS[handIndex % HAND_OFFSETS.length] }
            : base;
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
