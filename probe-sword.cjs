globalThis.self = globalThis.self ?? globalThis;
globalThis.ProgressEvent = class ProgressEvent {
  constructor(type, opts) { this.type = type; Object.assign(this, opts || {}); }
};
const fs = require("fs");
const path = require("path");
const THREE = require("three");
const { GLTFLoader } = require("three/examples/jsm/loaders/GLTFLoader.js");
const DRACOLoader = require("three/examples/jsm/loaders/DRACOLoader.js").DRACOLoader;

const file = "public/models/royal-kilic.glb";
const buf = fs.readFileSync(path.resolve(file));

// Raw GLB JSON chunk — check KHR_draco_mesh_compression extension.
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8"));
console.log("GLB extensionsRequired:", JSON.stringify(json.extensionsRequired || []));

const draco = new DRACOLoader();
const decoderModule = (function () {
  try {
    return require("draco3d").createDecoderModule();
  } catch (e) {
    console.log("draco3d node binding unavailable:", e.message);
    return null;
  }
})();
if (decoderModule) {
  const wrapperSrc = fs.readFileSync("public/draco/draco_wasm_wrapper.js", "utf8");
  const wasmSrc = fs.readFileSync("public/draco/draco_decoder.wasm");
  console.log("DECODER: wasm bytes", wasmSrc.length);
  const http = require("http");
  const srv = http.createServer((req, res) => {
    if (req.url.endsWith("draco_wasm_wrapper.js")) {
      res.writeHead(200, { "content-type": "application/javascript" });
      res.end(wrapperSrc);
    } else if (req.url.endsWith("draco_decoder.wasm")) {
      res.writeHead(200, { "content-type": "application/wasm" });
      res.end(wasmSrc);
    } else {
      res.writeHead(404); res.end();
    }
  }).listen(0);
  const port = srv.address().port;
  draco.setDecoderPath(`http://127.0.0.1:${port}/`);
  // Serve the decoder through a tiny local HTTP server so DRACOLoader's
  // normal URL fetch flow works (no file:// in Node fetch).
}

const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", (g) => {
  const scene = g.scene;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  console.log("SIZE:", size.toArray().map((v) => v.toFixed(3)).join(","));
  console.log("CENTER (pivot offset from origin):", center.toArray().map((v) => v.toFixed(3)).join(","));
  console.log("MIN:", box.min.toArray().map((v) => v.toFixed(3)).join(","));
  console.log("MAX:", box.max.toArray().map((v) => v.toFixed(3)).join(","));
  // Longest axis = blade axis.
  const axes = [["X", size.x], ["Y", size.y], ["Z", size.z]].sort((a, b) => b[1] - a[1]);
  console.log("LONGEST AXIS (blade direction):", axes[0][0]);
  // Mesh inventory.
  let meshCount = 0;
  scene.traverse((o) => {
    if (o.isMesh) {
      meshCount++;
      const g2 = o.geometry.boundingBox?.getSize(new THREE.Vector3());
      console.log("  mesh:", o.name || "(unnamed)", "geoSize:", g2 ? g2.toArray().map((v) => v.toFixed(3)).join(",") : "n/a");
    }
  });
  console.log("MESH COUNT:", meshCount);
}, (e) => console.error("PARSE FAIL:", e && e.message || e));
