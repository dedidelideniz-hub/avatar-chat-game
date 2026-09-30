import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader, MeshoptDecoder } from "three-stdlib";
import { BENCHES, BENCH_SEAT_TOP, BENCH_SEAT_DEPTH, PLAYER_3D_HEIGHT, benchSeatSpot, benchSeatYaw } from "../src/engine/constants";
import { BenchSitController, captureStandingPose, canSit, findSitBones, tipOf } from "../src/engine/SitPose";

(globalThis as any).ProgressEvent = class {
  constructor(type: string, init = {}) { Object.assign(this, init, { type }); }
};
let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean) {
  console.log(`${ok ? "✔" : "✘"} ${label}`);
  if (ok) passed++; else failures.push(label);
}
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder());
async function load(file: string) {
  const json = JSON.parse(readFileSync(`public/models/${file}.glb`, "utf8"));
  delete json.images; delete json.textures; delete json.samplers; delete json.materials;
  for (const mesh of json.meshes ?? []) for (const p of mesh.primitives ?? []) delete p.material;
  return await new Promise<any>((resolve, reject) => loader.parse(JSON.stringify(json), "", resolve, reject));
}
const pos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
for (const file of ["character", "skin-savasci", "skin-samuray", "skin-sevalye"]) {
  for (const facing of [1, -1] as const) {
    const gltf = await load(file);
    const root = gltf.scene as THREE.Object3D;
    const restore = captureStandingPose(root);
    const original: { o: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion }[] = [];
    root.traverse(o => original.push({ o, p: o.position.clone(), q: o.quaternion.clone() }));
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const scale = PLAYER_3D_HEIGHT / (box.max.y - box.min.y);
    const inner = new THREE.Group();
    inner.scale.setScalar(scale);
    inner.rotation.y = file === "skin-savasci" ? Math.PI : 0;
    inner.add(root);
    const group = new THREE.Group();
    group.add(inner);
    const bench = BENCHES.find(b => (b.facing ?? 1) === facing)!;
    const spot = benchSeatSpot(bench);
    group.position.set(spot.x, 0.02, spot.z);
    group.rotation.y = benchSeatYaw(bench);
    const bones = findSitBones(root);
    const controller = new BenchSitController(root, bones, restore);
    const mixer = new THREE.AnimationMixer(root);
    const walk = gltf.animations.find((a: THREE.AnimationClip) => /walk|run/i.test(a.name)) ?? gltf.animations[0];
    const idle = gltf.animations.find((a: THREE.AnimationClip) => /idle|standing/i.test(a.name)) ?? gltf.animations[0];
    const action = walk ? mixer.clipAction(walk).play() : null;
    const idleAction = idle ? mixer.clipAction(idle) : null;
    mixer.update(0.37);
    controller.sitOnBench(mixer, idleAction);
    const label = `${file} facing ${facing}`;
    check(`${label}: rig bulundu`, canSit(bones));
    check(`${label}: yürüyüş ve idle gerçekten durdu`, !action?.isRunning() && !idleAction?.isRunning());
    for (let frame = 0; frame < 120; frame++) {
      mixer.update(1 / 60);
      inner.position.set(0, -box.min.y * scale, 0);
      controller.update(inner, group, facing, 1 / 60);
    }
    for (const side of ["L", "R"] as const) {
      const thigh = bones[side === "L" ? "thighL" : "thighR"]!;
      const shin = bones[side === "L" ? "shinL" : "shinR"]!;
      const foot = bones[side === "L" ? "footL" : "footR"]!;
      const start = pos(thigh), knee = pos(tipOf(thigh)!), ankle = pos(tipOf(shin)!);
      const td = knee.clone().sub(start).normalize();
      const sd = ankle.clone().sub(pos(shin)).normalize();
      check(`${label} ${side}: uyluk yatay ve yola uzanıyor`, td.z * facing > 0.95 && Math.abs(td.y) < 0.08);
      check(`${label} ${side}: diz yaklaşık 90°, baldır dikey`, sd.y < -0.98 && Math.abs(td.dot(sd)) < 0.15);
      check(`${label} ${side}: diz ve ayak ön kenarın dışında`, (knee.z - bench.z) * facing > BENCH_SEAT_DEPTH / 2 && (ankle.z - bench.z) * facing > BENCH_SEAT_DEPTH / 2);
      check(`${label} ${side}: bacak minderden aşağı sarkıyor`, ankle.y < BENCH_SEAT_TOP && ankle.y > -0.06 && start.y >= BENCH_SEAT_TOP + 0.19);
      check(`${label} ${side}: ayrık ayak da bacağı izliyor`, pos(foot).distanceTo(ankle) < 1e-4);
    }
    const before = pos(bones.footL!);
    for (let frame = 0; frame < 120; frame++) {
      mixer.update(1 / 60);
      inner.position.set(0, -box.min.y * scale, 0);
      controller.update(inner, group, facing, 1 / 60);
    }
    check(`${label}: poz sabit, animasyon ezmiyor`, pos(bones.footL!).distanceTo(before) < 1e-4);
    controller.unsit(mixer);
    check(`${label}: tüm model/ayak dönüşümleri geri yüklendi`, original.every(t => t.o.position.distanceTo(t.p) < 1e-6 && 1 - Math.abs(t.o.quaternion.dot(t.q)) < 1e-6));
    idleAction?.reset().play();
    mixer.update(1 / 60);
    check(`${label}: ayakta durma yeniden başladı`, idleAction ? idleAction.isRunning() : true);
  }
}
const root = new THREE.Group();
const inner = new THREE.Group(); inner.add(root);
const outer = new THREE.Group(); outer.add(inner);
const fallback = new BenchSitController(root, findSitBones(root), captureStandingPose(root));
fallback.sitOnBench(new THREE.AnimationMixer(root));
fallback.update(inner, outer, 1, 1);
check("rigsiz model: gövde geriye yatar ve pivot alçalır", inner.rotation.x < 0 && inner.position.y < 0);
console.log(`${passed}/${passed + failures.length} kontrol geçti`);
if (failures.length) process.exit(1);
