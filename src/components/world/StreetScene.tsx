import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import type { AvatarConfig } from "@/lib/avatar";
import { GIFT_BOX, VENDORS, type Vendor } from "@/lib/shop";
import type { CSSProperties } from "react";

/**
 * The Sanalika street, drawn as one static SVG group in a 1600x900 world.
 * The World page renders this inside its game SVG (camera via viewBox) and
 * overlays the player sprite. Obstacles here must match OBSTACLES in shop.ts.
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
};

const STALL_PRODUCTS: Record<string, string> = {
  dondurma: "🍦🍨",
  balon: "🎈🌈",
  oyuncak: "🧸🚗",
  moda: "🕶️👒",
};

interface BuildingProps {
  x: number;
  w: number;
  color: string;
  accent: string;
  sign: string;
}

function Building({ x, w, color, accent, sign }: BuildingProps) {
  const cx = x + w / 2;
  return (
    <g>
      <rect x={x} y={250} width={w} height={220} fill={color} />
      <rect x={x} y={250} width={w} height={12} fill="#ffffff" opacity={0.18} />
      <rect x={x} y={462} width={w} height={8} fill="#3d2f2a" opacity={0.18} />
      {/* side windows */}
      {[x + 26, x + w - 66].map((wx, i) => (
        <g key={i}>
          <rect
            x={wx}
            y={292}
            width={40}
            height={62}
            rx={8}
            fill="#fff7e0"
            stroke="#3d2f2a"
            strokeOpacity={0.3}
            strokeWidth={3}
          />
          <line
            x1={wx + 20}
            y1={292}
            x2={wx + 20}
            y2={354}
            stroke="#3d2f2a"
            strokeOpacity={0.25}
            strokeWidth={2}
          />
        </g>
      ))}
      {/* sign */}
      <rect x={cx - 74} y={346} width={148} height={34} rx={10} fill="#ffffff" opacity={0.92} />
      <text x={cx} y={369} textAnchor="middle" fontSize={17} fontWeight={800} fill="#2b2320">
        {sign}
      </text>
      {/* door */}
      <rect
        x={cx - 26}
        y={384}
        width={52}
        height={86}
        rx={10}
        fill="#5b4636"
        stroke="#3d2f2a"
        strokeOpacity={0.25}
        strokeWidth={3}
      />
      <circle cx={cx + 14} cy={430} r={3.5} fill="#ffd166" />
      {/* awning */}
      <g>
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={i}
            x={x + (i * w) / 8}
            y={425}
            width={w / 8 + 1}
            height={45}
            rx={4}
            fill={i % 2 === 0 ? color : accent}
          />
        ))}
        <rect x={x} y={425} width={w} height={45} rx={6} fill="#3d2f2a" opacity={0.08} />
      </g>
    </g>
  );
}

function Tree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x={-8} y={-30} width={16} height={32} rx={5} fill="#8a5a33" />
      <circle cx={0} cy={-52} r={34} fill="#5cb85c" />
      <circle cx={-24} cy={-38} r={20} fill="#6cc96c" />
      <circle cx={24} cy={-38} r={20} fill="#4fae4f" />
    </g>
  );
}

function Lamp({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-5} y={-52} width={10} height={54} rx={4} fill="#3d3a36" />
      <circle cx={0} cy={-60} r={16} fill="#ffd166" opacity={0.3} />
      <circle cx={0} cy={-60} r={9} fill="#ffd166" />
    </g>
  );
}

const BALLOONS = [
  { x: -22, y: -186, r: 15, color: "#ef4444" },
  { x: 6, y: -214, r: 17, color: "#f7c948" },
  { x: 34, y: -176, r: 14, color: "#a855f7" },
  { x: 62, y: -208, r: 15, color: "#14b8a6" },
] as const;

/** A little cartoon car; `left` mirrors it to drive the other way. */
function Car({
  className,
  y,
  left,
  style,
}: {
  className: string;
  y: number;
  left?: boolean;
  style?: CSSProperties;
}) {
  return (
    <g className={className} style={style}>
      <g transform={`translate(0 ${y})${left ? " scale(-1 1)" : ""}`}>
        <ellipse cx="0" cy="34" rx="52" ry="7" fill="#1c1917" opacity="0.16" />
        <rect
          x="-52"
          y="2"
          width="104"
          height="28"
          rx="12"
          fill="#3b82f6"
          stroke="#3d2f2a"
          strokeOpacity="0.25"
          strokeWidth="2"
        />
        <path
          d="M-24 2 L-12 -16 Q0 -21 12 -16 L24 2 Z"
          fill="#93c5fd"
          stroke="#3d2f2a"
          strokeOpacity="0.25"
          strokeWidth="2"
        />
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

function Stall({ vendor, index }: { vendor: Vendor; index: number }) {
  const awningW = 176;
  return (
    <g transform={`translate(${vendor.x} ${vendor.y})`}>
      {/* poles */}
      <rect x={-86} y={-116} width={9} height={126} rx={3} fill="#6b4a2f" />
      <rect x={77} y={-116} width={9} height={126} rx={3} fill="#6b4a2f" />
      {/* awning */}
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
        <rect x={-awningW / 2} y={-116} width={awningW} height={44} rx={6} fill="#3d2f2a" opacity={0.08} />
      </g>
      {/* vendor standing behind the counter — gently bobbing */}
      <g
        className="vendor-idle"
        style={{ animationDelay: `${((index * 0.7) % 2.6) * -1}s` }}
      >
        <g transform={`translate(-27 -120)`}>
          <AvatarPreview width={54} height={70} config={VENDOR_AVATARS[vendor.id]} />
        </g>
      </g>
      {/* the balloon seller waves a hand under her balloons */}
      {vendor.id === "balon" && (
        <text x={48} y={-140} fontSize={26} className="wave-hand" aria-hidden="true">
          👋
        </text>
      )}
      {/* floating balloons above the balloon stand */}
      {vendor.id === "balon" && (
        <g>
          {BALLOONS.map((b, i) => (
            <g key={i}>
              <line
                x1={b.x}
                y1={-70}
                x2={b.x}
                y2={b.y + b.r + 3}
                stroke="#d9c49e"
                strokeWidth={2}
              />
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
                    fill="#ffffff"
                    opacity="0.35"
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
      )}
      {/* counter */}
      <rect x={-80} y={-50} width={160} height={54} rx={9} fill="#5b4636" />
      <rect x={-72} y={-44} width={144} height={12} rx={5} fill="#7a5c3f" />
      {/* wares on the counter */}
      <text x={0} y={-57} textAnchor="middle" fontSize={22}>
        {STALL_PRODUCTS[vendor.id]}
      </text>
      {/* name plate */}
      <rect
        x={-64}
        y={-34}
        width={128}
        height={26}
        rx={8}
        fill="#ffffff"
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
      <rect x={-26} y={-14} width={52} height={12} rx={5} fill={claimed ? "#9c958c" : "#eab308"} stroke="#8a6a1f" strokeWidth={2} />
      <rect x={-24} y={-6} width={48} height={34} rx={6} fill={claimed ? "#b7b0a6" : "#f7c948"} stroke="#8a6a1f" strokeWidth={2} />
      <rect x={-4} y={-14} width={8} height={42} rx={2} fill="#ff6b4a" />
      <circle cx={0} cy={-12} r={7} fill="#ff8fb3" stroke="#ff6b4a" strokeWidth={2} />
      <text
        x={0}
        y={38}
        textAnchor="middle"
        fontSize={15}
        fontWeight={800}
        fill={claimed ? "#6b655b" : "#2b2320"}
      >
        {claimed ? "Bugün toplandı ✓" : "Hediye kutusu +150 SP"}
      </text>
    </g>
  );
}

export function StreetScene({ giftClaimed }: { giftClaimed: boolean }) {
  return (
    <g>
      <defs>
        <linearGradient id="street-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bfe3ff" />
          <stop offset="100%" stopColor="#eaf6ff" />
        </linearGradient>
      </defs>

      {/* sky */}
      <rect x="0" y="0" width="1600" height="470" fill="url(#street-sky)" />
      {/* sun */}
      <circle cx="1452" cy="86" r="52" fill="#ffd166" opacity="0.35" />
      <circle cx="1452" cy="86" r="34" fill="#ffd166" />
      <circle cx="1452" cy="86" r="24" fill="#ffe9a8" />
      {/* clouds — drifting slowly */}
      <g className="clouds" fill="#ffffff" opacity="0.9">
        <ellipse cx="220" cy="90" rx="46" ry="16" />
        <ellipse cx="258" cy="78" rx="30" ry="13" />
        <ellipse cx="640" cy="120" rx="52" ry="17" />
        <ellipse cx="686" cy="106" rx="32" ry="13" />
        <ellipse cx="1040" cy="70" rx="40" ry="14" />
      </g>

      {/* buildings */}
      <Building x={0} w={330} color="#ff6b4a" accent="#ffd166" sign="☕ KAFE" />
      <Building x={330} w={330} color="#14b8a6" accent="#ffffff" sign="🥐 FIRIN" />
      <Building x={660} w={330} color="#ffd166" accent="#ff6b4a" sign="🧸 OYUNCAKÇI" />
      <Building x={990} w={330} color="#a855f7" accent="#ffd166" sign="🕶️ MODA" />
      <Building x={1320} w={280} color="#7cc74f" accent="#ffffff" sign="🛒 BAKKAL" />

      {/* top sidewalk */}
      <rect x="0" y="470" width="1600" height="90" fill="#ecdcbc" />
      <g stroke="#d9c49e" strokeWidth="2">
        {[482, 494, 506, 518, 530, 542, 554].map((y) => (
          <line key={y} x1="0" y1={y} x2="1600" y2={y} />
        ))}
      </g>

      {/* road */}
      <rect x="0" y="560" width="1600" height="120" fill="#4a4540" />
      <rect x="0" y="560" width="1600" height="6" fill="#8a7f70" />
      <rect x="0" y="674" width="1600" height="6" fill="#8a7f70" />
      {/* center dashes — scrolling to suggest traffic */}
      <g className="road-dashes" fill="#f7c948">
        {Array.from({ length: 16 }).map((_, i) => (
          <rect key={i} x={-122 + i * 122} y={614} width={64} height={12} rx={6} />
        ))}
      </g>
      {/* crosswalks */}
      {[360, 1060].map((x) => (
        <g key={x} fill="#ffffff" opacity="0.85">
          {Array.from({ length: 8 }).map((_, i) => (
            <rect key={i} x={x + i * 26} y={563} width={16} height={114} rx={4} />
          ))}
        </g>
      ))}
      {/* traffic on the road */}
      <Car className="car-r" y={580} style={{ animationDuration: "16s", animationDelay: "-3s" }} />
      <Car className="car-r" y={602} style={{ animationDuration: "21s", animationDelay: "-11s" }} />
      <Car className="car-l" y={648} left style={{ animationDuration: "24s", animationDelay: "-8s" }} />
      <Car className="car-l" y={630} left style={{ animationDuration: "18s", animationDelay: "-16s" }} />

      {/* bottom sidewalk */}
      <rect x="0" y="680" width="1600" height="140" fill="#ecdcbc" />
      <g stroke="#d9c49e" strokeWidth="2">
        {[700, 716, 732, 748, 764, 780, 796, 812].map((y) => (
          <line key={y} x1="0" y1={y} x2="1600" y2={y} />
        ))}
      </g>

      {/* grass */}
      <rect x="0" y="820" width="1600" height="80" fill="#aee571" />
      <rect x="0" y="820" width="1600" height="18" fill="#9bd95c" opacity="0.7" />
      <g>
        <circle cx="60" cy="850" r="4" fill="#ff8fb3" />
        <circle cx="420" cy="866" r="4" fill="#ffd166" />
        <circle cx="700" cy="856" r="4" fill="#9b5de5" />
        <circle cx="1120" cy="862" r="4" fill="#ff8fb3" />
        <circle cx="1420" cy="850" r="4" fill="#ffd166" />
      </g>

      {/* trees + lamps */}
      <Tree x={200} y={505} />
      <Tree x={820} y={505} />
      <Tree x={1420} y={505} />
      <Tree x={120} y={862} scale={0.9} />
      <Tree x={1500} y={862} scale={0.9} />
      <Lamp x={480} y={510} />
      <Lamp x={1120} y={510} />

      {/* vendor stalls */}
      {VENDORS.map((vendor, index) => (
        <Stall key={vendor.id} vendor={vendor} index={index} />
      ))}

      {/* daily gift box */}
      <GiftBox claimed={giftClaimed} />
    </g>
  );
}
