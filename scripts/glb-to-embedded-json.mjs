/**
 * glTF binary (.glb) -> single-file embedded JSON glTF (.gltf).
 *
 * Usage: node scripts/glb-to-embedded-json.mjs <file.glb> [out]
 *
 * The hosting pipeline re-encodes every binary asset it uploads as UTF-8, so
 * invalid byte sequences (glTF headers, MP3 frames) are replaced with U+FFFD
 * and the file is destroyed. Pure-ASCII files are untouched. Rewriting a GLB
 * as a JSON glTF whose buffer is an embedded base64 data URI keeps the asset
 * byte-exact through that pipeline (and the meshopt extension data lives in
 * that same buffer, so nothing else changes).
 *
 * The output keeps the original path/extension: three.js's GLTFLoader parses
 * an ArrayBuffer that does not start with the "glTF" magic as plain JSON, so
 * `useGLTF("/models/x.glb")` keeps working untouched.
 */
import fs from "node:fs";

const [, , input, output = input] = process.argv;
if (!input) {
  console.error("usage: node scripts/glb-to-embedded-json.mjs <file.glb> [out]");
  process.exit(1);
}

const file = fs.readFileSync(input);
const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
if (file.toString("latin1", 0, 4) !== "glTF") {
  console.error(`${input}: not a GLB (already converted?)`);
  process.exit(1);
}
const jsonLength = view.getUint32(12, true);
const json = JSON.parse(file.toString("utf8", 20, 20 + jsonLength));
const binOffset = 20 + jsonLength;
const binLength = view.getUint32(binOffset, true);
if (binOffset + 8 + binLength !== file.length) {
  console.error(`${input}: unexpected chunk layout`);
  process.exit(1);
}
const bin = file.subarray(binOffset + 8);

json.buffers = json.buffers.map((buffer, index) => {
  if (index === 0) {
    return {
      byteLength: buffer.byteLength,
      uri: `data:application/octet-stream;base64,${bin.toString("base64")}`,
    };
  }
  // A virtual meshopt fallback buffer carries no data and is never fetched,
  // so it stays declared exactly as the spec describes it.
  if (buffer.extensions?.EXT_meshopt_compression?.fallback && buffer.uri === undefined) {
    return buffer;
  }
  throw new Error(`${input}: unsupported extra buffer #${index}`);
});

// Escape every non-ASCII character so the file is 100% ASCII (immune to any
// text re-encoding) — the original mesh names round-trip through \u escapes.
const text = JSON.stringify(json).replace(
  /[\u0080-\uffff]/g,
  (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
);
fs.writeFileSync(output, text);
console.log(
  `${output}: ${(file.length / 1048576).toFixed(2)}MiB -> ${(text.length / 1048576).toFixed(2)}MiB ` +
    `(${json.meshes?.length ?? 0} meshes, ${json.images?.length ?? 0} images, ascii-only)`,
);
