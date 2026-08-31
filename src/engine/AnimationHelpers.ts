import * as THREE from "three";

/* ── Animation clip-name resolution ───────────────────────────── */
/* GLB packs name their clips inconsistently (Idle/Walk/Run vs
 * idle/walking vs TPose). These helpers map an actions map to the
 * keys the avatar system needs, case-insensitively.
 *
 * Two distinct strategies exist ON PURPOSE:
 *  • resolveIdleWalk — exported legacy helper: walk OR run (first
 *    match wins, run accepted as walk).
 *  • resolveIdleWalkClips — gameplay preference: a REAL walk cycle
 *    wins over run so the feet visibly alternate while moving; run
 *    is only a fallback when no walk clip exists. */

/** Resolves the idle/walk clip keys from an actions map (case-insensitive). */
export function resolveIdleWalk(
  actions: Record<string, THREE.AnimationAction | null>,
) {
  let idle: string | undefined;
  let walk: string | undefined;
  for (const k of Object.keys(actions)) {
    const lk = k.toLowerCase();
    if (!idle && lk.includes("idle")) idle = k;
    if (!walk && (lk.includes("walk") || lk.includes("run"))) walk = k;
  }
  return { idle, walk };
}

/**
 * Gameplay clip preference: walk beats run (feet alternate visibly),
 * run is the fallback when the pack has no walk cycle.
 */
export function resolveIdleWalkClips(
  actions: Record<string, THREE.AnimationAction | null>,
) {
  const keys = Object.keys(actions);
  const walk = keys.find((key) => key.toLowerCase().includes("walk"));
  const run = keys.find((key) => key.toLowerCase().includes("run"));
  const idle = keys.find((key) => key.toLowerCase().includes("idle"));
  return { idle, walk: walk ?? run };
}
