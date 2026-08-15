import type { AvatarConfig } from "@/lib/avatar";

/**
 * Flat, cartoon "chibi" avatar rendered as pure SVG.
 * All coordinates live in a 140x180 space; the viewBox can be cropped to show
 * just the head (used by hair-style thumbnails).
 */

const OUTLINE = {
  stroke: "#3d2f2a",
  strokeOpacity: 0.28,
  strokeWidth: 2.5,
  strokeLinejoin: "round" as const,
};

/** Hair that sits behind the head (side panels, back fluff). */
function HairBack({ style, color }: { style: string; color: string }) {
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

/** Hair that sits in front of the head (fringe, crown, bob sides). */
function HairFront({ style, color }: { style: string; color: string }) {
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
      <HairBack style={hair} color={hairColor} />

      {/* ground shadow */}
      <ellipse cx="70" cy="165" rx="36" ry="7" fill="#1c1917" opacity="0.12" />

      {/* legs (swing from the hips while walking) */}
      <g className="avatar-leg-l">
        <rect x="55" y="127" width="14" height="26" rx="7" fill={pants} {...OUTLINE} />
        <rect x="52" y="152" width="18" height="13" rx="5" fill={shoes} {...OUTLINE} />
      </g>
      <g className="avatar-leg-r">
        <rect x="71" y="127" width="14" height="26" rx="7" fill={pants} {...OUTLINE} />
        <rect x="70" y="152" width="18" height="13" rx="5" fill={shoes} {...OUTLINE} />
      </g>

      {/* arms + hands (swing from the shoulders while walking) */}
      <g className="avatar-arm-l">
        <rect x="32" y="94" width="12" height="32" rx="6" fill={shirt} {...OUTLINE} />
        <circle cx="38" cy="126" r="7" fill={skin} {...OUTLINE} />
      </g>
      <g className="avatar-arm-r">
        <rect x="96" y="94" width="12" height="32" rx="6" fill={shirt} {...OUTLINE} />
        <circle cx="102" cy="126" r="7" fill={skin} {...OUTLINE} />
      </g>

      {/* torso */}
      <rect x="46" y="86" width="48" height="46" rx="14" fill={shirt} {...OUTLINE} />
      {/* collar */}
      <rect x="60" y="85" width="20" height="9" rx="4" fill="#ffffff" opacity="0.55" />

      {/* head */}
      <circle cx="70" cy="56" r="36" fill={skin} {...OUTLINE} />
      {/* ears */}
      <circle cx="33" cy="58" r="7" fill={skin} {...OUTLINE} />
      <circle cx="107" cy="58" r="7" fill={skin} {...OUTLINE} />

      {/* face */}
      <g>
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
    <svg viewBox="30 12 80 88" className={className} aria-hidden="true">
      <circle cx="70" cy="56" r="36" fill="#ffd1a3" {...OUTLINE} />
      <HairBack style={style} color={color} />
      <HairFront style={style} color={color} />
    </svg>
  );
}
