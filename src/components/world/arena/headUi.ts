// ⚔️ Arena baş-üstü arayüzü (world-space HUD) çizim yardımcıları.
//
// Arena3D.tsx tek dosyada 75 KB'yi aştığı için bu yardımcılar modüle taşındı:
// can barı (koyu çerçeve + SOLDA seviye rozeti + beyaz ghost iz + renkli dolgu),
// isim etiketi ve elektrik çarpması bolt dokusu. Hepsi prosedürel canvas
// dokularıdır — harici dosya indirilmez.
//
// Bu modül yalnızca çizim yapar; dövüşçü durumu (hp/level/isim) Arena3D'nin
// rig'inden parametre olarak gelir.
import * as THREE from "three";

/** Can barı dokusu çözünürlüğü (5:1) — seviye rozeti + çerçeve + dolgu sığar. */
export const BAR_W = 320;
export const BAR_H = 64;

export function makeBarTex() {
  const c = document.createElement("canvas");
  c.width = BAR_W;
  c.height = BAR_H;
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

/** Rounded-rect path — works even on browsers without ctx.roundRect. */
function roundedRectPath(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  g.moveTo(x + rad, y);
  g.arcTo(x + w, y, x + w, y + h, rad);
  g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad);
  g.arcTo(x, y, x + w, y, rad);
  g.closePath();
}

/** Trace a rounded rect using ctx.roundRect when available, else manually. */
function traceRoundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (typeof g.roundRect === "function") {
    g.roundRect(x, y, w, h, r);
  } else {
    roundedRectPath(g, x, y, w, h, r);
  }
}

/**
 * Tek karelik can barı (MOBA okunurluğu):
 *   • koyu/siyah çerçeve + ince parlak kenarlık,
 *   • SOLUNDA seviye rozeti (oyuncu = cyan, düşman = kırmızı),
 *   • arkada beyaz "ghost" iz — hasar yeni alındığında geriden gelir,
 *   • üstte renkli can dolgusu + parlama şeridi + %25 çentikleri.
 * Ghost ve dolgu AYNI dokuda çizilir; iki ayrı sprite'ın hizası kaymaz.
 */
export function drawBarSprite(
  tex: THREE.CanvasTexture,
  pct: number,
  ghostPct: number,
  color: string,
  level: number,
  isPlayer: boolean,
) {
  const canvas = tex.image as HTMLCanvasElement;
  const g = canvas.getContext("2d");
  if (!g) return;
  const p = Math.max(0, Math.min(1, pct));
  const gp = Math.max(p, Math.min(1, ghostPct));
  g.clearRect(0, 0, BAR_W, BAR_H);

  // ── dış çerçeve: koyu zemin + ince parlak kenar ──
  g.beginPath();
  traceRoundRect(g, 1.5, 1.5, BAR_W - 3, BAR_H - 3, 16);
  g.fillStyle = "rgba(4,7,18,0.94)";
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = "rgba(255,255,255,0.32)";
  g.stroke();

  // ── seviye rozeti (SOL) ──
  const badge = 58;
  g.beginPath();
  traceRoundRect(g, 3, 3, badge, BAR_H - 6, 14);
  g.fillStyle = isPlayer ? "rgba(9,31,50,0.98)" : "rgba(48,10,22,0.98)";
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = isPlayer ? "#38bdf8" : "#fb7185";
  g.stroke();
  g.font = "900 34px 'Baloo 2', 'Segoe UI', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#ffffff";
  g.fillText(
    String(Math.max(1, Math.round(level))),
    3 + badge / 2,
    BAR_H / 2 + 1,
  );

  // ── bar yatağı ──
  const bx = badge + 10;
  const bw = BAR_W - bx - 7;
  const by = 13;
  const bh = BAR_H - 26;
  g.beginPath();
  traceRoundRect(g, bx, by, bw, bh, 11);
  g.fillStyle = "rgba(255,255,255,0.08)";
  g.fill();

  // beyaz ghost iz (yeni kaybedilen can)
  const gw = bw * gp;
  if (gw > 1) {
    g.save();
    g.beginPath();
    traceRoundRect(g, bx, by, bw, bh, 11);
    g.clip();
    g.fillStyle = "rgba(248,250,252,0.9)";
    g.fillRect(bx, by, gw, bh);
    g.restore();
  }

  // renkli can dolgusu (üstte beyaz parlama şeridi)
  const fw = bw * p;
  if (fw > 0.5) {
    g.save();
    g.beginPath();
    traceRoundRect(g, bx, by, bw, bh, 11);
    g.clip();
    const grad = g.createLinearGradient(0, by, 0, by + bh);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.35, color);
    grad.addColorStop(1, color);
    g.fillStyle = grad;
    g.fillRect(bx, by, fw, bh);
    g.fillStyle = "rgba(255,255,255,0.45)";
    g.fillRect(bx, by + 2, fw, 4);
    g.restore();
  }

  // %25 çentikleri
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const x = bx + (bw * i) / 4;
    g.beginPath();
    g.moveTo(x, by + 2);
    g.lineTo(x, by + bh - 2);
    g.stroke();
  }

  // bar kenarlığı
  g.lineWidth = 2.5;
  g.strokeStyle = "rgba(255,255,255,0.5)";
  g.beginPath();
  traceRoundRect(g, bx, by, bw, bh, 11);
  g.stroke();

  tex.needsUpdate = true;
}

/** Name-tag texture — dark rounded chip with the fighter's ability emoji and
 *  name. Lives above the HP bar as a world-space THREE.Sprite, which
 *  automatically billboards toward the camera. Seviye numarası burada DEĞİL,
 *  can barının solundaki rozette gösterilir. */
export function makeNameTex() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

/** Paint one name-tag frame. Drawn once per fight (name/emoji never change). */
export function drawNameSprite(
  tex: THREE.CanvasTexture,
  { name, emoji, isPlayer }: { name: string; emoji: string; isPlayer: boolean },
) {
  const canvas = tex.image as HTMLCanvasElement;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.clearRect(0, 0, 512, 96);
  g.font = "800 44px 'Baloo 2', 'Segoe UI', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let namePart = name;
  const maxW = 434; // leave room for the chip padding inside the 512px canvas
  const fits = (s: string) => g.measureText(`${emoji}  ${s}`).width <= maxW;
  while (namePart.length > 1 && !fits(namePart)) {
    namePart = namePart.slice(0, -1);
  }
  if (namePart !== name) namePart = `${namePart}…`;
  const label = `${emoji}  ${namePart}`;
  const w = Math.min(474, g.measureText(label).width + 44);
  const x = (512 - w) / 2;
  g.beginPath();
  traceRoundRect(g, x, 18, w, 60, 30);
  g.fillStyle = "rgba(8,12,26,0.85)";
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = isPlayer ? "#38bdf8" : "#fb7185";
  g.stroke();
  g.fillStyle = "#ffffff";
  g.fillText(label, 256, 50);
  tex.needsUpdate = true;
}

/**
 * Yumuşak beyaz parlama dokusu (radyal gradyan, kenarsız).
 *
 * İsabet anının "çekirdek flaşı" için kullanılır: vurulan karakterin göğsünde
 * bir kare boyunca patlar, additive karışımla UnrealBloomPass eşiğini geçer.
 * Dış varlık yok — canvas'ta bir kez üretilir, tüm dövüşçüler paylaşır.
 */
export function makeGlowTexture() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  if (!g) return tex;
  const grad = g.createRadialGradient(
    size / 2,
    size / 2,
    1,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.22, "rgba(255,255,255,0.72)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.2)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Lightning-bolt sprite texture (white core + cyan glow) for the player's
 *  electric-strike effect around the identity ring. */
export function makeBoltTexture() {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 192;
  const g = c.getContext("2d");
  const t = new THREE.CanvasTexture(c);
  if (!g) return t;
  // deterministic jagged bolt — zigzag from top to bottom + one branch
  const pts: [number, number][] = [];
  let bx = 48;
  for (let y = 10; y <= 186; y += 18) {
    bx += (Math.random() - 0.5) * 46;
    bx = Math.max(18, Math.min(78, bx));
    pts.push([bx, y]);
  }
  const stroke = (width: number, color: string, blur: number) => {
    g.beginPath();
    g.moveTo(48, 2);
    for (const [px, py] of pts) g.lineTo(px, py);
    g.lineTo(48, 190);
    g.lineWidth = width;
    g.strokeStyle = color;
    g.shadowColor = blur > 0 ? "#22d3ee" : "transparent";
    g.shadowBlur = blur;
    g.stroke();
    // side branch for a more "lightning" silhouette
    g.beginPath();
    g.moveTo(pts[3][0], pts[3][1]);
    g.lineTo(pts[3][0] + 20, pts[3][1] + 24);
    g.lineTo(pts[3][0] + 13, pts[3][1] + 42);
    g.lineWidth = width * 0.7;
    g.stroke();
  };
  stroke(10, "rgba(34,211,238,0.55)", 14);
  stroke(4, "#e0f2fe", 0);
  return t;
}
