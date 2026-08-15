import { useRef, useState } from "react";

interface JoystickProps {
  /** Called with a normalized vector in [-1, 1] as the knob is dragged. */
  onMove: (x: number, y: number) => void;
  className?: string;
}

const SIZE = 148; // base diameter in px
const RADIUS = 50; // max knob travel in px
const KNOB = 64; // knob diameter
const KNOB_OFFSET = (SIZE - KNOB) / 2;
/** Ignore tiny drags so the character doesn't jitter. */
const DEAD_ZONE = 0.14;

/**
 * Touch-friendly virtual joystick. Uses pointer events + pointer capture so it
 * works with finger and mouse alike; `touch-none` stops page scrolling while
 * dragging. A dead zone keeps the character still on tiny movements.
 */
export function Joystick({ onMove, className }: JoystickProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    originRef.current = { x: e.clientX, y: e.clientY };
    setActive(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    let dx = e.clientX - originRef.current.x;
    let dy = e.clientY - originRef.current.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    let nx = dx / RADIUS;
    let ny = dy / RADIUS;
    if (Math.hypot(nx, ny) < DEAD_ZONE) {
      nx = 0;
      ny = 0;
    }
    onMove(nx, ny);
  };

  const handlePointerEnd = () => {
    setActive(false);
    if (knobRef.current) knobRef.current.style.transform = "";
    onMove(0, 0);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      aria-label="Hareket joysticki"
      role="application"
      style={{ width: SIZE, height: SIZE }}
      className={`relative touch-none rounded-full border-2 border-white/60 bg-black/25 shadow-xl backdrop-blur-sm select-none ${
        active ? "scale-110" : ""
      } ${className ?? ""}`}
    >
      {/* inner guide ring */}
      <div className="pointer-events-none absolute inset-4 rounded-full border border-white/25" />
      {/* direction markers */}
      <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 text-xs leading-none text-white/80">
        ▲
      </span>
      <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-xs leading-none text-white/80">
        ▼
      </span>
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs leading-none text-white/80">
        ◀
      </span>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs leading-none text-white/80">
        ▶
      </span>
      <div
        ref={knobRef}
        style={{
          width: KNOB,
          height: KNOB,
          top: KNOB_OFFSET,
          left: KNOB_OFFSET,
          willChange: "transform",
        }}
        className={`absolute rounded-full border-2 border-white/70 bg-gradient-to-br from-primary to-primary/80 shadow-lg ${
          active
            ? "ring-4 ring-primary/30"
            : "transition-transform duration-150 ease-out"
        }`}
      />
    </div>
  );
}
