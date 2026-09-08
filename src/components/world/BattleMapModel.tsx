import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
const GRID_CELL = 4; // game-space px per cell
const GRID_COLS = Math.ceil((ARENA_W * PX) / GRID_CELL);
const GRID_ROWS = Math.ceil((ARENA_D * PX) / GRID_CELL);

export interface RockGrid {
  cell: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
}

// Populated once when the map finishes fitting; read per-frame by the sim.
const rockCollision: { grid: RockGrid | null } = { grid: null };

/** True when the circle (cx, cy, r) — in game-space px — overlaps any rock,
 *  wall or tower geometry rasterized from the map's real meshes. */
export function hitsRockCollision(cx: number, cy: number, r: number): boolean {
  const g = rockCollision.grid;
  if (!g) return false;
  const { cell, cols, rows, blocked } = g;
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

function markCell(g: RockGrid, px: number, py: number) {
  const c = Math.floor(px / g.cell);
  const r = Math.floor(py / g.cell);
  if (c >= 0 && c < g.cols && r >= 0 && r < g.rows) g.blocked[r * g.cols + c] = 1;
}

function pointInTri(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function sampleEdge(g: RockGrid, x0: number, y0: number, x1: number, y1: number) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len / g.cell));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    markCell(g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  }
}

/** Rasterize one triangle (already in game px) into the occupancy grid. */
function rasterizeTriangle(g: RockGrid, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const minx = Math.min(ax, bx, cx);
  const maxx = Math.max(ax, bx, cx);
  const miny = Math.min(ay, by, cy);
  const maxy = Math.max(ay, by, cy);
  const c0 = Math.max(0, Math.floor(minx / g.cell));
  const c1 = Math.min(g.cols - 1, Math.floor(maxx / g.cell));
  const r0 = Math.max(0, Math.floor(miny / g.cell));
  const r1 = Math.min(g.rows - 1, Math.floor(maxy / g.cell));
  for (let r = r0; r <= r1; r++) {
    const py = (r + 0.5) * g.cell;
    for (let c = c0; c <= c1; c++) {
      const px = (c + 0.5) * g.cell;
      if (pointInTri(px, py, ax, ay, bx, by, cx, cy)) markCell(g, px, py);
    }
  }
  // Sample the edges too so thin walls never leave gaps.
  sampleEdge(g, ax, ay, bx, by);
  sampleEdge(g, bx, by, cx, cy);
  sampleEdge(g, cx, cy, ax, ay);
}

function clearCircle(g: RockGrid, cx: number, cy: number, radius: number) {
  const c0 = Math.max(0, Math.floor((cx - radius) / g.cell));
  const c1 = Math.min(g.cols - 1, Math.floor((cx + radius) / g.cell));
  const r0 = Math.max(0, Math.floor((cy - radius) / g.cell));
  const r1 = Math.min(g.rows - 1, Math.floor((cy + radius) / g.cell));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const pxx = (c + 0.5) * g.cell;
      const pyy = (r + 0.5) * g.cell;
      if (Math.hypot(pxx - cx, pyy - cy) < radius) g.blocked[r * g.cols + c] = 0;
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
  };
  // Use only named gameplay obstacle meshes. In particular, do not use a
  // broad /wall/ or /block/ match: the GLB contains decorative perimeter
  // walls, underside chunks and low path dressing with those words in their
  // names. Those meshes were the reason the visible roads became blocked.
  const isObstacleMesh = (name: string) =>
    /(?:rockgroup|rockwall|wildblock|block(?:buff|boss)|tower)/i.test(name) &&
    !/(?:wallg|sidewalla|background|ground|terrain|decal|river|station|tree|foliage|monster|sculpture)/i.test(name);
  // A fighter collides with the part of a prop that actually reaches the
  // walking plane, not with every triangle in its full exported volume. This
  // removes below-ground/upper decorative triangles while preserving the
  // footprint of raised rocks, jungle blocks and towers.
  const MIN_OBSTACLE_H = 0.18; // world units — small raised rocks still block
  const WALK_MIN_Y = -0.06;
  const WALK_MAX_Y = 0.42; // tops above this are reached through their side faces
  const MIN_TOP = 0.08; // world units — a blocker must rise above the walk plane
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const tmpBox = new THREE.Box3();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const name = mesh.name || "";
    if (!isObstacleMesh(name)) return;
    // Shape test: only obstacles that genuinely rise out of the ground can
    // stop a fighter — hidden underside chunks and flat rock decals cannot.
    tmpBox.setFromObject(mesh);
    const top = tmpBox.max.y;
    if (top < MIN_TOP) return;
    if (top - tmpBox.min.y < MIN_OBSTACLE_H) return;
    const pos = (mesh.geometry as THREE.BufferGeometry | undefined)?.getAttribute("position");
    if (!pos) return;
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
      // The map is exported with large underground and elevated triangles.
      // Projecting those triangles from above turns an innocent road into a
      // solid square. Only triangles touching the fighter's walk plane may
      // contribute to the 2D collision mask.
      const triangleMinY = Math.min(va.y, vb.y, vc.y);
      const triangleMaxY = Math.max(va.y, vb.y, vc.y);
      const touchesWalkPlane = triangleMinY <= WALK_MIN_Y + 0.16 && triangleMaxY >= WALK_MIN_Y;
      const hasRaisedFace = triangleMaxY >= 0.16 && triangleMaxY - triangleMinY >= 0.12;
      edgeA.subVectors(vb, va);
      edgeB.subVectors(vc, va);
      faceNormal.crossVectors(edgeA, edgeB).normalize();
      const isWallLikeFace = Math.abs(faceNormal.y) < 0.82;
      // Do not project horizontal tops or underground caps into 2D. Those
      // surfaces cover the whole model footprint and were falsely closing
      // nearby roads. Only a raised, wall-like face that reaches the walking
      // plane is a solid collision boundary.
      if (!touchesWalkPlane || !hasRaisedFace || !isWallLikeFace) continue;
      rasterizeTriangle(
        grid,
        va.x * PX, va.z * PX,
        vb.x * PX, vb.z * PX,
        vc.x * PX, vc.z * PX,
      );
    }
  });
  // Keep the two spawn pads (player top / bot bottom) clear so fighters can
  // always step out onto the lane.
  clearCircle(grid, ARENA_W / 2 * PX, 80, 95);
  clearCircle(grid, ARENA_W / 2 * PX, ARENA_D * PX - 80, 95);
  return grid;
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

function meshCenterAvg(root: THREE.Object3D, pattern: RegExp): THREE.Vector3 | null {
  const center = new THREE.Vector3();
  let count = 0;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !pattern.test(mesh.name)) return;
    center.add(new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()));
    count += 1;
  });
  return count ? center.multiplyScalar(1 / count) : null;
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
        scale = Math.max(
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
      <primitive object={clone} />
    </group>
  );
}

export function BattleMapModel() {
  return (
    <Suspense fallback={null}>
      <MapModelInner />
    </Suspense>
  );
}

useGLTF.preload(MAP_URL);