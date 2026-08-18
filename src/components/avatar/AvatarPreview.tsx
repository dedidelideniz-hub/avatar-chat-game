import type { AvatarConfig } from "@/lib/avatar";

/**
 * Side-view cartoon avatar rendered as pure SVG.
 * Character faces RIGHT by default — the game loop flips via scaleX=-1
 * to face left.  All coordinates live in a 140×180 space.
 */

const OUTLINE = {
  stroke: "#3d2f2a",
  strokeOpacity: 0.28,
  strokeWidth: 2.5,
  strokeLinejoin: "round" as const,
};

/* ── Hair helpers (side-view silhouettes) ─────────────────────── */

/** Hair that sits behind the head. */
function HairBack({ style, color }: { style: string; color: string }) {
  switch (style) {
    case "long":
      return (
        <g fill={color}>
          {/* Long hair flowing behind the head */}
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

/** Hair that sits in front / on top of the head. */
function HairFront({ style, color }: { style: string; color: string }) {
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
          {/* Top hair sweeping back */}
          <path d="M34 44 C30 32 34 16 52 10 C60 8 74 10 82 18 C88 24 86 34 82 42 L74 38 C68 32 56 28 46 30 C38 32 34 38 34 44 Z" />
          {/* Side bang */}
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

/* ── Main component ──────────────────────────────────────────── */

interface AvatarPreviewProps {
  config: AvatarConfig;
  className?: string;
  /** Explicit pixel dimensions — required when nested inside another SVG. */
  width?: number;
  height?: number;
}

export function AvatarPreview({
  config,
  className,
  width,
  height,
}: AvatarPreviewProps) {
  const { skin, hair, hairColor, shirt, pants, shoes } = config;
  return (
    <svg
      viewBox="0 0 140 180"
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label="Avatar önizlemesi"
    >
      {/* ── Hair behind head ── */}
      <HairBack style={hair} color={hairColor} />

      {/* ── Ground shadow ── */}
      <ellipse
        cx="70"
        cy="172"
        rx="30"
        ry="5"
        fill="#1c1917"
        opacity="0.12"
      />

      {/* ── Back leg (behind body) ── */}
      <g className="avatar-leg-r">
        <rect
          x="58"
          y="128"
          width="16"
          height="28"
          rx="8"
          fill={pants}
          {...OUTLINE}
        />
        <rect
          x="54"
          y="154"
          width="22"
          height="12"
          rx="6"
          fill={shoes}
          {...OUTLINE}
        />
      </g>

      {/* ── Front leg ── */}
      <g className="avatar-leg-l">
        <rect
          x="48"
          y="128"
          width="16"
          height="28"
          rx="8"
          fill={pants}
          {...OUTLINE}
        />
        <rect
          x="44"
          y="154"
          width="22"
          height="12"
          rx="6"
          fill={shoes}
          {...OUTLINE}
        />
      </g>

      {/* ── Back arm (behind torso) ── */}
      <g className="avatar-arm-r">
        <rect
          x="72"
          y="88"
          width="12"
          height="34"
          rx="6"
          fill={shirt}
          {...OUTLINE}
        />
        <circle cx="78" cy="122" r="6" fill={skin} {...OUTLINE} />
      </g>

      {/* ── Torso (side-view, slightly forward-leaning) ── */}
      <rect
        x="42"
        y="82"
        width="42"
        height="50"
        rx="14"
        fill={shirt}
        {...OUTLINE}
      />
      {/* Collar */}
      <rect
        x="52"
        y="81"
        width="18"
        height="8"
        rx="4"
        fill="#ffffff"
        opacity="0.5"
      />

      {/* ── Front arm ── */}
      <g className="avatar-arm-l">
        <rect
          x="36"
          y="88"
          width="12"
          height="34"
          rx="6"
          fill={shirt}
          {...OUTLINE}
        />
        <circle cx="42" cy="122" r="6" fill={skin} {...OUTLINE} />
      </g>

      {/* ── Head (side-view profile) ── */}
      <ellipse cx="62" cy="52" rx="34" ry="36" fill={skin} {...OUTLINE} />

      {/* Ear (left side, behind head) */}
      <ellipse cx="30" cy="54" rx="8" ry="10" fill={skin} {...OUTLINE} />
      <ellipse cx="30" cy="54" rx="4" ry="5" fill={skin} stroke="#c4a882" strokeWidth="1.5" strokeOpacity="0.4" />

      {/* Nose (pointing right — side profile) */}
      <path
        d="M92 48 Q98 50 96 56 Q94 60 90 58"
        fill={skin}
        stroke="#c4a882"
        strokeWidth="1.5"
        strokeOpacity="0.5"
        strokeLinecap="round"
      />

      {/* ── Face (shifted toward walking direction) ── */}
      <g className="avatar-face">
        {/* Eye — single eye visible in side view */}
        <ellipse cx="74" cy="48" rx="4.5" ry="6" fill="#2b2320" />
        <circle cx="72.5" cy="46" r="2" fill="#ffffff" />

        {/* Cheek blush */}
        <circle cx="84" cy="58" r="5" fill="#ff7b7b" opacity="0.3" />

        {/* Smile */}
        <path
          d="M76 64 Q82 70 88 64"
          stroke="#2b2320"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Eyebrow */}
        <path
          d="M68 38 Q74 34 82 36"
          stroke="#2b2320"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      {/* ── Hair on top ── */}
      <HairFront style={hair} color={hairColor} />
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
    <svg viewBox="20 2 100 90" className={className} aria-hidden="true">
      {/* Head silhouette */}
      <ellipse cx="62" cy="52" rx="34" ry="36" fill="#ffd1a3" {...OUTLINE} />
      <ellipse cx="30" cy="54" rx="8" ry="10" fill="#ffd1a3" {...OUTLINE} />
      <HairBack style={style} color={color} />
      <HairFront style={style} color={color} />
    </svg>
  );
}
