/**
 * ═══════════════════════════════════════════════════════════════
 * SANALIKA 3D GAME ENGINE — Coordinate Utilities
 * ═══════════════════════════════════════════════════════════════
 *
 * Converts between SVG 2D coordinates and 3D world coordinates.
 *
 * SVG coordinate system:
 *   x: 0..1600 (left to right)
 *   y: 0..900  (top to bottom)
 *
 * 3D coordinate system (Three.js):
 *   x: -8..8 (left to right)
 *   y: height above ground (0 = ground)
 *   z: 4.5..-4.5 (top to bottom in SVG → forward in 3D)
 *
 * CRITICAL RULE:
 *   As long as the 2D game logic (movement, collision, pathfinding)
 *   continues to use SVG coordinates internally, we only need to
 *   convert when rendering in 3D. The game loop stays in SVG space.
 * ═══════════════════════════════════════════════════════════════
 */

import { SVG_WORLD_W, SVG_WORLD_H, S, WORLD_CX, WORLD_CZ } from "./constants";

/**
 * Convert SVG coordinates to 3D world position.
 * @param svgX - SVG X coordinate (0..1600)
 * @param svgY - SVG Y coordinate (0..900, top=0)
 * @returns [x, y, z] Three.js world position (y=ground level)
 */
export function svgTo3D(svgX: number, svgY: number): [number, number, number] {
  const x = svgX / S - WORLD_CX; // center around origin
  const y = 0; // ground level
  const z = -(svgY / S - WORLD_CZ); // flip Y so SVG top = 3D -Z
  return [x, y, z];
}

/**
 * Convert SVG X to 3D X.
 */
export function svgXTo3D(svgX: number): number {
  return svgX / S - WORLD_CX;
}

/**
 * Convert SVG Y to 3D Z.
 */
export function svgYTo3DZ(svgY: number): number {
  return -(svgY / S - WORLD_CZ);
}

/**
 * Convert SVG width to 3D width.
 */
export function svgWTo3D(svgW: number): number {
  return svgW / S;
}

/**
 * Convert SVG height to 3D depth.
 */
export function svgHTo3D(svgH: number): number {
  return svgH / S;
}

/**
 * Convert 3D world position back to SVG coordinates.
 * Used for converting raycast results back to 2D game space.
 */
export function threeDToSVG(x3d: number, z3d: number): { x: number; y: number } {
  const svgX = (x3d + WORLD_CX) * S;
  const svgY = -(z3d - WORLD_CZ) * S;
  return { x: svgX, y: svgY };
}

/**
 * Get the 3D position for a building placed at the building zone.
 * Buildings are at the top of the SVG (y=0..470), so in 3D they
 * are at the "back" of the scene (negative Z).
 */
export function buildingPosition(svgX: number, svgW: number): [number, number, number] {
  const x = (svgX + svgW / 2) / S - WORLD_CX;
  const y = 0;
  const z = svgYTo3DZ(470) - 2; // slightly behind the sidewalk edge
  return [x, y, z];
}

/**
 * Convert a facing direction (1=right, -1=left) to a Y-axis rotation in radians.
 * In3D, the default "facing right" is rotation Y = 0.
 * "facing left" = rotation Y = PI.
 */
export function facingToRotation(facing: number): number {
  return facing < 0 ? Math.PI : 0;
}
