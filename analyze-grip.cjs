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

(async () => {
  const gltf = await parse(fs.readFileSync(process.argv[2]));
  const clone = skClone(gltf.scene);
  clone.updateMatrixWorld(true);

  const bones = {};
  clone.traverse((o) => {
    if (o.isBone && /RightHand(Thumb|Index|Middle|Ring|Pinky)\d$/.test(o.name)) bones[o.name] = o;
    if (o.isBone && o.name === "mixamorigRightHand") bones.HAND = o;
  });
  const fingerNames = Object.keys(bones).filter((n) => n !== "HAND").sort();
  console.log("FINGERS:", fingerNames.map((n) => n.replace("mixamorigRightHand", "")).join(","));

  const hand = bones.HAND;
  const handBindQ = hand.quaternion.clone();
  const handWorldQ = hand.getWorldQuaternion(new THREE.Quaternion());
  const bindQ = {};
  const relQ = {}; // hand -> bone relative rotation
  for (const n of fingerNames) {
    bindQ[n] = bones[n].quaternion.clone();
    relQ[n] = handWorldQ.clone().invert().multiply(bones[n].getWorldQuaternion(new THREE.Quaternion()));
  }

  // Hand-local bind frame: +Y = along fingers, -X = palm side, Z = across.
  const palmCenterHL = new THREE.Vector3(-0.02, 0.085, -0.012);
  const bonePosHL = {};
  for (const n of fingerNames) bonePosHL[n] = relQ[n] === undefined ? null : null;

  // ── Per-bone flexion axis (proper frames): rotate +30° about candidate
  //    local axes; the tip must move toward the palm center. ──
  const curlAxes = {};
  for (const name of fingerNames) {
    const b = bones[name];
    const child = b.children.find((c) => c.isBone);
    let dLocal;
    if (child) {
      dLocal = b.worldToLocal(child.getWorldPosition(new THREE.Vector3())).normalize();
    } else {
      dLocal = b.parent.worldToLocal(b.getWorldPosition(new THREE.Vector3())).normalize();
    }
    // bone position in hand-local (bind): rel-inverse of world offset
    const boneWorld = b.getWorldPosition(new THREE.Vector3());
    const handWorld = hand.getWorldPosition(new THREE.Vector3());
    const offWorld = boneWorld.clone().sub(handWorld);
    // world offset -> hand-local via inverse hand world matrix (rotation part)
    const offHL = offWorld.clone().applyQuaternion(handWorldQ.clone().invert());
    const palmDirHL = palmCenterHL.clone().sub(offHL);
    if (palmDirHL.lengthSq() < 1e-9) palmDirHL.set(-1, 0, 0);
    palmDirHL.normalize();
    const palmLocal_b = palmDirHL.clone().applyQuaternion(relQ[name].clone().invert());
    const base = dLocal.dot(palmLocal_b);
    let best = null;
    for (const ax of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const a = new THREE.Vector3(ax[0], ax[1], ax[2]);
      if (Math.abs(a.dot(dLocal)) > 0.6) continue;
      const q = new THREE.Quaternion().setFromAxisAngle(a, D(30));
      const d2 = dLocal.clone().applyQuaternion(q);
      const score = d2.dot(palmLocal_b) - base;
      if (!best || score > best.score) best = { axis: a.clone(), score };
    }
    curlAxes[name] = { axis: best.axis, dLocal };
    console.log("AX", name.replace("mixamorigRightHand", ""), "axis", f3(best.axis), "score", f4(best.score));
  }

  // ── Idle hand orientation ──
  const mixer = new THREE.AnimationMixer(clone);
  const idleClip = THREE.AnimationClip.findByName(gltf.animations, "Idle");
  mixer.clipAction(idleClip).reset().play();
  mixer.update(0); clone.updateMatrixWorld(true);
  const handIdleQ = hand.quaternion.clone();
  mixer.stopAllAction(); clone.updateMatrixWorld(true);
  hand.quaternion.copy(handBindQ); // restore bind

  // ── Grip hand rotation candidates: make the flexion axis ≈ vertical ──
  const avgHL = new THREE.Vector3();
  for (const name of fingerNames) avgHL.add(curlAxes[name].axis.clone().applyQuaternion(relQ[name]));
  avgHL.normalize();
  console.log("AVG curl axis hand-local(bind):", f3(avgHL));

  let bestR = null;
  for (const cand of [[[1,0,0], 90], [[1,0,0], -90], [[0,0,1], 90], [[0,0,1], -90]]) {
    const axis = new THREE.Vector3(cand[0][0], cand[0][1], cand[0][2]);
    const R = new THREE.Quaternion().setFromAxisAngle(axis, D(cand[1]));
    const wAxis = avgHL.clone().applyQuaternion(R).applyQuaternion(handIdleQ);
    const score = wAxis.y; // how vertical in idle
    console.log("CAND R", axis.toArray().join(","), cand[1], "-> idle", f3(wAxis), "y", f4(score));
    if (!bestR || score > bestR.score) bestR = { R, score };
  }
  const eH = new THREE.Euler().setFromQuaternion(bestR.R, "XYZ");
  console.log("HAND_GRIP_EULER", f4(eH.x), f4(eH.y), f4(eH.z));

  // ── Apply pose on bind, measure fist ──
  const CURL = { Index: [86, 75, 45], Middle: [88, 78, 48], Ring: [88, 80, 50], Pinky: [84, 78, 50], Thumb: [28, 34, 22] };
  const applyPoseBind = (scale = 1) => {
    hand.quaternion.copy(handBindQ).multiply(bestR.R);
    for (const name of fingerNames) {
      const m = name.match(/RightHand(Thumb|Index|Middle|Ring|Pinky)(\d)$/);
      if (!m) continue;
      const b = bones[name];
      b.quaternion.copy(bindQ[name]).multiply(
        new THREE.Quaternion().setFromAxisAngle(curlAxes[name].axis, D(CURL[m[1]][Number(m[2]) - 1] * scale))
      );
    }
    clone.updateMatrixWorld(true);
  };

  const toHL = (o) => {
    const off = o.getWorldPosition(new THREE.Vector3()).sub(hand.getWorldPosition(new THREE.Vector3()));
    return off.applyQuaternion(handWorldQ.clone().invert());
  };

  for (const scale of [0.85, 1.0, 1.15]) {
    applyPoseBind(scale);
    const tips = fingerNames.filter((n) => !/Thumb/.test(n) && Number(n.slice(-1)) >= 2);
    let sum = 0, cnt = 0;
    const knAvg = new THREE.Vector3(), tipAvg = new THREE.Vector3();
    let kn = 0, tp = 0;
    for (const n of fingerNames) {
      const p = toHL(bones[n]);
      if (/Thumb/.test(n)) continue;
      const rel = p.clone().sub(fistRefTmp(p));
      function fistRefTmp() { return new THREE.Vector3(); }
      const ji = Number(n.slice(-1));
      if (ji === 1) { knAvg.add(p); kn++; } else { tipAvg.add(p); tp++; }
    }
    knAvg.divideScalar(kn); tipAvg.divideScalar(tp);
    const center = knAvg.clone().add(tipAvg).multiplyScalar(0.5);
    for (const n of tips) {
      const p = toHL(bones[n]);
      const rel = p.clone().sub(center);
      const along = rel.dot(avgHL);
      const perp = rel.clone().sub(avgHL.clone().multiplyScalar(along));
      sum += perp.length(); cnt++;
    }
    console.log("SCALE", scale, "meanTipPerp", f4(sum / cnt), "center", f3(center), "knAvg", f3(knAvg), "tipAvg", f3(tipAvg));
  }

  applyPoseBind(1.0);
  const knAvgF = new THREE.Vector3(), tipAvgF = new THREE.Vector3();
  let knC = 0, tpC = 0;
  for (const n of fingerNames) {
    if (/Thumb/.test(n)) continue;
    const p = toHL(bones[n]);
    if (Number(n.slice(-1)) === 1) { knAvgF.add(p); knC++; } else { tipAvgF.add(p); tpC++; }
  }
  knAvgF.divideScalar(knC); tipAvgF.divideScalar(tpC);
  const fistCenter = knAvgF.clone().add(tipAvgF).multiplyScalar(0.5);
  console.log("FIST_CENTER_HL", f3(fistCenter));

  // ── Blade axis (hand-local) → sword euler ──
  const blade = avgHL.clone();
  if (blade.clone().applyQuaternion(bestR.R).applyQuaternion(handIdleQ).y < 0) blade.negate();
  const qS = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), blade);
  const eS = new THREE.Euler().setFromQuaternion(qS, "XYZ");
  console.log("SWORD_EULER", f4(eS.x), f4(eS.y), f4(eS.z));

  // ── Idle validation ──
  mixer.clipAction(idleClip).reset().play();
  mixer.update(0); clone.updateMatrixWorld(true);
  hand.quaternion.multiply(bestR.R);
  for (const name of fingerNames) {
    const m = name.match(/RightHand(Thumb|Index|Middle|Ring|Pinky)(\d)$/);
    if (!m) continue;
    bones[name].quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(curlAxes[name].axis, D(CURL[m[1]][Number(m[2]) - 1]))
    );
  }
  clone.updateMatrixWorld(true);
  const idleAxis = new THREE.Vector3();
  for (const name of fingerNames) {
    idleAxis.add(curlAxes[name].axis.clone().applyQuaternion(bones[name].getWorldQuaternion(new THREE.Quaternion())));
  }
  idleAxis.normalize();
  console.log("IDLE blade world:", f3(idleAxis), "up", f4(idleAxis.y));
  // Fingertip wrap in idle (world dist to blade line through fist center world)
  const fcWorld = fistCenter.clone().applyQuaternion(hand.quaternion).multiplyScalar(0.0105).add(hand.getWorldPosition(new THREE.Vector3()));
  let wrapSum = 0, wrapN = 0;
  for (const name of fingerNames) {
    if (/Thumb/.test(name) || Number(name.slice(-1)) < 2) continue;
    const p = bones[name].getWorldPosition(new THREE.Vector3());
    const rel = p.clone().sub(fcWorld);
    const along = rel.dot(idleAxis);
    wrapSum += rel.clone().sub(idleAxis.clone().multiplyScalar(along)).length();
    wrapN++;
  }
  console.log("IDLE mean tip perp dist (raw units):", f4(wrapSum / wrapN));
})().catch((e2) => { console.error("ERR", e2 && e2.stack); process.exit(1); });
