import { forwardRef, useImperativeHandle, useRef } from "react";
import { GIFT_BOX, VENDORS } from "@/lib/shop";

export interface MiniMapHandle {
  setPlayer(x: number, y: number): void;
  setViewport(x: number, y: number, w: number, h: number): void;
}

const MAP_W = 1600;
const MAP_H = 900;

const BUILDINGS = [
  { x: 0, w: 330, color: "#ff6b4a" },
  { x: 330, w: 330, color: "#14b8a6" },
  { x: 660, w: 330, color: "#ffd166" },
  { x: 990, w: 330, color: "#a855f7" },
  { x: 1320, w: 280, color: "#7cc74f" },
];

const TREES = [
  { x: 200, y: 505 },
  { x: 820, y: 505 },
  { x: 1420, y: 505 },
  { x: 120, y: 862 },
  { x: 1500, y: 862 },
];

/**
 * Full-street minimap — uses the same 1600x900 viewBox as the world and is
 * scaled down with CSS. Tapping a walkable spot sets a move target; the player
 * dot and camera frame are updated imperatively from the game loop.
 */
export const MiniMap = forwardRef<
  MiniMapHandle,
  { onPick: (x: number, y: number) => void; className?: string }
>(function MiniMap({ onPick, className }, ref) {
  const playerRef = useRef<SVGCircleElement>(null);
  const viewportRef = useRef<SVGRectElement>(null);

  useImperativeHandle(ref, () => ({
    setPlayer(x, y) {
      playerRef.current?.setAttribute("cx", String(x));
      playerRef.current?.setAttribute("cy", String(y));
    },
    setViewport(x, y, w, h) {
      const el = viewportRef.current;
      if (!el) return;
      el.setAttribute("x", String(x));
      el.setAttribute("y", String(y));
      el.setAttribute("width", String(w));
      el.setAttribute("height", String(h));
    },
  }));

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * MAP_W;
    const y = ((e.clientY - rect.top) / rect.height) * MAP_H;
    onPick(x, y);
  };

  return (
    <div className={className} data-minimap>
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="h-auto w-full"
        onClick={handleClick}
        role="img"
        aria-label="Cadde haritası — dokununca karakter oraya yürür"
        style={{ touchAction: "none" }}
      >
        {/* sky */}
        <rect width={MAP_W} height={MAP_H} fill="#bfe3ff" />
        {/* buildings */}
        {BUILDINGS.map((b, i) => (
          <rect key={i} x={b.x} y={250} width={b.w} height={220} fill={b.color} />
        ))}
        {/* sidewalks + grass */}
        <rect x={0} y={470} width={MAP_W} height={90} fill="#ecdcbc" />
        <rect x={0} y={680} width={MAP_W} height={140} fill="#ecdcbc" />
        <rect x={0} y={820} width={MAP_W} height={80} fill="#aee571" />
        {/* road */}
        <rect x={0} y={560} width={MAP_W} height={120} fill="#4a4540" />
        {/* walkable strip */}
        <rect
          x={28}
          y={578}
          width={1544}
          height={274}
          fill="#ffffff"
          opacity={0.16}
        />
        {/* stalls */}
        {VENDORS.map((v) => (
          <rect
            key={v.id}
            x={v.x - 80}
            y={660}
            width={160}
            height={90}
            rx={6}
            fill={v.color}
            stroke="#ffffff"
            strokeOpacity={0.8}
            strokeWidth={2}
          />
        ))}
        {/* trees */}
        {TREES.map((t, i) => (
          <circle key={i} cx={t.x} cy={t.y} r={6} fill="#2f7d3a" />
        ))}
        {/* gift box */}
        <circle
          cx={GIFT_BOX.x}
          cy={GIFT_BOX.y}
          r={9}
          fill="#f7c948"
          stroke="#8a6a1f"
          strokeWidth={2}
        />
        {/* camera viewport frame */}
        <rect
          ref={viewportRef}
          x={0}
          y={0}
          width={MAP_W}
          height={MAP_H}
          fill="none"
          stroke="#ffffff"
          strokeWidth={3}
          strokeDasharray="8 6"
          opacity={0.9}
          pointerEvents="none"
        />
        {/* player dot */}
        <circle
          ref={playerRef}
          cx={800}
          cy={760}
          r={9}
          fill="#ff6b4a"
          stroke="#ffffff"
          strokeWidth={3}
          pointerEvents="none"
        />
      </svg>
    </div>
  );
});
