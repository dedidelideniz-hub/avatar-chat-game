// ⚔️ Kılıç kesik izi (slash) — yeni `"slash"` efekt türünün dokusu.
//
// NEDEN VAR: barut patlamasının tam merkezinde ANLIK beliren, parlayıp kaybolan
// bir kesik izi; samuray temasını patlamanın içine taşır (patlama artık yalnız
// "ateş" değil, "kılıçla yarılmış" bir olay olarak okunur). Süresi çok kısadır
// (≈0.25 sn) ve patlamanın en parlak anıyla aynı karede doğar.
//
// NEDEN KANJI DEĞİL: kanji glifi yazı tipine bağlıdır — glifi olmayan cihazda
// "tofu" kutusu çizilir ve efekt bozulur. Kesik izi tamamen prosedüreldir
// (canvas çizimi), her cihazda birebir aynı görünür ve zaten yeterince
// okunurdur (bkz. `BombTargetMark` → shuriken için aynı gerekçe).
//
// Doku BEYAZDIR: renk, kullanan sprite'ın `color`ından gelir (patlama paleti
// amber ile boyanır), yani tek doku tüm tonlara hizmet eder.
import * as THREE from "three";

let slashTexture: THREE.Texture | null = null;

/**
 * İki çapraz kesiği (uzun ana kesik + kısa ikinci kesik) taşıyan doku.
 * Bir kez üretilir ve tüm havuz yuvaları paylaşır.
 */
export function makeSlashTexture(): THREE.Texture {
  if (slashTexture) return slashTexture;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const c = size / 2;
    ctx.translate(c, c);

    // Bir "kesik": ortası şiş, uçları sivrilen mercek biçimi + parlak bıçak izi.
    const drawCut = (angle: number, halfLen: number, bulge: number) => {
      ctx.save();
      ctx.rotate(angle);
      // 1) yumuşak ışıma (kesiğin çevresine yayılan sıcaklık)
      ctx.shadowColor = "rgba(255,255,255,0.9)";
      ctx.shadowBlur = 26;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.moveTo(-halfLen, 0);
      ctx.quadraticCurveTo(0, -bulge, halfLen, 0);
      ctx.quadraticCurveTo(0, bulge * 0.85, -halfLen, 0);
      ctx.closePath();
      ctx.fill();
      // 2) bıçak çizgisi: kesiğin tam ortasında ince, beyaz, keskin iz.
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "rgba(255,255,255,1)";
      ctx.lineWidth = size * 0.012;
      ctx.beginPath();
      ctx.moveTo(-halfLen * 0.98, 0);
      ctx.quadraticCurveTo(0, -bulge * 0.18, halfLen * 0.98, 0);
      ctx.stroke();
      ctx.restore();
    };

    drawCut(-0.42, size * 0.46, size * 0.075); // ana kesik
    drawCut(0.62, size * 0.32, size * 0.05); // ikinci, kısa kesik

    // Merkez parlaması: iki kesiğin buluştuğu yer en sıcak noktadır.
    ctx.shadowBlur = 0;
    const flash = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.2);
    flash.addColorStop(0, "rgba(255,255,255,1)");
    flash.addColorStop(0.45, "rgba(255,255,255,0.5)");
    flash.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Kesiklerden kopan kıvılcımlar (sabit sahte-rastgele: doku her seferinde
    // aynı olsun, kare kare titremesin).
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    let seed = 0x51a5;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return ((seed >>> 8) & 0xffff) / 0xffff;
    };
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const r = size * (0.18 + rand() * 0.3);
      const s = size * (0.004 + rand() * 0.012);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r * 0.7, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  slashTexture = texture;
  return texture;
}
