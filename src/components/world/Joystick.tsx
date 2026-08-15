import { useRef, useState } from "react";

interface JoystickProps {
  /** Called with a normalized vector in [-1, 1] as the knob is dragged. */
  onMove: (x: number, y: number) => void;
  className?: string;
}

const RADIUS = 44; // max knob travel in px
const KNOB_OFFSET = 36; // (128 - 56) / 2, centers the knob in the base

/**
 * Touch-friendly virtual joystick. Uses pointer events + pointer capture so it
 * works with finger and mouse alike; `touch-none` stops page scrolling while
 * dragging.
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
    onMove(dx / RADIUS, dy / RADIUS);
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
      className={`relative h-32 w-32 touch-none rounded-full border-2 border-white/50 bg-black/25 shadow-lg backdrop-blur-sm select-none transition-transform ${
        active ? "scale-110" : ""
      } ${className ?? ""}`}
    >
      <span className="pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2 text-xs leading-none text-white/80">
        ▲
      </span>
      <span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 text-xs leading-none text-white/80">
        ▼
      </span>
      <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-xs leading-none text-white/80">
        ◀
      </span>
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs leading-none text-white/80">
        ▶
      </span>
      <div
        ref={knobRef}
        className={`absolute left-9 top-9 h-14 w-14 rounded-full border-2 border-white/60 bg-primary shadow-lg ${
          active ? "ring-4 ring-primary/30" : ""
        }`}
        style={{ willChange: "transform" }}
      />
    </div>
  );
}
