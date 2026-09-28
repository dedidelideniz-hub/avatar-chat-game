/**
 * VAELOS CADDESİ — prosedürel yüzey dokuları.
 *
 * Cadde detay katmanı (kaldırım taşı, asfalt, lamba ışık havuzu, tente
 * çizgileri, dükkan tabelaları) harici dosya indirmez: her doku kanvas
 * üzerinde BİR KEZ üretilir ve modül düzeyinde önbelleğe alınır, böylece
 * aynı doku tüm örneklerde paylaşılır (ek GLB/PNG yok, ek shader yok).
 *
 * Renkler `map` olarak kullanıldığı için sRGB renk uzayında işaretlenir.
 */
import * as THREE from "three";

const cache = new Map<string, THREE.CanvasTexture>();

/** Tohumlu rastgele — doku her üretimde aynı görünsün. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function textureOf(key: string, width: number, height: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  if (g) draw(g);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/**
 * Kaldırım taşı — derzli bloklar, hafif ton farkları ve granül.
 * Doku 2×2 dünya birimine karşılık gelir (repeat çağıran tarafta ayarlanır).
 */
export function makePavementTexture(): THREE.CanvasTexture {
  return textureOf("pavement", 256, 256, (g) => {
    const s = 256;
    const rnd = seeded(20117);
    g.fillStyle = "#c9bfa8";
    g.fillRect(0, 0, s, s);

    const rows = 6; // ~0.33 birim yüksekliğinde taşlar
    const rowH = s / rows;
    const cols = 3;
    const colW = s / cols;

    for (let r = 0; r < rows; r++) {
      const offset = r % 2 === 0 ? 0 : colW / 2;
      for (let c = -1; c <= cols; c++) {
        const x = c * colW + offset;
        const y = r * rowH;
        const tone = 208 + Math.floor(rnd() * 30);
        g.fillStyle = `rgb(${tone},${tone - 9},${tone - 32})`;
        g.fillRect(x + 1.5, y + 1.5, colW - 3, rowH - 3);
        // üst kenar ışığı / alt gölge → taşların hacim hissi
        g.fillStyle = "rgba(255,255,255,0.12)";
        g.fillRect(x + 1.5, y + 1.5, colW - 3, 2);
        g.fillStyle = "rgba(92,80,60,0.16)";
        g.fillRect(x + 1.5, y + rowH - 4, colW - 3, 2.4);
      }
      // yatay derz
      g.fillStyle = "rgba(118,106,86,0.30)";
      g.fillRect(0, r * rowH, s, 1.6);
    }

    // granül + ince lekeler
    for (let i = 0; i < 1100; i++) {
      g.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.06)" : "rgba(72,62,46,0.07)";
      g.fillRect(rnd() * s, rnd() * s, 1.7, 1.7);
    }
  });
}

/** Asfalt — koyu agrega benekleri ve hafif aşınma lekeleri. */
export function makeAsphaltTexture(): THREE.CanvasTexture {
  return textureOf("asphalt", 256, 256, (g) => {
    const s = 256;
    const rnd = seeded(7717);
    g.fillStyle = "#9b9385";
    g.fillRect(0, 0, s, s);

    for (let i = 0; i < 15; i++) {
      g.fillStyle = "rgba(84,78,68,0.06)";
      g.beginPath();
      g.arc(rnd() * s, rnd() * s, 16 + rnd() * 30, 0, Math.PI * 2);
      g.fill();
    }

    for (let i = 0; i < 2600; i++) {
      const v = rnd();
      g.fillStyle =
        v > 0.62
          ? "rgba(255,252,240,0.11)"
          : v > 0.28
            ? "rgba(64,58,50,0.14)"
            : "rgba(122,114,100,0.10)";
      g.beginPath();
      g.arc(rnd() * s, rnd() * s, 1 + rnd() * 2.2, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Yumuşak radyal parıltı — lamba halesi ve zemine düşen ışık havuzu. */
export function makeGlowTexture(): THREE.CanvasTexture {
  return textureOf("glow", 128, 128, (g) => {
    const s = 128;
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, "rgba(255,246,214,1)");
    grad.addColorStop(0.35, "rgba(255,238,178,0.55)");
    grad.addColorStop(0.7, "rgba(255,230,150,0.16)");
    grad.addColorStop(1, "rgba(255,230,150,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

/** Tente çizgileri — iki renk dikey şerit (dükkan brandaları). */
export function makeAwningTexture(a: string, b: string): THREE.CanvasTexture {
  return textureOf(`awning|${a}|${b}`, 128, 64, (g) => {
    const w = 128;
    const h = 64;
    const stripes = 4;
    const sw = w / stripes;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 === 0 ? a : b;
      g.fillRect(i * sw, 0, sw, h);
    }
    // kumaş kıvrımı: alt kenarda gölge, üstte ışık
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255,255,255,0.16)");
    grad.addColorStop(0.55, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.22)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/**
 * Tabela yüzü — zemin rengi üzerine dükkan adı, isteğe bağlı yön oku.
 * Cadde tabelaları ve dükkan panoları aynı üreticiyi paylaşır.
 */
export function makeSignTexture(
  text: string,
  bg: string,
  fg: string,
  arrow?: "left" | "right",
): THREE.CanvasTexture {
  return textureOf(`sign|${text}|${bg}|${fg}|${arrow ?? ""}`, 256, 80, (g) => {
    const w = 256;
    const h = 80;
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    g.strokeStyle = "rgba(0,0,0,0.28)";
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.strokeStyle = "rgba(255,255,255,0.22)";
    g.lineWidth = 2;
    g.strokeRect(9, 9, w - 18, h - 18);

    g.fillStyle = fg;
    g.font = "bold 36px system-ui, -apple-system, 'Segoe UI', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const shift = arrow === "left" ? 14 : arrow === "right" ? -14 : 0;
    g.fillText(text, w / 2 + shift, h / 2 + 2, w - (arrow ? 66 : 26));

    if (arrow) {
      const cx = arrow === "left" ? 28 : w - 28;
      const cy = h / 2;
      g.beginPath();
      if (arrow === "left") {
        g.moveTo(cx - 15, cy);
        g.lineTo(cx + 10, cy - 18);
        g.lineTo(cx + 10, cy + 18);
      } else {
        g.moveTo(cx + 15, cy);
        g.lineTo(cx - 10, cy - 18);
        g.lineTo(cx - 10, cy + 18);
      }
      g.closePath();
      g.fill();
    }
  });
}
