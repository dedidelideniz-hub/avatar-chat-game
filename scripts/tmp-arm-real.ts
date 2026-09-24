// Geçici ölçüm betiği (repo'ya girmez): `skin-samuray.glb`nin DÜĞÜM
// hiyerarşisini doğrudan kurar (meshopt/geometri çözülmez — sadece kemik
// dönüşümleri gerekir) ve `findBombArmRig` + `applyBombArmPose` sonuçlarını
// gerçek oranlarla ölçer.
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { applyBombArmPose, findBombArmRig } from "../src/engine/BombArmPose";
import { sampleJuggleTiming, type JuggleSample } from "../src/engine/BombJuggle";
import { leftHandBone, rightHandBone } from "../src/engine/HandGrip";

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

// Kemik konumlarından dikey ölçek: baş/kalça/ayak yükseklikleri.
const ys: { name: string; y: number }[] = [];
scene.traverse((o) => {
  if ((o as THREE.Bone).isBone) ys.push({ name: o.name, y: o.getWorldPosition(new THREE.Vector3()).y });
});
ys.sort((a, b) => b.y - a.y);
console.log("en tepe kemikler", ys.slice(0, 4).map((b) => `${b.name}=${b.y.toFixed(3)}`).join(" "));
console.log("en alt kemikler", ys.slice(-4).map((b) => `${b.name}=${b.y.toFixed(3)}`).join(" "));

const rHand = rightHandBone(scene);
const lHand = leftHandBone(scene);
console.log("eller", rHand?.name, lHand?.name);
if (!rHand || !lHand) throw new Error("el kemiği yok");

const rig = findBombArmRig(scene);
if (!rig) throw new Error("kol zinciri bulunamadı");
console.log("reach", rig.reach.toFixed(4), "| l1/l2 R", rig.right.l1.toFixed(4), rig.right.l2.toFixed(4), "| L", rig.left.l1.toFixed(4), rig.left.l2.toFixed(4));

const loc = (o: THREE.Object3D) =>
  scene.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
console.log("omuz R", loc(rig.right.shoulder).toArray().map((n) => n.toFixed(3)).join(","));
console.log("omuz L", loc(rig.left.shoulder).toArray().map((n) => n.toFixed(3)).join(","));
console.log("forward", rig.forward.toArray().map((n) => n.toFixed(3)).join(","));
console.log("baseR", rig.baseRight.toArray().map((n) => n.toFixed(3)).join(","), "| omuz→base", rig.baseRight.distanceTo(loc(rig.right.shoulder)).toFixed(3));
console.log("dinlenme el R", loc(rHand).toArray().map((n) => n.toFixed(3)).join(","));

const sample: JuggleSample = {
  position: new THREE.Vector3(),
  tossT: 0,
  legT: 0,
  spinAngle: 0,
  spinAxis: new THREE.Vector3(1, 0, 0),
  squash: 1,
  handMix: 0,
  holding: true,
  direction: 1,
};

let prevR: THREE.Vector3 | null = null;
let prevL: THREE.Vector3 | null = null;
let maxStep = 0;
let minY = Infinity;
let maxY = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
const rows: string[] = [];
for (let i = 0; i <= 600; i++) {
  const time = (i / 300) * 2;
  sampleJuggleTiming(time, sample);
  applyBombArmPose(scene, rig, sample, time);
  const hr = loc(rHand);
  const hl = loc(lHand);
  if (prevR && prevL) {
    const dr = hr.distanceTo(prevR);
    const dl = hl.distanceTo(prevL);
    if (Math.max(dr, dl) > maxStep) {
      maxStep = Math.max(dr, dl);
      console.log(`  en büyük adım t=${time.toFixed(3)} legT=${sample.legT.toFixed(3)} dir=${sample.direction} R=${dr.toFixed(4)} L=${dl.toFixed(4)}`);
    }
  }
  prevR = hr;
  prevL = hl;
  minY = Math.min(minY, hr.y, hl.y);
  maxY = Math.max(maxY, hr.y, hl.y);
  minZ = Math.min(minZ, hr.z, hl.z);
  maxZ = Math.max(maxZ, hr.z, hl.z);
  if (i % 50 === 0) {
    rows.push(
      `t=${time.toFixed(2)} legT=${sample.legT.toFixed(2)} dir=${sample.direction} R=(${hr.x.toFixed(3)},${hr.y.toFixed(3)},${hr.z.toFixed(3)}) L=(${hl.x.toFixed(3)},${hl.y.toFixed(3)},${hl.z.toFixed(3)})`,
    );
  }
}
console.log(rows.join("\n"));
console.log("el y", minY.toFixed(3), "→", maxY.toFixed(3), "| el z", minZ.toFixed(3), "→", maxZ.toFixed(3));
console.log("kare başına maks hareket (300fps)", maxStep.toFixed(4));
