// Geçici ölçüm betiği (repo'ya girmez): "bombayı yere koyma" pozu için omurga
// eğilmesinin omzu ne kadar indirdiğini ve elin yere ne kadar yaklaştığını ölçer.
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { findBombArmRig } from "../src/engine/BombArmPose";

interface GltfNode {
  name?: string;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}
const json = JSON.parse(readFileSync("public/models/skin-samuray.glb", "utf8")) as {
  nodes: GltfNode[];
  scenes: { nodes: number[] }[];
};

const built: THREE.Object3D[] = json.nodes.map((n, i) => {
  const b = new THREE.Bone();
  b.name = n.name ?? `node_${i}`;
  if (n.translation) b.position.fromArray(n.translation);
  if (n.rotation) b.quaternion.fromArray(n.rotation);
  if (n.scale) b.scale.fromArray(n.scale);
  return b;
});
json.nodes.forEach((n, i) => {
  for (const c of n.children ?? []) built[i].add(built[c]);
});
const scene = new THREE.Group();
for (const rootIndex of json.scenes[0].nodes) scene.add(built[rootIndex]);
scene.updateMatrixWorld(true);

const loc = (o: THREE.Object3D) =>
  scene.worldToLocal(o.getWorldPosition(new THREE.Vector3()));

const rig = findBombArmRig(scene);
if (!rig) throw new Error("rig yok");
const shR = loc(rig.right.shoulder);
const shL = loc(rig.left.shoulder);
const chest = () =>
  new THREE.Vector3().addVectors(
    loc(rig.right.shoulder),
    loc(rig.left.shoulder),
  ).multiplyScalar(0.5);
const GROUND = -0.9078;
const lateral = shR.clone().sub(shL).setY(0).normalize();
console.log(`lateral ${lateral.toArray().map((v) => v.toFixed(3)).join(", ")}`);

// Omurga zinciri: omzun ataları (kökten aşağıya).
const chain: THREE.Object3D[] = [];
for (let o: THREE.Object3D | null = rig.right.upper; o; o = o.parent) {
  if (/spine/i.test(o.name)) chain.unshift(o);
}
console.log("omurga zinciri:", chain.map((b) => b.name).join(" → "));

const bow = (totalDeg: number, sign: number, weights: number[]) => {
  const saved = chain.map((b) => b.quaternion.clone());
  chain.forEach((bone, i) => {
    const w = weights[i] ?? 0;
    bone.quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(
        lateral,
        (sign * totalDeg * w * Math.PI) / 180,
      ),
    );
  });
  scene.updateMatrixWorld(true);
  const c = chest();
  const result = { y: c.y, z: c.z, handMin: c.y - rig.reach * 0.995 };
  chain.forEach((b, i) => b.quaternion.copy(saved[i]));
  scene.updateMatrixWorld(true);
  return result;
};

const rest = bow(0, 1, [0, 0, 0]);
console.log(
  `dinlenme: omuz y ${rest.y.toFixed(3)} z ${rest.z.toFixed(3)} → en alçak el ${rest.handMin.toFixed(3)} (zemin ${GROUND})`,
);

for (const sign of [1, -1]) {
  for (const deg of [30, 45, 60, 75]) {
    const r = bow(deg, sign, [0.5, 0.3, 0.2]);
    console.log(
      `işaret ${sign > 0 ? "+" : "-"} ${deg}° → omuz y ${r.y.toFixed(3)} (Δ${(r.y - rest.y).toFixed(3)}) z ${r.z.toFixed(3)} | en alçak el ${r.handMin.toFixed(3)} → zeminin ${(r.handMin - GROUND).toFixed(3)} üstünde`,
    );
  }
}
