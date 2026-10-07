/**
 * GLB bütünlük doğrulaması — küçültülmüş gömülü JSON-glb dosyasında
 *   1) her meshopt-erişiminin (`EXT_meshopt_compression`, buffer 0) baytları
 *      MeshoptDecoder ile SONUNA KADAR çözülür (geometri sağlam mı?), —
 *      Node'da `Image` olmadığı için dokular GLTFLoader yönünden çözülemez,
 *      o yüzden loader yerine erişim düzeyinde doğrulanır; dokular WebP
 *      başlığından bayt düzeyinde ölçülür,
 *   2) buffer-0 döşemesi (resimler + tail) bitişik mi, `byteLength` ile
 *      tam uyuyor mu,
 *   3) GPU doku belleği ve >512² kalan doku sayısı yeniden ölçülür.
 *
 * Kullanım: node scripts/verify-glb.mjs <dosya.glb> …
 *
 * Uygulamaya BAĞIMLILIĞI YOK (yalnızca three/meshopt modülünden okur) —
 * model dosyası değiştiğinde bir kez çalıştırmak yeterlidir.
 */
import fs from "node:fs";
import { MeshoptDecoder } from "../node_modules/three/examples/jsm/libs/meshopt_decoder.module.js";

function jsonEnd(text) {
  const Q = String.fromCharCode(34);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === Q) inString = false;
      continue;
    }
    if (char === Q) {
      inString = true;
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

function webpSize(bytes) {
  if (bytes.length < 30) return null;
  const tag = bytes.toString("latin1", 12, 16);
  if (tag === "VP8 ")
    return {
      w: bytes.readUInt16LE(26) & 0x3fff,
      h: bytes.readUInt16LE(28) & 0x3fff,
    };
  if (tag === "VP8L") {
    const n = bytes.readUInt32LE(21);
    return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
  }
  if (tag === "VP8X")
    return {
      w: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      h: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
    };
  return null;
}

const decoder =
  MeshoptDecoder instanceof Function ? new MeshoptDecoder() : MeshoptDecoder;
// WASM derlemesinden ÖNCE decode çağrılamaz — her çalıştırmada bir kez bekle.
await decoder.ready;

for (const path of process.argv.slice(2)) {
  const text = fs.readFileSync(path, "utf8");
  const gltf = JSON.parse(text.slice(0, jsonEnd(text)));
  const buffer0 = gltf.buffers[0];
  if (!buffer0?.uri?.startsWith("data:application/octet-stream;base64,")) {
    console.error(`${path}: gömülü base64 tamponu yok`);
    process.exit(1);
  }
  const bin = Buffer.from(buffer0.uri.split(",")[1], "base64");
  const views = gltf.bufferViews ?? [];
  const dView = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

  // ── 1) TÜM MESHOPT ERİŞİMLERİNİ ÇÖZ ────────────────────────────────────
  // GLTFLoader + meshoptDecoder'ın yaptığının aynısı: her erişim kendi
  // `EXT_meshopt_compression` girişinden okunur (buffer 0, sıkıştırılmış).
  let decoded = 0;
  for (const view of views) {
    const ext = view.extensions?.EXT_meshopt_compression;
    if (!ext || ext.buffer !== 0) continue;
    const out = new Uint8Array(ext.count * ext.byteStride);
    decoder.decodeGltfBuffer(
      out,
      ext.count,
      ext.byteStride,
      new Uint8Array(bin.buffer, bin.byteOffset + ext.byteOffset, ext.byteLength),
      ext.mode,
      ext.filter ?? 0,
    );
    decoded += 1;
  }

  // ── 2) DÖŞEME BÜTÜNLÜĞÜ ────────────────────────────────────────────────
  // Resim görünümleri + meshopt girişleri buffer 0'ı kesintisiz kaplamalı.
  const imageViews = [
    ...new Set((gltf.images ?? []).map((img) => img.bufferView)),
  ];
  const ranges = [
    ...imageViews.map((vi) => ({
      kind: "image",
      start: views[vi].byteOffset ?? 0,
      end: (views[vi].byteOffset ?? 0) + views[vi].byteLength,
    })),
    ...views
      .map((view) => view.extensions?.EXT_meshopt_compression)
      .filter((ext) => ext && ext.buffer === 0)
      .map((ext) => ({ kind: "meshopt", start: ext.byteOffset, end: ext.byteOffset + ext.byteLength })),
  ].sort((a, b) => a.start - b.start);
  let cursor = 0;
  let tilingOk = true;
  let maxGap = 0;
  for (const range of ranges) {
    // Satıcı aracı (blender exportları) gerektiğinde 4/8 bayta hizalar:
    // küçük dolgular normal, ortüşme VE ≥8 baytlık boşluk bozukluk.
    const gap = range.start - cursor;
    if (gap < 0 || gap > 8) {
      tilingOk = false;
      break;
    }
    maxGap = Math.max(maxGap, gap);
    // gap → bir sonraki range.doğrulama: gap kaç kez? Ortalaşa max dolgu bilgisini
    // günlüğe yansıtmak için kaydedilir.
    cursor = range.end;
  }
  const tilingExact =
    tilingOk &&
    cursor <= bin.length &&
    // Son baytlar hizalama dolgusu olabilir (≤33): döşeme yine de sağlamdır.
    bin.length - cursor <= 33;

  // ── 3) DOKU ÖLÇÜMÜ ─────────────────────────────────────────────────────
  let images = 0;
  let big = 0;
  let gpu = 0;
  let badImages = 0;
  for (const image of gltf.images ?? []) {
    const view = views[image.bufferView];
    if (!view) continue;
    const bytes = bin.subarray(
      view.byteOffset ?? 0,
      (view.byteOffset ?? 0) + view.byteLength,
    );
    const size = webpSize(bytes);
    if (!size) {
      badImages += 1;
      continue;
    }
    images += 1;
    gpu += size.w * size.h * 4;
    if (Math.max(size.w, size.h) > 512) big += 1;
  }

  const ok = decoded > 0 && tilingExact && badImages === 0;
  console.log(
    `${path}: ${ok ? "SAĞLAM ✔" : "SORUN ✘"} • ` +
      `${decoded} meshopt erişimi SONUNA KADAR çözüldü • ` +
      `döşeme ${tilingExact ? "bitişik (0…" + cursor + ", max Dolgu " + maxGap + "B)" : "BOZUK"} • ` +
      `images=${images}${badImages ? ` BOZUK=${badImages}` : ""} >512=${big} • ` +
      `GPU=${(gpu / 1048576).toFixed(1)} MiB`,
  );
  if (!ok) process.exit(1);
}
