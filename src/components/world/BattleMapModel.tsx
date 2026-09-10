import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { WarAtmosphere } from "./WarAtmosphere";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";

const MAP_URL = "/models/5v5_game_map.glb";
const ROT_Y = (-135 * Math.PI) / 180;
// Arena footprint in 3D units — must match Arena3D (S=50). The terrain is
// spread over this larger footprint so the map reads big and fighters small.
const ARENA_W = 34;
const ARENA_D = 22;
const ARENA_CX = ARENA_W / 2;
const ARENA_CZ = ARENA_D / 2;
/** px per 3D unit (Arena3D S) — geometry is rasterized into game px. */
const PX = 50;
const FALLBACK_SCALE = ARENA_W / 32962.3;
const FALLBACK_POS = [
  ARENA_CX - -590.9 * FALLBACK_SCALE,
  8.9 * FALLBACK_SCALE,
  ARENA_CZ - -15242.1 * FALLBACK_SCALE,
] as [number, number, number];

/* ------------------------------------------------------------------ */
/* Geometry-derived collision — an occupancy grid rasterized from the  */
/* ACTUAL rock / wall / tower triangles of the uploaded map. There are */
/* NO hand-placed obstacle lists and NO coordinate-based invisible     */
/* walls: a fighter only collides where real geometry exists, so open  */
/* roads and lanes stay completely free.                              */
/* ------------------------------------------------------------------ */

// A small cell keeps the walkable road edges accurate without inflating
// obstacle footprints into the lane. The old 8 px cells made narrow road
// clearances collide several pixels before the fighter reached the prop.
const GRID_CELL = 2; // game-space px per cell; keeps collider edges tight to GLB geometry
// The fitted GLB is placed with its terrain top at y=0. Props are usually
// seated on that surface (their lowest vertices are often exactly y=0).
const WALK_PLANE_Y = 0;
const WALK_PLANE_EPSILON = 0.035;
// Use a thin band above the walk plane when sampling obstacle sides. This
// catches rocks whose exported bottom is a few centimetres above/below the
// terrain, without projecting their tall upper faces across nearby roads.
const OBSTACLE_BASE_BAND = 0.12;
// Raised camp/island tops are not walkable surfaces. They are sampled only
// when the actual GLB face is above the fitted walk plane; flat grass beside
// a lane remains walkable. This prevents a fighter from climbing onto the
// green rock islands without introducing coordinate-authored blockers.
const RAISED_ISLAND_MIN_Y = 0.05;
const RAISED_SURFACE_MIN_AREA = 0.0002;
const GRID_COLS = Math.ceil((ARENA_W * PX) / GRID_CELL);
const GRID_ROWS = Math.ceil((ARENA_D * PX) / GRID_CELL);

export interface RockGrid {
  cell: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
  /** Occupied cells of the real top-facing terrain mesh. */
  walkable: Uint8Array;
  walkableCount: number;
}

// Populated once when the map finishes fitting; read per-frame by the sim.
const rockCollision: { grid: RockGrid | null } = { grid: null };

/** True when the circle (cx, cy, r) — in game-space px — overlaps any rock,
 *  wall or tower geometry rasterized from the map's real meshes. */
export function hitsRockCollision(cx: number, cy: number, r: number): boolean {
  const g = rockCollision.grid;
  if (!g) return false;
  const { cell, cols, rows, blocked } = g;

  // The GLB terrain is not a rectangular island: the lower/right part of
  // the screenshot is empty space outside its actual mesh. Treat leaving the
  // rasterized terrain footprint exactly like hitting a rigid collider. The
  // circumference samples keep the whole fighter body on the map, not just
  // its center point.
  if (g.walkableCount > 0) {
    // The center cell is the authoritative map-boundary test. Requiring all
    // circumference samples to be walkable made narrow but visibly open
    // lanes fail: the fighter radius touched a decorative/base mesh that is
    // not a rigid obstacle. Actual rocks, walls and towers are checked below
    // with the circle-vs-cell test, so the body still cannot enter a real
    // collider while open roads remain traversable.
    // Terrain is triangulated in many small pieces. At a seam between two
    // triangles the exact center cell can be empty for one raster cell even
    // though the visible lane is continuous. Accept a tiny neighbourhood for
    // the boundary test; rigid obstacle cells below still remain authoritative
    // and keep rocks/walls from becoming passable.
    // Keep the entire collision circle on the authored navigation surface.
    // This is deliberately separate from `blocked`: roads remain open, while
    // a fighter-sized footprint cannot be placed half on a wall/platform.
    if (!hasWalkableFootprint(g, cx, cy, r)) return true;
  }

  const minCol = Math.max(0, Math.floor((cx - r) / cell));
  const maxCol = Math.min(cols - 1, Math.floor((cx + r) / cell));
  const minRow = Math.max(0, Math.floor((cy - r) / cell));
  const maxRow = Math.min(rows - 1, Math.floor((cy + r) / cell));
  for (let row = minRow; row <= maxRow; row++) {
    const rowOff = row * cols;
    const ny0 = row * cell;
    for (let col = minCol; col <= maxCol; col++) {
      if (!blocked[rowOff + col]) continue;
      // circle vs. cell square (same test the sim uses for rects)
      const nx = Math.max(col * cell, Math.min(cx, col * cell + cell));
      const ny = Math.max(ny0, Math.min(cy, ny0 + cell));
      const dx = cx - nx;
      const dy = cy - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}

function isWalkableCell(g: RockGrid, px: number, py: number): boolean {
  const col = Math.floor(px / g.cell);
  const row = Math.floor(py / g.cell);
  return (
    col >= 0 &&
    col < g.cols &&
    row >= 0 &&
    row < g.rows &&
    g.walkable[row * g.cols + col] !== 0
  );
}

function hasWalkableNeighbour(
  g: RockGrid,
  px: number,
  py: number,
  radius: number,
): boolean {
  const minCol = Math.max(0, Math.floor((px - radius) / g.cell));
  const maxCol = Math.min(g.cols - 1, Math.floor((px + radius) / g.cell));
  const minRow = Math.max(0, Math.floor((py - radius) / g.cell));
  const maxRow = Math.min(g.rows - 1, Math.floor((py + radius) / g.cell));
  const radiusSq = radius * radius;
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (!g.walkable[row * g.cols + col]) continue;
      const cellX = (col + 0.5) * g.cell;
      const cellY = (row + 0.5) * g.cell;
      const dx = cellX - px;
      const dy = cellY - py;
      if (dx * dx + dy * dy <= radiusSq) return true;
    }
  }
  return false;
}

/**
 * Navigation clearance test for a fighter-sized circle. A nearby walkable
 * cell is not enough: that old rule let the center sit on a wall/platform
 * edge whenever some road cell was within the tolerance. Sample the actual
 * circle in the walkable mask instead, keeping the corridor open while
 * reserving the fighter radius from every unwalkable surface.
 */
function hasWalkableFootprint(g: RockGrid, px: number, py: number, radius: number) {
  if (!isWalkableCell(g, px, py)) return false;
  const clearance = Math.max(0, radius - g.cell);
  const rings = [clearance * 0.55, clearance];
  for (const ring of rings) {
    const samples = Math.max(12, Math.ceil((Math.PI * 2 * ring) / g.cell));
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      if (!isWalkableCell(g, px + Math.cos(angle) * ring, py + Math.sin(angle) * ring)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * A GLB can finish loading after the fighter refs have been created. If a
 * spawn point was inside a real prop, the normal movement test would reject
 * every next position and leave the fighter permanently pinned. Find the
 * nearest free point on the already-built geometry mask so the first frame
 * of the simulation always starts on walkable ground.
 */
export function findNearestWalkablePosition(
  x: number,
  y: number,
  r: number,
): [number, number] | null {
  if (!rockCollision.grid) return null;
  if (!hitsRockCollision(x, y, r)) return [x, y];

  const maxX = ARENA_W * PX;
  const maxY = ARENA_D * PX;
  const maxRadius = Math.max(maxX, maxY);
  for (let distance = GRID_CELL * 2; distance <= maxRadius; distance += GRID_CELL * 2) {
    const samples = Math.max(16, Math.ceil((Math.PI * 2 * distance) / (GRID_CELL * 2)));
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const candidateX = Math.max(r, Math.min(maxX - r, x + Math.cos(angle) * distance));
      const candidateY = Math.max(r, Math.min(maxY - r, y + Math.sin(angle) * distance));
      if (!hitsRockCollision(candidateX, candidateY, r)) {
        return [candidateX, candidateY];
      }
    }
  }
  return null;
}

/**
 * Find a short, radius-aware route on the fitted GLB navigation mask.
 * Player taps and bot chase requests use this instead of drawing a straight
 * line through a wall. The route is deliberately 4-directional: diagonal
 * corner cutting is not allowed unless the complete fighter footprint is
 * clear along the segment.
 */
export function findWalkablePath(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  radius: number,
): [number, number][] {
  const grid = rockCollision.grid;
  if (!grid) return [];

  const navCell = Math.max(GRID_CELL * 4, radius);
  const cols = Math.ceil((ARENA_W * PX) / navCell);
  const rows = Math.ceil((ARENA_D * PX) / navCell);
  const toNode = (x: number, y: number) => ({
    c: Math.max(0, Math.min(cols - 1, Math.floor(x / navCell))),
    r: Math.max(0, Math.min(rows - 1, Math.floor(y / navCell))),
  });
  const toWorld = (c: number, r: number): [number, number] => [
    Math.min(ARENA_W * PX - radius, Math.max(radius, (c + 0.5) * navCell)),
    Math.min(ARENA_D * PX - radius, Math.max(radius, (r + 0.5) * navCell)),
  ];
  const key = (c: number, r: number) => r * cols + c;
  const isFree = (c: number, r: number) => {
    if (c < 0 || c >= cols || r < 0 || r >= rows) return false;
    const [x, y] = toWorld(c, r);
    return !hitsRockCollision(x, y, radius);
  };
  const nearestFree = (x: number, y: number) => {
    const start = toNode(x, y);
    if (isFree(start.c, start.r)) return start;
    const queue: [number, number][] = [[start.c, start.r]];
    const visited = new Set<number>([key(start.c, start.r)]);
    while (queue.length) {
      const [c, r] = queue.shift()!;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nc = c + dc;
        const nr = r + dr;
        const nk = key(nc, nr);
        if (visited.has(nk) || nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        visited.add(nk);
        if (isFree(nc, nr)) return { c: nc, r: nr };
        queue.push([nc, nr]);
      }
    }
    return null;
  };

  const start = nearestFree(sx, sy);
  const goal = nearestFree(gx, gy);
  if (!start || !goal) return [];
  if (start.c === goal.c && start.r === goal.r) return [toWorld(start.c, start.r)];

  const open: { c: number; r: number; g: number; f: number; parent: number | null }[] = [
    { ...start, g: 0, f: 0, parent: null },
  ];
  const records = new Map<number, (typeof open)[number]>();
  const closed = new Set<number>();
  const startKey = key(start.c, start.r);
  const goalKey = key(goal.c, goal.r);
  open[0].f = Math.abs(start.c - goal.c) + Math.abs(start.r - goal.r);
  records.set(startKey, open[0]);

  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const current = open.splice(best, 1)[0];
    const currentKey = key(current.c, current.r);
    if (closed.has(currentKey)) continue;
    if (currentKey === goalKey) {
      const route: [number, number][] = [];
      let node: typeof current | undefined = current;
      while (node) {
        route.push(toWorld(node.c, node.r));
        node = node.parent === null ? undefined : records.get(node.parent);
      }
      route.reverse();
      return smoothWalkableRoute(route, radius);
    }
    closed.add(currentKey);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = current.c + dc;
      const nr = current.r + dr;
      if (!isFree(nc, nr)) continue;
      const nk = key(nc, nr);
      if (closed.has(nk)) continue;
      const g = current.g + 1;
      const existing = records.get(nk);
      if (existing && existing.g <= g) continue;
      const node = {
        c: nc,
        r: nr,
        g,
        f: g + Math.abs(nc - goal.c) + Math.abs(nr - goal.r),
        parent: currentKey,
      };
      records.set(nk, node);
      open.push(node);
    }
  }
  return [];
}

function smoothWalkableRoute(route: [number, number][], radius: number): [number, number][] {
  if (route.length <= 2) return route;
  const result: [number, number][] = [route[0]];
  let anchor = 0;
  for (let i = 2; i < route.length; i++) {
    if (!canWalkSegment(route[anchor], route[i], radius)) {
      result.push(route[i - 1]);
      anchor = i - 1;
    }
  }
  result.push(route[route.length - 1]);
  return result;
}

function canWalkSegment(a: [number, number], b: [number, number], radius: number) {
  const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(distance / Math.max(4, GRID_CELL * 2)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (hitsRockCollision(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, radius)) return false;
  }
  return true;
}

function markCell(g: RockGrid, px: number, py: number) {
  const c = Math.floor(px / g.cell);
  const r = Math.floor(py / g.cell);
  if (c >= 0 && c < g.cols && r >= 0 && r < g.rows) g.blocked[r * g.cols + c] = 1;
}

function markWalkableCell(g: RockGrid, px: number, py: number) {
  const c = Math.floor(px / g.cell);
  const r = Math.floor(py / g.cell);
  if (c < 0 || c >= g.cols || r < 0 || r >= g.rows) return;
  const index = r * g.cols + c;
  if (g.walkable[index] === 0) {
    g.walkable[index] = 1;
    g.walkableCount++;
  }
}

function rasterizeWalkableTriangle(
  g: RockGrid,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  const minCol = Math.max(
    0,
    Math.floor((Math.min(a.x, b.x, c.x) * PX) / g.cell) - 1,
  );
  const maxCol = Math.min(
    g.cols - 1,
    Math.ceil((Math.max(a.x, b.x, c.x) * PX) / g.cell) + 1,
  );
  const minRow = Math.max(
    0,
    Math.floor((Math.min(a.z, b.z, c.z) * PX) / g.cell) - 1,
  );
  const maxRow = Math.min(
    g.rows - 1,
    Math.ceil((Math.max(a.z, b.z, c.z) * PX) / g.cell) + 1,
  );
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const x = (col + 0.5) * g.cell / PX;
      const z = (row + 0.5) * g.cell / PX;
      if (pointInTriangle2D(x, z, a, b, c)) {
        markWalkableCell(g, x * PX, z * PX);
      }
    }
  }
}

function sampleEdge(g: RockGrid, x0: number, y0: number, x1: number, y1: number) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len / g.cell));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    markCell(g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  }
}

/**
 * Rasterize only the obstacle's footprint at the fighter's walking plane.
 * Projecting the complete 3D triangle used to turn sloped/top faces into
 * huge rectangular blockers over nearby roads. A wall contributes its real
 * ground-level edge; a rock contributes the small slice where it meets the
 * ground, while upper/underground geometry contributes nothing.
 */
function clipPolygonAgainstY(
  polygon: THREE.Vector3[],
  y: number,
  keepAbove: boolean,
): THREE.Vector3[] {
  const clipped: THREE.Vector3[] = [];
  if (polygon.length === 0) return clipped;
  const inside = (point: THREE.Vector3) =>
    keepAbove ? point.y >= y : point.y <= y;
  for (let i = 0; i < polygon.length; i++) {
    const from = polygon[i];
    const to = polygon[(i + 1) % polygon.length];
    const fromInside = inside(from);
    const toInside = inside(to);
    if (fromInside !== toInside) {
      const t = (y - from.y) / (to.y - from.y);
      clipped.push(
        new THREE.Vector3(
          from.x + (to.x - from.x) * t,
          y,
          from.z + (to.z - from.z) * t,
        ),
      );
    }
    if (toInside) clipped.push(to.clone());
  }
  return clipped;
}

/** Fill only the real lower side of an obstacle. Unlike projecting a whole
 * triangle, clipping to the base band cannot turn a tall rock face into a
 * large invisible rectangle on the lane beside it. */
function rasterizeObstacleBase(
  g: RockGrid,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  minY: number,
  maxY: number,
): THREE.Vector3[] {
  let polygon = [a, b, c];
  polygon = clipPolygonAgainstY(polygon, minY, true);
  polygon = clipPolygonAgainstY(polygon, maxY, false);
  if (polygon.length < 3) return polygon;
  const origin = polygon[0];
  for (let i = 1; i < polygon.length - 1; i++) {
    rasterizeProjectedTriangle(g, origin, polygon[i], polygon[i + 1]);
  }
  return polygon;
}

function rasterizeWalkSlice(
  g: RockGrid,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  planeY: number,
) {
  const points: THREE.Vector3[] = [];
  const addPoint = (x: number, z: number) => {
    if (points.some((point) => Math.hypot(point.x - x, point.z - z) < 0.001)) return;
    points.push(new THREE.Vector3(x, 0, z));
  };
  const addEdgeSlice = (from: THREE.Vector3, to: THREE.Vector3) => {
    const fromNear = Math.abs(from.y - planeY) <= WALK_PLANE_EPSILON;
    const toNear = Math.abs(to.y - planeY) <= WALK_PLANE_EPSILON;
    if (fromNear) addPoint(from.x, from.z);
    if (toNear) addPoint(to.x, to.z);
    if (
      (from.y < planeY && to.y > planeY) ||
      (from.y > planeY && to.y < planeY)
    ) {
      const t = (planeY - from.y) / (to.y - from.y);
      addPoint(
        from.x + (to.x - from.x) * t,
        from.z + (to.z - from.z) * t,
      );
    }
  };

  addEdgeSlice(a, b);
  addEdgeSlice(b, c);
  addEdgeSlice(c, a);
  if (points.length === 0) return points;

  // The selected obstacle faces are wall-like, so their walk-plane section
  // is normally a line. Mark only that section, not the full projected face.
  if (points.length === 1) {
    markCell(g, points[0].x * PX, points[0].z * PX);
    return points;
  }
  for (let i = 0; i < points.length; i++) {
    const from = points[i];
    const to = points[(i + 1) % points.length];
    sampleEdge(g, from.x * PX, from.z * PX, to.x * PX, to.z * PX);
  }
  return points;
}

function mergeClosedMeshFootprint(
  target: RockGrid,
  boundary: Uint8Array,
  bounds: THREE.Box3,
) {
  // Do not pad this box. The fighter radius is handled by hitsRockCollision;
  // padding the mesh bounds here made every collider visibly wider than the
  // corresponding GLB rock and pushed it into neighbouring roads.
  const minCol = Math.max(0, Math.floor((bounds.min.x * PX) / target.cell));
  const maxCol = Math.min(
    target.cols - 1,
    Math.ceil((bounds.max.x * PX) / target.cell),
  );
  const minRow = Math.max(0, Math.floor((bounds.min.z * PX) / target.cell));
  const maxRow = Math.min(
    target.rows - 1,
    Math.ceil((bounds.max.z * PX) / target.cell),
  );
  if (minCol > maxCol || minRow > maxRow) return;

  let boundaryCount = 0;
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (boundary[row * target.cols + col]) boundaryCount++;
    }
  }
  if (boundaryCount < 3) return;

  // Flood-fill only this mesh's own bounding box. The old implementation
  // flood-filled the entire map after combining every prop's edges, so an
  // unrelated rock outline could close a road hundreds of pixels away.
  // Large/incomplete exporter chunks are kept as boundary lines only.
  const area = (maxCol - minCol + 1) * (maxRow - minRow + 1);
  if (area > target.cols * target.rows * 0.45) {
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (boundary[row * target.cols + col]) {
          target.blocked[row * target.cols + col] = 1;
        }
      }
    }
    return;
  }

  const outside = new Uint8Array(target.blocked.length);
  const queue = new Int32Array(target.blocked.length);
  let head = 0;
  let tail = 0;
  const enqueue = (index: number) => {
    if (boundary[index] || outside[index]) return;
    outside[index] = 1;
    queue[tail++] = index;
  };
  for (let col = minCol; col <= maxCol; col++) {
    enqueue(minRow * target.cols + col);
    enqueue(maxRow * target.cols + col);
  }
  for (let row = minRow + 1; row < maxRow; row++) {
    enqueue(row * target.cols + minCol);
    enqueue(row * target.cols + maxCol);
  }
  while (head < tail) {
    const index = queue[head++];
    const row = Math.floor(index / target.cols);
    const col = index - row * target.cols;
    if (col > minCol) enqueue(index - 1);
    if (col < maxCol) enqueue(index + 1);
    if (row > minRow) enqueue(index - target.cols);
    if (row < maxRow) enqueue(index + target.cols);
  }
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const index = row * target.cols + col;
      if (boundary[index] || !outside[index]) target.blocked[index] = 1;
    }
  }
}

function pointInTriangle2D(
  px: number,
  py: number,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  const ab = (px - a.x) * (b.z - a.z) - (py - a.z) * (b.x - a.x);
  const bc = (px - b.x) * (c.z - b.z) - (py - b.z) * (c.x - b.x);
  const ca = (px - c.x) * (a.z - c.z) - (py - c.z) * (a.x - c.x);
  return (ab >= 0 && bc >= 0 && ca >= 0) || (ab <= 0 && bc <= 0 && ca <= 0);
}

function rasterizeProjectedTriangle(
  g: RockGrid,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  const minCol = Math.max(
    0,
    Math.floor((Math.min(a.x, b.x, c.x) * PX) / g.cell) - 1,
  );
  const maxCol = Math.min(
    g.cols - 1,
    Math.ceil((Math.max(a.x, b.x, c.x) * PX) / g.cell) + 1,
  );
  const minRow = Math.max(
    0,
    Math.floor((Math.min(a.z, b.z, c.z) * PX) / g.cell) - 1,
  );
  const maxRow = Math.min(
    g.rows - 1,
    Math.ceil((Math.max(a.z, b.z, c.z) * PX) / g.cell) + 1,
  );
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const x = (col + 0.5) * g.cell / PX;
      const z = (row + 0.5) * g.cell / PX;
      if (pointInTriangle2D(x, z, a, b, c)) g.blocked[row * g.cols + col] = 1;
    }
  }
}

/**
 * Rasterize the map's actual rock / wall / tower meshes into an occupancy
 * grid (game px). Only the walkable-height gameplay props are included:
 * ground/terrain/decals, walkable base platforms, stations, trees, props
 * and the giant perimeter/underside walls are excluded so empty roads stay
 * clear.
 */
function buildCollisionGrid(root: THREE.Object3D): RockGrid {
  const grid: RockGrid = {
    cell: GRID_CELL,
    cols: GRID_COLS,
    rows: GRID_ROWS,
    blocked: new Uint8Array(GRID_COLS * GRID_ROWS),
    walkable: new Uint8Array(GRID_COLS * GRID_ROWS),
    walkableCount: 0,
  };
  // Use only named gameplay obstacle meshes. In particular, do not use a
  // broad /wall/ or /block/ match: the GLB contains decorative perimeter
  // walls, underside chunks and low path dressing with those words in their
  // names. Those meshes were the reason the visible roads became blocked.
  const isObstacleMesh = (mesh: THREE.Mesh) => {
    // BaseBluePart/BaseRedPart meshes combine the walkable base floor with
    // decorative side pieces. Treating the whole mesh as an obstacle closes
    // the central stone entrance shown in the screenshot. Towers and actual
    // rock/wall props remain obstacle sources; base floor geometry remains
    // part of the walkable surface mask.
    const names: string[] = [];
    let node: THREE.Object3D | null = mesh;
    while (node) {
      if (node.name) names.push(node.name);
      node = node.parent;
    }
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const item of material) if (item.name) names.push(item.name);
    } else if (material?.name) {
      names.push(material.name);
    }
    const semanticName = names.join("/");
    // A camp island is often exported as BlockBuff/WildBlock with a child
    // mesh or material named Grass. Do not discard that whole prop merely
    // because its decorative skirt is green: the raised island body still
    // needs its real GLB footprint. Only explicit environmental containers
    // (terrain, water, bridge, etc.) override an obstacle token.
    const hasObstacleToken = /(?:rock|boulder|propswall|rockwall|wildblock|block(?:buff|boss)?|tower|base(?:blue|red)part)/i.test(
      semanticName,
    );
    const hasEnvironmentalContainer = /(?:background|ground|terrain|decal|river|water|stream|lake|pond|bridge|crossing|walkway|station|tree|bush|shrub|reed|plant|leaf|foliage|vegetation|flower|fern|underbrush|groundcover|monster|sculpture|rockfloor|rockbase|perimeter|wallg|sidewalla)/i.test(
      names.slice(0, -1).join("/"),
    );
    return hasObstacleToken && !hasEnvironmentalContainer;
  };
  // A fighter collides with the part of a prop that actually reaches the
  // walking plane, not with every triangle in its full exported volume. This
  // removes below-ground/upper decorative triangles while preserving the
  // footprint of raised rocks, jungle blocks and towers.
  const MIN_OBSTACLE_H = 0.18; // world units — small raised rocks still block
  const MIN_TOP = 0.08; // world units — a blocker must rise above the walk plane
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const tmpBox = new THREE.Box3();
  const bridgeBoxes: THREE.Box3[] = [];
  const semanticNameOf = (mesh: THREE.Mesh) => {
    const names: string[] = [];
    let node: THREE.Object3D | null = mesh;
    while (node) {
      if (node.name) names.push(node.name);
      node = node.parent;
    }
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const item of material) if (item.name) names.push(item.name);
    } else if (material?.name) {
      names.push(material.name);
    }
    return names.join("/");
  };
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const semanticName = semanticNameOf(mesh);
    const isBridge = /(?:bridge|crossing|walkway)/i.test(semanticName);
    if (isBridge) {
      mesh.updateWorldMatrix(true, false);
      bridgeBoxes.push(new THREE.Box3().setFromObject(mesh));
      // Do not return here. The bridge's real top triangles must also be
      // rasterized into `walkable`; clearing water cells alone is not enough
      // now that the outer boundary follows the actual map footprint.
    }
    const isWater = /(?:water|river|stream|lake|pond)/i.test(semanticName);
    const pos = (mesh.geometry as THREE.BufferGeometry | undefined)?.getAttribute("position");

    // Keep the playable footprint from the actual top-facing map triangles.
    // The screenshot shows the lower/right blue area is outside the island,
    // while both team bases are valid floor. A rectangular 0..1700 ×
    // 0..1100 clamp is not enough; nothing is authored here: cells are filled
    // only by real GLB geometry at the fitted walk plane.
    const isBaseSurface =
      /(?:base(?:blue|red)(?:part|ground|background))/i.test(semanticName);
      const isNavigationFloor =
      /(?:terraincenter|terrainpart|base(?:blue|red)(?:ground|background))/i.test(
        semanticName,
      );
    const isWalkableSurface =
      !isWater &&
      // Navigation is authored from the map's floor/terrain meshes only.
      // Props, walls, foliage and platform meshes are never allowed to make
      // themselves walkable just because they have an upward-facing triangle.
      // The two base backgrounds/grounds are included because they are the
      // visible side corridors in the supplied screenshot.
      (isBaseSurface || isNavigationFloor);
    if (isWalkableSurface && pos) {
      mesh.updateWorldMatrix(true, false);
      m.copy(mesh.matrixWorld);
      const indexAttr = (mesh.geometry as THREE.BufferGeometry).getIndex();
      const triCount = indexAttr ? indexAttr.count / 3 : pos.count / 3;
      for (let t = 0; t < triCount; t++) {
        const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
        const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
        va.set(pos.getX(i0), pos.getY(i0), pos.getZ(i0)).applyMatrix4(m);
        vb.set(pos.getX(i1), pos.getY(i1), pos.getZ(i1)).applyMatrix4(m);
        vc.set(pos.getX(i2), pos.getY(i2), pos.getZ(i2)).applyMatrix4(m);
        edgeA.subVectors(vb, va);
        edgeB.subVectors(vc, va);
        faceNormal.crossVectors(edgeA, edgeB).normalize();
        const triangleMinY = Math.min(va.y, vb.y, vc.y);
        const triangleMaxY = Math.max(va.y, vb.y, vc.y);
        // The fit places the terrain's highest point at y=0, but the two
        // base platforms are exported slightly below that reference plane.
        // Keep the complete low, top-facing map band so the base floor is not
        // mistaken for the out-of-map void. Raised props are harmless here:
        // their own real obstacle footprint is checked after this mask.
        // A raised obstacle top is still an object, even though its face is
        // horizontal and would otherwise look like a valid floor to the
        // walkable rasterizer. Leave it out here; the obstacle pass below
        // marks that same real face as blocked. This is the important
        // distinction between walking on the base floor and walking on top
        // of a rock, tower, wall cap, or island prop.
        const isRaisedObstacleSurface =
          isObstacleMesh(mesh) &&
          faceNormal.y > 0.55 &&
          triangleMinY > WALK_PLANE_Y + RAISED_ISLAND_MIN_Y &&
          triangleMaxY - triangleMinY < 0.75;
        if (
          !isRaisedObstacleSurface &&
          faceNormal.y > 0.65 &&
          triangleMaxY <= WALK_PLANE_Y + 0.85 &&
          triangleMinY >= WALK_PLANE_Y - 1.8 &&
          triangleMaxY - triangleMinY < 0.65
        ) {
          rasterizeWalkableTriangle(grid, va, vb, vc);
        }
      }
    }

    // The camp decorations in the screenshot are exported as a mixture of
    // grass, rock and block meshes. Their raised, horizontal top faces are
    // the island itself, not an obstacle side touching y=0, so the old base
    // slice let the fighter walk straight up onto them. Treat only sizeable
    // elevated faces from island/camp/rock semantic groups as blocked. A
    // normal lane/grass surface at y=0 is deliberately not included.
    const nodePath = (() => {
      const path: string[] = [];
      let node: THREE.Object3D | null = mesh;
      while (node) {
        if (node.name) path.push(node.name);
        node = node.parent;
      }
      return path.join("/");
    })();
    const isRaisedIslandCandidate =
      /(?:island|camp|jungle|wildblock|block(?:buff|boss)?|rock|boulder|platform)/i.test(
        nodePath,
      ) &&
      !/(?:terrain|ground|decal|river|water|stream|lake|pond|bridge|crossing|walkway|road|path|lane|tree|bush|shrub|reed|plant|leaf|foliage|vegetation|flower|fern|underbrush|groundcover|station|tower|base|spawn|fountain|nexus|core)/i.test(
        nodePath,
      );
    if (isRaisedIslandCandidate && !isWater && pos) {
      mesh.updateWorldMatrix(true, false);
      m.copy(mesh.matrixWorld);
      const indexAttr = (mesh.geometry as THREE.BufferGeometry).getIndex();
      const triCount = indexAttr ? indexAttr.count / 3 : pos.count / 3;
      for (let t = 0; t < triCount; t++) {
        const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
        const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
        va.set(pos.getX(i0), pos.getY(i0), pos.getZ(i0)).applyMatrix4(m);
        vb.set(pos.getX(i1), pos.getY(i1), pos.getZ(i1)).applyMatrix4(m);
        vc.set(pos.getX(i2), pos.getY(i2), pos.getZ(i2)).applyMatrix4(m);
        edgeA.subVectors(vb, va);
        edgeB.subVectors(vc, va);
        faceNormal.crossVectors(edgeA, edgeB).normalize();
        const triangleMinY = Math.min(va.y, vb.y, vc.y);
        const triangleMaxY = Math.max(va.y, vb.y, vc.y);
        const surfaceArea = Math.abs(
          (vb.x - va.x) * (vc.z - va.z) -
            (vb.z - va.z) * (vc.x - va.x),
        ) * 0.5;
        if (
          faceNormal.y > 0.78 &&
          triangleMinY > RAISED_ISLAND_MIN_Y &&
          triangleMaxY - triangleMinY < 0.5 &&
          surfaceArea >= RAISED_SURFACE_MIN_AREA
        ) {
          rasterizeProjectedTriangle(grid, va, vb, vc);
        }
      }
    }
    if (isWater && pos) {
      mesh.updateWorldMatrix(true, false);
      m.copy(mesh.matrixWorld);
      const indexAttr = (mesh.geometry as THREE.BufferGeometry).getIndex();
      const triCount = indexAttr ? indexAttr.count / 3 : pos.count / 3;
      for (let t = 0; t < triCount; t++) {
        const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
        const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
        va.set(pos.getX(i0), pos.getY(i0), pos.getZ(i0)).applyMatrix4(m);
        vb.set(pos.getX(i1), pos.getY(i1), pos.getZ(i1)).applyMatrix4(m);
        vc.set(pos.getX(i2), pos.getY(i2), pos.getZ(i2)).applyMatrix4(m);
        edgeA.subVectors(vb, va);
        edgeB.subVectors(vc, va);
        faceNormal.crossVectors(edgeA, edgeB).normalize();
        const triangleMinY = Math.min(va.y, vb.y, vc.y);
        const triangleMaxY = Math.max(va.y, vb.y, vc.y);
        if (
          Math.abs(faceNormal.y) > 0.75 &&
          triangleMinY <= 0.2 &&
          triangleMaxY >= -0.2
        ) {
          rasterizeProjectedTriangle(grid, va, vb, vc);
        }
      }
      return;
    }
    if (!isObstacleMesh(mesh)) return;
    // Shape test: only obstacles that genuinely rise out of the ground can
    // stop a fighter — hidden underside chunks and flat rock decals cannot.
    // WallG/SideWallA pieces can sit fractionally below the fitted terrain
    // reference plane, although they are visibly standing walls. Resolve the
    // wall classification before the height gate so those walls cannot be
    // walked through just because their exported origin is below y=0.
    const isBaseWallMesh = /(?:base(?:blue|red)part)/i.test(semanticName);
    const isWallMesh = /(?:propswall|rockwall)/i.test(semanticName);
    tmpBox.setFromObject(mesh);
    const top = tmpBox.max.y;
    if (!isWallMesh && !isBaseWallMesh && top < MIN_TOP) return;
    if (!isWallMesh && !isBaseWallMesh && top - tmpBox.min.y < MIN_OBSTACLE_H) return;
    const obstaclePos = (mesh.geometry as THREE.BufferGeometry | undefined)?.getAttribute("position");
    if (!obstaclePos) return;
    mesh.updateWorldMatrix(true, false);
    m.copy(mesh.matrixWorld);
    const meshBoundary = new Uint8Array(grid.blocked.length);
    const collisionBounds = new THREE.Box3();
    let hasCollisionFace = false;
    const isBroadBlock = /(?:wildblock|block(?:buff|boss)?)/i.test(semanticName);
    const raisedFaceMinTop = isBroadBlock ? 0.35 : 0.22;
    const indexAttr = (mesh.geometry as THREE.BufferGeometry).getIndex();
    const triCount = indexAttr ? indexAttr.count / 3 : obstaclePos.count / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
      const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
      va.set(obstaclePos.getX(i0), obstaclePos.getY(i0), obstaclePos.getZ(i0)).applyMatrix4(m);
      vb.set(obstaclePos.getX(i1), obstaclePos.getY(i1), obstaclePos.getZ(i1)).applyMatrix4(m);
      vc.set(obstaclePos.getX(i2), obstaclePos.getY(i2), obstaclePos.getZ(i2)).applyMatrix4(m);
      // The map is exported with large underground and elevated triangles.
      // Projecting those triangles from above turns an innocent road into a
      // solid square. Ground-touching sides are clipped to their exact base
      // intersection below. Raised, top-facing faces are handled separately:
      // they are the surfaces the character was visibly standing on, so their
      // own projected geometry must be blocked as well.
      // Recompute the normal for THIS obstacle triangle. The walkable-surface
      // pass above is skipped for some obstacle meshes, so relying on the
      // previous loop's normal made wall top/side tests use a stale face
      // normal and silently omit the wall collider.
      edgeA.subVectors(vb, va);
      edgeB.subVectors(vc, va);
      faceNormal.crossVectors(edgeA, edgeB).normalize();
      const triangleMinY = Math.min(va.y, vb.y, vc.y);
      const triangleMaxY = Math.max(va.y, vb.y, vc.y);
      // Base meshes also contain the walkable platform. Only their real
      // vertical faces that touch the walking plane are rigid. Projecting all
      // base triangles would close the road; accepting only a near-ground
      // vertical face captures the visible entrance wall in the screenshot.
      if (isBaseWallMesh) {
        // BaseBluePart/BaseRedPart are composite meshes. Their horizontal
        // floor is walkable, but the raised cap of the brown entrance wall
        // must never become walkable just because it shares the same mesh.
        // Use the real face height/normal here: the floor remains at the
        // fitted walk plane, while a wall top is projected into the blocked
        // grid and cannot be climbed onto.
        const isRaisedBaseTop =
          faceNormal.y > 0.55 &&
          triangleMinY > WALK_PLANE_Y + RAISED_ISLAND_MIN_Y &&
          triangleMaxY - triangleMinY < 0.75;
        if (isRaisedBaseTop) {
          rasterizeProjectedTriangle(grid, va, vb, vc);
          hasCollisionFace = true;
          continue;
        }
        const isGroundContactWall =
          Math.abs(faceNormal.y) < 0.45 &&
          triangleMinY <= WALK_PLANE_Y + OBSTACLE_BASE_BAND &&
          triangleMaxY >= WALK_PLANE_Y - WALK_PLANE_EPSILON &&
          triangleMaxY - triangleMinY >= 0.12;
        if (!isGroundContactWall) continue;
        const baseSlice = rasterizeObstacleBase(
          { ...grid, blocked: meshBoundary },
          va,
          vb,
          vc,
          WALK_PLANE_Y - WALK_PLANE_EPSILON,
          WALK_PLANE_Y + OBSTACLE_BASE_BAND,
        );
        rasterizeWalkSlice(
          { ...grid, blocked: meshBoundary },
          va,
          vb,
          vc,
          WALK_PLANE_Y,
        );
        for (const point of baseSlice) collisionBounds.expandByPoint(point);
        hasCollisionFace = true;
        continue;
      }
      // Explicit wall props are rigid, but their meshes contain the full
      // upper wall and decorative caps. Projecting every wall triangle onto
      // the map turns the adjacent marked lane into an invisible blocker.
      // Let the common ground-slice path below use only the real section where
      // the wall meets the walk plane; raised horizontal faces are handled by
      // `isRaisedSurface` and remain un-climbable.
      const touchesWalkPlane =
        triangleMinY <= WALK_PLANE_Y + OBSTACLE_BASE_BAND &&
        triangleMaxY >= WALK_PLANE_Y - WALK_PLANE_EPSILON;
      const isRaisedSurface =
        faceNormal.y > 0.55 &&
        triangleMinY > WALK_PLANE_Y + RAISED_ISLAND_MIN_Y &&
        triangleMaxY - triangleMinY < 0.75;
      if (isRaisedSurface) {
        // Block only the visible top footprint, never the wall's entire
        // exported height or its decorative upper projection.
        rasterizeProjectedTriangle(grid, va, vb, vc);
      }
      // Real wall props are rigid, but only their ground contact is a wall
      // collider. This keeps the adjacent road open up to the exact visual
      // base instead of filling the whole corridor with the wall's upper
      // geometry.
      const hasRaisedFace =
        triangleMaxY >= (isWallMesh ? MIN_TOP : raisedFaceMinTop) &&
        triangleMaxY - triangleMinY >= (isBroadBlock ? 0.28 : 0.16);
      if (!touchesWalkPlane || !hasRaisedFace) continue;
      const baseSlice = rasterizeObstacleBase(
        { ...grid, blocked: meshBoundary },
        va,
        vb,
        vc,
        WALK_PLANE_Y - WALK_PLANE_EPSILON,
        WALK_PLANE_Y + OBSTACLE_BASE_BAND,
      );
      // Keep the exact plane edge as well. The clipped lower face blocks the
      // real raised part of a rock, while the edge keeps the collider aligned
      // with the visible bottom contour.
      rasterizeWalkSlice(
        { ...grid, blocked: meshBoundary },
        va,
        vb,
        vc,
        WALK_PLANE_Y,
      );
      // Keep the bounds limited to the clipped, low obstacle slice. This
      // fills a rock's real enclosed interior (preventing entry through
      // triangulation gaps) without filling the much larger grass skirt or
      // upper decorative volume from the original mesh bounding box.
      for (const point of baseSlice) collisionBounds.expandByPoint(point);
      hasCollisionFace = true;
    }
    // Base meshes are composite assets: their vertical wall faces should
    // block the character, but their open doorway must remain open. The
    // closed-footprint flood fill assumes a sealed rock and would fill that
    // doorway, which is the small passage visible in the screenshot. Keep
    // only the exact rasterized wall faces for bases; use the enclosed fill
    // only for rocks/islands whose geometry actually forms a closed footprint.
    // Rock/island meshes are usually closed footprints and need the fill to
    // prevent slipping through a triangulation seam. Wall meshes are long,
    // composite strips: filling their bounds closes the very lanes that are
    // visibly marked as walkable. Their exact raised faces and ground slices
    // above are sufficient, so never flood-fill an explicit wall mesh.
    if (hasCollisionFace && !isBaseWallMesh && !isWallMesh) {
      mergeClosedMeshFootprint(grid, meshBoundary, collisionBounds);
    }
  });
  // Water is blocked from the uploaded water surface itself. A bridge is
  // deliberately treated as a walkable cut-through and removes only its own
  // real bounding volume from the water cells; no hand-authored river/bridge
  // coordinates are used.
  for (const bridgeBox of bridgeBoxes) {
    const minCol = Math.max(0, Math.floor((bridgeBox.min.x * PX) / grid.cell));
    const maxCol = Math.min(grid.cols - 1, Math.ceil((bridgeBox.max.x * PX) / grid.cell));
    const minRow = Math.max(0, Math.floor((bridgeBox.min.z * PX) / grid.cell));
    const maxRow = Math.min(grid.rows - 1, Math.ceil((bridgeBox.max.z * PX) / grid.cell));
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        grid.blocked[row * grid.cols + col] = 0;
      }
    }
  }
  // Guarantee each spawn base connects to the walkable lanes. Base meshes
  // (BaseBluePart / BaseRedPart) combine the walkable floor with thin
  // perimeter walls; those walls are rasterized as solid and can seal every
  // exit, leaving the character trapped on the base floor. This pass finds
  // where a base floor touches a real walkable lane through a thin blocked
  // band and clears that band (a doorway) so the character can always leave
  // its base — while thick obstacles (blue props, towers, raised platforms)
  // stay solid.
  carveBaseExits(grid);
  return grid;
}

/** Spawn base centers in game-space px (must match BattleScene). */
const BASE_CENTERS: [number, number][] = [
  [850, 80], // player (red) base
  [850, 1020], // enemy (blue) base
];

/** Distance from a point to a segment, in px. */
function pointToSegmentDist(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/**
 * Carve a straight, fighter-wide passage from a base toward a lane. Only
 * clears blocked cells where the corridor ends on real open ground (a
 * walkable lane) AND stays mostly clear along its length — so it never cuts
 * through a raised platform or a thick obstacle. The cleared cells are forced
 * walkable too, so both the wall test and the walkable-footprint test pass.
 */
function carveBaseCorridor(
  grid: RockGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  halfWidth: number,
) {
  const { cols, rows, cell } = grid;
  const isWalkablePx = (px: number, py: number) => {
    const c = Math.floor(px / cell);
    const r = Math.floor(py / cell);
    return c >= 0 && c < cols && r >= 0 && r < rows && grid.walkable[r * cols + c] === 1;
  };

  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(12, Math.ceil(len / cell));
  const samples: boolean[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    samples.push(isWalkablePx(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t));
  }
  // Must start on the base floor and end on the lane, and the blocked band in
  // the middle (the thin wall) must stay small — a raised platform or thick
  // prop would leave a large blocked run and this corridor is skipped.
  const startOk = samples.length > 4 ? samples[Math.floor(samples.length * 0.12)] : true;
  const endOk = samples.length > 4 ? samples[samples.length - 1] : false;
  const blockedRun = samples.filter((w) => !w).length;
  if (!startOk || !endOk || blockedRun > steps * 0.38) return;

  // Clear blocked cells within halfWidth of the whole corridor and mark them
  // walkable.
  const minC = Math.max(0, Math.floor((Math.min(x0, x1) - halfWidth) / cell));
  const maxC = Math.min(cols - 1, Math.ceil((Math.max(x0, x1) + halfWidth) / cell));
  const minR = Math.max(0, Math.floor((Math.min(y0, y1) - halfWidth) / cell));
  const maxR = Math.min(rows - 1, Math.ceil((Math.max(y0, y1) + halfWidth) / cell));
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const px = (c + 0.5) * cell;
      const py = (r + 0.5) * cell;
      if (pointToSegmentDist(px, py, x0, y0, x1, y1) <= halfWidth) {
        const idx = r * cols + c;
        grid.blocked[idx] = 0;
        if (grid.walkable[idx] === 0) {
          grid.walkable[idx] = 1;
          grid.walkableCount++;
        }
      }
    }
  }
}

/**
 * Opens each spawn base onto the walkable lanes. Bases face the arena
 * centre, so try the inward direction plus both flanks, carving only toward
 * real open ground. Guarantees the character can leave its base while thick
 * obstacles stay solid.
 */
function carveBaseExits(grid: RockGrid) {
  const MID = (ARENA_D * PX) / 2; // 550 px — the lane between the bases
  const LEN = 300; // corridor length (px) along the vertical axis
  const SPREAD = 300; // how far the flank corridors fan out horizontally
  const HALF = 30; // half-width (px) -> ~60px opening, fighter r=22 fits
  const before = grid.blocked.reduce((a, b) => a + b, 0);

  for (const [bx, by] of BASE_CENTERS) {
    if (bx < 0 || bx > ARENA_W * PX || by < 0 || by > ARENA_D * PX) continue;
    const dir = by < MID ? 1 : -1; // player base exits down, enemy base up
    const ey = by + dir * LEN;
    // Fan of corridors: straight toward the centre lane, diagonal flanks
    // toward the two side lanes, and horizontal flanks. carveBaseCorridor
    // only opens the ones that actually land on walkable ground.
    carveBaseCorridor(grid, bx, by, bx, ey, HALF);
    carveBaseCorridor(grid, bx, by, bx - SPREAD, ey, HALF);
    carveBaseCorridor(grid, bx, by, bx + SPREAD, ey, HALF);
    carveBaseCorridor(grid, bx, by, bx - SPREAD, by, HALF);
    carveBaseCorridor(grid, bx, by, bx + SPREAD, by, HALF);
  }

  const after = grid.blocked.reduce((a, b) => a + b, 0);
  console.log(
    `[BattleMapModel] base-exit carve cleared ${before - after} blocked cells ` +
      `(walkable cells now ${grid.walkableCount})`,
  );
}

function meshBounds(root: THREE.Object3D, pattern: RegExp): THREE.Box3 | null {
  const bounds = new THREE.Box3();
  let found = false;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !pattern.test(mesh.name)) return;
    bounds.union(new THREE.Box3().setFromObject(mesh));
    found = true;
  });
  return found ? bounds : null;
}

function MapModelInner() {
  const { scene } = useGLTF(MAP_URL);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const groupRef = useRef<THREE.Group>(null);
  const fittedRef = useRef(false);

  // Render the map with its ORIGINAL materials/textures/lighting intact.
  // Only keep large chunks from being wrongly frustum-culled by the follow
  // camera; we do NOT override transparency, opacity, color space, or
  // depth flags on the exported materials.
  useEffect(() => {
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
    });
  }, [clone]);

  useLayoutEffect(() => {
    const root = groupRef.current;
    if (!root || fittedRef.current) return;
    fittedRef.current = true;
    root.rotation.y = ROT_Y;
    root.scale.setScalar(1);
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);

    // Fit the terrain EXACTLY onto the simulation rectangle (34 × 22) with a
    // uniform scale, so every lane/tower the player sees stands at the same
    // world coordinate the sim, collisions and the click plane use — visuals
    // can never drift apart from the walkable area.
    const terrainBox = meshBounds(root, /terrain/i);
    let scale = FALLBACK_SCALE;
    let posX = FALLBACK_POS[0];
    let posY = FALLBACK_POS[1];
    let posZ = FALLBACK_POS[2];
    if (terrainBox) {
      const size = terrainBox.getSize(new THREE.Vector3());
      if (size.x > 1 && size.z > 1) {
        // A uniform fit must use the smaller ratio. Using the larger ratio
        // enlarged one axis beyond the simulation rectangle, which made the
        // rendered lanes and the collision grid disagree.
        scale = Math.min(
          (ARENA_W - 0.3) / size.x,
          (ARENA_D - 0.3) / size.z,
        );
        const center = terrainBox.getCenter(new THREE.Vector3());
        posX = ARENA_CX - center.x * scale;
        posY = -terrainBox.max.y * scale;
        posZ = ARENA_CZ - center.z * scale;
      }
    }
    root.scale.setScalar(scale);
    root.position.set(posX, posY, posZ);
    root.updateMatrixWorld(true);

    // Hide the terrain's huge underside/cliff art — perimeter side walls and
    // G-walls hang ~20 units below the terrain slab and read as giant white
    // raw meshes once the map is scaled down and viewed from the battle
    // camera. Anything sitting entirely below the ground plane (y < 0 after
    // the fit) is invisible from gameplay anyway, so drop it. Terrain/ground/
    // decal meshes are always kept so no walkable surface disappears.
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (/terrain|ground|decal/i.test(mesh.name || "")) return;
      if (new THREE.Box3().setFromObject(mesh).max.y < 0) {
        mesh.visible = false;
      }
    });

    // Build the geometry collision grid from the map's real meshes.
    rockCollision.grid = buildCollisionGrid(root);
    console.log(
      `[BattleMapModel] collision grid=${GRID_COLS}x${GRID_ROWS} ` +
        `blocked=${rockCollision.grid.blocked.reduce((a, b) => a + b, 0)}`,
    );
  }, [clone]);

  return (
    <group ref={groupRef}>
      {/* Faction rim lights — visual-only battlefield atmosphere. The map
          keeps its own neutral fill lighting; these add cool/warm side color
          so each base reads like a live team fight. Purely decorative, never
          used by movement or collision. */}
      <pointLight position={[7, 5, 1.5]} color="#38d9ff" distance={18} decay={2} intensity={2.4} />
      <pointLight position={[7, 5, 10]} color="#ff426f" distance={18} decay={2} intensity={2.2} />
      <primitive object={clone} />
    </group>
  );
}

export function BattleMapModel() {
  return (
    <>
      <Suspense fallback={null}>
        <MapModelInner />
      </Suspense>
      {/* War atmosphere renders as a sibling of the map so it stays in
          arena/world space (embers, team base beams, golden sun). Visual
          only — never participates in movement or collision. */}
      <WarAtmosphere />
    </>
  );
}

useGLTF.preload(MAP_URL);