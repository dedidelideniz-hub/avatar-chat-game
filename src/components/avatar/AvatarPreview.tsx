import type { AvatarConfig } from "@/lib/avatar";
import { getProduct, wearEmojiOf, type Product } from "@/lib/shop";

/* ── Per-item visual config ───────────────────────────────── */

interface HandItemConfig {
  emoji: string;
  /** Scale multiplier relative to base fontSize 22. */
  scale: number;
  /** Offset from hand center (grip adjustment). */
  gripDx: number;
  gripDy: number;
}

/** Per-product hand-item tuning. Items not listed get sensible defaults. */
const HAND_ITEM_CONFIG: Record<string, Partial<HandItemConfig>> = {
  // Ice creams — held upright, slightly above hand
  "dondurma-cilek":   { scale: 1.15, gripDy: -4 },
  "dondurma-cikolata":{ scale: 1.15, gripDy: -4 },
  "dondurma-mix":     { scale: 1.25, gripDy: -5 },
  // Balloons — float above the hand on a string
  "balon-kirmizi":    { scale: 1.2, gripDy: -10 },
  "balon-gokkusagi":  { scale: 1.2, gripDy: -10 },
  "balon-yildiz":     { scale: 1.2, gripDy: -10 },
  // Teddy bear — large, held to the side
  "oyuncak-ayi":      { scale: 1.5, gripDx: -3, gripDy: -2 },
  // Toy car — small, in palm
  "oyuncak-araba":    { scale: 1.05, gripDy: 1 },
  // Ball — medium, centered in palm
  "oyuncak-top":      { scale: 1.15, gripDy: 0 },
};

const DEFAULT_HAND_CONFIG: HandItemConfig = {
  emoji: "",
  scale: 1.0,
  gripDx: 0,
  gripDy: 0,
};

function handConfig(product: Product): HandItemConfig {
  const override = HAND_ITEM_CONFIG[product.id] ?? {};
  return {
    ...DEFAULT_HAND_CONFIG,
    emoji: wearEmojiOf(product),
    ...override,
  };
}

/**
 * Cartoon chibi avatar with FOUR directional poses:
 *  • data-pose="idle"      → front-facing (standing still, OR walking down)
 *  • data-pose="walk-up"   → back view (walking upward, only hair visible)
 *  • data-pose="walk-side" → side profile (walking left/right, game loop flips)
 *
 * The game loop sets data-pose on the root <svg> and toggles the
 * `.walking` class on the sprite group — both views share the same
 * limb classNames so the swing animations work on whichever is visible.
 */

const OUTLINE = {
  stroke: "#3d2f2a",
  strokeOpacity: 0.28,
  strokeWidth: 2.5,
  strokeLinejoin: "round" as const,
};

/* ── Idle pose helpers (FRONT-FACING) ────────────────────────── */

function IdleHairBack({ style, color }: { style: string; color: string }) {
  switch (style) {
    case "long":
      return (
        <g fill={color}>
          <rect x="29" y="42" width="11" height="56" rx="7" />
          <rect x="100" y="42" width="11" height="56" rx="7" />
        </g>
      );
    case "curly":
      return (
        <g fill={color}>
          <circle cx="38" cy="46" r="11" />
          <circle cx="102" cy="46" r="11" />
          <circle cx="45" cy="28" r="11" />
          <circle cx="95" cy="28" r="11" />
          <circle cx="70" cy="20" r="11" />
        </g>
      );
    default:
      return null;
  }
}

function IdleHairFront({ style, color }: { style: string; color: string }) {
  switch (style) {
    case "none":
      return null;
    case "short":
      return (
        <path
          fill={color}
          d="M32 52 C32 22 108 22 108 52 C99 40 82 35 70 37 C58 35 41 40 32 52 Z"
        />
      );
    case "long":
      return (
        <path
          fill={color}
          d="M32 52 C32 22 108 22 108 52 C99 40 82 35 70 37 C58 35 41 40 32 52 Z"
        />
      );
    case "spiky":
      return (
        <path
          fill={color}
          d="M32 52 L32 32 L44 42 L48 22 L60 40 L66 16 L74 38 L82 20 L90 40 L100 28 L108 52 Z"
        />
      );
    case "curly":
      return (
        <g fill={color}>
          <circle cx="46" cy="34" r="10" />
          <circle cx="58" cy="26" r="10" />
          <circle cx="72" cy="26" r="10" />
          <circle cx="86" cy="30" r="10" />
          <circle cx="36" cy="50" r="9" />
          <circle cx="104" cy="50" r="9" />
          <circle cx="47" cy="46" r="8" />
          <circle cx="93" cy="46" r="8" />
        </g>
      );
    case "bob":
      return (
        <path
          fill={color}
          d="M32 52 C32 22 108 22 108 52 L108 66 L100 66 L100 78 Q100 86 90 86 Q80 86 80 78 L80 66 L60 66 L60 78 Q60 86 50 86 Q40 86 40 78 L40 66 L32 66 Z"
        />
      );
    default:
      return null;
  }
}

function HandItemText({ item }: { item: HandItemConfig }) {
  return (
    <text
      className="hand-item"
      x={item.gripDx}
      y={item.gripDy}
      fontSize={22 * item.scale}
      textAnchor="middle"
      dominantBaseline="central"
      style={{ pointerEvents: "none" }}
    >{item.emoji}</text>
  );
}

function IdlePose({ skin, hair, hairColor, shirt, pants, shoes, _handItems }: AvatarConfig & { _handItems?: { left?: HandItemConfig; right?: HandItemConfig } }) {
  return (
    <g>
      <IdleHairBack style={hair} color={hairColor} />

      {/* Legs */}
      <g className="avatar-leg-l">
        <rect x="55" y="127" width="14" height="26" rx="7" fill={pants} {...OUTLINE} />
        <rect x="52" y="152" width="18" height="13" rx="5" fill={shoes} {...OUTLINE} />
      </g>
      <g className="avatar-leg-r">
        <rect x="71" y="127" width="14" height="26" rx="7" fill={pants} {...OUTLINE} />
        <rect x="70" y="152" width="18" height="13" rx="5" fill={shoes} {...OUTLINE} />
      </g>

      {/* Arms */}
      <g className="avatar-arm-l">
        <rect x="32" y="94" width="12" height="32" rx="6" fill={shirt} {...OUTLINE} />
        <circle cx="38" cy="126" r="7" fill={skin} {...OUTLINE} />
        {_handItems?.left && (
          <g transform="translate(38,126)"><HandItemText item={_handItems.left} /></g>
        )}
      </g>
      <g className="avatar-arm-r">
        <rect x="96" y="94" width="12" height="32" rx="6" fill={shirt} {...OUTLINE} />
        <circle cx="102" cy="126" r="7" fill={skin} {...OUTLINE} />
        {_handItems?.right && (
          <g transform="translate(102,126)"><HandItemText item={_handItems.right} /></g>
        )}
      </g>

      {/* Torso */}
      <rect x="46" y="86" width="48" height="46" rx="14" fill={shirt} {...OUTLINE} />
      <rect x="60" y="85" width="20" height="9" rx="4" fill="#ffffff" opacity="0.55" />

      {/* Head */}
      <circle cx="70" cy="56" r="36" fill={skin} {...OUTLINE} />
      <circle cx="33" cy="58" r="7" fill={skin} {...OUTLINE} />
      <circle cx="107" cy="58" r="7" fill={skin} {...OUTLINE} />

      {/* Face — front view */}
      <g className="avatar-face">
        <ellipse cx="58" cy="63" rx="4.5" ry="6.5" fill="#2b2320" />
        <circle cx="56.5" cy="60" r="1.9" fill="#ffffff" />
        <ellipse cx="82" cy="63" rx="4.5" ry="6.5" fill="#2b2320" />
        <circle cx="80.5" cy="60" r="1.9" fill="#ffffff" />
        <circle cx="46" cy="71" r="5" fill="#ff7b7b" opacity="0.35" />
        <circle cx="94" cy="71" r="5" fill="#ff7b7b" opacity="0.35" />
        <path
          d="M63 76 Q70 82 77 76"
          stroke="#2b2320"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      <IdleHairFront style={hair} color={hairColor} />
    </g>
  );
}

/* ── Back pose (WALKING UP — only back of head with hair) ───── */

function BackPose({ skin, hair, hairColor, shirt, pants, shoes, _handItems }: AvatarConfig & { _handItems?: { left?: HandItemConfig; right?: HandItemConfig } }) {
  return (
    <g>
      {/* Hair back — covers the entire head from behind */}
      <BackHair style={hair} color={hairColor} />

      {/* Legs */}
      <g className="avatar-leg-l">
        <rect x="55" y="127" width="14" height="26" rx="7" fill={pants} {...OUTLINE} />
        <rect x="52" y="152" width="18" height="13" rx="5" fill={shoes} {...OUTLINE} />
      </g>
      <g className="avatar-leg-r">
        <rect x="71" y="127" width="14" height="26" rx="7" fill={pants} {...OUTLINE} />
        <rect x="70" y="152" width="18" height="13" rx="5" fill={shoes} {...OUTLINE} />
      </g>

      {/* Arms */}
      <g className="avatar-arm-l">
        <rect x="32" y="94" width="12" height="32" rx="6" fill={shirt} {...OUTLINE} />
        <circle cx="38" cy="126" r="7" fill={skin} {...OUTLINE} />
        {_handItems?.left && (
          <g transform="translate(38,126)"><HandItemText item={_handItems.left} /></g>
        )}
      </g>
      <g className="avatar-arm-r">
        <rect x="96" y="94" width="12" height="32" rx="6" fill={shirt} {...OUTLINE} />
        <circle cx="102" cy="126" r="7" fill={skin} {...OUTLINE} />
        {_handItems?.right && (
          <g transform="translate(102,126)"><HandItemText item={_handItems.right} /></g>
        )}
      </g>

      {/* Torso — back view (no collar detail) */}
      <rect x="46" y="86" width="48" height="46" rx="14" fill={shirt} {...OUTLINE} />

      {/* Head — back of head (skin circle, fully covered by hair) */}
      <circle cx="70" cy="56" r="36" fill={skin} {...OUTLINE} />
      <circle cx="33" cy="58" r="7" fill={skin} {...OUTLINE} />
      <circle cx="107" cy="58" r="7" fill={skin} {...OUTLINE} />

      {/* Hair on top — no face visible */}
      <BackHair style={hair} color={hairColor} />
    </g>
  );
}

function BackHair({ style, color }: { style: string; color: string }) {
  switch (style) {
    case "none":
      return null;
    case "short":
      return (
        <path
          fill={color}
          d="M32 56 C32 22 108 22 108 56 C108 42 98 32 70 30 C42 32 32 42 32 56 Z"
        />
      );
    case "long":
      return (
        <g fill={color}>
          <path d="M32 56 C32 22 108 22 108 56 C108 42 98 32 70 30 C42 32 32 42 32 56 Z" />
          <rect x="32" y="46" width="10" height="52" rx="6" />
          <rect x="98" y="46" width="10" height="52" rx="6" />
        </g>
      );
    case "spiky":
      return (
        <path
          fill={color}
          d="M32 56 L32 32 L44 42 L48 22 L60 40 L66 16 L74 38 L82 20 L90 40 L100 28 L108 56 C108 42 98 32 70 30 C42 32 32 42 32 56 Z"
        />
      );
    case "curly":
      return (
        <g fill={color}>
          <circle cx="46" cy="34" r="10" />
          <circle cx="58" cy="26" r="10" />
          <circle cx="72" cy="26" r="10" />
          <circle cx="86" cy="30" r="10" />
          <circle cx="36" cy="50" r="9" />
          <circle cx="104" cy="50" r="9" />
          <circle cx="38" cy="46" r="8" />
          <circle cx="102" cy="46" r="8" />
          <circle cx="70" cy="20" r="10" />
        </g>
      );
    case "bob":
      return (
        <path
          fill={color}
          d="M32 56 C32 22 108 22 108 56 L108 72 L100 72 L100 80 Q100 86 92 86 Q84 86 84 80 L84 72 L56 72 L56 80 Q56 86 48 86 Q40 86 40 80 L40 72 L32 72 Z"
        />
      );
    default:
      return null;
  }
}

/* ── Walking pose helpers (SIDE-VIEW) ────────────────────────── */

function WalkHairBack({ style, color }: { style: string; color: string }) {
  switch (style) {
    case "long":
      return (
        <g fill={color}>
          <path d="M30 38 C26 30 28 18 42 12 C38 32 36 50 34 72 Q32 88 36 100 L42 98 Q40 82 42 66 C44 50 46 38 50 28 L30 38 Z" />
          <path d="M34 72 Q30 90 32 110 L40 108 Q40 92 40 74 Z" />
        </g>
      );
    case "curly":
      return (
        <g fill={color}>
          <circle cx="32" cy="34" r="10" />
          <circle cx="38" cy="22" r="9" />
          <circle cx="52" cy="16" r="8" />
          <circle cx="28" cy="50" r="9" />
          <circle cx="30" cy="66" r="8" />
        </g>
      );
    default:
      return null;
  }
}

function WalkHairFront({ style, color }: { style: string; color: string }) {
  switch (style) {
    case "none":
      return null;
    case "short":
      return (
        <path
          fill={color}
          d="M34 44 C30 32 34 16 52 10 C60 8 74 10 82 18 C88 24 86 34 82 42 L74 38 C68 32 56 28 46 30 C38 32 34 38 34 44 Z"
        />
      );
    case "long":
      return (
        <g fill={color}>
          <path d="M34 44 C30 32 34 16 52 10 C60 8 74 10 82 18 C88 24 86 34 82 42 L74 38 C68 32 56 28 46 30 C38 32 34 38 34 44 Z" />
          <path d="M34 44 C32 52 30 64 28 76 Q30 82 36 80 C36 70 36 58 38 48 Z" />
        </g>
      );
    case "spiky":
      return (
        <path
          fill={color}
          d="M32 46 L36 24 L44 36 L52 14 L58 34 L66 10 L70 32 L78 18 L80 36 L88 22 L84 42 L74 38 C68 32 56 28 46 30 C38 32 34 38 32 46 Z"
        />
      );
    case "curly":
      return (
        <g fill={color}>
          <circle cx="44" cy="22" r="10" />
          <circle cx="58" cy="14" r="10" />
          <circle cx="72" cy="16" r="9" />
          <circle cx="82" cy="24" r="8" />
          <circle cx="36" cy="36" r="8" />
        </g>
      );
    case "bob":
      return (
        <path
          fill={color}
          d="M34 44 C30 32 34 16 52 10 C60 8 74 10 82 18 C88 24 86 34 82 42 L82 68 L76 68 Q74 56 70 50 L44 50 Q40 56 38 68 L34 68 L34 44 Z"
        />
      );
    default:
      return null;
  }
}

function WalkPose({ skin, hair, hairColor, shirt, pants, shoes, _handItems }: AvatarConfig & { _handItems?: { left?: HandItemConfig; right?: HandItemConfig } }) {
  return (
    <g>
      <WalkHairBack style={hair} color={hairColor} />

      {/* Back leg */}
      <g className="avatar-leg-r">
        <rect x="58" y="128" width="16" height="28" rx="8" fill={pants} {...OUTLINE} />
        <rect x="54" y="154" width="22" height="12" rx="6" fill={shoes} {...OUTLINE} />
      </g>

      {/* Front leg */}
      <g className="avatar-leg-l">
        <rect x="48" y="128" width="16" height="28" rx="8" fill={pants} {...OUTLINE} />
        <rect x="44" y="154" width="22" height="12" rx="6" fill={shoes} {...OUTLINE} />
      </g>

      {/* Back arm */}
      <g className="avatar-arm-r">
        <rect x="72" y="88" width="12" height="34" rx="6" fill={shirt} {...OUTLINE} />
        <circle cx="78" cy="122" r="6" fill={skin} {...OUTLINE} />
        {_handItems?.right && (
          <g transform="translate(78,122)"><HandItemText item={_handItems.right} /></g>
        )}
      </g>

      {/* Torso (side-view) */}
      <rect x="42" y="82" width="42" height="50" rx="14" fill={shirt} {...OUTLINE} />
      <rect x="52" y="81" width="18" height="8" rx="4" fill="#ffffff" opacity="0.5" />

      {/* Front arm */}
      <g className="avatar-arm-l">
        <rect x="36" y="88" width="12" height="34" rx="6" fill={shirt} {...OUTLINE} />
        <circle cx="42" cy="122" r="6" fill={skin} {...OUTLINE} />
        {_handItems?.left && (
          <g transform="translate(42,122)"><HandItemText item={_handItems.left} /></g>
        )}
      </g>

      {/* Head (side-view) */}
      <ellipse cx="62" cy="52" rx="34" ry="36" fill={skin} {...OUTLINE} />
      <ellipse cx="30" cy="54" rx="8" ry="10" fill={skin} {...OUTLINE} />
      <ellipse cx="30" cy="54" rx="4" ry="5" fill={skin} stroke="#c4a882" strokeWidth="1.5" strokeOpacity="0.4" />

      {/* Nose */}
      <path
        d="M92 48 Q98 50 96 56 Q94 60 90 58"
        fill={skin}
        stroke="#c4a882"
        strokeWidth="1.5"
        strokeOpacity="0.5"
        strokeLinecap="round"
      />

      {/* Face — side view */}
      <g className="avatar-face">
        <ellipse cx="74" cy="48" rx="4.5" ry="6" fill="#2b2320" />
        <circle cx="72.5" cy="46" r="2" fill="#ffffff" />
        <circle cx="84" cy="58" r="5" fill="#ff7b7b" opacity="0.3" />
        <path
          d="M76 64 Q82 70 88 64"
          stroke="#2b2320"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M68 38 Q74 34 82 36"
          stroke="#2b2320"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      <WalkHairFront style={hair} color={hairColor} />
    </g>
  );
}

/* ── Main component ──────────────────────────────────────────── */

interface AvatarPreviewProps {
  config: AvatarConfig;
  className?: string;
  /** Explicit pixel dimensions — required when nested inside another SVG. */
  width?: number;
  height?: number;
  /** Equipped product ids — hand items render inside arm groups for animation. */
  equipped?: string[];
}

/** Compute hand item configs from equipped array. */
function computeHandItems(equipped: string[]): { left?: HandItemConfig; right?: HandItemConfig } {
  const handProducts = equipped
    .map((id) => getProduct(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined && p.slot === "hand");
  return {
    left: handProducts[0] ? handConfig(handProducts[0]) : undefined,
    right: handProducts[1] ? handConfig(handProducts[1]) : undefined,
  };
}

export function AvatarPreview({
  config,
  className,
  width,
  height,
  equipped,
}: AvatarPreviewProps) {
  const handItems = equipped ? computeHandItems(equipped) : undefined;

  return (
    <svg
      viewBox="0 0 140 180"
      width={width}
      height={height}
      className={className}
      data-pose="idle"
      role="img"
      aria-label="Avatar önizlemesi"
    >
      {/* Ground shadow */}
      <ellipse cx="70" cy="165" rx="36" ry="7" fill="#1c1917" opacity="0.12" />

      {/* Front-facing idle pose (also used for walking DOWN) */}
      <g className="avatar-pose-idle">
        <IdlePose {...config} _handItems={handItems} />
      </g>

      {/* Back view (walking UP) */}
      <g className="avatar-pose-back">
        <BackPose {...config} _handItems={handItems} />
      </g>

      {/* Side-view walking pose (LEFT / RIGHT — game loop handles flip) */}
      <g className="avatar-pose-side">
        <WalkPose {...config} _handItems={handItems} />
      </g>
    </svg>
  );
}

/** Small head-only preview of a single hair style, for style picker buttons. */
export function HairThumb({
  style,
  color,
  className,
}: {
  style: string;
  color: string;
  className?: string;
}) {
  return (
    <svg viewBox="30 12 80 88" className={className} aria-hidden="true">
      <circle cx="70" cy="56" r="36" fill="#ffd1a3" {...OUTLINE} />
      <IdleHairBack style={style} color={color} />
      <IdleHairFront style={style} color={color} />
    </svg>
  );
}
