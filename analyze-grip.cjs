// Deterministic grip analysis — measures everything the runtime hook needs.
// Run: node analyze-grip.cjs public/models/skin-savasci.glb
globalThis.self = globalThis.self ?? globalThis;
const fs = require("fs");
const THREE = require("three");
const { GLTFLoader } = require("three/examples/jsm/loaders/GLTFLoader.js");
const SU = require("three/examples/jsm/utils/SkeletonUtils.js");
const skClone = SU.clone || (SU.default && SU.default.clone) || SU;

function parse(buf) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      "",
      (g) => resolve(g),
      reject
    );
  });
}

const f3 = (v) => v.toArray().map((n) => Number(n.toFixed(3)));
const f4 = (n) => Number(n.toFixed(4));
const D = THREE.MathUtils.degToRad;
const RE_BONE = /RightHand(Thumb|Index|Middle|Ring|Pinky)\d$/i;

(async () => {
  const gltf = await parse(fs.readFileSync(process.argv[2]));
  const clone = skClone(gltf.scene);
  clone.updateMatrixWorld(true);

  const bones = {};
  clone.traverse((o) => {
    if (o.isBone && RE_BONE.test(o.name)) bones[o.name] = o;
    if (o.isBone && /righthand$/i.test(o.name)) bones.HAND = o;
  });
  const fingerNames = Object.keys(bones).filter((n) => n !== "HAND").sort();
  console.log("FINGERS:", fingerNames.map((n) => n.replace(/^.*?Hand/, "")).join(","));
  const hand = bones.HAND;
  const handBindQ = hand.quaternion.clone();
  const bindQ = {};
  for (const n of fingerNames) bindQ[n] = bones[n].quaternion.clone();

  // ── Bind-frame helpers ──
  const handWQ_bind = hand.getWorldQuaternion(new THREE.Quaternion());
  const relQ = {};
  for (const n of fingerNames)
    relQ[n] = handWQ_bind.clone().invert().multiply(bones[n].getWorldQuaternion(new THREE.Quaternion()));

  // Palm center (hand-local bind, RAW units): fingers +Y, palm -X, across Z.
  const palmCenterRaw = new THREE.Vector3(-0.02, 0.085, -0.012);

  // ── Flexion axis per bone: tip must move toward palm center ──
  const curlAxes = {};
  for (const name of fingerNames) {
    const b = bones[name];
    const child = b.children.find((c) => c.isBone);
    const dLocal = child
      ? b.worldToLocal(child.getWorldPosition(new THREE.Vector3())).normalize()
      : b.parent.worldToLocal(b.getWorldPosition(new THREE.Vector3())).normalize();
    const offHL = b.getWorldPosition(new THREE.Vector3())
      .sub(hand.getWorldPosition(new THREE.Vector3()))
      .applyQuaternion(handWQ_bind.clone().invert());
    const palmDirHL = palmCenterRaw.clone().sub(offHL);
    if (palmDirHL.lengthSq() < 1e-9) palmDirHL.set(-1, 0, 0);
    palmDirHL.normalize();
    const palmLocal = palmDirHL.applyQuaternion(relQ[name].clone().invert());
    const base = dLocal.dot(palmLocal);
    let best = null;
    for (const ax of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const a = new THREE.Vector3(...ax);
      if (Math.abs(a.dot(dLocal)) > 0.6) continue;
      const d2 = dLocal.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(a, D(30)));
      const score = d2.dot(palmLocal) - base;
      if (!best || score > best.score) best = { axis: a.clone(), score };
    }
    curlAxes[name] = { axis: best.axis };
    console.log("AX", name.replace(/^.*?Hand/, ""), f3(best.axis), "s", f4(best.score));
  }

  const avgHL = new THREE.Vector3();
  for (const name of fingerNames) avgHL.add(curlAxes[name].axis.clone().applyQuaternion(relQ[name]));
  avgHL.normalize();
  console.log("AVG_FLEX (bind hand-local):", f3(avgHL));

  // ── Idle hand WORLD quaternion ──
  const mixer = new THREE.AnimationMixer(clone);
  const idleClip = THREE.AnimationClip.findByName(gltf.animations, "Idle");
  mixer.clipAction(idleClip).reset().play();
  mixer.update(0); clone.updateMatrixWorld(true);
  const handWQ_idle = hand.getWorldQuaternion(new THREE.Quaternion());
  // restore bind on every bone the mixer touched
  mixer.stopAllAction();
  hand.quaternion.copy(handBindQ);
  for (const n of fingerNames) bones[n].quaternion.copy(bindQ[n]);
  clone.updateMatrixWorld(true);

  // ── Grip candidates: deterministic shortest-arc + axis-constrained ──
  const upInHand = new THREE.Vector3(0, 1, 0).applyQuaternion(handWQ_idle.clone().invert());
  const candidates = [];
  candidates.push({ R: new THREE.Quaternion().setFromUnitVectors(avgHL, upInHand), label: "arc" });
  for (const cand of [[[1,0,0], 90], [[1,0,0], -90], [[0,0,1], 90], [[0,0,1], -90]])
    candidates.push({ R: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...cand[0]), D(cand[1])), label: `axis${cand[0].join("")}${cand[1]}` });

  const CURL = { Index: [86, 75, 45], Middle: [88, 78, 48], Ring: [88, 80, 50], Pinky: [84, 78, 50], Thumb: [28, 34, 22] };
  const applyPoseOn = (R) => {
    hand.quaternion.multiply(R);
    for (const name of fingerNames) {
      const m = name.match(RE_BONE);
      bones[name].quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(curlAxes[name].axis, D(CURL[m[1]][Number(m[2]) - 1]))
      );
    }
    clone.updateMatrixWorld(true);
  };
  const resetToBind = () => {
    hand.quaternion.copy(handBindQ);
    for (const n of fingerNames) bones[n].quaternion.copy(bindQ[n]);
    clone.updateMatrixWorld(true);
  };

  let best = null;
  for (const cand of candidates) {
    mixer.clipAction(idleClip).reset().play();
    mixer.update(0); clone.updateMatrixWorld(true);
    applyPoseOn(cand.R);
    const flexW = new THREE.Vector3();
    for (const name of fingerNames)
      flexW.add(curlAxes[name].axis.clone().applyQuaternion(bones[name].getWorldQuaternion(new THREE.Quaternion())));
    flexW.normalize();
    const score = flexW.y;
    console.log("CAND", cand.label, "idleFlex", f3(flexW), "y", f4(score));
    resetToBind();
    if (!best || score > best.score) best = { R: cand.R.clone(), label: cand.label, score };
  }
  console.log("BEST:", best.label, "score", f4(best.score));
  const eH = new THREE.Euler().setFromQuaternion(best.R, "XYZ");
  console.log("HAND_GRIP_EULER", f4(eH.x), f4(eH.y), f4(eH.z));

  // ── Fist center in the POSED hand frame (best R, bind base) ──
  hand.quaternion.copy(handBindQ).multiply(best.R);
  for (const name of fingerNames) {
    const m = name.match(RE_BONE);
    bones[name].quaternion.copy(bindQ[name]).multiply(
      new THREE.Quaternion().setFromAxisAngle(curlAxes[name].axis, D(CURL[m[1]][Number(m[2]) - 1]))
    );
  }
  clone.updateMatrixWorld(true);
  const hwqPosed = hand.getWorldQuaternion(new THREE.Quaternion());
  const toPosedHL = (o) =>
    o.getWorldPosition(new THREE.Vector3())
      .sub(hand.getWorldPosition(new THREE.Vector3()))
      .applyQuaternion(hwqPosed.clone().invert());
  const knAvg = new THREE.Vector3(), tipAvg = new THREE.Vector3();
  let kn = 0, tp = 0;
  for (const name of fingerNames) {
    if (/Thumb/i.test(name)) continue;
    const p = toPosedHL(bones[name]);
    if (Number(name.slice(-1)) === 1) { knAvg.add(p); kn++; } else { tipAvg.add(p); tp++; }
  }
  knAvg.divideScalar(kn); tipAvg.divideScalar(tp);
  const fistCenter = knAvg.clone().add(tipAvg).multiplyScalar(0.5);
  console.log("FIST knAvg", f3(knAvg), "tipAvg", f3(tipAvg), "CENTER(raw,posed frame)", f3(fistCenter));
  const handScale = hand.getWorldScale(new THREE.Vector3());
  const boneAvg = (handScale.x + handScale.y + handScale.z) / 3;
  console.log("HAND boneAvg", f4(boneAvg), "=> bone-local position =", f3(fistCenter.clone().divideScalar(boneAvg)));

  // Tip wrap check around the blade line (through fist center, dir avg flexion)
  let wrapSum = 0, wrapN = 0;
  for (const name of fingerNames) {
    if (/Thumb/i.test(name) || Number(name.slice(-1)) < 2) continue;
    const p = toPosedHL(bones[name]);
    const rel = p.clone().sub(fistCenter);
    const perp = rel.clone().sub(avgHL.clone().multiplyScalar(rel.dot(avgHL)));
    wrapSum += perp.length(); wrapN++;
  }
  console.log("BIND-POSED mean tip perp dist (raw):", f4(wrapSum / wrapN));

  // ── Sword rotation (hand-local frame): blade ∥ flexion axis ──
  const qS = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), avgHL);
  const eS = new THREE.Euler().setFromQuaternion(qS, "XYZ");
  console.log("SWORD_EULER", f4(eS.x), f4(eS.y), f4(eS.z));

  // ── Final idle validation: mixer + pose → blade axis + wrap ──
  mixer.clipAction(idleClip).reset().play();
  mixer.update(0); clone.updateMatrixWorld(true);
  applyPoseOn(best.R);
  const flexW = new THREE.Vector3();
  for (const name of fingerNames)
    flexW.add(curlAxes[name].axis.clone().applyQuaternion(bones[name].getWorldQuaternion(new THREE.Quaternion())));
  flexW.normalize();
  const fcWorld = fistCenter.clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()))
    .multiplyScalar(boneAvg).add(hand.getWorldPosition(new THREE.Vector3()));
  wrapSum = 0; wrapN = 0;
  for (const name of fingerNames) {
    if (/Thumb/i.test(name) || Number(name.slice(-1)) < 2) continue;
    const rel = bones[name].getWorldPosition(new THREE.Vector3()).sub(fcWorld);
    const perp = rel.clone().sub(flexW.clone().multiplyScalar(rel.dot(flexW)));
    wrapSum += perp.length(); wrapN++;
  }
  console.log("IDLE blade world:", f3(flexW), "up", f4(flexW.y), "| tip perp(raw)", f4(wrapSum / wrapN));
})().catch((e2) => { console.error("ERR", e2 && e2.stack); process.exit(1); });
