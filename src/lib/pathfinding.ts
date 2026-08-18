/**
 * Grid-based A* pathfinding for the Sanalika street map.
 *
 * The world is discretised into cells.  Obstacle rectangles are
 * "burned" into the grid (inflated by PLAYER_RADIUS so the character
 * circle never overlaps a stall).  A* then finds the shortest walkable
 * path from start → goal.
 */

import { OBSTACLES, WALKABLE_ZONES, PLAYER_RADIUS } from "./shop";

/* ── grid constants ─────────────────────────────────────────── */

const CELL = 16; // px per cell — small enough for smooth paths,
// large enough to keep the open list tiny.
const COLS = Math.ceil(1600 / CELL); // 100
const ROWS = Math.ceil(900 / CELL); // 57

/* ── walkability bitmap (built once, module-level) ──────────── */

// true = walkable, false = blocked
const walkable: boolean[][] = (() => {
  const g: boolean[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => false),
  );

  // 1) mark everything inside a walkable zone
  for (const z of WALKABLE_ZONES) {
    const c0 = Math.floor(z.x / CELL);
    const r0 = Math.floor(z.y / CELL);
    const c1 = Math.ceil((z.x + z.w) / CELL);
    const r1 = Math.ceil((z.y + z.h) / CELL);
    for (let r = r0; r < r1 && r < ROWS; r++)
      for (let c = c0; c < c1 && c < COLS; c++) g[r][c] = true;
  }

  // 2) burn obstacles (inflated by PLAYER_RADIUS) — mark as blocked
  for (const o of OBSTACLES) {
    const pad = PLAYER_RADIUS;
    const c0 = Math.floor((o.x - pad) / CELL);
    const r0 = Math.floor((o.y - pad) / CELL);
    const c1 = Math.ceil((o.x + o.w + pad) / CELL);
    const r1 = Math.ceil((o.y + o.h + pad) / CELL);
    for (let r = r0; r < r1 && r < ROWS; r++)
      for (let c = c0; c < c1 && c < COLS; c++) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r][c] = false;
      }
  }

  return g;
})();

/* ── helpers ────────────────────────────────────────────────── */

function toGrid(wx: number, wy: number) {
  return {
    c: Math.max(0, Math.min(COLS - 1, Math.round(wx / CELL))),
    r: Math.max(0, Math.min(ROWS - 1, Math.round(wy / CELL))),
  };
}

function toWorld(c: number, r: number) {
  return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 };
}

/** 4-directional neighbours only — no diagonal movement. */
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/* ── A* ─────────────────────────────────────────────────────── */

interface Node {
  c: number;
  r: number;
  g: number;
  f: number;
  parent: Node | null;
}

function heuristic(a: Node, b: Node) {
  // octile distance
  const dx = Math.abs(a.c - b.c);
  const dy = Math.abs(a.r - b.r);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * Find a path from world-start to world-goal.
 * Returns world-coordinate waypoints (including start & goal) or
 * an empty array if unreachable.
 */
export function findPath(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): { x: number; y: number }[] {
  const start = toGrid(sx, sy);
  const goal = toGrid(gx, gy);

  // If start or goal is blocked, try the nearest walkable cell.
  const resolveBlocked = (c: number, r: number) => {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS && walkable[r][c])
      return { c, r };
    // BFS outward to find the closest walkable cell (max 10 cells)
    const visited = new Set<string>();
    const queue: [number, number][] = [[c, r]];
    visited.add(`${c},${r}`);
    while (queue.length > 0) {
      const [cc, rr] = queue.shift()!;
      for (const [dc, dr] of DIRS) {
        const nc = cc + dc;
        const nr = rr + dr;
        const key = `${nc},${nr}`;
        if (visited.has(key)) continue;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        visited.add(key);
        if (walkable[nr][nc]) return { c: nc, r: nr };
        queue.push([nc, nr]);
      }
    }
    return null; // truly unreachable
  };

  const startNode = resolveBlocked(start.c, start.r);
  const goalNode = resolveBlocked(goal.c, goal.r);

  if (!startNode || !goalNode) return [];
  if (
    startNode.c === goalNode.c &&
    startNode.r === goalNode.r
  )
    return [toWorld(startNode.c, startNode.r)];

  const key = (c: number, r: number) => r * COLS + c;

  const openMap = new Map<number, Node>();
  const closed = new Set<number>();

  const root: Node = {
    c: startNode.c,
    r: startNode.r,
    g: 0,
    f: 0,
    parent: null,
  };
  root.f = heuristic(root, { c: goalNode.c, r: goalNode.r, g: 0, f: 0, parent: null });
  openMap.set(key(root.c, root.r), root);

  // Simple array-based open list (sorted on pop).  Grid is small
  // (≤ 5700 cells), so linear scan is fast enough.
  const openArr: Node[] = [root];

  while (openArr.length > 0) {
    // pop node with lowest f
    let bestIdx = 0;
    for (let i = 1; i < openArr.length; i++) {
      if (openArr[i].f < openArr[bestIdx].f) bestIdx = i;
    }
    const current = openArr.splice(bestIdx, 1)[0];
    const ck = key(current.c, current.r);

    if (current.c === goalNode.c && current.r === goalNode.r) {
      // reconstruct
      const path: { x: number; y: number }[] = [];
      let n: Node | null = current;
      while (n) {
        path.push(toWorld(n.c, n.r));
        n = n.parent;
      }
      path.reverse();
      return smoothPath(path);
    }

    closed.add(ck);

    for (const [dc, dr] of DIRS) {
      const nc = current.c + dc;
      const nr = current.r + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      if (!walkable[nr][nc]) continue;
      const nk = key(nc, nr);
      if (closed.has(nk)) continue;

      const moveCost = 1; // cardinal only
      const g = current.g + moveCost;

      const existing = openMap.get(nk);
      if (existing && g >= existing.g) continue;

      const node: Node = {
        c: nc,
        r: nr,
        g,
        f: g + heuristic({ c: nc, r: nr, g: 0, f: 0, parent: null }, { c: goalNode.c, r: goalNode.r, g: 0, f: 0, parent: null }),
        parent: current,
      };

      if (existing) {
        // update in-place
        existing.g = node.g;
        existing.f = node.f;
        existing.parent = node.parent;
      } else {
        openMap.set(nk, node);
        openArr.push(node);
      }
    }
  }

  return []; // no path
}

/* ── path smoothing ─────────────────────────────────────────── */

/**
 * Remove collinear waypoints so the character walks in
 * straight lines instead of zig-zagging cell-by-cell.
 */
function smoothPath(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length <= 2) return pts;

  const result: { x: number; y: number }[] = [pts[0]];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = result[result.length - 1];
    const next = pts[i + 1];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dx2 = pts[i].x - prev.x;
    const dy2 = pts[i].y - prev.y;

    // If the point is collinear (or very close), skip it.
    if (Math.abs(dx * dy2 - dy * dx2) > 0.5) {
      result.push(pts[i]);
    }
  }

  result.push(pts[pts.length - 1]);
  return result;
}
