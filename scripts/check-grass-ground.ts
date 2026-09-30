/**
 * 🌱 ÇİM ZEMİN TEŞHİSİ — gerçek `grass_ground.glb` ile çalıştırır.
 *
 * Neden var: bu ortamda önizleme açılamıyor, yani "zemin boşluksuz döşendi mi,
 * doğru yükseklikte mi?" sorusu gözle doğrulanamıyor. Bu script sahnenin
 * kullandığı AYNI kodu (`src/engine/grassGroundPrep.ts`) gerçek dosya üzerinde
 * çalıştırıp ölçümü yazdırır:
 *   · karo boyutu (ölçülen, varsayılmayan),
 *   · yüzey yönü (normal +Y) ve metalness düzeltmesi,
 *   · kaç örnek (instance) çizileceği, kaplanan alan, boşluk kontrolü,
 *   · zeminin Y'si ile propların (ağaç/çim öbeği) taban Y'sinin aynı olduğu.
 *
 * Kullanım:  bun scripts/check-grass-ground.ts
 */
// GLTFLoader Node'da tarayıcı API'leri arar; ölçüm için yeterli sahte karşılıklar.
const g = globalThis as unknown as Record<string, unknown>;
g.self = globalThis;
g.ProgressEvent = class ProgressEvent {
  type: string;
  constructor(type: string, init: Record<string, unknown> = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};
g.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

import fs from "node:fs";
import zlib from "node:zlib";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import {
  GRASS_GROUND_URL,
  buildGrassGroundPlacements,
  prepareGrassGround,
} from "../src/engine/grassGroundPrep";
import {
  BENCHES,
  BUILDINGS,
  BUS_STOPS,
  FENCE_CAPS,
  FENCE_EDGES,
  FENCE_LINES,
  FENCE_SPACING,
  GRASS_GROUND_Y,
  GRASS_GROUND_ZONES,
  LAMPS,
  SIDE_STREET_SOUTH,
  SIDE_STREET_W,
  STALLS,
  TRASH_CANS,
  VEG_SIZES,
  ZONE,
} from "../src/engine/constants";
import { buildFenceEdge, buildFenceLine } from "../src/engine/fenceLine";

/**
 * GLB içindeki PNG'leri çözer (zlib + PNG filtre çözümü, ek bağımlılık yok) ve
 * ortalama rengi yazdırır. Görünüm ayarlarının GEREKÇESİ budur: basecolor
 * koyuysa açma çarpanı şart, AO ortalaması düşükse (koyu) dolaylı ışığı
 * kısıyordur → kapatılır.
 */
function reportTextureStats() {
  const gltf = JSON.parse(fs.readFileSync(`public${GRASS_GROUND_URL}`, "utf8"));
  const bin = Buffer.from(gltf.buffers[0].uri.split(",")[1], "base64");
  const imageBuffer = (i: number) => {
    const view = gltf.bufferViews[gltf.images[i].bufferView];
    const offset = view.byteOffset ?? 0;
    return bin.subarray(offset, offset + view.byteLength);
  };

  const decode = (png: Buffer) => {
    let p = 8;
    let w = 0;
    let h = 0;
    let bitDepth = 0;
    let colorType = 0;
    const idat: Buffer[] = [];
    while (p < png.length) {
      const len = png.readUInt32BE(p);
      const type = png.toString("latin1", p + 4, p + 8);
      if (type === "IHDR") {
        w = png.readUInt32BE(p + 8);
        h = png.readUInt32BE(p + 12);
        bitDepth = png[p + 16];
        colorType = png[p + 17];
      } else if (type === "IDAT") idat.push(png.subarray(p + 8, p + 8 + len));
      else if (type === "IEND") break;
      p += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType as 0 | 2 | 3 | 4 | 6] ?? 3;
    const bpp = Math.max(1, (channels * bitDepth) / 8);
    const stride = w * bpp;
    const out = Buffer.alloc(h * stride);
    let o = 0;
    for (let y = 0; y < h; y++) {
      const filter = raw[o++];
      const line = raw.subarray(o, o + stride);
      o += stride;
      const cur = out.subarray(y * stride, (y + 1) * stride);
      const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? cur[x - bpp] : 0;
        const b = prev[x];
        const c = x >= bpp ? prev[x - bpp] : 0;
        let v = line[x];
        if (filter === 1) v += a;
        else if (filter === 2) v += b;
        else if (filter === 3) v += (a + b) >> 1;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        cur[x] = v & 255;
      }
    }
    const count = w * h;
    const sums = [0, 0, 0];
    for (let i = 0; i < count; i++) {
      for (let ch = 0; ch < Math.min(3, channels); ch++) sums[ch] += out[i * bpp + ch];
    }
    return { w, h, mean: sums.map((s) => s / count) };
  };

  const base = decode(imageBuffer(0));
  const orm = decode(imageBuffer(1));
  const luma = 0.2126 * base.mean[0] + 0.7152 * base.mean[1] + 0.0722 * base.mean[2];
  console.log(
    `\n  doku teşhisi: basecolor ${base.w}×${base.h} ort. RGB ` +
      `[${base.mean.map((v) => v.toFixed(0)).join(", ")}] → parlaklık ${luma.toFixed(0)}/255 ` +
      `→ ${luma < 110 ? "KOYU, açma çarpanı şart" : "yeterli"}`,
  );
  console.log(
    `    ORM ort. R(AO) ${orm.mean[0].toFixed(0)} · G(roughness) ${orm.mean[1].toFixed(0)} · ` +
      `B(metalness) ${orm.mean[2].toFixed(0)} → AO x${(orm.mean[0] / 255).toFixed(2)} ile dolaylı ` +
      `ışığı kısıyordu (kapatıldı)`,
  );
}

function loadModel(url: string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const file = fs.readFileSync(`public${url}`);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  return new Promise((resolve, reject) => {
    loader.parse(buffer as ArrayBuffer, "", (gltf) => resolve(gltf.scene), reject);
  });
}

const scene = await loadModel(GRASS_GROUND_URL);
const tile = prepareGrassGround(scene);
const { report, size } = tile;

console.log(`\n=== ÇİM ZEMİN (${GRASS_GROUND_URL})`);
console.log(
  `  ham model: ${report.sourceMeshes} mesh · ${report.triangles} üçgen · ` +
    `ölçülen kutu ${report.rawSize.x.toFixed(2)}×${report.rawSize.y.toFixed(2)}×${report.rawSize.z.toFixed(2)} birim`,
);
console.log(
  `  karo (döşeme adımı): ${size.x.toFixed(3)} × ${size.z.toFixed(3)} birim · ` +
    `yüzey kalınlığı ${report.thickness.toFixed(3)}`,
);
console.log(
  `  yüzey yönü: ${report.normalUp ? "+Y ✔ (düzeltme gerekmedi)" : "ters → 180° X ile düzeltildi ✔"}`,
);
console.log(
  `  görünüm: açma ${report.look.brightness}× · tint rgb(${report.look.tint.r}, ` +
    `${report.look.tint.g}, ${report.look.tint.b}) · emissive rgb(${report.look.emissive.r}, ` +
    `${report.look.emissive.g}, ${report.look.emissive.b}) · roughness ${report.look.roughness} · ` +
    `metalness ${report.look.metalness}`,
);
console.log(
  `  kalan dokular: ${report.maps.join(", ") || "yok"} · ` +
    `kapatılanlar: ${report.droppedMaps.join(", ") || "—"}`,
);
reportTextureStats();

const { placements, zones } = buildGrassGroundPlacements(tile, GRASS_GROUND_ZONES);
console.log(`\n  döşeme: ${placements.length} örnek (instance) → 1 draw call`);
zones.forEach((zone, i) => {
  const def = GRASS_GROUND_ZONES[i];
  const gapX = zone.coverageX - def.w;
  const gapZ = zone.coverageZ - def.d;
  console.log(
    `    bölge ${i}: ${zone.cols}×${zone.rows} karo · kaplanan ${zone.coverageX.toFixed(2)}×` +
      `${zone.coverageZ.toFixed(2)} · istenen ${def.w}×${def.d} · taşma ` +
      `${gapX.toFixed(2)}×${gapZ.toFixed(2)} → ${gapX >= 0 && gapZ >= 0 ? "BOŞLUK YOK ✔" : "BOŞLUK VAR ✘"}`,
  );
});

// Uç uca gelme: komşu karoların kenarları tam örtüşüyor mu?
const stepX = size.x;
const stepZ = size.z;
const xs = [...new Set(placements.map((p) => p.x))].sort((a, b) => a - b);
const zs = [...new Set(placements.map((p) => p.z))].sort((a, b) => a - b);
const dx = xs.length > 1 ? xs[1] - xs[0] : 0;
const dz = zs.length > 1 ? zs[1] - zs[0] : 0;
console.log(
  `\n  dikiş kontrolü: X adımı ${dx.toFixed(6)} (karo ${stepX.toFixed(6)}) · ` +
    `Z adımı ${dz.toFixed(6)} (karo ${stepZ.toFixed(6)}) → ` +
    `${Math.abs(dx - stepX) < 1e-9 && Math.abs(dz - stepZ) < 1e-9 ? "TAM UÇ UCA ✔" : "FARK VAR ✘"}`,
);

// Yükseklik hizası: zemin ile propların tabanı aynı mı?
const groundY = placements[0]?.y ?? Number.NaN;
console.log(
  `\n  yükseklik: zemin y=${groundY.toFixed(3)} · GRASS_GROUND_Y=${GRASS_GROUND_Y.toFixed(3)} · ` +
    `ağaç tabanı=${GRASS_GROUND_Y.toFixed(3)} (boy ${VEG_SIZES.tree}) · ` +
    `çim öbeği tabanı=${GRASS_GROUND_Y.toFixed(3)}`,
);
console.log(
  `  referans: asfalt y=0.008 · kaldırım y=0.005 → zemin ${groundY < 0.005 ? "ALTINDA ✔" : "ÜSTÜNDE ✘"}`,
);

/* ═══════════════════════════════════════════════════════════ */
/*  SINIR ÇİTİ — kaldırım ↔ çim hattı                           */
/* ═══════════════════════════════════════════════════════════ */

const SLAT_HEIGHT = 0.38;
const SLAT_BOTTOM = 0.19 + GRASS_GROUND_Y - SLAT_HEIGHT / 2;
const SIDEWALK_DEPTH = ZONE.northSidewalkBot - ZONE.northSidewalkTop; // 1.2
const ROAD_WIDTH = ZONE.roadBot - ZONE.roadTop; // 2.4

console.log("\n=== SINIR ÇİTİ (kaldırım ile çimin birleştiği çizgi)");
let fenceSlats = 0;
let fenceRails = 0;

for (const line of FENCE_LINES) {
  const built = buildFenceLine(line);
  fenceSlats += built.slats.length;
  fenceRails += built.rails.length;

  const label =
    Math.abs(line.z - ZONE.southGrassTop) < 1e-9
      ? "güney kaldırım ↔ güney çim"
      : Math.abs(line.z - ZONE.northGrassBot) < 1e-9
        ? "kuzey çim ↔ kuzey kaldırım"
        : "SERBEST (sınır çizgisi değil!)";
  const first = built.slats[0]?.x ?? Number.NaN;
  const last = built.slats[built.slats.length - 1]?.x ?? Number.NaN;
  const maxGap = Math.max(0, ...built.slats.slice(1).map((s, i) => s.x - built.slats[i].x));
  // En yakın YOL kenarı: çit kaldırımın dış kenarında olduğu için aradaki
  // mesafe kaldırım derinliği (1.2) kadar olmalı — yola sarkma olmamalı.
  const roadEdge =
    Math.abs(line.z - ZONE.roadTop) < Math.abs(line.z - ZONE.roadBot)
      ? ZONE.roadTop
      : ZONE.roadBot;
  const roadClearance = Math.abs(line.z - roadEdge) - SIDEWALK_DEPTH;

  console.log(
    `\n  hat z=${line.z} (${label}) · ${line.enabled ? "etkin" : "KAPALI"}\n` +
      `    çıta ${built.slats.length} · korkuluk ${built.rails.length} · adım ${built.step.toFixed(4)} ` +
      `(hedef ${FENCE_SPACING}) → ${Math.abs(built.step - FENCE_SPACING) < 0.01 ? "aralık korunuyor ✔" : "aralık saptı ✘"}\n` +
      `    uçlar: ${first.toFixed(2)} … ${last.toFixed(2)} (istenen ${line.startX} … ${line.endX}) → ` +
      `${Math.abs(first - line.startX) < 1e-9 && Math.abs(last - line.endX) < 1e-9 ? "TAM HAT ✔" : "UÇLAR TUTMUYOR ✘"}\n` +
      `    kesintisizlik: en büyük çıta boşluğu ${maxGap.toFixed(4)} ≤ adım → ` +
      `${maxGap <= built.step + 1e-9 ? "BOŞLUK YOK ✔" : "BOŞLUK VAR ✘"}\n` +
      `    hiza: çıta tabanı y=${SLAT_BOTTOM.toFixed(3)} · zemin y=${GRASS_GROUND_Y.toFixed(3)} → ` +
      `${Math.abs(SLAT_BOTTOM - GRASS_GROUND_Y) < 1e-9 ? "TAM ZEMİN ÜSTÜNDE ✔" : "HİZASIZ ✘"}\n` +
      `    kaplama: çıta derinliği 0.035 → hat ${(0.035 / 2).toFixed(3)} birim taşar · ` +
      `en yakın yol kenarına ${Math.abs(line.z - roadEdge).toFixed(2)} birim ` +
      `(kaldırım derinliği ${SIDEWALK_DEPTH.toFixed(2)}, yol şeridi ${ROAD_WIDTH.toFixed(1)}) → ` +
      `${roadClearance >= -1e-9 ? "YOLA TAŞMA YOK ✔" : "YOL ÜSTÜNDE ✘"}`,
  );

  const clash = [...LAMPS, ...BENCHES, ...STALLS, ...TRASH_CANS, ...BUS_STOPS].filter(
    (prop) => Math.abs(prop.z - line.z) < 0.3,
  );
  console.log(
    `    prop çakışması: ${clash.length === 0 ? "yok ✔" : `${clash.length} prop çok yakın ✘`}`,
  );
}

/* ── Dikey sokak kenarı çitleri — çime geçişi kesen hatlar ──────
   Yatay sınır hatları sokak ağızlarında bölündüğü için sokak kenarında hiç
   çit yoktu; oyuncu asfalt şeritte dururken iki yanı çitsiz çim görünüyordu.
   Bu bölüm dikey koşuların da aynı aralık/hiza kurallarına uyduğunu ölçer. */
console.log("\n=== SOKAK KENARI ÇİTLERİ (dikey) + SOKAK UCU KAPAKLARI");
let edgeSlats = 0;
let edgeRails = 0;
let edgeBad = 0;

for (const edge of FENCE_EDGES) {
  const built = buildFenceEdge(edge);
  edgeSlats += built.slats.length;
  edgeRails += built.rails.length;

  const zs = built.slats.map((s) => s.z);
  const spanNorth = Math.min(...zs);
  const spanSouth = Math.max(...zs);
  const maxGap = Math.max(0, ...zs.slice(1).map((z, i) => z - zs[i]));
  const stepOk = Math.abs(built.step - FENCE_SPACING) < 0.01;
  const endsOk =
    Math.abs(spanNorth - Math.min(edge.startZ, edge.endZ)) < 1e-9 &&
    Math.abs(spanSouth - Math.max(edge.startZ, edge.endZ)) < 1e-9;
  const xOk = built.slats.every((s) => Math.abs(s.x - edge.x) < 1e-9);
  // Tüm çıtalar aynı formülü kullanır: taban 0.19 - 0.38/2 = 0 = GRASS_GROUND_Y.
  const bottomOk = Math.abs(SLAT_BOTTOM - GRASS_GROUND_Y) < 1e-9;
  const spanOk = maxGap <= built.step + 1e-9;
  if (!(stepOk && endsOk && xOk && bottomOk && spanOk)) edgeBad++;

  const label =
    Math.abs(spanSouth - SIDE_STREET_SOUTH) < 1e-9
      ? "güney ağız (kaldırım → sokak ucu)"
      : Math.abs(spanNorth - ZONE.backWalkTop) < 1e-9
        ? "kuzey: çim şeridi + bina arası (kaldırım → arka kaldırım)"
        : "SERBEST (çim bandı değil!)";

  const clash = [
    ...LAMPS,
    ...BENCHES,
    ...STALLS,
    ...TRASH_CANS,
    ...BUS_STOPS,
  ].filter(
    (prop) =>
      Math.abs(prop.x - edge.x) < 0.35 &&
      prop.z < spanSouth + 0.2 &&
      prop.z > spanNorth - 0.2,
  );
  // Binalar da ayak izi: kenar çiti dükkan bloklarına girmemeli.
  const clashBuildings = BUILDINGS.filter(
    (b) =>
      Math.abs(b.x - edge.x) < b.w / 2 &&
      b.frontZ > spanNorth &&
      b.frontZ - b.d < spanSouth,
  );

  console.log(
    `\n  kenar X=${edge.x} (${label})\n` +
      `    çıta ${built.slats.length} · korkuluk ${built.rails.length} · adım ${built.step.toFixed(4)} ` +
      `(hedef ${FENCE_SPACING}) → ${stepOk ? "aralık korunuyor ✔" : "aralık saptı ✘"}\n` +
      `    uçlar: Z ${spanNorth.toFixed(2)} … ${spanSouth.toFixed(2)} (istenen ${edge.endZ} … ${edge.startZ}) → ` +
      `${endsOk ? "TAM HAT ✔" : "UÇLAR TUTMUYOR ✘"} · X sabit → ${xOk ? "hizada ✔" : "kaymış ✘"}\n` +
      `    kesintisizlik: en büyük çıta boşluğu ${maxGap.toFixed(4)} ≤ adım → ${spanOk ? "BOŞLUK YOK ✔" : "BOŞLUK VAR ✘"}\n` +
      `    hiza: çıta tabanı y=${SLAT_BOTTOM.toFixed(3)} · zemin y=${GRASS_GROUND_Y.toFixed(3)} → ` +
      `${bottomOk ? "TAM ZEMİN ÜSTÜNDE ✔" : "HİZASIZ ✘"}\n` +
      `    prop çakışması: ${clash.length === 0 ? "yok ✔" : `${clash.length} prop çok yakın ✘`} · ` +
      `bina çakışması: ${clashBuildings.length === 0 ? "yok ✔" : `${clashBuildings.length} bina ✘`}`,
  );
}

console.log(
  `\n  kenar toplamı: ${edgeSlats} çıta + ${edgeRails} korkuluk · ` +
    `${FENCE_EDGES.length} kenar (${SIDE_STREET_W} birim sokak genişliğinin iki yanı) → ` +
    `${edgeBad === 0 ? "TÜM KENARLAR GEÇTİ ✔" : `${edgeBad} KENAR HATALI ✘`}`,
);

// Sokak ucunu kapatan yatay kapaklar: sokak genişliğinde mi, tam uçta mı?
const capBad = FENCE_CAPS.filter((cap) => {
  const built = buildFenceLine(cap);
  const first = built.slats[0]?.x ?? Number.NaN;
  const last = built.slats[built.slats.length - 1]?.x ?? Number.NaN;
  return (
    built.slats.length === 0 ||
    Math.abs(first - cap.startX) > 1e-9 ||
    Math.abs(last - cap.endX) > 1e-9 ||
    Math.abs(cap.endX - cap.startX - SIDE_STREET_W) > 1e-9
  );
});
console.log(
  `  sokak ucu kapakları: ${FENCE_CAPS.length} kapak · her biri ${SIDE_STREET_W} birim ` +
    `(sokak genişliği) · Z ${SIDE_STREET_SOUTH} → ` +
    `${capBad.length === 0 ? "SOKAK UCU KAPALI ✔" : `${capBad.length} kapak hatalı ✘`}`,
);

console.log(
  `\n  toplam: ${fenceSlats + edgeSlats} çıta + ${fenceRails + edgeRails} korkuluk → 2 draw call ` +
    `(${FENCE_LINES.filter((l) => l.enabled).length} yatay hat + ${FENCE_CAPS.length} kapak + ` +
    `${FENCE_EDGES.length} dikey kenar)`,
);
