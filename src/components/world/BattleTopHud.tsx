// Arena top HUD — Wild Rift style score strip.
//
// Both battle scenes (bot duel + PvP) render the same strip: each fighter's
// HP ("score") bar on its own side and the match clock in the middle. All
// sizing lives in CSS (`index.css`) as clamp()/vh expressions so the HUD keeps
// its visual weight from a small phone in landscape up to a tablet, instead of
// being a fixed pixel block that eats a third of a short screen.
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** mm:ss — the strip must not reflow when the width changes. */
function clockLabel(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Proportional HP bar. The enemy bar fills from the right so both bars
 *  drain toward the middle of the screen, like a MOBA scoreboard. */
export function HudHpBar({
  pct,
  tone,
  align = "left",
}: {
  pct: number;
  tone: "sky" | "rose";
  align?: "left" | "right";
}) {
  return (
    <div className={cn("battle-hud-bar", align === "right" && "justify-end")}>
      <span
        className={cn(
          "battle-hud-bar-fill",
          tone === "sky"
            ? "bg-gradient-to-r from-sky-500 to-cyan-300"
            : "bg-gradient-to-l from-rose-500 to-red-400",
        )}
        style={{ width: `${clamp01(pct) * 100}%` }}
      />
    </div>
  );
}

/** One fighter's side of the strip: avatar, name, ability charge and HP. */
export function HudFighter({
  name,
  pct,
  abilityPct,
  tone,
  align = "left",
}: {
  name: string;
  pct: number;
  /** Super ability charge 0…1. */
  abilityPct: number;
  tone: "sky" | "rose";
  align?: "left" | "right";
}) {
  const right = align === "right";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1.5",
        right && "flex-row-reverse",
      )}
    >
      <div
        className={cn(
          "battle-hud-avatar flex shrink-0 items-center justify-center rounded-full font-extrabold",
          tone === "sky" ? "bg-sky-500/25" : "bg-rose-500/25",
        )}
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          className={cn(
            "flex min-w-0 items-center gap-1.5",
            right && "flex-row-reverse",
          )}
        >
          <span className="battle-hud-name truncate font-extrabold">{name}</span>
          <span
            className={cn(
              "battle-hud-chip flex shrink-0 items-center gap-0.5 font-extrabold",
              tone === "sky" ? "text-sky-300" : "text-rose-300",
            )}
          >
            <Zap className="size-3" />
            {Math.round(clamp01(abilityPct) * 100)}%
          </span>
        </div>
        <div className={cn("flex items-center gap-1.5", right && "flex-row-reverse")}>
          <HudHpBar pct={pct} tone={tone} align={align} />
          <span className="battle-hud-hpnum shrink-0 font-extrabold tabular-nums text-white/80">
            {Math.round(clamp01(pct) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

/** Match clock — the "time" half of the top strip. */
export function HudClock({ seconds }: { seconds: number }) {
  return (
    <span className="battle-hud-clock flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-extrabold tabular-nums">
      <span className="text-amber-300">⏱</span>
      {clockLabel(seconds)}
    </span>
  );
}
