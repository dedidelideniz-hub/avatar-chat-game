import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import type { AvatarConfig } from "@/lib/avatar";
import { GIFT_BOX, VENDORS, type Vendor } from "@/lib/shop";
import type { CSSProperties } from "react";

/**
 * Canlı Cadde — a vibrant, bustling Turkish market street.
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

/* ─── Vibrant Shop Front ─── */
interface ShopProps {
  x: number;
  w: number;
  wallColor: string;
  accentColor: string;
  awningColor1: string;
  awningColor2: string;
  sign: string;
  signColor?: string;
  neon?: boolean;
}

function VibrantShop({ x, w, wallColor, accentColor, awningColor1, awningColor2, sign, signColor, neon }: ShopProps) {
  const cx = x + w / 2;
  const wallY = 240;
  const wallH = 230;
  return (
    <g>
      {/* building body */}
      <rect x={x} y={wallY} width={w} height={wallH} rx={6} fill={wallColor} />
      {/* decorative horizontal stripe */}
      <rect x={x} y={wallY} width={w} height={10} fill={accentColor} />
      <rect x={x} y={wallY + wallH - 8} width={w} height={8} fill={accentColor} opacity={0.6} />

      {/* upper windows — 2 rows */}
      {[0, 1].map((row) =>
        [0, 1, 2].map((col) => {
          const wx = x + 20 + col * ((w - 40) / 3);
          const wy = wallY + 20 + row * 52;
          return (
            <g key={`${row}-${col}`}>
              <rect x={wx} y={wy} width={38} height={40} rx={6} fill="#1a1a2e" stroke={accentColor} strokeWidth={2.5} />
              {/* window glow */}
              <rect x={wx + 3} y={wy + 3} width={32} height={34} rx={4} fill="#ffe9a8" opacity={0.85} />
              {/* cross */}
              <line x1={wx + 19} y1={wy + 3} x2={wx + 19} y2={wy + 37} stroke={accentColor} strokeWidth={2} />
              <line x1={wx + 3} y1={wy + 20} x2={wx + 35} y2={wy + 20} stroke={accentColor} strokeWidth={2} />
            </g>
          );
        })
      )}

      {/* shop front — large glass window */}
      <rect x={x + 14} y={wallY + 120} width={w - 28} height={70} rx={8} fill="#1a1a2e" stroke={accentColor} strokeWidth={3} />
      <rect x={x + 18} y={wallY + 124} width={w - 36} height={62} rx={5} fill="#e8f4f8" opacity={0.9} />

      {/* door */}
      <rect x={cx - 24} y={wallY + 195} width={48} height={35} rx={6} fill="#5b4636" stroke={accentColor} strokeWidth={2} />
      <circle cx={cx + 10} cy={wallY + 212} r={3} fill="#ffd166" />

      {/* awning — scalloped */}
      <g>
        {Array.from({ length: Math.floor(w / 22) }).map((_, i) => (
          <g key={i}>
            <rect x={x + i * 22} y={wallY + wallH} width={23} height={38} rx={4} fill={i % 2 === 0 ? awningColor1 : awningColor2} />
            <ellipse cx={x + i * 22 + 11} cy={wallY + wallH + 38} rx={11} ry={5} fill={i % 2 === 0 ? awningColor1 : awningColor2} />
          </g>
        ))}
      </g>

      {/* sign board */}
      <rect x={cx - 78} y={wallY + 70} width={156} height={42} rx={10} fill="#ffffff" opacity={0.95} stroke={accentColor} strokeWidth={2.5} />
      <text x={cx} y={wallY + 98} textAnchor="middle" fontSize={18} fontWeight={900} fill={signColor || "#2b2320"}>
        {sign}
      </text>

      {/* neon glow effect */}
      {neon && (
        <g opacity={0.6} className="neon-blink">
          <rect x={cx - 80} y={wallY + 68} width={160} height={46} rx={12} fill="none" stroke={accentColor} strokeWidth={3} />
        </g>
      )}
    </g>
  );
}

/* ─── String Lights (crisscrossing the street) ─── */
function StringLights() {
  const bulbColors = ["#ff6b6b", "#ffd166", "#6bcb77", "#4d96ff", "#ff6bcb", "#ffd700", "#00e5ff", "#ff4444"];
  const anchors = [80, 320, 560, 800, 1040, 1280, 1520];
  return (
    <g>
      {anchors.map((ax, i) => {
        if (i >= anchors.length - 1) return null;
        const bx = anchors[i + 1];
        const midX = (ax + bx) / 2;
        const sag = 14 + (i % 3) * 4;
        return (
          <g key={i}>
            {/* wire */}
            <path d={`M${ax} 540 Q${midX} ${540 + sag} ${bx} 540`} fill="none" stroke="#555" strokeWidth={1.5} opacity={0.5} />
            {/* bulbs */}
            {Array.from({ length: 7 }).map((_, j) => {
              const t = (j + 1) / 8;
              const px = ax + (bx - ax) * t;
              const py = 540 + sag * Math.sin(t * Math.PI);
              const color = bulbColors[(i * 7 + j) % bulbColors.length];
              return (
                <g key={j}>
                  <circle cx={px} cy={py} r={5} fill={color} opacity={0.85} className="string-bulb" style={{ animationDelay: `${(i * 0.3 + j * 0.2) % 2.5}s` }} />
                  <circle cx={px} cy={py} r={8} fill={color} opacity={0.2} className="string-bulb" style={{ animationDelay: `${(i * 0.3 + j * 0.2) % 2.5}s` }} />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/* ─── Bunting / Pennant Flags ─── */
function Bunting() {
  const colors = ["#ff6b6b", "#ffd166", "#6bcb77", "#4d96ff", "#ff6bcb", "#a855f7"];
  return (
    <g>
      {/* left half */}
      <path d="M20 530 Q400 555 780 530" fill="none" stroke="#888" strokeWidth={1.2} opacity={0.4} />
      {Array.from({ length: 18 }).map((_, i) => {
        const t = (i + 0.5) / 18;
        const px = 20 + 760 * t;
        const py = 530 + 25 * Math.sin(t * Math.PI);
        return (
          <polygon key={i} points={`${px - 8},${py} ${px + 8},${py} ${px},${py + 18}`} fill={colors[i % colors.length]} opacity={0.85} />
        );
      })}
      {/* right half */}
      <path d="M820 530 Q1200 555 1580 530" fill="none" stroke="#888" strokeWidth={1.2} opacity={0.4} />
      {Array.from({ length: 18 }).map((_, i) => {
        const t = (i + 0.5) / 18;
        const px = 820 + 760 * t;
        const py = 530 + 25 * Math.sin(t * Math.PI);
        return (
          <polygon key={`r${i}`} points={`${px - 8},${py} ${px + 8},${py} ${px},${py + 18}`} fill={colors[(i + 3) % colors.length]} opacity={0.85} />
        );
      })}
    </g>
  );
}

/* ─── Flower Pot ─── */
function FlowerPot({ x, y, flowerColor }: { x: number; y: number; flowerColor: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-10} y={-4} width={20} height={14} rx={3} fill="#c45a3c" />
      <rect x={-8} y={-2} width={16} height={10} rx={2} fill="#a04830" />
      <circle cx={0} cy={-14} r={8} fill="#5cb85c" />
      <circle cx={-5} cy={-18} r={5} fill="#6cc96c" />
      <circle cx={5} cy={-16} r={5} fill="#4fae4f" />
      <circle cx={0} cy={-22} r={4} fill={flowerColor} />
      <circle cx={-4} cy={-20} r={3} fill={flowerColor} opacity={0.8} />
      <circle cx={4} cy={-20} r={3} fill={flowerColor} opacity={0.8} />
    </g>
  );
}

/* ─── Street Lamp (ornate) ─── */
function OrnateLamp({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-5} y={-58} width={10} height={60} rx={4} fill="#4a4540" />
      <rect x={-8} y={-62} width={16} height={8} rx={4} fill="#4a4540" />
      <circle cx={0} cy={-72} r={12} fill="#ffd166" opacity={0.35} />
      <circle cx={0} cy={-72} r={7} fill="#ffd166" />
      <circle cx={0} cy={-72} r={4} fill="#fff3c4" />
      {/* decorative scroll */}
      <path d="M-16 -40 Q-20 -50 -10 -55" fill="none" stroke="#4a4540" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M16 -40 Q20 -50 10 -55" fill="none" stroke="#4a4540" strokeWidth={2.5} strokeLinecap="round" />
    </g>
  );
}

/* ─── Bench ─── */
function Bench({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-28} y={-6} width={56} height={8} rx={3} fill="#8b6a3f" />
      <rect x={-28} y={-24} width={56} height={6} rx={3} fill="#8b6a3f" />
      <rect x={-24} y={-24} width={4} height={26} rx={2} fill="#6b5030" />
      <rect x={20} y={-24} width={4} height={26} rx={2} fill="#6b5030" />
      {/* backrest slats */}
      <rect x={-22} y={-22} width={44} height={4} rx={1} fill="#a07840" opacity={0.7} />
      <rect x={-22} y={-16} width={44} height={4} rx={1} fill="#a07840" opacity={0.7} />
    </g>
  );
}

/* ─── Animated Car ─── */
function Car({ className, y, left, color, style }: { className: string; y: number; left?: boolean; color?: string; style?: CSSProperties }) {
  const c = color || "#3b82f6";
  return (
    <g className={className} style={style}>
      <g transform={`translate(0 ${y})${left ? " scale(-1 1)" : ""}`}>
        <ellipse cx="0" cy="34" rx="52" ry="7" fill="#1c1917" opacity={0.16} />
        <rect x="-52" y="2" width="104" height="28" rx="12" fill={c} stroke="#3d2f2a" strokeOpacity={0.25} strokeWidth={2} />
        <path d="M-24 2 L-12 -16 Q0 -21 12 -16 L24 2 Z" fill="#93c5fd" stroke="#3d2f2a" strokeOpacity={0.25} strokeWidth={2} />
        <circle cx="-30" cy="30" r="9" fill="#2b2320" />
        <circle cx="30" cy="30" r="9" fill="#2b2320" />
        <circle cx="-30" cy="30" r="4" fill="#9ca3af" />
        <circle cx="30" cy="30" r="4" fill="#9ca3af" />
        <circle cx="50" cy="17" r="3" fill="#ffe9a8" />
        <circle cx="-50" cy="17" r="3" fill="#ff6b4a" />
      </g>
    </g>
  );
}

/* ─── Vendor Stall ─── */
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

/* ─── Gift Box ─── */
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

/* ─── Cloud ─── */
function Cloud({ cx, cy, scale = 1 }: { cx: number; cy: number; scale?: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`} fill="#ffffff" opacity={0.9}>
      <ellipse cx={0} cy={0} rx={48} ry={16} />
      <ellipse cx={-28} cy={-8} rx={22} ry={12} />
      <ellipse cx={28} cy={-6} rx={26} ry={14} />
      <ellipse cx={0} cy={-14} rx={20} ry={10} />
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
        <linearGradient id="vibrant-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6ec6ff" />
          <stop offset="50%" stopColor="#a8dcf7" />
          <stop offset="100%" stopColor="#d4eeff" />
        </linearGradient>
        <radialGradient id="sun-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff3c4" />
          <stop offset="60%" stopColor="#ffd166" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#ffd166" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* ═══ SKY ═══ */}
      <rect x={0} y={0} width={1600} height={470} fill="url(#vibrant-sky)" />
      {/* sun with glow */}
      <circle cx={1420} cy={90} r={80} fill="url(#sun-glow)" />
      <circle cx={1420} cy={90} r={36} fill="#ffd166" />
      <circle cx={1420} cy={90} r={24} fill="#fff3c4" />
      {/* sun rays */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <line key={i} x1={1420 + Math.cos(a) * 42} y1={90 + Math.sin(a) * 42} x2={1420 + Math.cos(a) * 62} y2={90 + Math.sin(a) * 62} stroke="#ffd166" strokeWidth={2.5} opacity={0.3} strokeLinecap="round" />
        );
      })}
      {/* clouds */}
      <Cloud cx={160} cy={70} scale={1.1} />
      <Cloud cx={520} cy={100} scale={0.9} />
      <Cloud cx={880} cy={55} scale={1.0} />
      <Cloud cx={1200} cy={85} scale={0.75} />

      {/* ═══ VIBRANT BUILDINGS ═══ */}
      <VibrantShop x={0} w={330} wallColor="#ff6b6b" accentColor="#ffd166" awningColor1="#ff6b6b" awningColor2="#ffd166" sign="☕ KAFE" signColor="#c0392b" neon />
      <VibrantShop x={330} w={330} wallColor="#4ecdc4" accentColor="#ffffff" awningColor1="#4ecdc4" awningColor2="#45b7aa" sign="🥐 FIRIN" signColor="#1a7a6e" />
      <VibrantShop x={660} w={330} wallColor="#ffe66d" accentColor="#ff6b6b" awningColor1="#ffe66d" awningColor2="#ffd93d" sign="🧸 OYUNCAKÇI" signColor="#c0392b" />
      <VibrantShop x={990} w={330} wallColor="#a855f7" accentColor="#ffd166" awningColor1="#a855f7" awningColor2="#c084fc" sign="🕶️ MODA" signColor="#ffd166" neon />
      <VibrantShop x={1320} w={280} wallColor="#22c55e" accentColor="#ffffff" awningColor1="#22c55e" awningColor2="#16a34a" sign="🛒 BAKKAL" signColor="#ffffff" />

      {/* ═══ TOP SIDEWALK ═══ */}
      <rect x={0} y={470} width={1600} height={90} fill="#f0e6d6" />
      <g stroke="#ddd0be" strokeWidth={1.5}>
        {[482, 494, 506, 518, 530, 542, 554].map((y) => (
          <line key={y} x1={0} y1={y} x2={1600} y2={y} />
        ))}
      </g>

      {/* ═══ HEDGE ═══ */}
      <g>
        {Array.from({ length: 14 }).map((_, i) => (
          <g key={i}>
            <rect x={i * 118 - 10} y={514} width={128} height={34} rx={16} fill="#2d8a3e" />
            <rect x={i * 118 - 10} y={514} width={128} height={15} rx={8} fill="#43a854" opacity={0.85} />
          </g>
        ))}
      </g>

      {/* ═══ STRING LIGHTS ═══ */}
      <StringLights />

      {/* ═══ BUNTING ═══ */}
      <Bunting />

      {/* ═══ ROAD ═══ */}
      <rect x={0} y={560} width={1600} height={120} fill="#3d3a36" />
      <rect x={0} y={560} width={1600} height={5} fill="#6b6560" />
      <rect x={0} y={675} width={1600} height={5} fill="#6b6560" />
      {/* lane lines */}
      <rect x={0} y={590} width={1600} height={2} fill="#6b6560" opacity={0.35} />
      <rect x={0} y={646} width={1600} height={2} fill="#6b6560" opacity={0.35} />
      {/* center dashes */}
      <g className="road-dashes" fill="#ffd166">
        {Array.from({ length: 16 }).map((_, i) => (
          <rect key={i} x={-122 + i * 122} y={614} width={64} height={12} rx={6} />
        ))}
      </g>
      {/* crosswalks */}
      {[360, 1060].map((x) => (
        <g key={x} fill="#ffffff" opacity={0.85}>
          {Array.from({ length: 8 }).map((_, i) => (
            <rect key={i} x={x + i * 26} y={563} width={16} height={114} rx={4} />
          ))}
        </g>
      ))}
      {/* traffic — colorful cars */}
      <Car className="car-r" y={574} color="#ff6b6b" style={{ animationDuration: "16s", animationDelay: "-3s" }} />
      <Car className="car-r" y={602} color="#4ecdc4" style={{ animationDuration: "21s", animationDelay: "-11s" }} />
      <Car className="car-l" y={631} left color="#ffe66d" style={{ animationDuration: "24s", animationDelay: "-8s" }} />
      <Car className="car-l" y={648} left color="#a855f7" style={{ animationDuration: "18s", animationDelay: "-16s" }} />

      {/* ═══ BOTTOM SIDEWALK ═══ */}
      <rect x={0} y={680} width={1600} height={140} fill="#f0e6d6" />
      <g stroke="#ddd0be" strokeWidth={1.5}>
        {[700, 716, 732, 748, 764, 780, 796, 812].map((y) => (
          <line key={y} x1={0} y1={y} x2={1600} y2={y} />
        ))}
      </g>

      {/* ═══ FLOWER POTS on bottom sidewalk ═══ */}
      <FlowerPot x={160} y={820} flowerColor="#ff6b6b" />
      <FlowerPot x={460} y={820} flowerColor="#ffd166" />
      <FlowerPot x={760} y={820} flowerColor="#a855f7" />
      <FlowerPot x={1060} y={820} flowerColor="#ff6bcb" />
      <FlowerPot x={1360} y={820} flowerColor="#4ecdc4" />

      {/* ═══ BENCHES ═══ */}
      <Bench x={350} y={816} />
      <Bench x={1150} y={816} />

      {/* ═══ GRASS ═══ */}
      <rect x={0} y={830} width={1600} height={70} fill="#6bcb77" />
      <rect x={0} y={830} width={1600} height={14} fill="#5cb85c" opacity={0.6} />
      {/* wildflowers */}
      {Array.from({ length: 20 }).map((_, i) => {
        const fx = 40 + i * 78;
        const fy = 848 + (i % 3) * 10;
        const colors = ["#ff6b6b", "#ffd166", "#a855f7", "#ff6bcb", "#4ecdc4", "#f59e0b"];
        return (
          <g key={i}>
            <circle cx={fx} cy={fy} r={3.5} fill={colors[i % colors.length]} />
            <circle cx={fx} cy={fy - 2} r={2.5} fill={colors[(i + 2) % colors.length]} opacity={0.7} />
          </g>
        );
      })}

      {/* ═══ ORNATE LAMPS ═══ */}
      <OrnateLamp x={480} y={510} />
      <OrnateLamp x={1120} y={510} />

      {/* ═══ VENDOR STALLS ═══ */}
      {VENDORS.map((vendor, index) => (
        <Stall key={vendor.id} vendor={vendor} index={index} />
      ))}

      {/* ═══ GIFT BOX ═══ */}
      <GiftBox claimed={giftClaimed} />
    </g>
  );
}
