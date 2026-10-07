/**
 * GLB DOKU KÜÇÜLTÜCÜ — GPU doku belleğini DOSYADA sabitler.
 *
 * Neden: `public/models` altındaki modeller meshopt ile sıkıştırılmış ve
 * dokuları WebP olduğu için DOSYA küçük görünür, ama GLTFLoader tüm
 * dokuları AYNI ANDA çözüp RGBA8 olarak GPU'ya çıkarır. Ölçüm (bu depoda
 * yapıldı): `witch_shop.glb` 43 dokunun 31'i 1024×1024 → çözülünce
 * **130 MiB** GPU dokusu (mip zinciriyle ~173 MiB). Android WebView'de bu
 * zirve, yükleme kapısı ("Cadde kuruluyor") açılırken işleyici (renderer)
 * sürecini bellekten düşürüyor → "Hay aksi! / Yeniden Yükle" (Aw, Snap).
 *
 * Bu betik cihazdan BAĞIMSIZ olarak >512² dokuları 512'ye indirir (WebP
 * q80) ve dosyayı küçültür. 512² ve altındaki dokular yeniden
 * KODLANMAZ (kalite kaybı olmasın) — baytları aynen korunur.
 *
 * GÜVENLİK (yapı 3 modelde doğrulandı — witch_shop/empty_office/grass_ground):
 *   · Tampon 0'da YALNIZCA resim bufferView'leri var; geometri
 *     accessor'larının TAMAMI tampon 1'de (GLB ikili parçası).
 *   · meshopt sıkıştırma verisi de tampon 0'ın SONUNDA ("tail"): resim
 *     aralıkları ile meshopt `EXT_meshopt_compression` aralıkları
 *     ÖRTÜŞMÜYOR ve tail tamponun sonuna kadar uzanıyor.
 * Dolayısıyla resim baytlarını yeniden paketlemek geometriye dokunmaz;
 * resim görünümlerine yeni offset yazılır, meshopt adresleri tail'deki
 * yeni konuma taşınır (tail, resim küçülünce SIKIŞTIRILIR). Kritik bir
 * yapı beklenmedik çıkarsa betik dosyayı DOKUNMADAN bırakır.
 *
 * Kullanım:  node scripts/shrink-glb-textures.mjs <dosya.glb> …
 *
 * Gereksinim: `sharp` (yalnızca bu BAKIM betiği için — uygulamaya girmez):
 *   bun add -d sharp && node scripts/shrink-glb-textures.mjs public/models/*.glb
 * Sonrasında `node scripts/verify-glb.mjs <dosya.glb> …` ile bütünlük
 * doğrulanır. Depodaki model dosyaları ZATEN küçültülmüş durumda; betiği
 * yalnızca YENİ model eklendiğinde çalıştırmak gerekir.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { argv } from "node:process";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

/** Hedef: dokunun en uzun kenarı bu piksele indirilir. */
const MAX = 512;
const QUOTE = String.fromCharCode(34);
const align4 = (n) => Math.ceil(n / 4) * 4;

/** Gömülü JSON'un bitişini bulur (dizge kaçışlarına saygılı tarayıcı). */
function parseGltfJson(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === QUOTE) inString = false;
      continue;
    }
    if (char === QUOTE) {
      inString = true;
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(0, i + 1));
    }
  }
  throw new Error("gömülü JSON sınırları bulunamadı");
}

/** WebP başlığından gerçek piksel boyutu (tarayıcı ölçümüyle aynı yöntem). */
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

async function processFile(path) {
  const original = fs.readFileSync(path, "utf8");
  const json = parseGltfJson(original);
  const buffer0 = json.buffers?.[0];
  if (!buffer0?.uri?.startsWith("data:application/octet-stream;base64,")) {
    console.error(`${path}: gömülü base64 tamponu yok — değişmedi`);
    return;
  }
  const bin = Buffer.from(buffer0.uri.split(",")[1], "base64");
  const views = json.bufferViews ?? [];
  const images = json.images ?? [];

  // ── 1) SINIFLANDIRMA (orijinal adreslerle; HENÜZ MUTASYON YOK) ─────────
  const imageViewIdx = [
    ...new Set(
      images
        .map((image) => image.bufferView)
        .filter((vi) => vi != null && views[vi]?.buffer === 0),
    ),
  ];
  const imageRanges = imageViewIdx.map((vi) => {
    const view = views[vi];
    return { vi, start: view.byteOffset ?? 0, end: (view.byteOffset ?? 0) + view.byteLength };
  });

  const meshoptRanges = [];
  for (const [vi, view] of views.entries()) {
    const ext = view.extensions?.EXT_meshopt_compression;
    if (view.buffer === 1 && ext && ext.buffer === 0) {
      meshoptRanges.push({
        vi,
        start: ext.byteOffset,
        end: ext.byteOffset + ext.byteLength,
        ext,
      });
    }
  }

  // Güvenlik 1: resim aralıkları ile meshopt aralıkları ÖRTÜŞMEMELİ.
  for (const m of meshoptRanges) {
    for (const img of imageRanges) {
      if (m.start < img.end && m.end > img.start) {
        console.error(
          `${path}: meshopt verisi resim aralığıyla çakışıyor — dosya DEĞİŞMEDİ`,
        );
        return;
      }
    }
  }
  // Güvenlik 2: buffer 0'ın resimlerden sonraki bölümü meshopt tail'i
  // OLMALI. Tail'de bitişik olmayan meshopt girişleri arasındaki 1–3 baytlık
  // DOLGULAR normalize edilir: boşlukların TAMAMI küçük (≤8 bayt) olmalı —
  // aksi halde yapı beklenmediktir ve dosya DEĞİŞMEDEN bırakılır.
  const imagesEnd = Math.max(...imageRanges.map((r) => r.end), 0);
  const sortedTail = [...meshoptRanges].sort((a, b) => a.start - b.start);
  let tailPrevEnd = imagesEnd;
  for (const m of sortedTail) {
    const gap = m.start - tailPrevEnd;
    if (gap < 0 || gap > 8) {
      console.error(
        `${path}: meshopt tail'inde beklenmedik ${gap} baytlık boşluk — dosya DEĞİŞMEDİ`,
      );
      return;
    }
    tailPrevEnd = m.end;
  }
  const tailEnd = tailPrevEnd;
  if (tailEnd > buffer0.byteLength || tailEnd + 8 < buffer0.byteLength) {
    console.error(
      `${path}: tail tamponun sonuna ulaşmıyor ` +
        `(${tailEnd} ≠ ${buffer0.byteLength}) — dosya DEĞİŞMEDİ`,
    );
    return;
  }

  // ── 2) KÜÇÜLTME KARARLARI ──────────────────────────────────────────────
  const resizedByView = new Map(); // vi → Buffer (küçültüldü) | null (korunur)
  let imageBytesBefore = 0;
  let imageBytesAfter = 0;
  for (const [imageIndex, image] of images.entries()) {
    const vi = image.bufferView;
    if (vi == null || views[vi]?.buffer !== 0) continue;
    if (resizedByView.has(vi)) continue;
    const view = views[vi];
    const bytes = bin.subarray(
      view.byteOffset ?? 0,
      (view.byteOffset ?? 0) + view.byteLength,
    );
    const size = webpSize(bytes);
    if (!size) continue;
    imageBytesBefore += bytes.length;
    if (Math.max(size.w, size.h) <= MAX) {
      resizedByView.set(vi, null); // aynen korunur
      imageBytesAfter += bytes.length;
      continue;
    }
    const scale = MAX / Math.max(size.w, size.h);
    const targetW = Math.max(1, Math.round(size.w * scale));
    const targetH = Math.max(1, Math.round(size.h * scale));
    const resized = await sharp(bytes)
      .resize(targetW, targetH, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 3 })
      .toBuffer();
    resizedByView.set(vi, resized);
    imageBytesAfter += resized.length;
    console.log(
      `  doku#${imageIndex}/${images.length} ${size.w}×${size.h} → ` +
        `${targetW}×${targetH} • ${(bytes.length / 1024).toFixed(0)} KiB → ` +
        `${(resized.length / 1024).toFixed(0)} KiB`,
    );
  }

  const touched = [...resizedByView.values()].filter(Boolean).length;
  if (touched === 0) {
    console.log(`${path}: >512² doku yok — dosya değişmedi\n`);
    return;
  }

  // ── 3) YENİDEN PAKETLEME PLANI (mutasyonsuz hesap) ─────────────────────
  // Faz A: resimler ORİJİNAL offset sırasıyla başa dizilir (küçülmüş
  //        baytlarıyla), aralara 4-bayt dolgu.
  // Faz B: meshopt tail'i SIKIŞTIRILMIŞ olarak eklenir (orijinal sıra).
  const chunks = [];
  let cursor = 0;
  const newImageOffset = new Map(); // vi → yeni byteOffset
  const newImageLength = new Map(); // vi → yeni byteLength
  for (const { vi, start } of [...imageRanges].sort((a, b) => a.start - b.start)) {
    const view = views[vi];
    let bytes = bin.subarray(start, (start) + view.byteLength);
    const resized = resizedByView.get(vi);
    if (resized) bytes = resized;
    newImageOffset.set(vi, cursor);
    newImageLength.set(vi, bytes.length);
    chunks.push(bytes);
    const padded = align4(cursor + bytes.length);
    if (padded > cursor + bytes.length) chunks.push(Buffer.alloc(padded - cursor - bytes.length));
    cursor = padded;
  }
  for (const m of sortedTail) {
    const bytes = bin.subarray(m.start, m.end);
    m.newOffset = cursor;
    chunks.push(bytes);
    const padded = align4(cursor + bytes.length);
    if (padded > cursor + bytes.length) chunks.push(Buffer.alloc(padded - cursor - bytes.length));
    cursor = padded;
  }
  const newBin = Buffer.concat(chunks);

  // ── 4) MUTASYONLAR (plan doğrulandıktan sonra) ─────────────────────────
  for (const [vi, offset] of newImageOffset) {
    views[vi].byteOffset = offset;
    views[vi].byteLength = newImageLength.get(vi);
  }
  for (const m of sortedTail) m.ext.byteOffset = m.newOffset;
  buffer0.byteLength = newBin.length;
  buffer0.uri = `data:application/octet-stream;base64,${newBin.toString("base64")}`;

  // ── 5) ASCII KAÇIŞLI YAZIM (metin tabanlı dosya kalır) ─────────────────
  const text = JSON.stringify(json).replace(
    /[\u0080-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  fs.writeFileSync(path, text);
  console.log(
    `  → ${touched} doku 512²'ye indirildi • resim baytları ` +
      `${(imageBytesBefore / 1048576).toFixed(2)} → ` +
      `${(imageBytesAfter / 1048576).toFixed(2)} MiB • dosya ` +
      `${(original.length / 1048576).toFixed(2)} → ${(text.length / 1048576).toFixed(2)} MiB\n`,
  );
}

for (const path of argv.slice(2)) {
  await processFile(path);
}
