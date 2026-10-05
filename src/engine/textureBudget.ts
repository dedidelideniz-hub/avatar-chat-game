/**
 * DOKU BELLEK BÜTÇESİ — GLTF sahnelerinin dokularını cihaza göre küçültür.
 *
 * NEDEN VAR (kök neden): `public/models` altındaki modeller meshopt ile
 * sıkıştırılmış, dokuları da WebP'dir. Yani DOSYA küçüktür ama GPU dokusu
 * büyüktür — WebP yalnızca aktarımı küçültür, çözülünce RGBA8 olarak GPU'ya
 * çıkar. Ölçüm (`witch_shop.glb`, dosyadan okundu): 43 dokunun 31'i
 * 1024×1024 → tek başına **130 MiB** (mip zinciriyle ~173 MiB). Bu doku,
 * yükleme kapısı (\"Cadde kuruluyor\") açılırken caddenin ilk karesiyle aynı
 * anda yükleniyordu; Android WebView'in işleyici (renderer) süreci bellekten
 * düşüyordu → \"Hay aksi! Bu web sayfasını görüntülerken bir hata oluştu\"
 * (Aw, Snap). Aynı sorun oda modelinde de var:
 * `empty_office_space.glb` → 30 MiB.
 *
 * ÇÖZÜM: model sahneye girmeden ÖNCE (ilk kare çizilmeden, yani doku GPU'ya
 * hiç çıkmadan) `maxSize`i aşan dokular kanvas üzerinde küçültülür ve eski
 * doku BIRAKILIR. Mobilde 512: cadı dükkânı 130 MiB → **43 MiB**, oda modeli
 * 30 MiB → **9 MiB** (512² ve altı dokular zaten sınırın altında kaldığı için
 * korunur). Masaüstünde 1024'tür, yani oyun orada eskisi gibi görünür.
 *
 * İndirme boyutu DEĞİŞMEZ: bedel ağda değil GPU'da ödeniyordu.
 */
import * as THREE from "three";

/** Mobilde dokunun en büyük kenarı bu piksele indirilir. */
export const MOBILE_TEXTURE_MAX = 512;
/** Masaüstünde yalnızca aşırı büyük dokular kırpılır (ölçek korunur). */
export const DESKTOP_TEXTURE_MAX = 1024;

/** `useIsMobile` ile aynı ölçüt (768 px) — React'siz motor modülleri için. */
export function defaultTextureMax(): number {
  if (typeof window === "undefined") return DESKTOP_TEXTURE_MAX;
  return window.innerWidth < 768 ? MOBILE_TEXTURE_MAX : DESKTOP_TEXTURE_MAX;
}

/** Malzemede küçültülecek doku yuvaları. */
const TEXTURE_SLOTS = [
  "map",
  "normalMap",
  "bumpMap",
  "roughnessMap",
  "metalnessMap",
  "emissiveMap",
  "aoMap",
  "alphaMap",
  "specularMap",
  "displacementMap",
  "clearcoatMap",
  "clearcoatNormalMap",
  "clearcoatRoughnessMap",
  "sheenColorMap",
  "sheenRoughnessMap",
  "transmissionMap",
  "thicknessMap",
  "lightMap",
] as const;

/**
 * Küçültme bir kez yapılır: `useGLTF` önbelleği URL başına TEK sahne döndürür
 * ve o sahneyi birden fazla bileşen (kapı sondası + bina) paylaşır.
 */
const processedScenes = new WeakSet<THREE.Object3D>();

interface SizedImage {
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  close?: () => void;
}

function imageSize(image: unknown): { w: number; h: number } | null {
  if (!image || typeof image !== "object") return null;
  const im = image as SizedImage;
  const w = im.width ?? im.naturalWidth ?? 0;
  const h = im.height ?? im.naturalHeight ?? 0;
  if (!w || !h) return null;
  return { w: Math.round(w), h: Math.round(h) };
}

/** Kaynak doku ayarlarını (renk uzayı, sarma, filtre, kırpma) kopyalar. */
function cloneSettings(from: THREE.Texture, image: HTMLCanvasElement): THREE.Texture {
  const next = new THREE.Texture(image);
  next.name = from.name;
  next.colorSpace = from.colorSpace;
  next.wrapS = from.wrapS;
  next.wrapT = from.wrapT;
  next.magFilter = from.magFilter;
  next.minFilter = from.minFilter;
  next.anisotropy = from.anisotropy;
  next.flipY = from.flipY;
  next.repeat.copy(from.repeat);
  next.offset.copy(from.offset);
  next.center.copy(from.center);
  next.rotation = from.rotation;
  next.channel = from.channel;
  next.premultiplyAlpha = from.premultiplyAlpha;
  next.unpackAlignment = from.unpackAlignment;
  next.needsUpdate = true;
  return next;
}

/**
 * Tek bir dokuyu küçültür. Küçültülemezse (veri/sıkıştırılmış doku, resim
 * çözülemedi) `null` döner — çağıran eski dokuyu AYNEN bırakır.
 */
function shrink(
  texture: THREE.Texture,
  image: unknown,
  maxSize: number,
): THREE.Texture | null {
  const size = imageSize(image);
  if (!size) return null;
  const longest = Math.max(size.w, size.h);
  if (longest <= maxSize) return null;

  const scale = maxSize / longest;
  const w = Math.max(1, Math.round(size.w * scale));
  const h = Math.max(1, Math.round(size.h * scale));

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;
  try {
    canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    ctx = canvas.getContext("2d");
  } catch {
    return null;
  }
  if (!ctx) return null;
  try {
    ctx.drawImage(image as CanvasImageSource, 0, 0, w, h);
  } catch {
    return null;
  }
  return cloneSettings(texture, canvas);
}

/**
 * Sahnedeki aşırı büyük dokuları `maxSize` sınırına indirir ve eski dokuları
 * bırakır. Küçültülmüş doku sayısını döndürür (ölçüm/günlük için).
 *
 * Sahnedeki malzemeler YERİNDE değiştirilir; bu yüzden ilk kare çizilmeden
 * önce (render sırasında, `useMemo` içinde) çağrılmalıdır.
 */
export function shrinkModelTextures(
  root: THREE.Object3D | null | undefined,
  maxSize: number = defaultTextureMax(),
): number {
  if (!root || !root.isObject3D || maxSize <= 0) return 0;
  if (processedScenes.has(root)) return 0;
  processedScenes.add(root);

  const replaced = new Map<THREE.Texture, THREE.Texture>();
  let shrunk = 0;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const slots = material as unknown as Record<string, unknown>;
      for (const slot of TEXTURE_SLOTS) {
        const texture = slots[slot] as THREE.Texture | null | undefined;
        if (!texture || !texture.isTexture) continue;
        // Veri/sıkıştırılmış/render-target dokular kanvasa çizilemez.
        const kinds = texture as unknown as Record<string, boolean | undefined>;
        if (
          kinds.isDataTexture ||
          kinds.isCompressedTexture ||
          kinds.isRenderTargetTexture ||
          kinds.isVideoTexture
        ) {
          continue;
        }
        const cached = replaced.get(texture);
        if (cached) {
          slots[slot] = cached;
          continue;
        }
        const image = texture.image as unknown;
        const next = shrink(texture, image, maxSize);
        if (!next) {
          replaced.set(texture, texture);
          continue;
        }
        slots[slot] = next;
        replaced.set(texture, next);
        shrunk += 1;
        // Eski doku GPU'da kalmasın (kopyası yoksa) ve çözülmüş resim serbest
        // bırakılsın — küçültmenin amacı tam olarak bu bellek.
        texture.dispose();
        const closable = image as SizedImage | null;
        if (closable && typeof closable.close === "function") {
          try {
            closable.close();
          } catch {
            /* resim zaten kapalı olabilir */
          }
        }
      }
    }
  });

  return shrunk;
}
