// Geçici ölçüm betiği (repo'ya girmez): bomba aksiyon pozlarının (fırlatma /
// yere bırakma / boş el) sürekliliğini ve doğru yönlerini ölçer.
//
// Beklentiler:
//   · Kare başına en büyük el hareketi küçük kalır (zıplama yok).
//   · Fırlatmada el önce GERİYE/YUKARI, sonra ÖNE, sonra aşağı iner.
//   · Yere bırakmada el omuzdan AŞAĞI iner (top yere yaklaşır).
//   · Aksiyonun son karesi, hokkabazlığın 0. karesiyle AYNI pozdadır.
import { readFileSync } from "node:fs";
import * as THREE from "three";
import {
  PLACE_FALL_SPAN,
  applyBombActionPose,
  applyBombArmPose,
  findBombArmRig,
  type BombActionPoseInput,
} from "../src/engine/BombArmPose";
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
const lHand = leftHandBone(scene);
if (!rig || !rHand || !lHand) throw new Error("rig bulunamadı");
console.log(
  `şerit: spineChain ${rig.spineChain.map((b) => b.name).join(",") || "yok"} | bowSign ${rig.bowSign} | ayak ${rig.feet.length} kemik`,
);

const loc = (o: THREE.Object3D) =>
  scene.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
const chest = () =>
  loc(rig.right.shoulder).add(loc(rig.left.shoulder)).multiplyScalar(0.5);

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

// ⚠️ Gerçek oyunda mixer her karede TÜM kemikleri yeniden yazar; poz katmanı
// premultiply ettiği için (klibin üstüne biner) burada da her kareden önce
// iskelete dinlenme pozu geri verilmelidir — yoksa dönüşler birikip ölçümü
// bozar (ilk sürümde omurga her kare 40° eğilip karakter yere kapanmıştı).
const restBones: { bone: THREE.Object3D; quat: THREE.Quaternion }[] = [];
scene.traverse((o) => {
  if ((o as THREE.Bone).isBone) restBones.push({ bone: o, quat: o.quaternion.clone() });
});
const restore = () => {
  for (const entry of restBones) entry.bone.quaternion.copy(entry.quat);
  scene.updateMatrixWorld(true);
};

const FPS = 60;
const run = (
  label: string,
  make: (p: number) => BombActionPoseInput,
  duration: number,
) => {
  restore();
  const frames = Math.round(duration * FPS);
  let prevR = loc(rHand).clone();
  let prevL = loc(lHand).clone();
  let maxStepR = 0;
  let maxStepL = 0;
  let lowR = prevR.clone();
  let firstR = prevR.clone();
  /** Ondalık başına en büyük adım — tek bir sıçrama var mı diye bakılır. */
  const deciles = new Array(10).fill(0) as number[];
  const markers = [0, 0.25, 0.5, 0.72, 1];
  console.log(`\n--- ${label} (${frames} kare) ---`);
  for (let i = 0; i <= frames; i++) {
    const p = i / frames;
    restore();
    applyBombActionPose(scene, rig, make(p), 0.5);
    scene.updateMatrixWorld(true);
    const nowR = loc(rHand).clone();
    const nowL = loc(lHand).clone();
    if (i > 0) {
      const stepR = nowR.distanceTo(prevR);
      maxStepR = Math.max(maxStepR, stepR);
      maxStepL = Math.max(maxStepL, nowL.distanceTo(prevL));
      const d = Math.min(9, Math.floor(p * 10));
      deciles[d] = Math.max(deciles[d], stepR);
    }
    if (i === 0) firstR = nowR.clone();
    const c = chest();
    if (markers.some((m) => Math.abs(m - p) < 0.5 / frames)) {
      console.log(
        `  p ${p.toFixed(2)}: sağ el (${nowR.x.toFixed(3)}, y ${nowR.y.toFixed(3)}, z ${nowR.z.toFixed(3)}) | sol el (y ${nowL.y.toFixed(3)}, z ${nowL.z.toFixed(3)}) | göğüs y ${c.y.toFixed(3)}`,
      );
    }
    if (nowR.y < lowR.y) lowR = nowR.clone();
    prevR = nowR;
    prevL = nowL;
  }
  console.log(
    `  kare başına en büyük hareket: sağ ${maxStepR.toFixed(4)}, sol ${maxStepL.toFixed(4)}`,
  );
  console.log(
    `  elin en alçak noktası: y ${lowR.y.toFixed(3)}, z ${lowR.z.toFixed(3)} (zemin ${-0.908}, top yere ${(lowR.y + 0.908).toFixed(3)} birim yukarıdan düşer)`,
  );
  console.log(
    `  ondalık adım zirveleri (sağ): ${deciles.map((d) => d.toFixed(3)).join(" ")}`,
  );
  return { firstR, lastR: prevR.clone(), lastL: prevL.clone() };
};

// 1) FIRLATMA (sağ elle)
const throwOut = run(
  "fırlatma",
  (p) => ({ kind: "throw", progress: p, release: 0.62, right: true }),
  0.82,
);

// 2) YERE BIRAKMA (sağ elle)
run(
  "yere bırakma",
  (p) => ({
    kind: "place",
    progress: p,
    // Sim'in eşiği: yere değme `BOMB_PLACE_DROP_AT` = 0.62, düşüş ondan
    // `PLACE_FALL_SPAN` kadar önce başlar.
    release: 0.62 - PLACE_FALL_SPAN,
    right: true,
  }),
  0.95,
);

// 3) BOŞ EL
run("boş el", () => ({ kind: "empty", progress: 0, release: 0, right: true }), 0.05);

// 3b) HOKKABAZLIK DÖNGÜSÜ: kendi kare başına adım zirvesi (kıyas ölçüsü).
{
  restore();
  let prevR = loc(rHand).clone();
  let maxStepR = 0;
  const frames = Math.round(2 * FPS); // iki bacak = tam döngü (2 sn)
  for (let i = 0; i <= frames; i++) {
    restore();
    applyBombArmPose(scene, rig, sampleJuggleTiming(i / FPS, sample), 0.5);
    scene.updateMatrixWorld(true);
    const nowR = loc(rHand).clone();
    // İlk kare atlanır: dinlenme pozundan (kollar yana açık) ölçüm yapılmaz.
    if (i > 0) maxStepR = Math.max(maxStepR, nowR.distanceTo(prevR));
    prevR = nowR;
  }
  console.log(
    `\n--- hokkabazlık döngüsü ---\n  kare başına en büyük el hareketi: ${maxStepR.toFixed(4)} (kıyas ölçüsü)`,
  );
}

// 4) HOKKABAZLIK 0. KARE (aksiyon bitince döngünün başladığı poz)
restore();
sampleJuggleTiming(0, sample);
applyBombArmPose(scene, rig, sample, 0.5);
scene.updateMatrixWorld(true);
const juggleR = loc(rHand).clone();
const juggleL = loc(lHand).clone();
console.log(
  `\nhokkabazlık 0. kare: sağ ${juggleR.toArray().map((v) => v.toFixed(3)).join(", ")} | sol ${juggleL.toArray().map((v) => v.toFixed(3)).join(", ")}`,
);
console.log(
  `  aksiyon sonu ↔ hokkabazlık başı farkı: sağ ${throwOut.lastR.distanceTo(juggleR).toFixed(4)}, sol ${throwOut.lastL.distanceTo(juggleL).toFixed(4)}`,
);
if (throwOut.lastR.distanceTo(juggleR) > 0.004) {
  throw new Error("aksiyon sonu hokkabazlık başına oturmuyor (sıçrama olur)");
}
