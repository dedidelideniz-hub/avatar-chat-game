// Kaplamasız yapı onarımı — kule / dikilitaş mesh'leri.
//
// Haritanın GLB'sinde bazı yapı mesh'leri (özellikle kuleler) diffuse dokusu
// OLMADAN dışa aktarılmış. Three.js bunları koyu renkli, ışıksız bir gövde
// olarak çizer: sahnede "siyah/koyu mor kule" olarak okunan blok tam olarak
// budur. Bu modül yalnızca dokusu olmayan yapı mesh'lerine prosedürel bir TAŞ
// kaplaması atar; dokusu zaten olan mesh'lere ve çevre objelerine dokunulmaz.
//
// MATERYAL PAYLAŞIMI: `MapPalette` haritanın GLB sahnesinde çalışır, sahneye
// çizilen nesne ise o sahnenin klonudur. Klon materyal ÖRNEKLERİNİ paylaştığı
// için burada materyal REFERANSI değiştirilmez — materyalin kendisi yerinde
// (in-place) güncellenir. Böylece hem orijinal sahne hem de çizilen klon aynı
// anda taş kaplamasını alır.
//
// Görsel-only: fizik, collider maskesi ve hareket kodu bu geçişten etkilenmez.
import * as THREE from "three";

/** Kule/dikilitaş gibi yapı mesh'leri (isim kökü). */
const STRUCTURE_RE =
  /(?:tower|obelisk|pillar|column|monument|temple|shrine|statue|ruin|gate)/i;
/** Çevre mesh'leri: dokusu olmasa bile kaplaması değiştirilmez.
 *
 *  `decal(?!towerbase)` istisnası önemli: haritadaki "dekallar" genelde düz
evre kaplamasıdır, ama `PGD_M_13DecalTowerBase_*` mesh'leri KULE kaidesinin
yüzeyidir ve hiçbir diffuse dokusu olmadığı için ekranda düz BEYAZ, kaba bir
kare olarak okunur. Bunlar taş kaplaması alır (kule gövdesi haritanın taş
diliyle uyumlu olsun diye), diğer dekallar eskisi gibi atlanır. */
const STRUCTURE_SKIP_RE =
  /(?:terrain|ground|decal(?!towerbase)|river|water|stream|lake|pond|bridge|crossing|walkway|road|path|lane|tree|bush|shrub|reed|plant|leaf|foliage|vegetation|flower|fern|underbrush|groundcover|sky|cloud|light|glow|fx|effect|vfx|particle)/i;

/** "Kaplamasız + koyu" mesh'lerin okunurluk eşiği (sRGB parlaklık). */
const BLACK_SURFACE_LUM = 0.25;
/** İsmi YAPI olan mesh'ler için koyuluk eşiği: dokusu olsa bile bu kadar koyu
 *  bir taban rengi sahneye siyah kütle olarak düşer (siyah/koyu mor kule). */
const BLACK_STRUCTURE_LUM = 0.2;
/** Koyu fallback için gereken en az yükseklik (3D birim): düz zemin/decal
 *  plakaları bu geçişe hiç girmez, yalnızca yükselen kütleler girer. */
const STRUCTURE_MIN_HEIGHT = 1;
/** Taş yüzey rengi (doku uygulanamıyorsa kullanılır). */
const STONE_COLOR = 0x6b6572;

let stoneTextureCache: THREE.CanvasTexture | null = null;

/**
 * Prosedürel taş dokusu (kanvas, tek sefer üretilir ve paylaşılır): haritanın
 * kendi taş yapılarıyla aynı dilde — derzli bloklar, hafif ton farkları, gren
 * ve ince çatlaklar. Harici dosya indirilmez, GLB şişmez.
 */
export function makeStoneTexture(): THREE.CanvasTexture {
  if (stoneTextureCache) return stoneTextureCache;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) {
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    g.fillStyle = "#6b6572";
    g.fillRect(0, 0, size, size);
    // derzli taş bloklar (tuğla örgüsü)
    const rows = 6;
    const h = size / rows;
    const cols = 4;
    const w = size / cols;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? w * 0.5 : 0;
      for (let c = -1; c <= cols; c++) {
        const x = c * w + off;
        const shade = 0.05 + rnd() * 0.13;
        g.fillStyle =
          rnd() > 0.5
            ? `rgba(255,255,255,${(shade * 0.6).toFixed(3)})`
            : `rgba(0,0,0,${shade.toFixed(3)})`;
        g.fillRect(x + 1, r * h + 1, w - 2, h - 2);
      }
      g.strokeStyle = "rgba(26,22,32,0.5)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, r * h);
      g.lineTo(size, r * h);
      g.stroke();
      for (let c = -1; c <= cols; c++) {
        const x = c * w + off;
        g.beginPath();
        g.moveTo(x, r * h);
        g.lineTo(x, (r + 1) * h);
        g.stroke();
      }
    }
    // kum / gren
    for (let i = 0; i < 2400; i++) {
      const a = (0.04 + rnd() * 0.1).toFixed(3);
      g.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    // ince çatlaklar
    g.strokeStyle = "rgba(18,14,24,0.32)";
    g.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      let x = rnd() * size;
      let y = rnd() * size;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (rnd() - 0.5) * 26;
        y += (rnd() - 0.5) * 26;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  stoneTextureCache = tex;
  return tex;
}

/** Bir materyalin taş kaplaması alıp almayacağını belirler. */
function looksUntextured(material: THREE.Material): boolean {
  const std = material as THREE.MeshStandardMaterial;
  const tex = std.map as THREE.Texture | null | undefined;
  return !(tex && tex.image);
}

/** Materyalin sRGB parlaklığı (siyah/koyu mor tespiti için). */
function surfaceLuminance(material: THREE.Material): number {
  const color = (material as THREE.MeshStandardMaterial).color as
    | THREE.Color
    | undefined;
  if (!color) return 1;
  const srgb = color.clone().convertLinearToSRGB();
  return 0.2126 * srgb.r + 0.7152 * srgb.g + 0.0722 * srgb.b;
}

/**
 * Materyali YERİNDE taşa çevirir (yeni materyal üretilmez): klon materyal
 * örneklerini paylaştığı için referans değiştirmek çizilen sahnede etkisiz
 * kalırdı.
 */
function applyStone(material: THREE.Material, hasUv: boolean) {
  const map = hasUv ? makeStoneTexture() : null;
  const std = material as THREE.MeshStandardMaterial;
  if (map) {
    std.map = map;
    std.color?.setRGB(1, 1, 1);
  } else {
    std.map = null;
    std.color?.setHex(STONE_COLOR);
  }
  if (typeof std.roughness === "number") std.roughness = 0.88;
  if (typeof std.metalness === "number") std.metalness = 0.08;
  if (typeof std.envMapIntensity === "number") std.envMapIntensity = 0.3;
  if (std.emissive) {
    // Işımayı sıfırla: yapı kendinden parlamaz, yalnızca ışık alır.
    std.emissive.setHex(0x0a0812);
    std.emissiveIntensity = 0.2;
  }
  material.needsUpdate = true;
}

/**
 * Harita sahnesindeki kaplamasız yapı mesh'lerinin materyallerini taşa çevirir.
 * İki tetikleyici vardır:
 *
 *   1. İsmi yapı (kule/dikilitaş) olan ve diffuse dokusu OLMAYAN mesh.
 *   2. Dokusuz VE koyu (siyah/koyu mor) VE zeminden yükselen mesh — ismi ne
 *      olursa olsun sahneye siyah kütle olarak düşen yapı parçaları.
 */
export function repairUntexturedStructureMaterials(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const done = new Set<THREE.Material>();
  let repaired = 0;

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material || !mesh.visible) return;

    const names: string[] = [];
    let node: THREE.Object3D | null = mesh;
    while (node) {
      if (node.name) names.push(node.name);
      node = node.parent;
    }
    const semantic = names.join("/");
    if (STRUCTURE_SKIP_RE.test(semantic)) return;

    const named = STRUCTURE_RE.test(semantic);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // Aday materyaller: dokusuz olanlar; ismi yapı olan mesh'lerde ayrıca
    // dokusu olmasına rağmen taban rengi siyaha yakın olanlar (sahneye
    // "siyah/koyu mor kule" olarak düşen ikinci durum).
    const candidates = list.filter((m) => {
      if (done.has(m)) return false;
      if (looksUntextured(m)) return true;
      return named && surfaceLuminance(m) <= BLACK_STRUCTURE_LUM;
    });
    if (!candidates.length) return;

    const darkest = Math.min(...candidates.map(surfaceLuminance));
    if (!named) {
      // İsimsiz/dokunulmaz görünen mesh: yalnızca zeminden YÜKSELEN ve
      // gerçekten koyu (siyah/koyu mor) kütleler onarılır.
      if (darkest > BLACK_SURFACE_LUM) return;
      box.setFromObject(mesh);
      if (box.max.y - box.min.y < STRUCTURE_MIN_HEIGHT) return;
      if (box.max.y < 0.3) return;
    }

    const hasUv = !!mesh.geometry?.getAttribute?.("uv");
    for (const material of candidates) {
      done.add(material);
      applyStone(material, hasUv);
      repaired += 1;
    }
  });

  if (repaired) {
    console.log(
      `[BattleMapModel] ${repaired} untextured structure material(s) given stone cover`,
    );
  }
}
