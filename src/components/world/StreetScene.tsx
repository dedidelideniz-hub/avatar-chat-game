import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import type { AvatarConfig } from "@/lib/avatar";
import { GIFT_BOX, VENDORS, type Vendor } from "@/lib/shop";
import type { CSSProperties } from "react";

/**
 * Suburban Sanalika street — Kenney City Kit inspired 2D SVG scene.
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

/* ─── Suburban House ─── */
interface HouseProps {
  x: number;
  w: number;
  wallColor: string;
  roofColor: string;
  trimColor: string;
  doorColor: string;
  sign?: string;
}

function SuburbanHouse({ x, w, wallColor, roofColor, trimColor, doorColor, sign }: HouseProps) {
  const cx = x + w / 2;
  const roofH = 70;
  const wallY = 280;
  const wallH = 190;
  const doorW = 44;
  const doorH = 72;
  return (
    <g>
      {/* lawn in front of house */}
      <rect x={x + 10} y={wallY + wallH} width={w - 20} height={30} rx={6} fill="#8bc34a" opacity={0.5} />
      {/* driveway */}
      <rect x={cx - 30} y={wallY + wallH} width={60} height={100} fill="#b0b0a8" />
      <rect x={cx - 30} y={wallY + wallH} width={60} height={4} fill="#9a9a92" />

      {/* main wall */}
      <rect x={x + 8} y={wallY} width={w - 16} height={wallH} rx={4} fill={wallColor} />
      {/* wall texture stripe */}
      <rect x={x + 8} y={wallY} width={w - 16} height={8} fill="#ffffff" opacity={0.12} />

      {/* pitched roof */}
      <polygon
        points={`${x - 10},${wallY} ${cx},${wallY - roofH} ${x + w + 10},${wallY}`}
        fill={roofColor}
      />
      {/* roof ridge highlight */}
      <line x1={cx} y1={wallY - roofH + 4} x2={cx} y2={wallY - roofH + 22} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={3} />
      {/* roof edge */}
      <line x1={x - 8} y1={wallY} x2={cx} y2={wallY - roofH} stroke={trimColor} strokeWidth={4} strokeLinecap="round" />
      <line x1={x + w + 8} y1={wallY} x2={cx} y2={wallY - roofH} stroke={trimColor} strokeWidth={4} strokeLinecap="round" />

      {/* chimney */}
      <rect x={cx + 40} y={wallY - roofH + 18} width={20} height={38} rx={3} fill="#8b7355" />
      <rect x={cx + 37} y={wallY - roofH + 14} width={26} height={8} rx={2} fill="#6b5a42" />

      {/* porch roof */}
      <rect x={cx - 48} y={wallY + 20} width={96} height={10} rx={3} fill={roofColor} opacity={0.85} />
      {/* porch posts */}
      <rect x={cx - 44} y={wallY + 20} width={5} height={doorH - 10} rx={2} fill={trimColor} />
      <rect x={cx + 39} y={wallY + 20} width={5} height={doorH - 10} rx={2} fill={trimColor} />

      {/* windows */}
      {[x + 24, x + w - 64].map((wx, i) => (
        <g key={i}>
          {/* window frame */}
          <rect x={wx} y={wallY + 40} width={40} height={50} rx={4} fill="#d4e6f1" stroke={trimColor} strokeWidth={3} />
          {/* cross bars */}
          <line x1={wx + 20} y1={wallY + 40} x2={wx + 20} y2={wallY + 90} stroke={trimColor} strokeWidth={2} />
          <line x1={wx} y1={wallY + 65} x2={wx + 40} y2={wallY + 65} stroke={trimColor} strokeWidth={2} />
          {/* curtains */}
          <rect x={wx + 2} y={wallY + 42} width={16} height={22} rx={2} fill="#f8e8d0" opacity={0.7} />
          <rect x={wx + 22} y={wallY + 42} width={16} height={22} rx={2} fill="#f8e8d0" opacity={0.7} />
          {/* shutters */}
          <rect x={wx - 6} y={wallY + 38} width={7} height={54} rx={2} fill={trimColor} opacity={0.7} />
          <rect x={wx + 39} y={wallY + 38} width={7} height={54} rx={2} fill={trimColor} opacity={0.7} />
        </g>
      ))}

      {/* front door */}
      <rect x={cx - doorW / 2} y={wallY + wallH - doorH} width={doorW} height={doorH} rx={6} fill={doorColor} stroke={trimColor} strokeWidth={2} />
      {/* door panels */}
      <rect x={cx - doorW / 2 + 5} y={wallY + wallH - doorH + 6} width={doorW - 10} height={28} rx={3} fill="#000000" opacity={0.1} />
      <rect x={cx - doorW / 2 + 5} y={wallY + wallH - doorH + 38} width={doorW - 10} height={28} rx={3} fill="#000000" opacity={0.1} />
      {/* door handle */}
      <circle cx={cx + 12} cy={wallY + wallH - doorH + 42} r={3.5} fill="#ffd166" />
      {/* door number */}
      {sign && (
        <text x={cx} y={wallY + wallH - doorH - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={trimColor}>
          {sign}
        </text>
      )}

      {/* house number plaque */}
      <rect x={cx + doorW / 2 + 8} y={wallY + wallH - 22} width={28} height={18} rx={4} fill="#ffffff" opacity={0.9} stroke={trimColor} strokeWidth={1.5} />
      <text x={cx + doorW / 2 + 22} y={wallY + wallH - 8} textAnchor="middle" fontSize={10} fontWeight={800} fill="#333">
        {Math.floor(x / 100) + 1}
      </text>
    </g>
  );
}

/* ─── White Picket Fence ─── */
function PicketFence({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  const count = Math.floor((x2 - x1) / 18);
  return (
    <g>
      {/* horizontal rails */}
      <rect x={x1} y={y - 18} width={x2 - x1} height={4} rx={2} fill="#f5f0e8" stroke="#d4cbb8" strokeWidth={1} />
      <rect x={x1} y={y - 6} width={x2 - x1} height={4} rx={2} fill="#f5f0e8" stroke="#d4cbb8" strokeWidth={1} />
      {/* pickets */}
      {Array.from({ length: count }).map((_, i) => {
        const px = x1 + 4 + i * 18;
        return (
          <g key={i}>
            <rect x={px} y={y - 32} width={8} height={36} rx={1.5} fill="#f5f0e8" stroke="#d4cbb8" strokeWidth={1} />
            {/* pointed top */}
            <polygon points={`${px},${y - 32} ${px + 4},${y - 38} ${px + 8},${y - 32}`} fill="#f5f0e8" stroke="#d4cbb8" strokeWidth={1} />
          </g>
        );
      })}
    </g>
  );
}

/* ─── Suburban Mailbox ─── */
function Mailbox({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-3} y={-36} width={6} height={38} rx={2} fill="#8b7355" />
      <rect x={-10} y={-48} width={20} height={14} rx={4} fill="#3b82f6" stroke="#2563eb" strokeWidth={1.5} />
      {/* flag */}
      <rect x={10} y={-48} width={4} height={10} rx={1} fill="#ef4444" />
      <rect x={10} y={-48} width={8} height={4} rx={1} fill="#ef4444" />
    </g>
  );
}

/* ─── Suburban Tree ─── */
function SuburbanTree({ x, y, scale = 1, type = "round" }: { x: number; y: number; scale?: number; type?: "round" | "cone" | "bush" }) {
  if (type === "cone") {
    return (
      <g transform={`translate(${x} ${y}) scale(${scale})`}>
        <rect x={-6} y={-20} width={12} height={22} rx={4} fill="#8a6a3f" />
        <polygon points="0,-65 -22,-20 22,-20" fill="#4a8c3f" />
        <polygon points="0,-55 -16,-25 16,-25" fill="#5a9e4f" />
      </g>
    );
  }
  if (type === "bush") {
    return (
      <g transform={`translate(${x} ${y}) scale(${scale})`}>
        <ellipse cx={0} cy={-12} rx={20} ry={16} fill="#5cb85c" />
        <ellipse cx={-12} cy={-8} rx={14} ry={12} fill="#6cc96c" />
        <ellipse cx={12} cy={-8} rx={14} ry={12} fill="#4fae4f" />
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x={-7} y={-28} width={14} height={30} rx={5} fill="#8a5a33" />
      <circle cx={0} cy={-50} r={30} fill="#5cb85c" />
      <circle cx={-20} cy={-38} r={18} fill="#6cc96c" />
      <circle cx={20} cy={-38} r={18} fill="#4fae4f" />
      <circle cx={0} cy={-62} r={16} fill="#7ad97a" opacity={0.6} />
    </g>
  );
}

/* ─── Street Lamp ─── */
function StreetLamp({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-4} y={-54} width={8} height={56} rx={3} fill="#5a5550" />
      <circle cx={0} cy={-62} r={14} fill="#ffd166" opacity={0.25} />
      <circle cx={0} cy={-62} r={8} fill="#ffd166" />
      <rect x={-10} y={-66} width={20} height={5} rx={2.5} fill="#5a5550" />
    </g>
  );
}

const BALLOONS = [
  { x: -22, y: -186, r: 15, color: "#ef4444" },
  { x: 6, y: -214, r: 17, color: "#f7c948" },
  { x: 34, y: -176, r: 14, color: "#a855f7" },
  { x: 62, y: -208, r: 15, color: "#14b8a6" },
] as const;

/* ─── Cartoon Car ─── */
function Car({ className, y, left, style }: { className: string; y: number; left?: boolean; style?: CSSProperties }) {
  return (
    <g className={className} style={style}>
      <g transform={`translate(0 ${y})${left ? " scale(-1 1)" : ""}`}>
        <ellipse cx="0" cy="34" rx="52" ry="7" fill="#1c1917" opacity={0.16} />
        <rect x="-52" y="2" width="104" height="28" rx="12" fill="#3b82f6" stroke="#3d2f2a" strokeOpacity={0.25} strokeWidth={2} />
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

/* ─── Vendor Stall (unchanged from original) ─── */
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
      {vendor.id === "balon" && (
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
      )}
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

/* ─── Main Scene ─── */
export function StreetScene({ giftClaimed }: { giftClaimed: boolean }) {
  return (
    <g>
      <defs>
        <linearGradient id="suburban-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#87CEEB" />
          <stop offset="60%" stopColor="#b8e4f9" />
          <stop offset="100%" stopColor="#dff0ff" />
        </linearGradient>
      </defs>

      {/* ═══ SKY ═══ */}
      <rect x={0} y={0} width={1600} height={470} fill="url(#suburban-sky)" />
      {/* sun */}
      <circle cx={1452} cy={86} r={52} fill="#ffd166" opacity={0.3} />
      <circle cx={1452} cy={86} r={34} fill="#ffd166" />
      <circle cx={1452} cy={86} r={22} fill="#fff3c4" />
      {/* clouds */}
      <g className="clouds" fill="#ffffff" opacity={0.92}>
        <ellipse cx={180} cy={80} rx={50} ry={16} />
        <ellipse cx={220} cy={68} rx={32} ry={14} />
        <ellipse cx={580} cy={110} rx={56} ry={18} />
        <ellipse cx={630} cy={96} rx={34} ry={14} />
        <ellipse cx={1020} cy={60} rx={44} ry={15} />
        <ellipse cx={1060} cy={48} rx={28} ry={12} />
      </g>

      {/* ═══ SUBURBAN HOUSES ═══ */}
      <SuburbanHouse x={10} w={310} wallColor="#e8d5b8" roofColor="#8b5e3c" trimColor="#6b4a2f" doorColor="#5b3a1f" sign="☕" />
      <SuburbanHouse x={330} w={310} wallColor="#d4e8d0" roofColor="#6b8f5e" trimColor="#4a6b3e" doorColor="#3d5c2f" sign="🥐" />
      <SuburbanHouse x={660} w={310} wallColor="#e8e0d4" roofColor="#9b7653" trimColor="#7a5c3f" doorColor="#6b4a2f" sign="🧸" />
      <SuburbanHouse x={990} w={310} wallColor="#e0d4e8" roofColor="#7a5e8b" trimColor="#5c3d6b" doorColor="#4a2f5b" sign="🕶️" />
      <SuburbanHouse x={1320} w={280} wallColor="#d8e4d4" roofColor="#5a7e4e" trimColor="#3d5c2f" doorColor="#2f4a1f" sign="🛒" />

      {/* ═══ FENCES between houses ═══ */}
      <PicketFence x1={318} x2={340} y={470} />
      <PicketFence x1={640} x2={668} y={470} />
      <PicketFence x1={970} x2={1000} y={470} />
      <PicketFence x1={1300} x2={1330} y={470} />

      {/* ═══ MAILBOXES ═══ */}
      <Mailbox x={160} y={470} />
      <Mailbox x={480} y={470} />
      <Mailbox x={810} y={470} />
      <Mailbox x={1140} y={470} />
      <Mailbox x={1460} y={470} />

      {/* ═══ TOP SIDEWALK ═══ */}
      <rect x={0} y={470} width={1600} height={90} fill="#d9d0c0" />
      <g stroke="#c8bfae" strokeWidth={1.5}>
        {[482, 494, 506, 518, 530, 542, 554].map((y) => (
          <line key={y} x1={0} y1={y} x2={1600} y2={y} />
        ))}
      </g>

      {/* ═══ HEDGE ═══ */}
      <g>
        {Array.from({ length: 14 }).map((_, i) => (
          <g key={i}>
            <rect x={i * 118 - 10} y={514} width={128} height={34} rx={16} fill="#3e8e4a" />
            <rect x={i * 118 - 10} y={514} width={128} height={15} rx={8} fill="#57b164" opacity={0.85} />
          </g>
        ))}
      </g>

      {/* ═══ ROAD ═══ */}
      <rect x={0} y={560} width={1600} height={120} fill="#4a4540" />
      <rect x={0} y={560} width={1600} height={5} fill="#8a7f70" />
      <rect x={0} y={675} width={1600} height={5} fill="#8a7f70" />
      {/* lane lines */}
      <rect x={0} y={590} width={1600} height={2} fill="#8a7f70" opacity={0.35} />
      <rect x={0} y={646} width={1600} height={2} fill="#8a7f70" opacity={0.35} />
      {/* center dashes */}
      <g className="road-dashes" fill="#f7c948">
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
      {/* traffic */}
      <Car className="car-r" y={574} style={{ animationDuration: "16s", animationDelay: "-3s" }} />
      <Car className="car-r" y={602} style={{ animationDuration: "21s", animationDelay: "-11s" }} />
      <Car className="car-l" y={631} left style={{ animationDuration: "24s", animationDelay: "-8s" }} />
      <Car className="car-l" y={648} left style={{ animationDuration: "18s", animationDelay: "-16s" }} />

      {/* ═══ BOTTOM SIDEWALK ═══ */}
      <rect x={0} y={680} width={1600} height={140} fill="#d9d0c0" />
      <g stroke="#c8bfae" strokeWidth={1.5}>
        {[700, 716, 732, 748, 764, 780, 796, 812].map((y) => (
          <line key={y} x1={0} y1={y} x2={1600} y2={y} />
        ))}
      </g>

      {/* ═══ GRASS ═══ */}
      <rect x={0} y={820} width={1600} height={80} fill="#8bc34a" />
      <rect x={0} y={820} width={1600} height={16} fill="#7ab33a" opacity={0.6} />
      {/* flowers */}
      <g>
        <circle cx={60} cy={852} r={4} fill="#ff8fb3" />
        <circle cx={420} cy={868} r={4} fill="#ffd166" />
        <circle cx={700} cy={858} r={4} fill="#9b5de5" />
        <circle cx={1120} cy={864} r={4} fill="#ff8fb3" />
        <circle cx={1420} cy={852} r={4} fill="#ffd166" />
        <circle cx={280} cy={874} r={3} fill="#14b8a6" />
        <circle cx={900} cy={870} r={3} fill="#f59e0b" />
        <circle cx={1300} cy={876} r={3} fill="#ec4899" />
      </g>

      {/* ═══ TREES ═══ */}
      <SuburbanTree x={200} y={505} type="round" />
      <SuburbanTree x={820} y={505} type="cone" />
      <SuburbanTree x={1420} y={505} type="round" />
      <SuburbanTree x={120} y={862} scale={0.85} type="bush" />
      <SuburbanTree x={1500} y={862} scale={0.85} type="bush" />
      {/* extra bushes near houses */}
      <SuburbanTree x={350} y={468} scale={0.6} type="bush" />
      <SuburbanTree x={1020} y={468} scale={0.6} type="bush" />

      {/* ═══ LAMPS ═══ */}
      <StreetLamp x={480} y={510} />
      <StreetLamp x={1120} y={510} />

      {/* ═══ VENDOR STALLS ═══ */}
      {VENDORS.map((vendor, index) => (
        <Stall key={vendor.id} vendor={vendor} index={index} />
      ))}

      {/* ═══ GIFT BOX ═══ */}
      <GiftBox claimed={giftClaimed} />
    </g>
  );
}
