import * as THREE from "three";
import { readFileSync } from "node:fs";

const V = (v) => `[${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}]`;
const deg = (r) => (r * 180 / Math.PI).toFixed(1);

/* ── 1. Euler math of the current chain ─────────────────────────── */
const SWORD_GRIP_ROT = [-0.9509, 1.2112, -2.032];
const MODEL_ROT = [Math.PI / 2, 0, Math.PI / 2];

const blade = new THREE.Vector3(0, 1, 0);
const guard = new THREE.Vector3(1, 0, 0);
const thinAxis = new THREE.Vector3(0, 0, 1);

const qGrip = new THREE.Quaternion().setFromEuler(new THREE.Euler(...SWORD_GRIP_ROT, "XYZ"));
const qModel = new THREE.Quaternion().setFromEuler(new THREE.Euler(...MODEL_ROT, "XYZ"));

const bladeAfterGrip = blade.clone().applyQuaternion(qGrip);
const guardAfterGrip = guard.clone().applyQuaternion(qGrip);
const thinAfterGrip = thinAxis.clone().applyQuaternion(qGrip);

console.log("── SWORD_GRIP_ROT alone (pre-calibration grip) ──");
console.log("  blade +Y  →", V(bladeAfterGrip));
console.log("  guard +X  →", V(guardAfterGrip));
console.log("  thin  +Z  →", V(thinAfterGrip));

const bladeAfterBoth = blade.clone().applyQuaternion(qGrip).applyQuaternion(qModel);
const guardAfterBoth = guard.clone().applyQuaternion(qGrip).applyQuaternion(qModel);
console.log("\n── grip × pivot [PI/2,0,PI/2] (CURRENT, pre-calibration) ──");
console.log("  blade +Y  →", V(bladeAfterBoth));
console.log("  guard +X  →", V(guardAfterBoth));

// After calibration: grip.quaternion = handWorldQuat.invert() ⇒ grip axes ≈ world axes.
// Chain is then effectively world × pivot:
const bladeAfterCalib = blade.clone().applyQuaternion(qModel);
const guardAfterCalib = guard.clone().applyQuaternion(qModel);
console.log("\n── AFTER calibration (grip≈world) × pivot [PI/2,0,PI/2] ──");
console.log("  blade +Y  →", V(bladeAfterCalib));
console.log("  guard +X  →", V(guardAfterCalib));

const bladeIfIdentity = blade.clone().applyQuaternion(qGrip);
console.log("\n── pivot IDENTITY + grip (either pre-calib or calibrated) ──");
console.log("  blade +Y  →", V(bladeIfIdentity));

/* ── 2. GLB JSON chunk: internal axes / length / hilt ───────────── */
function gltfInfo(path) {
  const buf = readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint32(0, true);
  if (magic !== 0x46546c67) return { error: "not a GLB" };
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buf.slice(20, 20 + jsonLen)));
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const rootNames = nodes.filter((n) => n.name).slice(0, 12).map((n) => n.name);
  // Per-mesh primitive POSITION bounds → model-space box of every mesh part.
  const parts = [];
  for (const mesh of meshes) {
    for (const prim of mesh.primitives) {
      const acc = json.accessors[prim.attributes.POSITION];
      parts.push({
        mesh: mesh.name ?? "(unnamed)",
        min: acc.min, max: acc.max,
      });
    }
  }
  // Global box
  const gMin = [Infinity, Infinity, Infinity], gMax = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (let i = 0; i < 3; i++) {
    gMin[i] = Math.min(gMin[i], p.min[i]); gMax[i] = Math.max(gMax[i], p.max[i]);
  }
  const size = gMax.map((v, i) => +(v - gMin[i]).toFixed(4));
  return { nodes: nodes.length, meshes: meshes.length, rootNames, gMin: gMin.map((v) => +v.toFixed(4)), gMax: gMax.map((v) => +v.toFixed(4)), size, parts: parts.slice(0, 8) };
}

console.log("\n── GLB JSON chunk ──");
try {
  const info = gltfInfo("public/models/royal-kilic.glb");
  console.log("nodes:", info.nodes, "| meshes:", info.meshes);
  console.log("first node names:", info.rootNames?.join(", "));
  console.log("global box min:", info.gMin, "max:", info.gMax, "size:", info.size);
  for (const p of info.parts) {
    console.log(`  mesh "${p.mesh}"  min [${p.min.map((v) => v.toFixed(3))}]  max [${p.max.map((v) => v.toFixed(3))}]`);
  }
} catch (e) {
  console.log("GLB parse failed:", String(e));
}
