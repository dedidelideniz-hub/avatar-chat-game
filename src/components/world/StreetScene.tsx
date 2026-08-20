import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import type { AvatarConfig } from "@/lib/avatar";
import { GIFT_BOX, VENDORS, type Vendor } from "@/lib/shop";
import type { CSSProperties } from "react";

/**
 * Kenney City Kit-style Cadde — isometric 3D low-poly cityscape.
 * Flat-shaded buildings with visible side + top faces (2.5D perspective).
 * Warm orange / white / grey palette with blue glass windows.
 * 1600×900 world. Obstacles in shop.ts must match these drawings.
 */

const DEPTH = 26;
const DEPTH_H = DEPTH / 2;

const VENDOR_AVATARS: Record<string, AvatarConfig> = {
  dondurma: {
    skin: "#f5c19a",
    hair: "short",
    hairColor: "#3b2f2f",
    shirt: "#ffffff",
    pants: "#334155",
    shoes: "#111827",
  },
  balon: {
    skin: "#8d5a2b",
    hair: "curly",
    hairColor: "#1c1917",
    shirt: "#0ea5e9",
    pants: "#7f1d1d",
    shoes: "#f59e0b",
  },
  oyuncak: {
    skin: "#ffd1a3",
    hair: "none",
    hairColor: "#64748b",
    shirt: "#22c55e",
    pants: "#451a03",
    shoes: "#374151",
  },
  moda: {
    skin: "#3b2314",
    hair: "long",
    hairColor: "#eab308",
    shirt: "#ec4899",
    pants: "#1e3a8a",
    shoes: "#ef4444",
  },
  vip: {
    skin: "#f5c19a",
    hair: "short",
    hairColor: "#f59e0b",
    shirt: "#1e293b",
    pants: "#0f172a",
    shoes: "#92400e",
  },
};

const STALL_PRODUCTS: Record<string, string> = {
  dondurma: "🍦🍨",
  balon: "🎈🌈",
  oyuncak: "🧸🚗",
  moda: "🕶️👒",
  vip: "👑💎",
};

/* ═══════════════════════════════════════════════════════════════ */
/*               ISOMETRIC 3D BUILDING (Kenney style)              */
/* ═══════════════════════════════════════════════════════════════ */

interface IsoBuildingProps {
  x: number;
  w: number;
  h: number;
  front: string;
  side: string;
  top: string;
  roof: string;
  winColor: string;
  winFrame: string;
  trim: string;
  floors: number;
  winsPerFloor: number;
  sign?: string;
  signBg?: string;
  signFg?: string;
  hasShop?: boolean;
  shopGlass?: string;
  awningA?: string;
  awningB?: string;
  doorColor?: string;
  /** Optional roof detail — antenna, AC unit, water tank etc. */
  roofDetail?: "antenna" | "ac" | "tank" | "chimney" | "satellite";
}

function IsoBuilding({
  x,
  w,
  h,
  front,
  side,
  top,
  roof,
  winColor,
  winFrame,
  trim,
  floors,
  winsPerFloor,
  sign,
  signBg,
  signFg,
  hasShop,
  shopGlass,
  awningA,
  awningB,
  doorColor,
  roofDetail,
}: IsoBuildingProps) {
  const baseY = 470;
  const wallY = baseY - h;
  const cx = x + w / 2;
  const storyH = Math.floor(h / floors);
  const winW = Math.min(28, (w - 40) / winsPerFloor - 6);
  const winH = storyH - 22;

  return (
    <g>
      {/* ─── Ground shadow (isometric) ─── */}
      <polygon
        points={`${x + 4},${baseY + 3} ${x + w + 6},${baseY + 3} ${x + w + DEPTH + 4},${baseY + DEPTH_H + 3} ${x + DEPTH + 2},${baseY + DEPTH_H + 3}`}
        fill="#1a1520"
        opacity={0.1}
      />

      {/* ─── Right side face (darker) ─── */}
      <polygon
        points={`${x + w},${wallY} ${x + w + DEPTH},${wallY - DEPTH_H} ${x + w + DEPTH},${baseY - DEPTH_H} ${x + w},${baseY}`}
        fill={side}
      />
      {/* Side face edge line */}
      <line
        x1={x + w}
        y1={wallY}
        x2={x + w}
        y2={baseY}
        stroke="#000"
        strokeWidth={1.2}
        opacity={0.08}
      />

      {/* ─── Front face ─── */}
      <rect x={x} y={wallY} width={w} height={h} fill={front} />
      {/* Subtle front edge */}
      <line
        x1={x}
        y1={wallY}
        x2={x}
        y2={baseY}
        stroke="#fff"
        strokeWidth={1}
        opacity={0.15}
      />

      {/* ─── Top face (lightest) ─── */}
      <polygon
        points={`${x},${wallY} ${x + w},${wallY} ${x + w + DEPTH},${wallY - DEPTH_H} ${x + DEPTH},${wallY - DEPTH_H}`}
        fill={top}
      />
      {/* Top face edge highlight */}
      <line
        x1={x}
        y1={wallY}
        x2={x + DEPTH}
        y2={wallY - DEPTH_H}
        stroke="#fff"
        strokeWidth={1}
        opacity={0.2}
      />

      {/* ─── Roof slab ─── */}
      <rect
        x={x - 2}
        y={wallY - 5}
        width={w + 4}
        height={7}
        rx={1}
        fill={roof}
      />
      <polygon
        points={`${x - 2},${wallY - 5} ${x + w + 2},${wallY - 5} ${x + w + DEPTH + 2},${wallY - 5 - DEPTH_H} ${x + DEPTH - 2},${wallY - 5 - DEPTH_H}`}
        fill={roof}
        opacity={0.85}
      />

      {/* ─── Windows (blue glass, flat rectangles) ─── */}
      {Array.from({ length: floors }).map((_, floor) => {
        const spacing = (w - 24) / winsPerFloor;
        const fy = wallY + 12 + floor * storyH;
        const isGroundFloor = floor === floors - 1 && hasShop;
        return Array.from({ length: winsPerFloor }).map((_, wi) => {
          if (isGroundFloor) return null; // ground floor → shop front
          const wx = x + 12 + wi * spacing;
          return (
            <g key={`${floor}-${wi}`}>
              {/* Window recess */}
              <rect
                x={wx - 1}
                y={fy - 1}
                width={winW + 2}
                height={winH + 2}
                fill="#000"
                opacity={0.12}
                rx={1}
              />
              {/* Window glass */}
              <rect
                x={wx}
                y={fy}
                width={winW}
                height={winH}
                fill={winColor}
                rx={1}
              />
              {/* Window reflection */}
              <rect
                x={wx + 2}
                y={fy + 2}
                width={winW * 0.35}
                height={winH - 4}
                fill="#fff"
                opacity={0.18}
                rx={1}
              />
              {/* Window frame */}
              <rect
                x={wx}
                y={fy}
                width={winW}
                height={winH}
                fill="none"
                stroke={winFrame}
                strokeWidth={1.2}
                rx={1}
              />
              {/* Cross divider */}
              <line
                x1={wx + winW / 2}
                y1={fy}
                x2={wx + winW / 2}
                y2={fy + winH}
                stroke={winFrame}
                strokeWidth={1}
                opacity={0.5}
              />
            </g>
          );
        });
      })}

      {/* ─── Side face windows (smaller, fewer) ─── */}
      {Array.from({ length: floors }).map((_, floor) => {
        const isGroundFloor = floor === floors - 1 && hasShop;
        if (isGroundFloor) return null;
        const fy = wallY + 16 + floor * storyH;
        const sw = 8;
        const sh = winH - 6;
        return (
          <g key={`side-${floor}`}>
            <rect
              x={x + w + 4}
              y={fy}
              width={sw}
              height={sh}
              fill={winColor}
              opacity={0.7}
              rx={1}
            />
            <rect
              x={x + w + DEPTH - sw - 4}
              y={fy}
              width={sw}
              height={sh}
              fill={winColor}
              opacity={0.5}
              rx={1}
            />
          </g>
        );
      })}

      {/* ─── Decorative horizontal trim lines ─── */}
      {[0.33, 0.66].map((pct) => (
        <line
          key={pct}
          x1={x}
          y1={wallY + h * pct}
          x2={x + w}
          y2={wallY + h * pct}
          stroke={trim}
          strokeWidth={1.5}
          opacity={0.2}
        />
      ))}

      {/* ─── Ground floor shop front ─── */}
      {hasShop && (
        <g>
          {/* Shop recess */}
          <rect
            x={x + 6}
            y={baseY - storyH + 6}
            width={w - 12}
            height={storyH - 12}
            rx={4}
            fill="#000"
            opacity={0.08}
          />
          {/* Shop glass */}
          <rect
            x={x + 10}
            y={baseY - storyH + 10}
            width={w - 20}
            height={storyH - 20}
            rx={4}
            fill={shopGlass || "#2a3a4a"}
          />
          <rect
            x={x + 14}
            y={baseY - storyH + 14}
            width={w - 28}
            height={storyH - 28}
            rx={3}
            fill="#d8e8f0"
            opacity={0.92}
          />
          {/* Interior glow */}
          <rect
            x={x + 16}
            y={baseY - storyH + 16}
            width={w - 32}
            height={storyH - 32}
            rx={2}
            fill="#e8f0f4"
            opacity={0.4}
          />

          {/* Door */}
          <rect
            x={cx - 18}
            y={baseY - 68}
            width={36}
            height={60}
            rx={3}
            fill={doorColor || "#4a3020"}
          />
          <rect
            x={cx - 14}
            y={baseY - 64}
            width={13}
            height={50}
            rx={2}
            fill="#000"
            opacity={0.08}
          />
          <rect
            x={cx + 1}
            y={baseY - 64}
            width={13}
            height={50}
            rx={2}
            fill="#000"
            opacity={0.08}
          />
          <circle cx={cx + 11} cy={baseY - 36} r={2.5} fill="#c9a84c" />

          {/* Awning */}
          {awningA &&
            awningB &&
            Array.from({ length: Math.floor(w / 18) }).map((_, i) => (
              <rect
                key={i}
                x={x + i * 18}
                y={baseY - storyH + 2}
                width={19}
                height={28}
                rx={3}
                fill={i % 2 === 0 ? awningA : awningB}
              />
            ))}
          {awningA && (
            <rect
              x={x}
              y={baseY - storyH + 2}
              width={w}
              height={5}
              rx={2}
              fill="#000"
              opacity={0.08}
            />
          )}
        </g>
      )}

      {/* ─── Shop sign ─── */}
      {sign && (
        <g>
          <rect
            x={cx - 64}
            y={wallY + 10}
            width={128}
            height={32}
            rx={8}
            fill={signBg || "#ffffff"}
            stroke={trim}
            strokeWidth={1.5}
          />
          <text
            x={cx}
            y={wallY + 31}
            textAnchor="middle"
            fontSize={15}
            fontWeight={800}
            fill={signFg || "#333"}
          >
            {sign}
          </text>
        </g>
      )}

      {/* ─── Roof details ─── */}
      {roofDetail === "antenna" && (
        <g>
          <line
            x1={cx + 10}
            y1={wallY - 5}
            x2={cx + 10}
            y2={wallY - 38}
            stroke="#707880"
            strokeWidth={2.5}
          />
          <line
            x1={cx + 3}
            y1={wallY - 28}
            x2={cx + 17}
            y2={wallY - 28}
            stroke="#707880"
            strokeWidth={2}
          />
          <circle cx={cx + 10} cy={wallY - 40} r={3} fill="#e74c3c" opacity={0.8} />
        </g>
      )}
      {roofDetail === "ac" && (
        <g>
          <rect
            x={cx - 16}
            y={wallY - 14}
            width={32}
            height={12}
            rx={2}
            fill="#808890"
          />
          <rect
            x={cx - 14}
            y={wallY - 12}
            width={28}
            height={4}
            rx={1}
            fill="#606870"
          />
          {/* Fan grill lines */}
          {[0, 6, 12, 18, 24].map((dx) => (
            <line
              key={dx}
              x1={cx - 12 + dx}
              y1={wallY - 12}
              x2={cx - 12 + dx}
              y2={wallY - 8}
              stroke="#505860"
              strokeWidth={0.8}
            />
          ))}
        </g>
      )}
      {roofDetail === "tank" && (
        <g>
          <rect
            x={cx - 12}
            y={wallY - 24}
            width={24}
            height={22}
            rx={4}
            fill="#6a7a8a"
          />
          <rect
            x={cx - 14}
            y={wallY - 26}
            width={28}
            height={4}
            rx={2}
            fill="#5a6a7a"
          />
          <line
            x1={cx}
            y1={wallY - 24}
            x2={cx}
            y2={wallY - 5}
            stroke="#5a6a7a"
            strokeWidth={2}
          />
        </g>
      )}
      {roofDetail === "chimney" && (
        <g>
          <rect
            x={cx + w * 0.2}
            y={wallY - 28}
            width={14}
            height={26}
            fill="#6a5a4a"
          />
          <rect
            x={cx + w * 0.2 - 2}
            y={wallY - 30}
            width={18}
            height={4}
            rx={1}
            fill="#5a4a3a"
          />
        </g>
      )}
      {roofDetail === "satellite" && (
        <g>
          <line
            x1={cx - 5}
            y1={wallY - 5}
            x2={cx - 5}
            y2={wallY - 30}
            stroke="#606870"
            strokeWidth={2}
          />
          <ellipse
            cx={cx - 5}
            cy={wallY - 32}
            rx={10}
            ry={6}
            fill="#808890"
            transform={`rotate(-25 ${cx - 5} ${wallY - 32})`}
          />
          <circle cx={cx - 5} cy={wallY - 32} r={2} fill="#505860" />
        </g>
      )}

      {/* ─── Downpipe ─── */}
      <rect
        x={x + w - 6}
        y={wallY}
        width={3}
        height={h}
        rx={1}
        fill={trim}
        opacity={0.25}
      />
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                  LOW-POLY TREE (Kenney style)                   */
/* ═══════════════════════════════════════════════════════════════ */

function LowPolyTree({
  x,
  y,
  scale = 1,
  variant = 0,
}: {
  x: number;
  y: number;
  scale?: number;
  variant?: number;
}) {
  const colors = [
    { trunk: "#6a5035", leaves: ["#4a9a3a", "#5aad4a", "#6abb5a"] },
    { trunk: "#5a4030", leaves: ["#3d8b37", "#4a9a42", "#58aa50"] },
    { trunk: "#7a5c40", leaves: ["#55ad4c", "#60b858", "#70c468"] },
  ];
  const c = colors[variant % colors.length];
  const swayClass = variant === 1 ? "tree-sway tree-sway-1" : variant === 2 ? "tree-sway tree-sway-2" : "tree-sway";
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* Shadow */}
      <ellipse cx={2} cy={4} rx={18} ry={5} fill="#1a1520" opacity={0.1} />
      {/* Trunk — simple cylinder */}
      <rect x={-4} y={-30} width={8} height={34} rx={2} fill={c.trunk} />
      <rect x={-1} y={-30} width={3} height={34} rx={1} fill="#000" opacity={0.06} />
      {/* Canopy — stacked triangles (low-poly cone style) with wind sway */}
      <g className={swayClass}>
        <polygon points={`0,${-62} -18,${-30} 18,${-30}`} fill={c.leaves[0]} />
        <polygon points={`0,${-74} -14,${-46} 14,${-46}`} fill={c.leaves[1]} />
        <polygon points={`0,${-82} -10,${-58} 10,${-58}`} fill={c.leaves[2]} />
        {/* Highlight edge */}
        <line x1={0} y1={-82} x2={-10} y2={-58} stroke="#fff" strokeWidth={1} opacity={0.15} />
      </g>
      {/* Falling leaves from this tree */}
      <FallingLeaves cx={0} cy={-70} />
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                 LOW-POLY LAMP (Kenney style)                    */
/* ═══════════════════════════════════════════════════════════════ */

function LowPolyLamp({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* Base */}
      <rect x={-8} y={-2} width={16} height={5} rx={2} fill="#4a4540" />
      {/* Pole */}
      <rect x={-3} y={-54} width={6} height={56} rx={2} fill="#5a5550" />
      <rect x={-1} y={-54} width={2} height={56} fill="#000" opacity={0.06} />
      {/* Arm */}
      <path d="M0 -54 Q8 -62 14 -56" fill="none" stroke="#5a5550" strokeWidth={4} strokeLinecap="round" />
      {/* Lamp head — geometric box */}
      <rect x={8} y={-66} width={14} height={11} rx={2} fill="#6a6560" />
      <rect x={8} y={-66} width={14} height={4} rx={1} fill="#7a7570" />
      {/* Light glow */}
      <circle cx={15} cy={-55} r={7} fill="#ffd166" opacity={0.2} />
      <circle cx={15} cy={-55} r={4} fill="#ffd166" opacity={0.6} />
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                     FLOWER BOX (updated)                        */
/* ═══════════════════════════════════════════════════════════════ */

function FlowerBox({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-16} y={-3} width={32} height={10} rx={3} fill="#7a5a30" />
      <rect x={-14} y={-1} width={28} height={6} rx={2} fill="#8a6a38" />
      <rect x={-12} y={-5} width={24} height={4} rx={1} fill="#5a3a18" />
      {[-8, -2, 4, 10].map((fx, i) => (
        <g key={i}>
          <line x1={fx} y1={-5} x2={fx} y2={-14 - i * 2} stroke="#4a8c3f" strokeWidth={1.5} />
          <circle
            cx={fx}
            cy={-16 - i * 2}
            r={3}
            fill={["#ff6b6b", "#ffd166", "#ff6bcb", "#a855f7"][i]}
          />
        </g>
      ))}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                        BENCH (updated)                          */
/* ═══════════════════════════════════════════════════════════════ */

function Bench({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-28} y={-3} width={56} height={6} rx={2} fill="#7a5a30" />
      <rect x={-26} y={-1} width={52} height={3} rx={1} fill="#8a6a38" opacity={0.5} />
      <rect x={-28} y={-22} width={56} height={4} rx={2} fill="#7a5a30" />
      <rect x={-28} y={-16} width={56} height={4} rx={2} fill="#7a5a30" />
      <rect x={-24} y={3} width={4} height={7} rx={1} fill="#5a4020" />
      <rect x={20} y={3} width={4} height={7} rx={1} fill="#5a4020" />
      <rect x={-28} y={-22} width={4} height={26} rx={1.5} fill="#6a4a28" />
      <rect x={24} y={-22} width={4} height={26} rx={1.5} fill="#6a4a28" />
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                      ANIMATED CAR (same)                        */
/* ═══════════════════════════════════════════════════════════════ */

function Car({
  className,
  y,
  left,
  color,
  style,
}: {
  className: string;
  y: number;
  left?: boolean;
  color?: string;
  style?: CSSProperties;
}) {
  const c = color || "#4a6a8a";
  return (
    <g className={className} style={style}>
      <g transform={`translate(0 ${y})${left ? " scale(-1 1)" : ""}`}>
        <ellipse cx="0" cy="34" rx="50" ry="7" fill="#1c1917" opacity={0.12} />
        <rect x="-50" y="4" width="100" height="22" rx="7" fill={c} />
        <rect x="-50" y="4" width="100" height="7" rx="3" fill="#fff" opacity={0.1} />
        <path d="M-24 4 L-12 -12 Q0 -15 12 -12 L24 4 Z" fill={c} />
        <path d="M-20 2 L-10 -9 Q0 -12 10 -9 L20 2 Z" fill="#8ab4d0" opacity={0.8} />
        <path d="M-16 1 L-8 -6 Q-3 -8 -1 -6 L-1 1 Z" fill="#fff" opacity={0.2} />
        <circle cx="-28" cy="26" r="7" fill="#2a2a2a" />
        <circle cx="28" cy="26" r="7" fill="#2a2a2a" />
        <circle cx="-28" cy="26" r="3" fill="#8a8a8a" />
        <circle cx="28" cy="26" r="3" fill="#8a8a8a" />
        <rect x="46" y="10" width="5" height="4" rx="1.5" fill="#ffe9a8" />
        <rect x="-51" y="10" width="5" height="4" rx="1.5" fill="#ff6b4a" opacity={0.8} />
      </g>
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                      STRING LIGHTS (same)                       */
/* ═══════════════════════════════════════════════════════════════ */

function StringLights() {
  const bulbColors = ["#ff6b6b", "#ffd166", "#6bcb77", "#4d96ff", "#ff6bcb", "#ffd700"];
  const anchors = [60, 280, 500, 720, 940, 1160, 1380, 1560];
  return (
    <g>
      {anchors.map((ax, i) => {
        if (i >= anchors.length - 1) return null;
        const bx = anchors[i + 1];
        const midX = (ax + bx) / 2;
        const sag = 12 + (i % 3) * 3;
        return (
          <g key={i}>
            <path
              d={`M${ax} 540 Q${midX} ${540 + sag} ${bx} 540`}
              fill="none"
              stroke="#666"
              strokeWidth={1}
              opacity={0.35}
            />
            {Array.from({ length: 6 }).map((_, j) => {
              const t = (j + 1) / 7;
              const px = ax + (bx - ax) * t;
              const py = 540 + sag * Math.sin(t * Math.PI);
              const color = bulbColors[(i * 6 + j) % bulbColors.length];
              return (
                <g key={j}>
                  <circle
                    cx={px}
                    cy={py}
                    r={4}
                    fill={color}
                    opacity={0.75}
                    className="string-bulb"
                    style={{ animationDelay: `${(i * 0.4 + j * 0.3) % 3}s` }}
                  />
                  <circle
                    cx={px}
                    cy={py}
                    r={7}
                    fill={color}
                    opacity={0.15}
                    className="string-bulb"
                    style={{ animationDelay: `${(i * 0.4 + j * 0.3) % 3}s` }}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                        BUNTING (same)                           */
/* ═══════════════════════════════════════════════════════════════ */

function Bunting() {
  const colors = ["#e74c3c", "#f39c12", "#27ae60", "#3498db", "#9b59b6", "#e67e22"];
  return (
    <g>
      <path d="M10 532 Q400 558 790 532" fill="none" stroke="#999" strokeWidth={1} opacity={0.3} />
      {Array.from({ length: 20 }).map((_, i) => {
        const t = (i + 0.5) / 20;
        const px = 10 + 780 * t;
        const py = 532 + 26 * Math.sin(t * Math.PI);
        return (
          <polygon
            key={i}
            points={`${px - 7},${py} ${px + 7},${py} ${px},${py + 16}`}
            fill={colors[i % colors.length]}
            opacity={0.8}
          />
        );
      })}
      <path d="M810 532 Q1200 558 1590 532" fill="none" stroke="#999" strokeWidth={1} opacity={0.3} />
      {Array.from({ length: 20 }).map((_, i) => {
        const t = (i + 0.5) / 20;
        const px = 810 + 780 * t;
        const py = 532 + 26 * Math.sin(t * Math.PI);
        return (
          <polygon
            key={`r${i}`}
            points={`${px - 7},${py} ${px + 7},${py} ${px},${py + 16}`}
            fill={colors[(i + 3) % colors.length]}
            opacity={0.8}
          />
        );
      })}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                     VENDOR STALL (same)                         */
/* ═══════════════════════════════════════════════════════════════ */

function Stall({ vendor, index }: { vendor: Vendor; index: number }) {
  const awningW = 176;
  return (
    <g transform={`translate(${vendor.x} ${vendor.y})`}>
      <rect x={-86} y={-116} width={9} height={126} rx={3} fill="#6b4a2f" />
      <rect x={77} y={-116} width={9} height={126} rx={3} fill="#6b4a2f" />
      <g>
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={i}
            x={-awningW / 2 + i * 22}
            y={-116}
            width={23}
            height={44}
            rx={4}
            fill={i % 2 === 0 ? vendor.color : vendor.accent}
          />
        ))}
        <rect
          x={-awningW / 2}
          y={-116}
          width={awningW}
          height={44}
          rx={6}
          fill="#3d2f2a"
          opacity={0.08}
        />
      </g>
      <g className="vendor-sprite" transform="rotate(-90 0 -50)">
        <ellipse className="vendor-halo" cx="0" cy="-84" rx="34" ry="40" />
        <g
          className="vendor-idle"
          style={{ animationDelay: `${((index * 0.7) % 2.6) * -1}s` }}
        >
          <g transform="translate(-27 -120)">
            <AvatarPreview width={54} height={70} config={VENDOR_AVATARS[vendor.id]} />
          </g>
        </g>
      </g>
      {vendor.id === "balon" && (
        <g transform="rotate(-90 48 -140)">
          <text x={48} y={-140} fontSize={26} className="wave-hand" aria-hidden="true">
            👋
          </text>
        </g>
      )}
      {vendor.id === "balon" &&
        (() => {
          const BALLOONS = [
            { x: -22, y: -186, r: 15, color: "#ef4444" },
            { x: 6, y: -214, r: 17, color: "#f7c948" },
            { x: 34, y: -176, r: 14, color: "#a855f7" },
            { x: 62, y: -208, r: 15, color: "#14b8a6" },
          ];
          return (
            <g>
              {BALLOONS.map((b, i) => (
                <g key={i}>
                  <line x1={b.x} y1={-70} x2={b.x} y2={b.y + b.r + 3} stroke="#d9c49e" strokeWidth={2} />
                  <g
                    className="balloon"
                    style={{
                      animationDuration: `${3 + (i % 3) * 0.7}s`,
                      animationDelay: `${i * -1.1}s`,
                    }}
                  >
                    <g transform={`translate(${b.x} ${b.y})`}>
                      <ellipse cx="0" cy="0" rx={b.r} ry={b.r * 1.15} fill={b.color} />
                      <ellipse
                        cx={-b.r * 0.3}
                        cy={-b.r * 0.45}
                        rx={b.r * 0.3}
                        ry={b.r * 0.4}
                        fill="#fff"
                        opacity={0.35}
                      />
                      <path
                        d={`M${-b.r * 0.3} ${b.r * 1.05} L0 ${b.r * 1.4} L${b.r * 0.3} ${b.r * 1.05} Z`}
                        fill={b.color}
                      />
                    </g>
                  </g>
                </g>
              ))}
            </g>
          );
        })()}
      <rect x={-80} y={-50} width={160} height={54} rx={9} fill="#5b4636" />
      <rect x={-72} y={-44} width={144} height={12} rx={5} fill="#7a5c3f" />
      <text x={0} y={-57} textAnchor="middle" fontSize={22} transform="rotate(-90 0 -57)">
        {STALL_PRODUCTS[vendor.id]}
      </text>
      <rect
        x={-64}
        y={-34}
        width={128}
        height={26}
        rx={8}
        fill="#fff"
        opacity={0.94}
        stroke="#3d2f2a"
        strokeOpacity={0.15}
      />
      <text x={0} y={-16} textAnchor="middle" fontSize={13} fontWeight={800} fill="#2b2320">
        {vendor.emoji} {vendor.short}
      </text>
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                       GIFT BOX (same)                           */
/* ═══════════════════════════════════════════════════════════════ */

function GiftBox({ claimed }: { claimed: boolean }) {
  return (
    <g transform={`translate(${GIFT_BOX.x} ${GIFT_BOX.y})`}>
      {!claimed && (
        <>
          <text x={-52} y={4} fontSize={20}>
            ✨
          </text>
          <text x={36} y={-10} fontSize={16}>
            ✨
          </text>
        </>
      )}
      <rect
        x={-26}
        y={-14}
        width={52}
        height={12}
        rx={5}
        fill={claimed ? "#9c958c" : "#eab308"}
        stroke="#8a6a1f"
        strokeWidth={2}
      />
      <rect
        x={-24}
        y={-6}
        width={48}
        height={34}
        rx={6}
        fill={claimed ? "#b7b0a6" : "#f7c948"}
        stroke="#8a6a1f"
        strokeWidth={2}
      />
      <rect x={-4} y={-14} width={8} height={42} rx={2} fill="#ff6b4a" />
      <circle cx={0} cy={-12} r={7} fill="#ff8fb3" stroke="#ff6b4a" strokeWidth={2} />
      <text
        x={0}
        y={38}
        textAnchor="middle"
        fontSize={15}
        fontWeight={800}
        fill={claimed ? "#6b655b" : "#2b2320"}
        transform="rotate(-90 0 38)"
      >
        {claimed ? "Bugün toplandı ✓" : "Hediye kutusu +150 SP"}
      </text>
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                         CLOUD (same)                            */
/* ═══════════════════════════════════════════════════════════════ */

function Cloud({
  cx,
  cy,
  scale = 1,
}: {
  cx: number;
  cy: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
      <ellipse cx={0} cy={0} rx={46} ry={14} fill="#fff" opacity={0.92} />
      <ellipse cx={-26} cy={-6} rx={20} ry={11} fill="#fff" opacity={0.88} />
      <ellipse cx={26} cy={-5} rx={24} ry={12} fill="#fff" opacity={0.9} />
      <ellipse cx={0} cy={-12} rx={18} ry={9} fill="#fff" opacity={0.85} />
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                  FALLING LEAVES (wind effect)                   */
/* ═══════════════════════════════════════════════════════════════ */

function FallingLeaves({ cx, cy }: { cx: number; cy: number }) {
  const leaves = [
    { dx: -12, delay: "0s", dur: "4.5s", color: "#5aad4a", size: 3.5, anim: "wind-leaf-1" },
    { dx: 8, delay: "1.8s", dur: "5.2s", color: "#6abb5a", size: 3, anim: "wind-leaf-2" },
    { dx: -5, delay: "3.2s", dur: "4s", color: "#88c86a", size: 2.8, anim: "wind-leaf-3" },
    { dx: 14, delay: "2.5s", dur: "5.8s", color: "#4a9a3a", size: 3.2, anim: "wind-leaf-1" },
    { dx: -18, delay: "0.8s", dur: "4.8s", color: "#55ad4c", size: 2.5, anim: "wind-leaf-2" },
  ];
  return (
    <g>
      {leaves.map((l, i) => (
        <g key={i}>
          {/* Leaf shape — small diamond */}
          <polygon
            points={`${cx + l.dx},${cy} ${cx + l.dx + l.size},${cy - l.size * 0.7} ${cx + l.dx},${cy - l.size * 1.4} ${cx + l.dx - l.size},${cy - l.size * 0.7}`}
            fill={l.color}
            className="leaf"
            style={{
              transformOrigin: `${cx + l.dx}px ${cy}px`,
              animation: `${l.anim} ${l.dur} ease-in-out ${l.delay} infinite`,
            }}
          />
        </g>
      ))}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*              BACKGROUND BUILDINGS (depth layer)                 */
/* ═══════════════════════════════════════════════════════════════ */

function BackgroundBuildings() {
  const buildings = [
    { x: -10, w: 80, h: 160, c1: "#b0b8c4", c2: "#98a0ac" },
    { x: 90, w: 60, h: 210, c1: "#a8b0bc", c2: "#909aa6" },
    { x: 230, w: 50, h: 130, c1: "#bcc4d0", c2: "#a4acba" },
    { x: 340, w: 70, h: 180, c1: "#a0a8b4", c2: "#8892a0" },
    { x: 470, w: 55, h: 240, c1: "#b4bcc8", c2: "#9ca6b4" },
    { x: 570, w: 65, h: 150, c1: "#a8b0bc", c2: "#9098a6" },
    { x: 690, w: 50, h: 200, c1: "#b8c0cc", c2: "#a0a8b8" },
    { x: 790, w: 60, h: 170, c1: "#a4acb8", c2: "#8c96a4" },
    { x: 900, w: 55, h: 220, c1: "#b0b8c4", c2: "#98a2b0" },
    { x: 1010, w: 65, h: 140, c1: "#bcc4d0", c2: "#a4acba" },
    { x: 1120, w: 50, h: 250, c1: "#a8b0bc", c2: "#9098a8" },
    { x: 1230, w: 60, h: 180, c1: "#b4bcc8", c2: "#9ca6b4" },
    { x: 1350, w: 55, h: 200, c1: "#a0a8b4", c2: "#8892a0" },
    { x: 1460, w: 70, h: 160, c1: "#b8c0cc", c2: "#a0a8b8" },
    { x: 1540, w: 80, h: 190, c1: "#a4acb8", c2: "#8c96a4" },
  ];
  return (
    <g>
      {buildings.map((b, i) => {
        const baseY = 470;
        const wallY = baseY - b.h;
        return (
          <g key={i}>
            <polygon
              points={`${b.x + b.w},${wallY} ${b.x + b.w + 16},${wallY - 8} ${b.x + b.w + 16},${baseY - 8} ${b.x + b.w},${baseY}`}
              fill={b.c2}
              opacity={0.5}
            />
            <rect x={b.x} y={wallY} width={b.w} height={b.h} fill={b.c1} opacity={0.5} />
            <polygon
              points={`${b.x},${wallY} ${b.x + b.w},${wallY} ${b.x + b.w + 16},${wallY - 8} ${b.x + 16},${wallY - 8}`}
              fill={b.c2}
              opacity={0.4}
            />
            {/* Faint windows */}
            {Array.from({ length: Math.floor(b.h / 30) }).map((_, r) =>
              Array.from({ length: Math.floor(b.w / 20) }).map((_, c) => (
                <rect
                  key={`${r}-${c}`}
                  x={b.x + 6 + c * 20}
                  y={wallY + 8 + r * 30}
                  width={10}
                  height={16}
                  fill="#6a98b4"
                  opacity={0.25}
                  rx={1}
                />
              )),
            )}
          </g>
        );
      })}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*                    MAIN STREET SCENE                           */
/* ═══════════════════════════════════════════════════════════════ */
export function StreetScene({ giftClaimed }: { giftClaimed: boolean }) {
  return (
    <g>
      {/* DEBUG: verify StreetScene renders */}
      <rect x={0} y={0} width={1600} height={900} fill="#4a80b8" />
      <defs>
        <linearGradient id="real-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a80b8" />
          <stop offset="50%" stopColor="#7ab0d8" />
          <stop offset="100%" stopColor="#a8d0e8" />
        </linearGradient>
        <radialGradient id="sun-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff8e0" />
          <stop offset="50%" stopColor="#ffd166" stopOpacity={0.25} />
          <stop offset="100%" stopColor="#ffd166" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* ═══ SKY ═══ */}
      <rect x={0} y={0} width={1600} height={470} fill="url(#real-sky)" />
      <circle cx={1400} cy={88} r={70} fill="url(#sun-glow)" />
      <circle cx={1400} cy={88} r={32} fill="#ffd166" />
      <circle cx={1400} cy={88} r={20} fill="#fff3c4" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={1400 + Math.cos(a) * 38}
            y1={88 + Math.sin(a) * 38}
            x2={1400 + Math.cos(a) * 56}
            y2={88 + Math.sin(a) * 56}
            stroke="#ffd166"
            strokeWidth={2}
            opacity={0.25}
            strokeLinecap="round"
          />
        );
      })}
      <Cloud cx={150} cy={65} scale={1.0} />
      <Cloud cx={500} cy={95} scale={0.85} />
      <Cloud cx={850} cy={50} scale={0.95} />
      <Cloud cx={1180} cy={78} scale={0.7} />

      {/* ═══ BACKGROUND BUILDINGS (depth layer) ═══ */}
      <BackgroundBuildings />

      {/* ═══ FOREGROUND ISOMETRIC 3D BUILDINGS ═══ */}

      {/* Building 1 — Café (warm peach, short) */}
      <IsoBuilding
        x={0}
        w={300}
        h={180}
        front="#e8a87c"
        side="#c87848"
        top="#8898a8"
        roof="#505058"
        winColor="#6ab0d6"
        winFrame="#4a6070"
        trim="#f0d8c0"
        floors={2}
        winsPerFloor={4}
        sign="☕ KAFE"
        signBg="#fff5eb"
        signFg="#6a4020"
        hasShop
        shopGlass="#2a3a4a"
        awningA="#e8a87c"
        awningB="#f5d8b8"
        doorColor="#5a3a1a"
        roofDetail="chimney"
      />

      {/* Building 2 — Tall white skyscraper */}
      <IsoBuilding
        x={305}
        w={120}
        h={340}
        front="#e8ecf0"
        side="#c0c4cc"
        top="#8890a0"
        roof="#484850"
        winColor="#5898c8"
        winFrame="#3a5868"
        trim="#d0d4dc"
        floors={8}
        winsPerFloor={2}
        roofDetail="antenna"
      />

      {/* Building 3 — Medium orange apartment */}
      <IsoBuilding
        x={430}
        w={130}
        h={230}
        front="#d49060"
        side="#b06838"
        top="#8890a0"
        roof="#505058"
        winColor="#6ab0d6"
        winFrame="#4a6070"
        trim="#e8c8a0"
        floors={5}
        winsPerFloor={2}
        roofDetail="ac"
      />

      {/* Building 4 — Bakery (cream, short) */}
      <IsoBuilding
        x={565}
        w={260}
        h={160}
        front="#f0d8b8"
        side="#d4b088"
        top="#9098a8"
        roof="#505058"
        winColor="#6ab0d6"
        winFrame="#4a6070"
        trim="#f8e8d0"
        floors={2}
        winsPerFloor={3}
        sign="🥐 FIRIN"
        signBg="#fff8f0"
        signFg="#6a4020"
        hasShop
        shopGlass="#2a3a4a"
        awningA="#f0d8b8"
        awningB="#fff0e0"
        doorColor="#5a3a1a"
      />

      {/* Building 5 — Narrow tall white tower */}
      <IsoBuilding
        x={830}
        w={100}
        h={290}
        front="#e0e4ec"
        side="#b8bcc8"
        top="#808898"
        roof="#484850"
        winColor="#5898c8"
        winFrame="#3a5868"
        trim="#ccd0d8"
        floors={7}
        winsPerFloor={2}
        roofDetail="satellite"
      />

      {/* Building 6 — Toy store (warm orange, short) */}
      <IsoBuilding
        x={935}
        w={260}
        h={170}
        front="#e0a070"
        side="#c07848"
        top="#8898a8"
        roof="#505058"
        winColor="#6ab0d6"
        winFrame="#4a6070"
        trim="#f0d0a8"
        floors={2}
        winsPerFloor={3}
        sign="🧸 OYUNCAKÇI"
        signBg="#fff5eb"
        signFg="#6a4020"
        hasShop
        shopGlass="#2a3a4a"
        awningA="#e0a070"
        awningB="#f5d0a0"
        doorColor="#5a3a1a"
      />

      {/* Building 7 — Medium white building */}
      <IsoBuilding
        x={1200}
        w={120}
        h={240}
        front="#e4e8f0"
        side="#bcc0cc"
        top="#8890a0"
        roof="#484850"
        winColor="#5898c8"
        winFrame="#3a5868"
        trim="#d4d8e0"
        floors={6}
        winsPerFloor={2}
        roofDetail="tank"
      />

      {/* Building 8 — Fashion store (peach, short-mid) */}
      <IsoBuilding
        x={1325}
        w={275}
        h={190}
        front="#e8b088"
        side="#c88858"
        top="#8898a8"
        roof="#505058"
        winColor="#6ab0d6"
        winFrame="#4a6070"
        trim="#f0d8c0"
        floors={2}
        winsPerFloor={4}
        sign="🕶️ MODA"
        signBg="#fff5eb"
        signFg="#5a3020"
        hasShop
        shopGlass="#2a3a4a"
        awningA="#c888e8"
        awningB="#f5d8b8"
        doorColor="#4a2a1a"
      />

      {/* ═══ TOP SIDEWALK ═══ */}
      <rect x={0} y={470} width={1600} height={90} fill="#d0ccc0" />
      <g stroke="#c0bbb0" strokeWidth={1.2}>
        {[482, 496, 510, 524, 538, 552].map((y) => (
          <line key={y} x1={0} y1={y} x2={1600} y2={y} />
        ))}
      </g>

      {/* ═══ HEDGE (with wind sway) ═══ */}
      {Array.from({ length: 14 }).map((_, i) => (
        <g key={i} className="hedge-sway" style={{ animationDelay: `${i * 0.15}s` }}>
          <rect x={i * 118 - 10} y={514} width={128} height={32} rx={14} fill="#2d7a38" />
          <rect x={i * 118 - 10} y={514} width={128} height={14} rx={7} fill="#3d9a48" opacity={0.8} />
          <rect x={i * 118 - 4} y={516} width={116} height={6} rx={3} fill="#4dAA58" opacity={0.4} />
        </g>
      ))}

      {/* ═══ STRING LIGHTS ═══ */}
      <StringLights />

      {/* ═══ BUNTING ═══ */}
      <Bunting />

      {/* ═══ ROAD ═══ */}
      <rect x={0} y={560} width={1600} height={120} fill="#3a3835" />
      {/* Curbs */}
      <rect x={0} y={558} width={1600} height={5} fill="#8a8580" />
      <rect x={0} y={677} width={1600} height={5} fill="#8a8580" />
      {/* ═══ ROAD LANE MARKINGS ═══ */}
      {/* Top edge line */}
      <rect x={0} y={567} width={1600} height={3} fill="#e8e4e0" opacity={0.9} />
      {/* Upper lane divider (dashed white) */}
      <g fill="#e8e4e0" opacity={0.85}>
        {Array.from({ length: 20 }).map((_, i) => (
          <rect key={i} x={i * 85} y={592} width={50} height={3} rx={1} />
        ))}
      </g>
      {/* Center median (solid yellow double line) */}
      <rect x={0} y={611} width={1600} height={2.5} fill="#e8c84a" opacity={0.9} />
      <rect x={0} y={615.5} width={1600} height={2.5} fill="#e8c84a" opacity={0.9} />
      {/* Lower lane divider (dashed white) */}
      <g fill="#e8e4e0" opacity={0.85}>
        {Array.from({ length: 20 }).map((_, i) => (
          <rect key={i} x={i * 85} y={644} width={50} height={3} rx={1} />
        ))}
      </g>
      {/* Bottom edge line */}
      <rect x={0} y={670} width={1600} height={3} fill="#e8e4e0" opacity={0.9} />
      {/* ═══ DIRECTION ARROWS ═══ */}
      {/* Right-pointing arrows (upper lane) */}
      {[200, 500, 800, 1100, 1400].map((ax) => (
        <g key={`r${ax}`} fill="#e8e4e0" opacity={0.5} transform={`translate(${ax}, 582)`}>
          <rect x={0} y={2} width={30} height={3} rx={1} />
          <polygon points="28,0 38,3.5 28,7" />
        </g>
      ))}
      {/* Left-pointing arrows (lower lane) */}
      {[100, 400, 700, 1000, 1300].map((ax) => (
        <g key={`l${ax}`} fill="#e8e4e0" opacity={0.5} transform={`translate(${ax}, 653)`}>
          <rect x={8} y={2} width={30} height={3} rx={1} />
          <polygon points="10,0 0,3.5 10,7" />
        </g>
      ))}
      {/* Crosswalks */}
      {[360, 1060].map((cx) => (
        <g key={cx} fill="#e8e4e0" opacity={0.85}>
          {Array.from({ length: 8 }).map((_, i) => (
            <rect key={i} x={cx + i * 26} y={563} width={16} height={114} rx={3} />
          ))}
        </g>
      ))}
      {/* Animated center dashes (yellow, moving) */}
      <g className="road-dashes" fill="#e8c84a">
        {Array.from({ length: 16 }).map((_, i) => (
          <rect key={i} x={-122 + i * 122} y={614} width={64} height={10} rx={5} />
        ))}
      </g>
      {/* Traffic */}
      <Car className="car-r" y={574} color="#c0392b" style={{ animationDuration: "16s", animationDelay: "-3s" }} />
      <Car className="car-r" y={602} color="#2980b9" style={{ animationDuration: "21s", animationDelay: "-11s" }} />
      <Car className="car-l" y={631} left color="#f39c12" style={{ animationDuration: "24s", animationDelay: "-8s" }} />
      <Car className="car-l" y={648} left color="#8e44ad" style={{ animationDuration: "18s", animationDelay: "-16s" }} />

      {/* ═══ BOTTOM SIDEWALK ═══ */}
      <rect x={0} y={680} width={1600} height={140} fill="#d0ccc0" />
      <g stroke="#c0bbb0" strokeWidth={1.2}>
        {[700, 716, 732, 748, 764, 780, 796, 812].map((y) => (
          <line key={y} x1={0} y1={y} x2={1600} y2={y} />
        ))}
      </g>

      {/* ═══ FLOWER BOXES ═══ */}
      <FlowerBox x={160} y={820} />
      <FlowerBox x={460} y={820} />
      <FlowerBox x={760} y={820} />
      <FlowerBox x={1060} y={820} />
      <FlowerBox x={1360} y={820} />

      {/* ═══ BENCHES ═══ */}
      <Bench x={350} y={816} />
      <Bench x={1150} y={816} />

      {/* ═══ GRASS ═══ */}
      <rect x={0} y={832} width={1600} height={68} fill="#6aaa5a" />
      <rect x={0} y={832} width={1600} height={12} fill="#5a9a4a" opacity={0.5} />
      {/* Wildflowers */}
      {Array.from({ length: 24 }).map((_, i) => {
        const fx = 30 + i * 66;
        const fy = 850 + (i % 3) * 8;
        const cols = ["#e74c3c", "#f1c40f", "#9b59b6", "#e91e63", "#00bcd4", "#ff9800"];
        return <circle key={i} cx={fx} cy={fy} r={3} fill={cols[i % cols.length]} />;
      })}

      {/* ═══ LOW-POLY TREES (with wind sway + falling leaves) ═══ */}
      <LowPolyTree x={200} y={508} scale={1.0} variant={0} />
      <LowPolyTree x={820} y={508} scale={1.1} variant={1} />
      <LowPolyTree x={1420} y={508} scale={0.95} variant={2} />

      {/* ═══ SCATTERED WIND-BLOWN LEAVES ═══ */}
      <FallingLeaves cx={350} cy={460} />
      <FallingLeaves cx={700} cy={470} />
      <FallingLeaves cx={1100} cy={455} />
      <FallingLeaves cx={1400} cy={465} />

      {/* ═══ LOW-POLY LAMPS ═══ */}
      <LowPolyLamp x={480} y={510} />
      <LowPolyLamp x={1120} y={510} />

      {/* ═══ VENDOR STALLS ═══ */}
      {VENDORS.map((vendor, index) => (
        <Stall key={vendor.id} vendor={vendor} index={index} />
      ))}

      {/* ═══ GIFT BOX ═══ */}
      <GiftBox claimed={giftClaimed} />
    </g>
  );
}
