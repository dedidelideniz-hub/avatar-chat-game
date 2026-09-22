// 🌑 ZEMİN GÖLGELERİ — karakterin zemine "oturması" için iki katman.
//
// 1) `ContactShadow` — ayakların altında duran yumuşak, koyu temas gölgesi.
//    Gerçek zamanlı gölge haritası olmayan cihazlarda (pointer: coarse →
//    Canvas `shadows` kapalı) TEK zemine-oturma ipucu budur: karakter havada
//    yüzüyormuş gibi görünmez. Aydınlatmadan bağımsız, sabit ve ucuzdur
//    (tek yarı saydam düzlem), bu yüzden mobilde de kapanmaz.
//
// 2) `GroundShadowFlags` — haritanın gölge ALICI bayrakları. `WarAtmosphere`
//    içindeki isim kalıbına dayalı geçiş 300 karelik bütçeyle çalışıyordu;
//    harita (14 MB GLB) o süre içinde yüklenmezse ya da mesh adları kalıba
//    uymazsa sahnede hiç gölge alıcısı kalmıyordu → ışık gölge düşürse bile
//    zemin gölgeyi göstermiyordu (karakter "havada" okunuyordu). Buradaki geçiş
//    isme HİÇ bakmaz: ışık alan (lit) her mesh alıcıdır; kare bütçesi yoktur,
//    harita geldikten sonra bayraklar bir kez yazılır.
//
// İkisi de yalnızca GÖRSEL bayrak/katmandır: fizik, çarpışma ızgarası, hasar
// ve ekonomi etkilenmez.
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* 1) Temas gölgesi                                                    */
/* ------------------------------------------------------------------ */

/** Yumuşak (penumbralı) yuvarlak gölge dokusu. Kenarda ani kesilme olmasın
 *  diye alfa kademeli düşer: MOBA'lardaki "temas gölgesi" görünümü. */
function makeContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(0,0,0,0.95)");
  g.addColorStop(0.34, "rgba(0,0,0,0.7)");
  g.addColorStop(0.6, "rgba(0,0,0,0.32)");
  g.addColorStop(0.84, "rgba(0,0,0,0.07)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

let sharedShadowTex: THREE.CanvasTexture | null = null;

/** Doku TEK üretilir ve iki dövüşçü rig'i tarafından paylaşılır. */
function contactShadowTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  if (!sharedShadowTex) sharedShadowTex = makeContactShadowTexture();
  return sharedShadowTex;
}

/**
 * Dövüşçünün AYAKLARININ ALTINDA duran temas gölgesi. Rig kökünün (grup
 * ölçeği `RIG_ROOT_SCALE`) çocuğu olarak çizilir, yani buradaki birimler
 * rig-yereldir: 1 yerel birim ≈ 0.48 dünya birimi. Varsayılan yarıçaplar
 * karakterin gerçek ayak izine göre seçildi (gövde çapı ~0.9 dünya birimi).
 *
 * `renderOrder = 1`: ekranın kimlik halkası (renderOrder 2) ve mavi kimlik
 * ışıması (renderOrder 0) ile çakışmadan gölgenin en ÜSTTE değil, ışımanın
 * hemen üstünde çizilmesini sağlar — kimlik işaretleri parlaklığını korur,
 * gölge de onların altında okunur.
 */
export function ContactShadow({
  radius = 0.95,
  length = 1.08,
  opacity = 0.42,
  y = 0.008,
}: {
  /** Yarı-genişlik (rig-yerel birim). */
  radius?: number;
  /** Yarı-uzunluk — gövde ekseninde hafif uzatılmış elips. */
  length?: number;
  opacity?: number;
  y?: number;
}) {
  const tex = useMemo(() => contactShadowTexture(), []);
  if (!tex) return null;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, y, 0]}
      scale={[radius, length, 1]}
      renderOrder={1}
      raycast={() => null}
    >
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial
        map={tex}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* 2) Harita gölge bayrakları                                          */
/* ------------------------------------------------------------------ */

/** Yükselen kütleler gölge DÜŞÜRÜR (kaya/kule/duvar/üs...). Ad kalıbına
 *  dayanır ama alıcı tarafı artık isme bağlı DEĞİL (aşağıya bakınız). */
const TALL_CAST_RE =
  /(?:rock|boulder|tower|wall|props|sculpture|station|island|block|base)/i;

/** Işık alan (gölge örnekleyebilen) materyal tipleri. MeshBasicMaterial
 *  ışık almadığı için gölge de göstermez — boşuna bayrak yazmayalım. */
function isLitMaterial(material: THREE.Material | THREE.Material[]): boolean {
  const list = Array.isArray(material) ? material : [material];
  return list.some((entry) => {
    // Materyal bayrakları üç.js'te alt sınıflarda tanımlı; ortak bir arayüz
    // olmadığı için tip daraltması burada yapılır.
    const m = entry as THREE.Material & {
      isMeshStandardMaterial?: boolean;
      isMeshPhongMaterial?: boolean;
      isMeshLambertMaterial?: boolean;
      isMeshToonMaterial?: boolean;
    };
    return Boolean(
      m.isMeshStandardMaterial ||
        m.isMeshPhongMaterial ||
        m.isMeshLambertMaterial ||
        m.isMeshToonMaterial,
    );
  });
}

/**
 * HARİTA GÖLGE ALICI BAYRAKLARI (isme bağlı olmayan, bütçesiz geçiş).
 *
 * `WarAtmosphere → MapShadowFlags` ile aynı işi yapar ama iki farkı var:
 *   • Mesh adları haritanın sözlüğüne uymasa da ışık alan HER mesh alıcı olur
 *     (asıl şikâyetin kaynağı buydu: ışık gölge düşürüyordu ama zemin gölgeyi
 *     göstermiyordu).
 *   • Kare bütçesi yok: 14 MB'lık GLB geç yüklenirse bayraklar yine yazılır.
 *
 * Maliyet: kare başına yalnızca bir `traverse` (bayrak yazımı O(1), geometri
 * ölçümü YOK). Ağaç 20 karede bir taranır ve mesh sayısı sabitlendiğinde
 * tamamen durur; dövüşçü rig'leri (`qaIgnore`) ve görünmez mesh'ler atlanır.
 */
export function GroundShadowFlags() {
  const scene = useThree((s) => s.scene);
  const frame = useRef(0);
  const stable = useRef(0);
  const lastMeshes = useRef(-1);
  const done = useRef(false);

  useFrame(() => {
    if (done.current) return;
    frame.current += 1;
    if (frame.current % 20 !== 0) return;

    let meshes = 0;
    let receivers = 0;
    let casters = 0;
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      meshes += 1;
      // Dövüşçü rig'leri kendi gölge bayraklarını taşır (bkz. GlbFighterBody).
      let node: THREE.Object3D | null = mesh;
      while (node) {
        if (node.userData?.qaIgnore || node.userData?.shadowIgnore) return;
        node = node.parent;
      }
      if (!isLitMaterial(mesh.material)) return;
      if (!mesh.receiveShadow) mesh.receiveShadow = true;
      receivers += 1;
      if (!mesh.castShadow) {
        const names: string[] = [];
        let walk: THREE.Object3D | null = mesh;
        for (let i = 0; walk && i < 6; walk = walk.parent, i++) {
          if (walk.name) names.push(walk.name);
        }
        if (TALL_CAST_RE.test(names.join("/"))) {
          mesh.castShadow = true;
          casters += 1;
        }
      }
    });

    if (receivers === 0) {
      // Harita henüz yüklenmemiş olabilir: bütçesiz beklemeye devam.
      lastMeshes.current = -1;
      return;
    }
    if (meshes === lastMeshes.current) {
      stable.current += 1;
      // Mesh sayısı üst üste sabitlendi → harita oturdu, tarama biter.
      if (stable.current >= 5) {
        done.current = true;
        console.log(
          `[shadow] zemin alıcı bayrakları hazır: ${receivers} alıcı mesh ` +
            `(${casters} yeni gölge verici) / toplam ${meshes}`,
        );
      }
      return;
    }
    stable.current = 0;
    lastMeshes.current = meshes;
  });

  return null;
}
