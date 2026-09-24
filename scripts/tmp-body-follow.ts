// Geçici ölçüm betiği (repo'ya girmez): gövde yaylandığında (yürüyüş dikey
// salınımı) ellerin de gövdeyle birlikte gidip gitmediğini ölçer.
// Beklenti: omuz Δy ≈ el Δy (eller omuza bağlı taşıma noktasını izler).
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

const rig = findBombArmRig(scene);
const rHand = rightHandBone(scene);
if (!rig || !rHand) throw new Error("rig/el bulunamadı");

// Gövde yaylanmasını taklit et: omurga kemiklerini biraz yukarı kaydır.
const spine: THREE.Bone[] = [];
scene.traverse((o) => {
  if ((o as THREE.Bone).isBone && /spine|hips|pelvis/i.test(o.name) && spine.length < 2) {
    spine.push(o as THREE.Bone);
  }
});
if (!spine.length) throw new Error("omurga kemiği yok");
console.log("omurga", spine.map((b) => b.name).join(", "));

const loc = (o: THREE.Object3D) =>
  scene.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
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

const measure = () => {
  sampleJuggleTiming(0.5, sample);
  applyBombArmPose(scene, rig, sample, 0.5);
  scene.updateMatrixWorld(true);
  return { shoulder: loc(rig.right.shoulder).clone(), hand: loc(rHand).clone() };
};

const rest = measure();

// Gövdeyi öne eğ (yürüyüş/ulti sırasındaki gerçek deformasyon): omurga döner,
// omuz yer değiştirir — eller de onunla gitmeli.
for (const bone of spine) bone.rotateZ(0.2);
scene.updateMatrixWorld(true);
const bent = measure();

const dSh = bent.shoulder.distanceTo(rest.shoulder);
const dHand = bent.hand.distanceTo(rest.hand);
console.log(`gövde eğilmesi → omuz Δ ${dSh.toFixed(4)}, el Δ ${dHand.toFixed(4)}`);
console.log(`takip oranı ${(dHand / dSh).toFixed(3)} (1.0 = eller omuzu birebir izliyor)`);
if (!(dHand / dSh > 0.85)) throw new Error("eller gövdeyi izlemiyor (hedef sabit kalmış)");
