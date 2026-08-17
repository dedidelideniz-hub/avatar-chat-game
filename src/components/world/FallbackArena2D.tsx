// 🎨 2D fallback arena — pure SVG, works everywhere (no WebGL needed).
// Used when the browser can't render the 3D scene. It reads the same battle
// refs (fighters, projectiles, effects) every frame and draws them as SVG,
// so the whole game (movement, attacks, supers, HP) keeps working.
// The map mirrors Arena3D: checkered grass, goals with red/blue banners,
// spawn circles, a center ball and crates/fences/bushes/barrels.
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import {
  BATTLE_OBSTACLES,
  type BattleFighter,
  type BattleFx,
  type BattleProj,
} from "@/components/world/Arena3D";
import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";

const W = 1700;
const H = 1100;
const CHAR_W = 58;
const CHAR_H = 78;
const SVG_NS = "http://www.w3.org/2000/svg";

const PROJ_POOL = 26;
const RING_POOL = 12;
const BURST_POOL = 8;
const TEXT_POOL = 8;
const BEAM_POOL = 2;
const SMOKE_POOL = 22;

export function FallbackArena2D({
  playerRef,
  botRef,
  projsRef,
  fxsRef,
  aimRef,
  onWorldClick,
}: {
  playerRef: MutableRefObject<BattleFighter>;
  botRef: MutableRefObject<BattleFighter>;
  projsRef: MutableRefObject<BattleProj[]>;
  fxsRef: MutableRefObject<BattleFx[]>;
  aimRef: MutableRefObject<{ active: boolean; dx: number; dy: number }>;
  onWorldClick: (x: number, y: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const fxRef = useRef<SVGGElement>(null);
  const pRef = useRef<SVGGElement>(null);
  const bRef = useRef<SVGGElement>(null);
  const pSpriteRef = useRef<SVGGElement>(null);
  const bSpriteRef = useRef<SVGGElement>(null);
  const projEls = useRef<SVGCircleElement[]>([]);
  const ringEls = useRef<SVGCircleElement[]>([]);
  const burstEls = useRef<SVGCircleElement[]>([]);
  const textEls = useRef<SVGTextElement[]>([]);
  const beamEls = useRef<SVGLineElement[]>([]);
  const smokeEls = useRef<SVGCircleElement[]>([]);
  // Smooth follow-camera center (world px) — same fixed-zoom behavior as the
  // 3D arena so both play identically.
  const camRef = useRef({ x: W / 2, y: H / 2 });
  // Thin animated HP bars above the fighters (white damage trail).
  const pBarRef = useRef<SVGGElement>(null);
  const bBarRef = useRef<SVGGElement>(null);
  const pBarFill = useRef<SVGRectElement>(null);
  const pBarGhost = useRef<SVGRectElement>(null);
  const bBarFill = useRef<SVGRectElement>(null);
  const bBarGhost = useRef<SVGRectElement>(null);
  const barState = useRef({
    p: { disp: -1, ghost: -1 },
    b: { disp: -1, ghost: -1 },
  });

  useEffect(() => {
    const fx = fxRef.current;
    if (!fx) return;

    const make = <K extends keyof SVGElementTagNameMap>(tag: K) =>
      document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];

    const ensure = <T extends SVGElement>(
      arr: T[],
      tag: keyof SVGElementTagNameMap,
      count: number,
      init: (el: T, i: number) => void,
    ): T[] => {
      for (let i = arr.length; i < count; i++) {
        const el = make(tag) as unknown as T;
        init(el, i);
        fx.appendChild(el);
        arr.push(el);
      }
      return arr;
    };

    const projsEls = ensure(projEls.current, "circle", PROJ_POOL, (el) => {
      el.setAttribute("r", "12");
      el.setAttribute("stroke", "#ffffff");
      el.setAttribute("stroke-width", "3");
    });
    const ringsEls = ensure(ringEls.current, "circle", RING_POOL, (el) => {
      el.setAttribute("fill", "none");
      el.setAttribute("stroke", "#ffffff");
      el.setAttribute("stroke-width", "7");
    });
    const burstsEls = ensure(burstEls.current, "circle", BURST_POOL, (el) => {
      el.setAttribute("fill", "#fdba74");
    });
    const textsEls = ensure(textEls.current, "text", TEXT_POOL, (el) => {
      el.setAttribute("text-anchor", "middle");
      el.setAttribute("font-size", "26");
      el.setAttribute("font-weight", "900");
      el.setAttribute("stroke", "#ffffff");
      el.setAttribute("stroke-width", "3");
      el.setAttribute("paint-order", "stroke");
    });
    const beamsEls = ensure(beamEls.current, "line", BEAM_POOL, (el) => {
      el.setAttribute("stroke", "#ffe066");
      el.setAttribute("stroke-width", "46");
      el.setAttribute("stroke-linecap", "round");
    });
    const smokesEls = ensure(smokeEls.current, "circle", SMOKE_POOL, (el) => {
      el.setAttribute("fill", "#c9c9c9");
    });

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;
      const p = playerRef.current;
      const b = botRef.current;

      // Game-simulation follow camera: fixed zoom (matches the 3D arena),
      // centered on the player and clamped to the arena edges.
      const svg = svgRef.current;
      if (svg && svg.clientWidth > 0) {
        const aspect = svg.clientWidth / Math.max(1, svg.clientHeight);
        const zoom = 12;
        // Same visible width as the 3D camera at fov 60° and this zoom.
        let viewW = Math.min(W, 115.47 * aspect * zoom);
        let viewH = Math.min(H, viewW / aspect);
        const hw = viewW / 2;
        const hh = viewH / 2;
        const tx = viewW >= W ? W / 2 : Math.min(Math.max(p.x, hw), W - hw);
        const ty = viewH >= H ? H / 2 : Math.min(Math.max(p.y, hh), H - hh);
        camRef.current.x += (tx - camRef.current.x) * Math.min(1, dt * 6);
        camRef.current.y += (ty - camRef.current.y) * Math.min(1, dt * 6);
        svg.setAttribute(
          "viewBox",
          `${camRef.current.x - hw} ${camRef.current.y - hh} ${viewW} ${viewH}`,
        );
      }

      // fighters
      pRef.current?.setAttribute("transform", `translate(${p.x} ${p.y})`);
      bRef.current?.setAttribute("transform", `translate(${b.x} ${b.y})`);
      const applySprite = (f: BattleFighter, sprite: SVGGElement | null) => {
        if (!sprite) return;
        const flip = f.facing < 0 ? -1 : 1;
        const bob = f.moving ? Math.sin(f.phase) * 5 : 0;
        sprite.classList.toggle("walking", f.moving);
        sprite.setAttribute(
          "transform",
          flip === 1
            ? `translate(${-CHAR_W / 2} ${-CHAR_H + bob})`
            : `scale(-1 1) translate(${-CHAR_W / 2} ${-CHAR_H + bob})`,
        );
      };
      applySprite(p, pSpriteRef.current);
      applySprite(b, bSpriteRef.current);

      // thin animated HP bar above each head — fill drops fast, the white
      // ghost trails behind it like a classic damage bar
      const syncBar = (
        f: BattleFighter,
        st: { disp: number; ghost: number },
        barG: SVGGElement | null,
        fill: SVGRectElement | null,
        ghost: SVGRectElement | null,
      ) => {
        if (!barG || !fill || !ghost) return;
        if (st.disp < 0) {
          st.disp = f.maxHp;
          st.ghost = f.maxHp;
        }
        st.disp += (f.hp - st.disp) * Math.min(1, dt * 6);
        if (st.ghost > st.disp + 0.5) {
          st.ghost += (st.disp - st.ghost) * Math.min(1, dt * 1.8);
        } else {
          st.ghost = st.disp;
        }
        const pct = Math.max(0, Math.min(1, st.disp / f.maxHp));
        const gpct = Math.max(0, Math.min(1, st.ghost / f.maxHp));
        const col = pct > 0.5 ? "#22c55e" : pct > 0.25 ? "#eab308" : "#ef4444";
        const hitPop = performance.now() - f.lastHitAt < 260;
        fill.setAttribute("width", `${Math.max(2, pct * 92)}`);
        fill.setAttribute("fill", col);
        fill.setAttribute("opacity", hitPop ? "0.35" : "1");
        ghost.setAttribute("width", `${Math.max(2, gpct * 92)}`);
        barG.setAttribute(
          "transform",
          `translate(-48 ${-CHAR_H - 26})${hitPop ? " scale(1.1)" : ""}`,
        );
      };
      syncBar(p, barState.current.p, pBarRef.current, pBarFill.current, pBarGhost.current);
      syncBar(b, barState.current.b, bBarRef.current, bBarFill.current, bBarGhost.current);

      // projectiles
      const projs = projsRef.current;
      for (let i = 0; i < PROJ_POOL; i++) {
        const el = projsEls[i];
        const pr = projs[i];
        if (pr) {
          el.setAttribute("visibility", "visible");
          el.setAttribute("cx", `${pr.x}`);
          el.setAttribute("cy", `${pr.y}`);
          el.setAttribute("fill", pr.owner === "player" ? "#38bdf8" : "#fb7185");
        } else {
          el.setAttribute("visibility", "hidden");
        }
      }

      // effects — sync by kind pools in list order
      let ri = 0;
      let bi = 0;
      let ti = 0;
      let mi = 0;
      let si = 0;
      const fxs = fxsRef.current;
      for (const fx of fxs) {
        if (fx.ttl <= 0) continue;
        const t = fx.ttl / fx.maxTtl;
        if (fx.kind === "ring") {
          const el = ringsEls[ri];
          if (el) {
            el.setAttribute("visibility", "visible");
            el.setAttribute("cx", `${fx.x}`);
            el.setAttribute("cy", `${fx.y}`);
            el.setAttribute("r", `${Math.max(6, fx.grow * (1 - t))}`);
            el.setAttribute("stroke", fx.color);
            el.setAttribute("opacity", `${t}`);
          }
          ri++;
        } else if (fx.kind === "burst") {
          const el = burstsEls[bi];
          if (el) {
            el.setAttribute("visibility", "visible");
            el.setAttribute("cx", `${fx.x}`);
            el.setAttribute("cy", `${fx.y}`);
            el.setAttribute("r", `${Math.max(8, fx.grow * (1 - t))}`);
            el.setAttribute("fill", fx.color);
            el.setAttribute("opacity", `${t}`);
          }
          bi++;
        } else if (fx.kind === "text") {
          const el = textsEls[ti];
          if (el) {
            el.setAttribute("visibility", "visible");
            el.setAttribute("x", `${fx.x}`);
            el.setAttribute("y", `${fx.y - (1 - t) * 60}`);
            el.setAttribute("fill", fx.color);
            el.setAttribute("opacity", `${t}`);
            const key = `${fx.text}|${fx.color}`;
            if (el.dataset.key !== key) {
              el.textContent = fx.text;
              el.dataset.key = key;
            }
          }
          ti++;
        } else if (fx.kind === "beam") {
          const el = beamsEls[mi];
          if (el) {
            el.setAttribute("visibility", "visible");
            el.setAttribute("x1", `${fx.x1}`);
            el.setAttribute("y1", `${fx.y1}`);
            el.setAttribute("x2", `${fx.x2}`);
            el.setAttribute("y2", `${fx.y2}`);
            el.setAttribute("opacity", `${t}`);
          }
          mi++;
        } else {
          // smoke — gray puffs rising and spreading
          const el = smokesEls[si];
          if (el) {
            el.setAttribute("visibility", "visible");
            el.setAttribute("cx", `${fx.x}`);
            el.setAttribute("cy", `${fx.y - (1 - t) * 140}`);
            el.setAttribute("r", `${Math.max(10, fx.grow * (0.4 + 0.8 * (1 - t)))}`);
            el.setAttribute("fill", fx.color);
            el.setAttribute("opacity", `${t * 0.55}`);
          }
          si++;
        }
      }
      const hide = (els: SVGElement[], from: number) => {
        for (let i = from; i < els.length; i++)
          els[i].setAttribute("visibility", "hidden");
      };
      hide(ringsEls, ri);
      hide(burstsEls, bi);
      hide(textsEls, ti);
      hide(beamsEls, mi);
      hide(smokesEls, si);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playerRef, botRef, projsRef, fxsRef, aimRef]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    onWorldClick(pt.x, pt.y);
  };

  return (
    <div className="absolute inset-0" onClick={handleClick}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <defs>
          <pattern
            id="arena2d-checker"
            width="100"
            height="100"
            patternUnits="userSpaceOnUse"
          >
            <rect width="100" height="100" fill="#5db04a" />
            <rect width="50" height="50" fill="#539e41" />
            <rect x="50" y="50" width="50" height="50" fill="#539e41" />
          </pattern>
          <radialGradient id="arena2d-ball-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffe89a" />
            <stop offset="100%" stopColor="#f5c542" />
          </radialGradient>
        </defs>

        {/* outer space border */}
        <rect width={W} height={H} fill="#0c1220" />

        {/* checkered grass pitch */}
        <rect width={W} height={H} fill="url(#arena2d-checker)" />

        {/* center line */}
        <line
          x1={W / 2}
          y1="0"
          x2={W / 2}
          y2={H}
          stroke="#ffffff"
          strokeOpacity="0.16"
          strokeWidth="6"
          strokeDasharray="18 14"
        />

        {/* spawn circles */}
        <circle cx={W / 2} cy="250" r="130" fill="#e63946" opacity="0.14" />
        <circle
          cx={W / 2}
          cy="250"
          r="130"
          fill="none"
          stroke="#e63946"
          strokeOpacity="0.3"
          strokeWidth="6"
          strokeDasharray="16 12"
        />
        <circle cx={W / 2} cy="850" r="130" fill="#3a86ff" opacity="0.14" />
        <circle
          cx={W / 2}
          cy="850"
          r="130"
          fill="none"
          stroke="#3a86ff"
          strokeOpacity="0.3"
          strokeWidth="6"
          strokeDasharray="16 12"
        />

        {/* goal frames — red top, blue bottom */}
        <Goal2D cx={W / 2} y={0} color="#e63946" />
        <Goal2D cx={W / 2} y={H} color="#3a86ff" />

        {/* center ball */}
        <circle cx={W / 2} cy={H / 2} r="36" fill="url(#arena2d-ball-glow)" stroke="#c99a2e" strokeWidth="5" />
        <circle cx={W / 2 - 10} cy={H / 2 - 12} r="9" fill="#ffffff" opacity="0.55" />

        {/* obstacles */}
        {BATTLE_OBSTACLES.map((o, i) => (
          <Obstacle2D key={i} o={o} />
        ))}

        {/* fighters */}
        <g ref={pRef}>
          <g ref={pSpriteRef}>
            <AvatarPreview width={CHAR_W} height={CHAR_H} config={playerRef.current.config} />
            <EquippedItems
              equipped={playerRef.current.equipped}
              width={CHAR_W}
              height={CHAR_H}
            />
          </g>
          {/* thin animated HP bar above the head */}
          <g ref={pBarRef}>
            <rect
              width="96"
              height="10"
              rx="5"
              fill="rgba(8,12,26,0.88)"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="1.5"
            />
            <rect ref={pBarGhost} x="2" y="2" width="92" height="6" rx="3" fill="#ffffff" />
            <rect ref={pBarFill} x="2" y="2" width="92" height="6" rx="3" fill="#22c55e" />
          </g>
        </g>
        <g ref={bRef}>
          <g ref={bSpriteRef}>
            <AvatarPreview width={CHAR_W} height={CHAR_H} config={botRef.current.config} />
            <EquippedItems
              equipped={botRef.current.equipped}
              width={CHAR_W}
              height={CHAR_H}
            />
          </g>
          {/* thin animated HP bar above the head */}
          <g ref={bBarRef}>
            <rect
              width="96"
              height="10"
              rx="5"
              fill="rgba(8,12,26,0.88)"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="1.5"
            />
            <rect ref={bBarGhost} x="2" y="2" width="92" height="6" rx="3" fill="#ffffff" />
            <rect ref={bBarFill} x="2" y="2" width="92" height="6" rx="3" fill="#22c55e" />
          </g>
        </g>

        {/* projectiles + effects */}
        <g ref={fxRef} />
      </svg>
    </div>
  );
}

function Goal2D({ cx, y, color }: { cx: number; y: number; color: string }) {
  const top = y === 0;
  const postY = top ? 0 : y - 115;
  const bannerY = top ? 30 : y - 105;
  return (
    <g>
      {/* posts */}
      <rect x={cx - 80} y={postY} width="16" height="115" rx="6" fill="#8a5a2b" stroke="#5f3d1c" strokeWidth="4" />
      <rect x={cx + 64} y={postY} width="16" height="115" rx="6" fill="#8a5a2b" stroke="#5f3d1c" strokeWidth="4" />
      {/* crossbar */}
      <rect x={cx - 88} y={top ? 10 : y - 28} width="176" height="18" rx="8" fill="#9c6b33" stroke="#5f3d1c" strokeWidth="4" />
      {/* banner */}
      <rect x={cx - 76} y={bannerY} width="152" height="72" rx="10" fill={color} stroke="#ffffff" strokeOpacity="0.35" strokeWidth="4" />
      <circle cx={cx} cy={bannerY + 36} r="18" fill="#ffffff" opacity="0.85" />
    </g>
  );
}

function Obstacle2D({ o }: { o: (typeof BATTLE_OBSTACLES)[number] }) {
  const { x, y, w, h, kind } = o;
  if (kind === "crate") {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx="16" fill="#8a5a2b" stroke="#5f3d1c" strokeWidth="6" />
        <rect
          x={x + 12}
          y={y + 12}
          width={w - 24}
          height={h - 24}
          rx="10"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.25"
          strokeWidth="4"
          strokeDasharray="14 10"
        />
      </g>
    );
  }
  if (kind === "fence") {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx="14" fill="#b07a45" stroke="#7a5230" strokeWidth="6" />
        <rect x={x + 8} y={y + 8} width={w - 16} height={Math.max(6, h / 2.6)} rx="5" fill="#c98f55" opacity="0.9" />
        <rect
          x={x + 8}
          y={y + h - 8 - Math.max(6, h / 2.6)}
          width={w - 16}
          height={Math.max(6, h / 2.6)}
          rx="5"
          fill="#c98f55"
          opacity="0.9"
        />
      </g>
    );
  }
  if (kind === "bush") {
    const r = Math.min(w, h) / 2;
    return (
      <g>
        <circle cx={x + w / 2} cy={y + h / 2} r={r} fill="#3e8e41" stroke="#2d6b30" strokeWidth="5" />
        <circle cx={x + w * 0.28} cy={y + h * 0.65} r={r * 0.62} fill="#4c9a3a" />
        <circle cx={x + w * 0.72} cy={y + h * 0.62} r={r * 0.6} fill="#5cb85c" />
        <circle cx={x + w * 0.5} cy={y + h * 0.38} r={r * 0.45} fill="#5cb85c" opacity="0.8" />
      </g>
    );
  }
  // barrel
  return (
    <g>
      <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) / 2} fill="#b98a4e" stroke="#6f4a24" strokeWidth="6" />
      <rect
        x={x + 10}
        y={y + h / 2 - 7}
        width={w - 20}
        height="14"
        rx="7"
        fill="#6f4a24"
        opacity="0.85"
      />
      <circle cx={x + w / 2 - 8} cy={y + h / 2 - 10} r="6" fill="#ffffff" opacity="0.35" />
    </g>
  );
}
