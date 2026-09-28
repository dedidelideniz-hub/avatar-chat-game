import { forwardRef, useImperativeHandle, useRef } from "react";
import { GIFT_BOX, MAP_H, MAP_W, VENDORS, svgX, svgY } from "@/lib/shop";
import {
  BUILDINGS,
  S,
  SIDE_STREETS,
  SIDE_STREET_SOUTH,
  SIDE_STREET_W,
  SPAWN_SVG,
  TREE_ROWS,
  ZONE,
} from "@/engine/constants";

export interface MiniMapHandle {
  setPlayer(x: number, y: number): void;
  setViewport(x: number, y: number, w: number, h: number): void;
}

/**
 * Bir Z bandını harita px dikdörtgenine çevirir. `zSouth` bandın caddeye bakan
 * (büyük Z) kenarı, `zNorth` çim tarafındaki (küçük Z) kenarıdır — px katmanında
 * kuzey büyük y'dedir, bu yüzden yükseklik pozitif çıkar.
 */
function band(zSouth: number, zNorth: number) {
  return { y: svgY(zSouth), h: (zSouth - zNorth) * S };
}

const SIDEWALK = "#ecdcbc";
/** Arka plan (görünmeyen kenar bölgeleri) — daha koyu çim. */
const GRASS_BG = "#93d956";
/** Yeşillik şeritleri — sınır çitleriyle çevrili bakımlı çim. */
const GRASS = "#aee571";
const ROAD = "#4a4540";

const NORTH_GRASS = band(ZONE.northGrassBot, ZONE.northGrassTop);
const NORTH_WALK = band(ZONE.northSidewalkBot, ZONE.northSidewalkTop);
const ROAD_BAND = band(ZONE.roadBot, ZONE.roadTop);
const SOUTH_WALK = band(ZONE.southSidewalkBot, ZONE.southSidewalkTop);
const SOUTH_GRASS = band(ZONE.southGrassBot, ZONE.southGrassTop);
const BACK_WALK = band(ZONE.backWalkTop, ZONE.backWalkBot);
const BACK_ROAD = band(ZONE.backRoadTop, ZONE.backRoadBot);
const BACK_NORTH_WALK = band(ZONE.backNorthWalkTop, ZONE.backNorthWalkBot);
const BACK_GRASS = band(ZONE.backGrassTop, ZONE.backGrassBot);

/** Dikey ara sokaklar — asfalt, kuzeyde arka caddenin kaldırımında biter. */
const SIDE_STREETS_PX = SIDE_STREETS.map((x) => ({
  x: svgX(x - SIDE_STREET_W / 2),
  y: svgY(SIDE_STREET_SOUTH),
  w: SIDE_STREET_W * S,
  h: (SIDE_STREET_SOUTH - ZONE.backNorthWalkTop) * S,
}));

/** Ağaç sıralarından seyrek bir örnek — her 3. ağaç, haritayı boğmasın. */
const TREES = TREE_ROWS.flatMap((row) => {
  const out: { x: number; y: number }[] = [];
  const avoidRadius = row.avoidRadius ?? 0;
  for (let i = 0, x = row.startX; x <= row.endX + 1e-6; x += row.spacing, i++) {
    if (row.avoidX?.some((ax) => Math.abs(x - ax) < avoidRadius)) continue;
    if (i % 3 === 0) out.push({ x: svgX(x), y: svgY(row.z) });
  }
  return out;
});

/**
 * Full-street minimap — dünya px katmanıyla (`MAP_W` × `MAP_H`) aynı koordinat
 * sistemini kullanır ve CSS ile küçültülür. Bu yüzden dokunma noktası doğrudan
 * oyuncu koordinatına çevrilebilir: çizim ile tıklama asla kaymaz.
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
        {/* zemin — harita büyüdüğü için taban artık çim, sokaklar üstüne çizilir */}
        <rect width={MAP_W} height={MAP_H} fill={GRASS_BG} />
        {/* yeşillik şeritleri: kuzey (dükkan önü), güney (çit arkası), arka (binaların arkası) */}
        <rect x={0} y={NORTH_GRASS.y} width={MAP_W} height={NORTH_GRASS.h} fill={GRASS} />
        <rect x={0} y={SOUTH_GRASS.y} width={MAP_W} height={SOUTH_GRASS.h} fill={GRASS} />
        <rect x={0} y={BACK_GRASS.y} width={MAP_W} height={BACK_GRASS.h} fill={GRASS} />
        {/* kaldırımlar */}
        <rect x={0} y={NORTH_WALK.y} width={MAP_W} height={NORTH_WALK.h} fill={SIDEWALK} />
        <rect x={0} y={SOUTH_WALK.y} width={MAP_W} height={SOUTH_WALK.h} fill={SIDEWALK} />
        <rect x={0} y={BACK_WALK.y} width={MAP_W} height={BACK_WALK.h} fill={SIDEWALK} />
        <rect x={0} y={BACK_NORTH_WALK.y} width={MAP_W} height={BACK_NORTH_WALK.h} fill={SIDEWALK} />
        {/* cadde + arka cadde + dikey ara sokaklar */}
        <rect x={0} y={ROAD_BAND.y} width={MAP_W} height={ROAD_BAND.h} fill={ROAD} />
        <rect x={0} y={BACK_ROAD.y} width={MAP_W} height={BACK_ROAD.h} fill={ROAD} />
        {SIDE_STREETS_PX.map((s) => (
          <rect key={s.x} x={s.x} y={s.y} width={s.w} height={s.h} fill={ROAD} />
        ))}
        {/* binalar — iki sıra: cadde dükkanları + arka caddenin arkasındakiler.
            Gövde, cephe hattından kuzeye (haritada aşağı) doğru uzanır. */}
        {BUILDINGS.map((b, i) => (
          <rect
            key={i}
            x={svgX(b.x) - (b.w * S) / 2}
            y={svgY(b.frontZ)}
            width={b.w * S}
            height={b.d * S}
            fill={b.front}
          />
        ))}
        {/* ağaçlar */}
        {TREES.map((t, i) => (
          <circle key={i} cx={t.x} cy={t.y} r={6} fill="#2f7d3a" />
        ))}
        {/* tezgâhlar */}
        {VENDORS.map((v) => (
          <rect
            key={v.id}
            x={v.x - 40}
            y={v.y - 30}
            width={80}
            height={30}
            rx={6}
            fill={v.color}
            stroke="#ffffff"
            strokeOpacity={0.8}
            strokeWidth={2}
          />
        ))}
        {/* hediye kutusu */}
        <circle
          cx={GIFT_BOX.x}
          cy={GIFT_BOX.y}
          r={9}
          fill="#f7c948"
          stroke="#8a6a1f"
          strokeWidth={2}
        />
        {/* kamera penceresi */}
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
        {/* oyuncu */}
        <circle
          ref={playerRef}
          cx={SPAWN_SVG.x}
          cy={SPAWN_SVG.y}
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
