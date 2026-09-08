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

function markCell(g: RockGrid, px: number, py: number) {
  const c = Math.floor(px / g.cell);
  const r = Math.floor(py / g.cell);
  if (c >= 0 && c < g.cols && r >= 0 && r < g.rows) g.blocked[r * g.cols + c] = 1;
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
function rasterizeWalkSlice(
  g: RockGrid,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  const points: THREE.Vector3[] = [];
  const addPoint = (x: number, z: number) => {
    if (points.some((point) => Math.hypot(point.x - x, point.z - z) < 0.001)) return;
    points.push(new THREE.Vector3(x, 0, z));
  };
  const addEdgeSlice = (from: THREE.Vector3, to: THREE.Vector3) => {
    const fromNear = Math.abs(from.y) <= 0.12;
    const toNear = Math.abs(to.y) <= 0.12;
    if (fromNear) addPoint(from.x, from.z);
    if (toNear) addPoint(to.x, to.z);
    if ((from.y < 0 && to.y > 0) || (from.y > 0 && to.y < 0)) {
      const t = -from.y / (to.y - from.y);
      addPoint(
        from.x + (to.x - from.x) * t,
        from.z + (to.z - from.z) * t,
      );
    }
  };

  addEdgeSlice(a, b);
  addEdgeSlice(b, c);
  addEdgeSlice(c, a);
  if (points.length === 0) return;

  // The selected obstacle faces are wall-like, so their walk-plane section
  // is normally a line. Mark only that section, not the full projected face.
  if (points.length === 1) {
    markCell(g, points[0].x * PX, points[0].z * PX);
    return;
  }
  for (let i = 0; i < points.length; i++) {
    const from = points[i];
    const to = points[(i + 1) % points.length];
    sampleEdge(g, from.x * PX, from.z * PX, to.x * PX, to.z * PX);
  }
}

function mergeClosedMeshFootprint(
  target: RockGrid,
  boundary: Uint8Array,
  bounds: THREE.Box3,
) {
  const minCol = Math.max(0, Math.floor((bounds.min.x * PX) / target.cell) - 1);
  const maxCol = Math.min(
    target.cols - 1,
    Math.ceil((bounds.max.x * PX) / target.cell) + 1,
  );
  const minRow = Math.max(0, Math.floor((bounds.min.z * PX) / target.cell) - 1);
  const maxRow = Math.min(
    target.rows - 1,
    Math.ceil((bounds.max.z * PX) / target.cell) + 1,
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
  };
  // Use only named gameplay obstacle meshes. In particular, do not use a
  // broad /wall/ or /block/ match: the GLB contains decorative perimeter
  // walls, underside chunks and low path dressing with those words in their
  // names. Those meshes were the reason the visible roads became blocked.
  const isObstacleMesh = (mesh: THREE.Mesh) => {
    // Some GLB exporters give the leaf mesh a generic name (for example
    // "Mesh.001") and put the useful semantic name on its parent. Include
    // the complete node path so the collider is still derived from the
    // uploaded rock/wall/tower geometry rather than from coordinates.
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
    return (
      /(?:rock|boulder|wall(?!g)|wildblock|block(?:buff|boss)?|tower)/i.test(semanticName) &&
      !/(?:wallg|sidewalla|background|ground|terrain|decal|river|water|stream|lake|pond|bridge|crossing|walkway|station|tree|foliage|monster|sculpture|rockfloor|rockbase)/i.test(semanticName)
    );
  };
  // A fighter collides with the part of a prop that actually reaches the
  // walking plane, not with every triangle in its full exported volume. This
  // removes below-ground/upper decorative triangles while preserving the
  // footprint of raised rocks, jungle blocks and towers.
  const MIN_OBSTACLE_H = 0.18; // world units — small raised rocks still block
  const WALK_MIN_Y = -0.06;
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
      return;
    }
    const isWater = /(?:water|river|stream|lake|pond)/i.test(semanticName);
    const pos = (mesh.geometry as THREE.BufferGeometry | undefined)?.getAttribute("position");
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
    tmpBox.setFromObject(mesh);
    const top = tmpBox.max.y;
    if (top < MIN_TOP) return;
    if (top - tmpBox.min.y < MIN_OBSTACLE_H) return;
    const obstaclePos = (mesh.geometry as THREE.BufferGeometry | undefined)?.getAttribute("position");
    if (!obstaclePos) return;
    mesh.updateWorldMatrix(true, false);
    m.copy(mesh.matrixWorld);
    const meshBoundary = new Uint8Array(grid.blocked.length);
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
      rasterizeWalkSlice(
        { ...grid, blocked: meshBoundary },
        va,
        vb,
        vc,
      );
    }
    mergeClosedMeshFootprint(grid, meshBoundary, tmpBox);
  });
  // Water is blocked from the uploaded water surface itself. A bridge is
  // deliberately treated as a walkable cut-through and removes only its own
  // real bounding volume from the water cells; no hand-authored river/bridge
  // coordinates are used.
  for (const bridgeBox of bridgeBoxes) {
    const minCol = Math.max(0, Math.floor((bridgeBox.min.x * PX) / grid.cell) - 1);
    const maxCol = Math.min(grid.cols - 1, Math.ceil((bridgeBox.max.x * PX) / grid.cell) + 1);
    const minRow = Math.max(0, Math.floor((bridgeBox.min.z * PX) / grid.cell) - 1);
    const maxRow = Math.min(grid.rows - 1, Math.ceil((bridgeBox.max.z * PX) / grid.cell) + 1);
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        grid.blocked[row * grid.cols + col] = 0;
      }
    }
  }
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