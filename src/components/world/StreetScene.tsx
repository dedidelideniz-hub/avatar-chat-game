import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import type { AvatarConfig } from "@/lib/avatar";
import { GIFT_BOX, VENDORS, type Vendor } from "@/lib/shop";
import type { CSSProperties } from "react";

/**
 * Canlı Cadde — realistic Turkish street with textured buildings.
 * 1600×900 world. Obstacles in shop.ts must match these drawings.
 */

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

/* ═══ Realistic Building ═══ */
interface BuildingProps {
  x: number;
  w: number;
  h: number;
  wallColor: string;
  brickColor: string;
  brickMortar: string;
  roofColor: string;
  trimColor: string;
  doorColor: string;
  floorCount?: number;
  sign?: string;
  signBg?: string;
  signFg?: string;
}

function RealisticBuilding({
  x, w, h, wallColor, brickColor, brickMortar, roofColor, trimColor, doorColor,
  floorCount = 2, sign, signBg, signFg,
}: BuildingProps) {
  const cx = x + w / 2;
  const wallY = 470 - h;
  const roofH = 55;
  const storyH = Math.floor(h / floorCount);
  const windowW = 36;
  const windowH = 44;

  return (
    <g>
      {/* building shadow on ground */}
      <rect x={x + 6} y={wallY + h + 2} width={w} height={8} rx={2} fill="#000000" opacity={0.08} />

      {/* main wall with brick texture */}
      <rect x={x} y={wallY} width={w} height={h} fill={wallColor} />
      {/* brick pattern overlay */}
      {Array.from({ length: Math.floor(h / 14) }).map((_, row) =>
        Array.from({ length: Math.floor(w / 28) }).map((_, col) => {
          const bx = x + 2 + col * 28 + (row % 2 === 0 ? 0 : 14);
          const by = wallY + 2 + row * 14;
          if (bx + 24 > x + w || by + 10 > wallY + h) return null;
          return (
            <rect key={`${row}-${col}`} x={bx} y={by} width={24} height={10} rx={1.5} fill={brickColor} opacity={0.45} />
          );
        })
      )}
      {/* mortar lines */}
      {Array.from({ length: Math.floor(h / 14) }).map((_, i) => (
        <line key={`m${i}`} x1={x} y1={wallY + 2 + i * 14} x2={x + w} y2={wallY + 2 + i * 14} stroke={brickMortar} strokeWidth={0.8} opacity={0.3} />
      ))}

      {/* ground floor shadow strip */}
      <rect x={x} y={wallY + h - 4} width={w} height={4} fill="#000000" opacity={0.06} />

      {/* window sills + lintels for each floor */}
      {Array.from({ length: floorCount }).map((_, floor) => {
        const fy = wallY + 16 + floor * storyH;
        const winCount = floor === 0 ? 2 : 3;
        const spacing = (w - 40) / winCount;
        return Array.from({ length: winCount }).map((_, wi) => {
          const wx = x + 20 + wi * spacing;
          const wy = fy;
          return (
            <g key={`${floor}-${wi}`}>
              {/* lintel (stone above window) */}
              <rect x={wx - 3} y={wy - 4} width={windowW + 6} height={6} rx={1} fill={trimColor} opacity={0.7} />
              {/* window glass */}
              <rect x={wx} y={wy} width={windowW} height={windowH} rx={2} fill="#1a2a3a" />
              <rect x={wx + 2} y={wy + 2} width={windowW - 4} height={windowH - 4} rx={1} fill="#3a5a7a" opacity={0.85} />
              {/* reflection */}
              <rect x={wx + 4} y={wy + 4} width={12} height={windowH - 12} rx={1} fill="#ffffff" opacity={0.15} />
              {/* cross bars */}
              <line x1={wx + windowW / 2} y1={wy} x2={wx + windowW / 2} y2={wy + windowH} stroke={trimColor} strokeWidth={2.5} opacity={0.6} />
              <line x1={wx} y1={wy + windowH / 2} x2={wx + windowW} y2={wy + windowH / 2} stroke={trimColor} strokeWidth={2.5} opacity={0.6} />
              {/* window sill */}
              <rect x={wx - 4} y={wy + windowH} width={windowW + 8} height={5} rx={1} fill={trimColor} />
              {/* shadow under sill */}
              <rect x={wx - 2} y={wy + windowH + 5} width={windowW + 4} height={2} fill="#000000" opacity={0.06} />
            </g>
          );
        });
      })}

      {/* roof — tiled */}
      <polygon points={`${x - 8},${wallY} ${cx},${wallY - roofH} ${x + w + 8},${wallY}`} fill={roofColor} />
      {/* roof tile rows */}
      {Array.from({ length: 8 }).map((_, i) => {
        const ty = wallY - roofH + 6 + i * 6;
        const rowW = ((roofH - 6 - i * 6) / roofH) * (w + 16);
        const rx = cx - rowW / 2;
        return (
          <g key={i}>
            <line x1={rx} y1={ty} x2={rx + rowW} y2={ty} stroke="#000000" strokeWidth={0.6} opacity={0.12} />
            {/* tile bumps */}
            {Array.from({ length: Math.floor(rowW / 16) }).map((_, j) => (
              <ellipse key={j} cx={rx + 8 + j * 16} cy={ty} rx={7} ry={2} fill="#000000" opacity={0.04} />
            ))}
          </g>
        );
      })}
      {/* roof ridge */}
      <line x1={cx - 4} y1={wallY - roofH + 2} x2={cx + 4} y2={wallY - roofH + 2} stroke={roofColor} strokeWidth={5} strokeLinecap="round" />
      {/* roof edge shadow */}
      <line x1={x - 6} y1={wallY} x2={cx} y2={wallY - roofH} stroke="#000000" strokeWidth={2} opacity={0.08} />
      <line x1={x + w + 6} y1={wallY} x2={cx} y2={wallY - roofH} stroke="#000000" strokeWidth={2} opacity={0.08} />

      {/* chimney */}
      <rect x={cx + w * 0.25} y={wallY - roofH + 16} width={18} height={32} fill="#8b7355" />
      <rect x={cx + w * 0.25 - 2} y={wallY - roofH + 12} width={22} height={6} rx={1} fill="#7a6345" />

      {/* ground floor — shop front */}
      <rect x={x + 6} y={wallY + h - storyH + 8} width={w - 12} height={storyH - 16} rx={4} fill="#1a1a1a" opacity={0.08} />
      {/* shop glass */}
      <rect x={x + 12} y={wallY + h - storyH + 16} width={w - 24} height={storyH - 40} rx={6} fill="#2a3a4a" />
      <rect x={x + 16} y={wallY + h - storyH + 20} width={w - 32} height={storyH - 48} rx={4} fill="#d8e8f0" opacity={0.92} />
      {/* shop interior hint */}
      <rect x={x + 18} y={wallY + h - storyH + 22} width={w - 36} height={storyH - 52} rx={3} fill="#e8f0f4" opacity={0.5} />

      {/* door */}
      <rect x={cx - 22} y={wallY + h - 76} width={44} height={68} rx={4} fill={doorColor} />
      <rect x={cx - 18} y={wallY + h - 72} width={16} height={58} rx={2} fill="#000000" opacity={0.08} />
      <rect x={cx + 2} y={wallY + h - 72} width={16} height={58} rx={2} fill="#000000" opacity={0.08} />
      <circle cx={cx + 14} cy={wallY + h - 40} r={3} fill="#c9a84c" />
      {/* door step */}
      <rect x={cx - 28} y={wallY + h - 6} width={56} height={8} rx={2} fill="#b0a898" />

      {/* awning over shop */}
      <g>
        {Array.from({ length: Math.floor(w / 20) }).map((_, i) => (
          <rect key={i} x={x + i * 20} y={wallY + h - storyH + 4} width={21} height={32} rx={3} fill={i % 2 === 0 ? roofColor : trimColor} opacity={0.85} />
        ))}
        <rect x={x} y={wallY + h - storyH + 4} width={w} height={6} rx={3} fill="#000000" opacity={0.1} />
      </g>

      {/* sign */}
      {sign && (
        <g>
          <rect x={cx - 72} y={wallY + 8} width={144} height={36} rx={8} fill={signBg || "#ffffff"} stroke={trimColor} strokeWidth={2} />
          <text x={cx} y={wallY + 32} textAnchor="middle" fontSize={16} fontWeight={800} fill={signFg || "#333"}>
            {sign}
          </text>
        </g>
      )}

      {/* downpipe */}
      <rect x={x + w - 12} y={wallY} width={4} height={h} rx={1} fill={trimColor} opacity={0.4} />
    </g>
  );
}

/* ═══ Realistic Tree ═══ */
function RealisticTree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* trunk */}
      <rect x={-6} y={-35} width={12} height={38} rx={3} fill="#6b5035" />
      <rect x={-3} y={-35} width={4} height={38} rx={1} fill="#7a5c40" opacity={0.5} />
      {/* canopy — layered for depth */}
      <ellipse cx={-14} cy={-42} rx={22} ry={20} fill="#3d8b37" />
      <ellipse cx={14} cy={-38} rx={20} ry={18} fill="#4a9e42" />
      <ellipse cx={0} cy={-54} rx={26} ry={22} fill="#55ad4c" />
      <ellipse cx={-8} cy={-60} rx={16} ry={14} fill="#60b858" opacity={0.7} />
      {/* highlights */}
      <ellipse cx={6} cy={-64} rx={8} ry={6} fill="#7acc6a" opacity={0.4} />
    </g>
  );
}

/* ═══ Realistic Lamp ═══ */
function RealisticLamp({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* pole */}
      <rect x={-4} y={-56} width={8} height={58} rx={3} fill="#4a4540" />
      {/* base */}
      <rect x={-10} y={-2} width={20} height={6} rx={2} fill="#4a4540" />
      {/* arm */}
      <path d="M0 -56 Q10 -64 16 -58" fill="none" stroke="#4a4540" strokeWidth={4} strokeLinecap="round" />
      {/* lamp housing */}
      <rect x={10} y={-68} width={14} height={12} rx={3} fill="#5a5550" />
      {/* light */}
      <circle cx={17} cy={-56} r={6} fill="#ffd166" opacity={0.3} />
      <circle cx={17} cy={-56} r={4} fill="#ffd166" />
    </g>
  );
}

/* ═══ Flower Box ═══ */
function FlowerBox({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-18} y={-4} width={36} height={12} rx={3} fill="#8b6a3f" />
      <rect x={-16} y={-2} width={32} height={8} rx={2} fill="#a07840" />
      {/* soil */}
      <rect x={-14} y={-6} width={28} height={4} rx={1} fill="#5a3a20" />
      {/* flowers */}
      {[-10, -4, 2, 8].map((fx, i) => (
        <g key={i}>
          <line x1={fx} y1={-6} x2={fx} y2={-16 - i * 2} stroke="#4a8c3f" strokeWidth={1.5} />
          <circle cx={fx} cy={-18 - i * 2} r={3.5} fill={["#ff6b6b", "#ffd166", "#ff6bcb", "#a855f7"][i]} />
        </g>
      ))}
    </g>
  );
}

/* ═══ Bench ═══ */
function Bench({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* seat */}
      <rect x={-30} y={-4} width={60} height={7} rx={2} fill="#8b6a3f" />
      <rect x={-28} y={-2} width={56} height={3} rx={1} fill="#a07840" opacity={0.6} />
      {/* backrest */}
      <rect x={-30} y={-24} width={60} height={5} rx={2} fill="#8b6a3f" />
      <rect x={-30} y={-18} width={60} height={5} rx={2} fill="#8b6a3f" />
      {/* legs */}
      <rect x={-26} y={3} width={4} height={8} rx={1} fill="#6b5030" />
      <rect x={22} y={3} width={4} height={8} rx={1} fill="#6b5030" />
      {/* armrests */}
      <rect x={-30} y={-24} width={4} height={28} rx={1.5} fill="#7a5c40" />
      <rect x={26} y={-24} width={4} height={28} rx={1.5} fill="#7a5c40" />
    </g>
  );
}

/* ═══ Animated Car ═══ */
function Car({ className, y, left, color, style }: { className: string; y: number; left?: boolean; color?: string; style?: CSSProperties }) {
  const c = color || "#4a6a8a";
  return (
    <g className={className} style={style}>
      <g transform={`translate(0 ${y})${left ? " scale(-1 1)" : ""}`}>
        {/* shadow */}
        <ellipse cx="0" cy="34" rx="52" ry="7" fill="#1c1917" opacity={0.12} />
        {/* body */}
        <rect x="-52" y="4" width="104" height="24" rx="8" fill={c} />
        <rect x="-52" y="4" width="104" height="8" rx="4" fill="#ffffff" opacity={0.1} />
        {/* roof */}
        <path d="M-26 4 L-14 -12 Q0 -16 14 -12 L26 4 Z" fill={c} />
        {/* window glass */}
        <path d="M-22 2 L-12 -10 Q0 -13 12 -10 L22 2 Z" fill="#8ab4d0" opacity={0.8} />
        {/* reflection */}
        <path d="M-18 1 L-10 -7 Q-4 -9 -2 -7 L-2 1 Z" fill="#ffffff" opacity={0.2} />
        {/* wheels */}
        <circle cx="-30" cy="28" r="8" fill="#2a2a2a" />
        <circle cx="30" cy="28" r="8" fill="#2a2a2a" />
        <circle cx="-30" cy="28" r="3.5" fill="#8a8a8a" />
        <circle cx="30" cy="28" r="3.5" fill="#8a8a8a" />
        {/* headlights */}
        <rect x="48" y="12" width="6" height="5" rx="2" fill="#ffe9a8" />
        <rect x="-54" y="12" width="6" height="5" rx="2" fill="#ff6b4a" opacity={0.8} />
      </g>
    </g>
  );
}

/* ═══ String Lights ═══ */
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
            <path d={`M${ax} 540 Q${midX} ${540 + sag} ${bx} 540`} fill="none" stroke="#666" strokeWidth={1} opacity={0.35} />
            {Array.from({ length: 6 }).map((_, j) => {
              const t = (j + 1) / 7;
              const px = ax + (bx - ax) * t;
              const py = 540 + sag * Math.sin(t * Math.PI);
              const color = bulbColors[(i * 6 + j) % bulbColors.length];
              return (
                <g key={j}>
                  <circle cx={px} cy={py} r={4} fill={color} opacity={0.75} className="string-bulb" style={{ animationDelay: `${(i * 0.4 + j * 0.3) % 3}s` }} />
                  <circle cx={px} cy={py} r={7} fill={color} opacity={0.15} className="string-bulb" style={{ animationDelay: `${(i * 0.4 + j * 0.3) % 3}s` }} />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/* ═══ Bunting ═══ */
function Bunting() {
  const colors = ["#e74c3c", "#f39c12", "#27ae60", "#3498db", "#9b59b6", "#e67e22"];
  return (
    <g>
      <path d="M10 532 Q400 558 790 532" fill="none" stroke="#999" strokeWidth={1} opacity={0.3} />
      {Array.from({ length: 20 }).map((_, i) => {
        const t = (i + 0.5) / 20;
        const px = 10 + 780 * t;
        const py = 532 + 26 * Math.sin(t * Math.PI);
        return <polygon key={i} points={`${px - 7},${py} ${px + 7},${py} ${px},${py + 16}`} fill={colors[i % colors.length]} opacity={0.8} />;
      })}
      <path d="M810 532 Q1200 558 1590 532" fill="none" stroke="#999" strokeWidth={1} opacity={0.3} />
      {Array.from({ length: 20 }).map((_, i) => {
        const t = (i + 0.5) / 20;
        const px = 810 + 780 * t;
        const py = 532 + 26 * Math.sin(t * Math.PI);
        return <polygon key={`r${i}`} points={`${px - 7},${py} ${px + 7},${py} ${px},${py + 16}`} fill={colors[(i + 3) % colors.length]} opacity={0.8} />;
      })}
    </g>
  );
}

/* ═══ Vendor Stall ═══ */
function Stall({ vendor, index }: { vendor: Vendor; index: number }) {
  const awningW = 176;
  return (
    <g transform={`translate(${vendor.x} ${vendor.y})`}>
      <rect x={-86} y={-116} width={9} height={126} rx={3} fill="#6b4a2f" />
      <rect x={77} y={-116} width={9} height={126} rx={3} fill="#6b4a2f" />
      <g>
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x={-awningW / 2 + i * 22} y={-116} width={23} height={44} rx={4} fill={i % 2 === 0 ? vendor.color : vendor.accent} />
        ))}
        <rect x={-awningW / 2} y={-116} width={awningW} height={44} rx={6} fill="#3d2f2a" opacity={0.08} />
      </g>
      <g className="vendor-sprite" transform="rotate(-90 0 -50)">
        <ellipse className="vendor-halo" cx="0" cy="-84" rx="34" ry="40" />
        <g className="vendor-idle" style={{ animationDelay: `${((index * 0.7) % 2.6) * -1}s` }}>
          <g transform="translate(-27 -120)">
            <AvatarPreview width={54} height={70} config={VENDOR_AVATARS[vendor.id]} />
          </g>
        </g>
      </g>
      {vendor.id === "balon" && (
        <g transform="rotate(-90 48 -140)">
          <text x={48} y={-140} fontSize={26} className="wave-hand" aria-hidden="true">👋</text>
        </g>
      )}
      {vendor.id === "balon" && (() => {
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
                <g className="balloon" style={{ animationDuration: `${3 + (i % 3) * 0.7}s`, animationDelay: `${i * -1.1}s` }}>
                  <g transform={`translate(${b.x} ${b.y})`}>
                    <ellipse cx="0" cy="0" rx={b.r} ry={b.r * 1.15} fill={b.color} />
                    <ellipse cx={-b.r * 0.3} cy={-b.r * 0.45} rx={b.r * 0.3} ry={b.r * 0.4} fill="#ffffff" opacity={0.35} />
                    <path d={`M${-b.r * 0.3} ${b.r * 1.05} L0 ${b.r * 1.4} L${b.r * 0.3} ${b.r * 1.05} Z`} fill={b.color} />
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
      <rect x={-64} y={-34} width={128} height={26} rx={8} fill="#ffffff" opacity={0.94} stroke="#3d2f2a" strokeOpacity={0.15} />
      <text x={0} y={-16} textAnchor="middle" fontSize={13} fontWeight={800} fill="#2b2320">
        {vendor.emoji} {vendor.short}
      </text>
    </g>
  );
}

/* ═══ Gift Box ═══ */
function GiftBox({ claimed }: { claimed: boolean }) {
  return (
    <g transform={`translate(${GIFT_BOX.x} ${GIFT_BOX.y})`}>
      {!claimed && (
        <>
          <text x={-52} y={4} fontSize={20}>✨</text>
          <text x={36} y={-10} fontSize={16}>✨</text>
        </>
      )}
      <rect x={-26} y={-14} width={52} height={12} rx={5} fill={claimed ? "#9c958c" : "#eab308"} stroke="#8a6a1f" strokeWidth={2} />
      <rect x={-24} y={-6} width={48} height={34} rx={6} fill={claimed ? "#b7b0a6" : "#f7c948"} stroke="#8a6a1f" strokeWidth={2} />
      <rect x={-4} y={-14} width={8} height={42} rx={2} fill="#ff6b4a" />
      <circle cx={0} cy={-12} r={7} fill="#ff8fb3" stroke="#ff6b4a" strokeWidth={2} />
      <text x={0} y={38} textAnchor="middle" fontSize={15} fontWeight={800} fill={claimed ? "#6b655b" : "#2b2320"} transform="rotate(-90 0 38)">
        {claimed ? "Bugün toplandı ✓" : "Hediye kutusu +150 SP"}
      </text>
    </g>
  );
}

/* ═══ Cloud ═══ */
function Cloud({ cx, cy, scale = 1 }: { cx: number; cy: number; scale?: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
      <ellipse cx={0} cy={0} rx={46} ry={14} fill="#ffffff" opacity={0.92} />
      <ellipse cx={-26} cy={-6} rx={20} ry={11} fill="#ffffff" opacity={0.88} />
      <ellipse cx={26} cy={-5} rx={24} ry={12} fill="#ffffff" opacity={0.9} />
      <ellipse cx={0} cy={-12} rx={18} ry={9} fill="#ffffff" opacity={0.85} />
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*                    MAIN SCENE                              */
/* ═══════════════════════════════════════════════════════════ */
export function StreetScene({ giftClaimed }: { giftClaimed: boolean }) {
  return (
    <g>
      <defs>
        <linearGradient id="real-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6db3e8" />
          <stop offset="60%" stopColor="#a8d8f0" />
          <stop offset="100%" stopColor="#d0eaf8" />
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
        return <line key={i} x1={1400 + Math.cos(a) * 38} y1={88 + Math.sin(a) * 38} x2={1400 + Math.cos(a) * 56} y2={88 + Math.sin(a) * 56} stroke="#ffd166" strokeWidth={2} opacity={0.25} strokeLinecap="round" />;
      })}
      <Cloud cx={150} cy={65} scale={1.0} />
      <Cloud cx={500} cy={95} scale={0.85} />
      <Cloud cx={850} cy={50} scale={0.95} />
      <Cloud cx={1180} cy={78} scale={0.7} />

      {/* ═══ REALISTIC BUILDINGS ═══ */}
      <RealisticBuilding
        x={0} w={330} h={230}
        wallColor="#d4c4a8" brickColor="#b8956a" brickMortar="#c8b898"
        roofColor="#7a4a2a" trimColor="#f0e8d8" doorColor="#5a3a1a"
        floorCount={2} sign="☕ KAFE" signBg="#f5efe4" signFg="#5a3a1a"
      />
      <RealisticBuilding
        x={330} w={330} h={210}
        wallColor="#c8d8c4" brickColor="#a0b898" brickMortar="#b8c8b0"
        roofColor="#5a7a4a" trimColor="#e8f0e4" doorColor="#3a5a2a"
        floorCount={2} sign="🥐 FIRIN" signBg="#f0f5ec" signFg="#3a5a2a"
      />
      <RealisticBuilding
        x={660} w={330} h={240}
        wallColor="#d8ccc0" brickColor="#c0a888" brickMortar="#d0c0a8"
        roofColor="#8a5a3a" trimColor="#f0e8dc" doorColor="#6a4a2a"
        floorCount={2} sign="🧸 OYUNCAKÇI" signBg="#f8f0e4" signFg="#6a4a2a"
      />
      <RealisticBuilding
        x={990} w={330} h={220}
        wallColor="#c4b8d4" brickColor="#a898c0" brickMortar="#b8a8c8"
        roofColor="#6a4a7a" trimColor="#e8e0f0" doorColor="#4a2a5a"
        floorCount={2} sign="🕶️ MODA" signBg="#f0ecf5" signFg="#4a2a5a"
      />
      <RealisticBuilding
        x={1320} w={280} h={200}
        wallColor="#bcd4bc" brickColor="#98b898" brickMortar="#a8c8a8"
        roofColor="#4a6a3a" trimColor="#e4f0e4" doorColor="#2a4a1a"
        floorCount={2} sign="🛒 BAKKAL" signBg="#ecf5ec" signFg="#2a4a1a"
      />

      {/* ═══ TOP SIDEWALK ═══ */}
      <rect x={0} y={470} width={1600} height={90} fill="#d8d0c0" />
      <g stroke="#ccc4b4" strokeWidth={1.2}>
        {[482, 496, 510, 524, 538, 552].map((y) => (
          <line key={y} x1={0} y1={y} x2={1600} y2={y} />
        ))}
      </g>

      {/* ═══ HEDGE ═══ */}
      {Array.from({ length: 14 }).map((_, i) => (
        <g key={i}>
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
      {/* road texture — subtle cracks */}
      <line x1={200} y1={580} x2={215} y2={586} stroke="#4a4845" strokeWidth={0.8} opacity={0.3} />
      <line x1={680} y1={620} x2={700} y2={618} stroke="#4a4845" strokeWidth={0.8} opacity={0.3} />
      <line x1={1100} y1={660} x2={1120} y2={665} stroke="#4a4845" strokeWidth={0.8} opacity={0.3} />
      {/* curbs */}
      <rect x={0} y={558} width={1600} height={5} fill="#8a8580" />
      <rect x={0} y={677} width={1600} height={5} fill="#8a8580" />
      {/* lane lines */}
      <rect x={0} y={590} width={1600} height={2} fill="#8a8580" opacity={0.3} />
      <rect x={0} y={646} width={1600} height={2} fill="#8a8580" opacity={0.3} />
      {/* center dashes */}
      <g className="road-dashes" fill="#e8c84a">
        {Array.from({ length: 16 }).map((_, i) => (
          <rect key={i} x={-122 + i * 122} y={614} width={64} height={10} rx={5} />
        ))}
      </g>
      {/* crosswalks */}
      {[360, 1060].map((x) => (
        <g key={x} fill="#e8e4e0" opacity={0.8}>
          {Array.from({ length: 8 }).map((_, i) => (
            <rect key={i} x={x + i * 26} y={563} width={16} height={114} rx={3} />
          ))}
        </g>
      ))}
      {/* traffic */}
      <Car className="car-r" y={574} color="#c0392b" style={{ animationDuration: "16s", animationDelay: "-3s" }} />
      <Car className="car-r" y={602} color="#2980b9" style={{ animationDuration: "21s", animationDelay: "-11s" }} />
      <Car className="car-l" y={631} left color="#f39c12" style={{ animationDuration: "24s", animationDelay: "-8s" }} />
      <Car className="car-l" y={648} left color="#8e44ad" style={{ animationDuration: "18s", animationDelay: "-16s" }} />

      {/* ═══ BOTTOM SIDEWALK ═══ */}
      <rect x={0} y={680} width={1600} height={140} fill="#d8d0c0" />
      <g stroke="#ccc4b4" strokeWidth={1.2}>
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
      {/* wildflowers */}
      {Array.from({ length: 24 }).map((_, i) => {
        const fx = 30 + i * 66;
        const fy = 850 + (i % 3) * 8;
        const cols = ["#e74c3c", "#f1c40f", "#9b59b6", "#e91e63", "#00bcd4", "#ff9800"];
        return <circle key={i} cx={fx} cy={fy} r={3} fill={cols[i % cols.length]} />;
      })}

      {/* ═══ TREES ═══ */}
      <RealisticTree x={200} y={505} scale={1.0} />
      <RealisticTree x={820} y={505} scale={1.1} />
      <RealisticTree x={1420} y={505} scale={0.95} />

      {/* ═══ LAMPS ═══ */}
      <RealisticLamp x={480} y={510} />
      <RealisticLamp x={1120} y={510} />

      {/* ═══ VENDOR STALLS ═══ */}
      {VENDORS.map((vendor, index) => (
        <Stall key={vendor.id} vendor={vendor} index={index} />
      ))}

      {/* ═══ GIFT BOX ═══ */}
      <GiftBox claimed={giftClaimed} />
    </g>
  );
}
