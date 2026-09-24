// Geçici ölçüm betiği (repo'ya girmez): samuray riginde YERE UZANMA pozu için
// gereken gerçek ölçüler — zemin yüksekliği (ayak kemikleri), omuz yüksekliği,
// kol erişimi ve elde tutulan topun yere değip değmediği.
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { findBombArmRig } from "../src/engine/BombArmPose";
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

const loc = (o: THREE.Object3D) =>
  scene.worldToLocal(o.getWorldPosition(new THREE.Vector3()));

const rig = findBombArmRig(scene);
const rHand = rightHandBone(scene);
const lHand = leftHandBone(scene);
if (!rig || !rHand || !lHand) throw new Error("rig bulunamadı");

console.log("--- kemikler (clone-yerel) ---");
scene.traverse((o) => {
  if (!(o as THREE.Bone).isBone) return;
  const p = loc(o);
  console.log(
    `${o.name.padEnd(28)} x ${p.x.toFixed(3)}  y ${p.y.toFixed(3)}  z ${p.z.toFixed(3)}`,
  );
});

const mid = (a: THREE.Vector3, b: THREE.Vector3) =>
  new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

const shR = loc(rig.right.shoulder);
const shL = loc(rig.left.shoulder);
console.log("\n--- özet ---");
console.log(`omuz ortası      ${mid(shR, shL).toArray().map((v) => v.toFixed(3)).join(", ")}`);
console.log(`reach            ${rig.reach.toFixed(4)}`);
console.log(`l1/l2 sağ        ${rig.right.l1.toFixed(4)} / ${rig.right.l2.toFixed(4)}`);
console.log(`ileri ekseni     ${rig.forward.toArray().map((v) => v.toFixed(3)).join(", ")}`);
console.log(`carry sağ        ${rig.carryRight.toArray().map((v) => v.toFixed(3)).join(", ")}`);

// Zemin: en alçak ayak/parmak kemiği.
let groundY = Infinity;
let groundBone = "";
scene.traverse((o) => {
  if (!(o as THREE.Bone).isBone) return;
  if (!/foot|ankle|toe/i.test(o.name)) return;
  const p = loc(o);
  if (p.y < groundY) {
    groundY = p.y;
    groundBone = o.name;
  }
});
console.log(`zemin (en alçak ayak kemiği) ${groundY.toFixed(4)}  ← ${groundBone}`);
console.log(`omuz → zemin mesafesi        ${(mid(shR, shL).y - groundY).toFixed(4)}`);

// Omurga eğme: hangi kemik, omzu ne kadar indiriyor?
const bend = rig.right.shoulder.parent;
console.log(`\nbükülecek kemik (omzun ebeveyni): ${bend?.name ?? "yok"}`);
if (bend) {
  const lateral = shR.clone().sub(shL).setY(0).normalize();
  const before = mid(shR, shL).clone();
  for (const deg of [20, 35, 50]) {
    const saved = bend.quaternion.clone();
    bend.quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(lateral, (deg * Math.PI) / 180),
    );
    scene.updateMatrixWorld(true);
    const after = mid(loc(rig.right.shoulder), loc(rig.left.shoulder));
    const footAfter = loc(rHand);
    console.log(
      `  ${deg}° → omuz Δ ${after.clone().sub(before).length().toFixed(4)} (y ${before.y.toFixed(3)}→${after.y.toFixed(3)}), el y ${footAfter.y.toFixed(3)}`,
    );
    bend.quaternion.copy(saved);
    scene.updateMatrixWorld(true);
  }
}

// Elini yere uzat: hedef = göğsün altı, öne doğru, zemin hizası.
const chest = mid(shR, shL);
const target = new THREE.Vector3(chest.x, groundY, chest.z).addScaledVector(
  rig.forward,
  rig.reach * 0.32,
);
console.log(
  `\nyere koyma hedefi ${target.toArray().map((v) => v.toFixed(3)).join(", ")}`,
);
console.log(`omuz→hedef mesafe ${loc(rig.right.upper).distanceTo(target).toFixed(4)} (reach ${rig.reach.toFixed(4)})`);

// solveArm erişimi kırptığı için gerçek el konumu: hedefe en yakın nokta.
const dir = target.clone().sub(loc(rig.right.upper)).normalize();
const reachable = loc(rig.right.upper).addScaledVector(dir, rig.reach * 0.995);
console.log(`erişilebilir el     ${reachable.toArray().map((v) => v.toFixed(3)).join(", ")}`);
console.log(`zeminin üstünde     ${(reachable.y - groundY).toFixed(4)}`);
