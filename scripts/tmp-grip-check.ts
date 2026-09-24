// Geçici ölçüm betiği (repo'ya girmez): parmak kavraması atış fazıyla senkron mu?
//  · Her elin parmak kıvrılması (dinlenmeye göre açı) döngü boyunca ölçülür.
//  · Kare başına en büyük değişim ve döngü sınırı sürekliliği raporlanır.
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { applyBombArmPose, findBombArmRig } from "../src/engine/BombArmPose";
import { JUGGLE_LEG_S, sampleJuggleTiming, type JuggleSample } from "../src/engine/BombJuggle";
import { fingerBonesOf, leftHandBone, rightHandBone } from "../src/engine/HandGrip";

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
const model = new THREE.Group();
for (const rootIndex of json.scenes[0].nodes) model.add(built[rootIndex]);
model.updateMatrixWorld(true);

const rig = findBombArmRig(model);
const rHand = rightHandBone(model);
const lHand = leftHandBone(model);
if (!rig || !rHand || !lHand) throw new Error("rig/el bulunamadı");

const rFingers = fingerBonesOf(rHand);
const lFingers = fingerBonesOf(lHand);
console.log(`parmak kemikleri: sağ ${rFingers.length}, sol ${lFingers.length}`);

/** Dinlenme (bind) pozu — `applyFingerGrip`in ilk çağrıda sakladığı taban. */
const rest = new Map<THREE.Object3D, THREE.Quaternion>();
for (const b of [...rFingers, ...lFingers]) rest.set(b, b.quaternion.clone());

/** Bir elin ortalama kıvrılma açısı (radyan, dinlenmeye göre). */
function curl(bones: THREE.Object3D[]): number {
  let sum = 0;
  for (const b of bones) {
    const q = rest.get(b)!;
    const dot = Math.min(1, Math.abs(q.dot(b.quaternion)));
    sum += 2 * Math.acos(dot);
  }
  return sum / Math.max(bones.length, 1);
}

const sample = (time: number): JuggleSample => {
  const s: JuggleSample = {
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
  return sampleJuggleTiming(time, s);
};

const cycle = JUGGLE_LEG_S * 2;
const steps = Math.round(cycle / (1 / 240));
let prevR: number | null = null;
let prevL: number | null = null;
let maxStepR = 0;
let maxStepL = 0;
let minR = Infinity;
let maxR = -Infinity;
let minL = Infinity;
let maxL = -Infinity;
const rows: string[] = [];
let firstR = 0;
let firstL = 0;
let lastR = 0;
let lastL = 0;

for (let i = 0; i <= steps; i++) {
  const t = (i / steps) * cycle;
  applyBombArmPose(model, rig, sample(t), t);
  const cr = curl(rFingers);
  const cl = curl(lFingers);
  if (i === 0) {
    firstR = cr;
    firstL = cl;
  }
  lastR = cr;
  lastL = cl;
  if (prevR !== null && prevL !== null) {
    maxStepR = Math.max(maxStepR, Math.abs(cr - prevR));
    maxStepL = Math.max(maxStepL, Math.abs(cl - prevL));
  }
  prevR = cr;
  prevL = cl;
  minR = Math.min(minR, cr);
  maxR = Math.max(maxR, cr);
  minL = Math.min(minL, cl);
  maxL = Math.max(maxL, cl);
  if (i % Math.round(steps / 8) === 0) {
    rows.push(
      `t=${t.toFixed(2)} legT=${sample(t).legT.toFixed(2)} dir=${sample(t).direction} ` +
        `kıvrım R=${cr.toFixed(3)} L=${cl.toFixed(3)} rad`,
    );
  }
}

console.log(rows.join("\n"));
console.log(`sağ el kıvrım ${minR.toFixed(3)}…${maxR.toFixed(3)} rad`);
console.log(`sol el kıvrım ${minL.toFixed(3)}…${maxL.toFixed(3)} rad`);
console.log(
  `kare başına en büyük kıvrım değişimi (240fps): R ${maxStepR.toFixed(4)}, L ${maxStepL.toFixed(4)} rad`,
);
console.log(
  `döngü sınırı sıçraması: R ${Math.abs(lastR - firstR).toFixed(4)}, L ${Math.abs(lastL - firstL).toFixed(4)} rad`,
);
