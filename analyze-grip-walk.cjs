// Search the BEST fixed grip direction (in hand-local space) so the sword
// blade stays as upright as possible across BOTH the Idle and Walk clips,
// while never reading as "held along the arm" (penalize finger-parallelism).
globalThis.self = globalThis.self ?? globalThis;
const fs = require("fs");
const THREE = require("three");
const { GLTFLoader } = require("three/examples/jsm/loaders/GLTFLoader.js");

const file = process.argv[2] || "public/models/skin-savasci.glb";
const buf = fs.readFileSync(file);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

new GLTFLoader().parse(ab, "", (gltf) => {
  const scene = gltf.scene;
  const clips = gltf.animations || [];
  console.log("CLIPS:", clips.map((c) => c.name).join(", "));

  scene.updateMatrixWorld(true);
  const mixer = new THREE.AnimationMixer(scene);

  const rh = [];
  scene.traverse((o) => { if ((o).isBone && /RightHand$/.test(o.name)) rh.push(o); });
  const hand = rh[0];

  // Collect (handWorldQuat, fingerWorldDir) frames from both clips.
  const frames = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const clip of clips) {
    if (!/idle|walk/i.test(clip.name)) continue;
    const action = mixer.clipAction(clip);
    action.reset().play();
    const N = /walk/i.test(clip.name) ? 16 : 8;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * clip.duration;
      mixer.setTime(t);
      scene.updateMatrixWorld(true);
      const wp = hand.getWorldPosition(new THREE.Vector3());
      const wq = hand.getWorldQuaternion(new THREE.Quaternion());
      const idx = hand.children.find((c) => /index|middle/i.test(c.name));
      const finger = idx ? idx.getWorldPosition(new THREE.Vector3()).sub(wp).normalize() : null;
      frames.push({ clip: clip.name, q: wq.clone(), finger });
    }
    mixer.stopAllAction();
  }
  console.log("FRAMES:", frames.length, "| clips:", [...new Set(frames.map((f) => f.clip))].join(","));

  // Fibonacci sphere candidates (~512 directions).
  const cands = [];
  const N = 512;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    cands.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
  }

  const tmp = new THREE.Vector3();
  let best = null;
  // ── Constrained sweep: blade ⊥-ish to fingers (X–Z plane + a small
  // anti-finger tilt). Penalize finger parallelism beyond 0.25 so the
  // sword never reads as sticking out ALONG the fist axis.
  for (let deg = 0; deg <= 90; deg += 5) {
    for (const tilt of [0, -0.1, -0.2, -0.3, -0.4]) {
      const th = (deg * Math.PI) / 180;
      const d = new THREE.Vector3(Math.cos(th), tilt, Math.sin(th)).normalize();
      let sumUp = 0, minUp = Infinity, parSum = 0;
      for (const f of frames) {
        tmp.copy(d).applyQuaternion(f.q);
        sumUp += tmp.y;
        if (tmp.y < minUp) minUp = tmp.y;
        if (f.finger) parSum += Math.abs(tmp.dot(f.finger));
      }
      const mean = sumUp / frames.length;
      const par = parSum / frames.filter((f) => f.finger).length;
      const score = par > 0.3 ? -1 : mean;
      if (!best || score > best.score) best = { score, mean, minUp, deg, tilt, d };
    }
  }
  console.log(`BEST blend ${best.deg}° tilt ${best.tilt} | meanUp ${best.mean.toFixed(3)} | minUp ${best.minUp.toFixed(3)}`);

  // Also evaluate the two previous calibrations for comparison.
  const evalDir = (label, d) => {
    let minUp = Infinity, maxUp = -Infinity, parSum = 0, sumUp = 0;
    for (const f of frames) {
      tmp.copy(d).applyQuaternion(f.q);
      minUp = Math.min(minUp, tmp.y); maxUp = Math.max(maxUp, tmp.y); sumUp += tmp.y;
      if (f.finger) parSum += Math.abs(tmp.dot(f.finger));
    }
    console.log(label, "| meanUp:", +(sumUp / frames.length).toFixed(3),
      "| minUp:", +minUp.toFixed(3), "maxUp:", +maxUp.toFixed(3),
      "| fingerParallel:", +(parSum / frames.filter((f) => f.finger).length).toFixed(3));
  };
  evalDir("BIND_GRIP  (hand +X, T-pose calibrated)", new THREE.Vector3(1, 0.027, 0.006).normalize());
  evalDir("WALK_AVG   (hand +Z, walk calibrated)", new THREE.Vector3(0.039, -0.205, 0.978).normalize());
  evalDir("SEARCH_BEST (X-Z + tilt)", best.d);

  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), best.d);
  const e = new THREE.Euler().setFromQuaternion(q);
  console.log("BEST_BLADE_LOCAL:", JSON.stringify(best.d.toArray().map((x) => +x.toFixed(3))), "| blendDeg:", best.deg, "| tilt:", best.tilt);
  console.log("GRIP_QUAT:", JSON.stringify([q.x, q.y, q.z, q.w].map((x) => +x.toFixed(4))));
  console.log("GRIP_EULER_XYZ:", JSON.stringify([e.x, e.y, e.z].map((x) => +x.toFixed(4))));
}, (err) => { console.error("PARSE_FAIL", err && err.message || err); process.exit(1); });