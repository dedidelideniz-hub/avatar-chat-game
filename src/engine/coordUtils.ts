/**
 * SANALIKA 3D GAME ENGINE — Coordinate Utilities
 *
 * Converts SVG 2D ↔ Three.js 3D.
 * SVG: x=0..1600, y=0..900 (top=0)
 * 3D: x=centered, y=height, z=toward camera (positive = "south")
 */
import { S, WORLD_CX, WORLD_CZ } from "./constants";

/** SVG (x,y) → Three.js [x, y, z] (y=0 ground) */
export function svgTo3D(svgX: number, svgY: number): [number, number, number] {
  return [svgX / S - WORLD_CX, 0, -(svgY / S - WORLD_CZ)];
}

export function svgXTo3D(svgX: number): number { return svgX / S - WORLD_CX; }
export function svgYTo3DZ(svgY: number): number { return -(svgY / S - WORLD_CZ); }
export function svgWTo3D(svgW: number): number { return svgW / S; }
export function svgHTo3D(svgH: number): number { return svgH / S; }

/** Three.js (x,z) → SVG {x,y} */
export function threeDToSVG(x3d: number, z3d: number): { x: number; y: number } {
  return { x: (x3d + WORLD_CX) * S, y: -(z3d - WORLD_CZ) * S };
}

/** Facing direction (1=right, -1=left) → Y rotation radians */
export function facingToRotation(facing: number): number {
  return facing < 0 ? Math.PI : 0;
}
