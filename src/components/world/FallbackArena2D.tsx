// 🎨 2D fallback arena — pure SVG, works everywhere (no WebGL needed).
// Used when the browser can't render the 3D scene. It reads the same battle
// refs (fighters, projectiles, effects) every frame and draws them as SVG,
// so the whole game (movement, attacks, supers, HP) keeps working.
import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { EquippedItems } from "@/components/avatar/EquippedItems";
import {
  BATTLE_CRATES,
  type BattleFighter,
  type BattleFx,
  type BattleProj,
} from "@/components/world/Arena3D";
import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";

const W = 1400;
const H = 800;
const CHAR_W = 70;
const CHAR_H = 96;
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
  zoomRef,
  onWorldClick,
}: {
  playerRef: MutableRefObject<BattleFighter>;
  botRef: MutableRefObject<BattleFighter>;
  projsRef: MutableRefObject<BattleProj[]>;
  fxsRef: MutableRefObject<BattleFx[]>;
  zoomRef: MutableRefObject<number>;
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
  // Smooth follow-camera center (world px).
  const camRef = useRef({ x: 700, y: 400 });

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
      el.setAttribute("r", "13");
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

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const p = playerRef.current;
      const b = botRef.current;

      // Brawl-Stars-style follow camera: zoom into the player, clamped to
      // the arena edges so the whole map stays reachable.
      const svg = svgRef.current;
      if (svg && svg.clientWidth > 0) {
        const aspect = svg.clientWidth / Math.max(1, svg.clientHeight);
        const zoom = Math.min(12, Math.max(3.4, zoomRef.current));
        let viewW = Math.min(W, 780 * (6.2 / zoom));
        let viewH = viewW / aspect;
        if (viewH > H) {
          viewH = H;
          viewW = viewH * aspect;
        }
        const hw = viewW / 2;
        const hh = viewH / 2;
        const tx = Math.min(Math.max(p.x, hw), W - hw);
        const ty = Math.min(Math.max(p.y, hh), H - hh);
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
  }, [playerRef, botRef, projsRef, fxsRef]);

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
          <radialGradient id="arena2d-grass" cx="50%" cy="42%" r="75%">
            <stop offset="0%" stopColor="#7ec850" />
            <stop offset="100%" stopColor="#4c9a3a" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#arena2d-grass)" />
        <rect
          x="20"
          y="20"
          width={W - 40}
          height={H - 40}
          rx="40"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.35"
          strokeWidth="10"
          strokeDasharray="26 18"
        />
        <line
          x1={W / 2}
          y1="60"
          x2={W / 2}
          y2={H - 60}
          stroke="#ffffff"
          strokeOpacity="0.18"
          strokeWidth="6"
          strokeDasharray="18 14"
        />
        {BATTLE_CRATES.map((c, i) => (
          <g key={i}>
            <rect
              x={c.x}
              y={c.y}
              width={c.w}
              height={c.h}
              rx="18"
              fill="#8a5a2b"
              stroke="#5f3d1c"
              strokeWidth="6"
            />
            <rect
              x={c.x + 12}
              y={c.y + 12}
              width={c.w - 24}
              height={c.h - 24}
              rx="10"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.25"
              strokeWidth="4"
              strokeDasharray="14 10"
            />
          </g>
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
        </g>

        {/* projectiles + effects */}
        <g ref={fxRef} />
      </svg>
    </div>
  );
}
