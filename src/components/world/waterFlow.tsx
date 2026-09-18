// 🌊 waterFlow — haritanın nehir/göl yüzeyine "hafif akan su" görünümü verir.
//
// NEDEN AYRI ELE ALINIYOR: su mesh'leri haritanın kendi dokusuyla (REPEAT
// sarmalı) geliyor, ama zemin geçişi (`normalizeGroundMaterial`) onları da mat,
// kuru bir yüzeye çeviriyordu. Burada su yüzeyleri zemin dilinden AYIRILIR:
//
//   · UV KAYDIRMA   — mevcut su dokusu yavaşça kayar (doku zaten REPEAT olduğu
//                     için dikişsiz akar). Görselin kendisi değişmez.
//   · DALGA         — akış ekseni boyunca ilerleyen iki sinüs + çapraz bir
//                     üçüncü: yüzeyde sürekli gezinen kırışıklık.
//   · SHEEN         — dalga tepelerinde roughness düşer: çevre ışığından gelen
//                     parıltı suyun üzerinde gezinen bir ışık şeridi olur.
//   · Islak materyal — düşük roughness, ölçülü çevre yansıması.
//
// TAMAMEN GÖRSELDİR: engel/yürünebilirlik ızgarası geometriden kurulur
// (BattleMapModel.buildCollisionGrid), bu modül ona hiç dokunmaz. Hasar,
// cooldown, menzil ve ağ da etkilenmez.
//
// Ayarlar: aşağıdaki `FLOW_*` sabitleri. 0 verirseniz su tamamen durur.
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

/** Su yüzeyi sayılan mesh adları (grid kurucusundaki `isWater` ile aynı dil). */
const WATER_NAME_RE = /(?:water|river|stream|lake|pond)/i;

/** Genel hız çarpanı (1 = ölçülü). 0 → su tamamen durgun. */
const FLOW = 1;
/** Doku kayma hızı (UV/sn). Bir doku karesi ~30 sn'de akar → "hafif akış". */
const FLOW_UV_U = 0.03;
const FLOW_UV_V = 0.045;
/** Dalga tepelerinin parlama şiddeti (0..1) — bloom'u tetiklemeyecek kadar az. */
const WAVE_SHEEN = 0.55;
/** Dalga tepelerinde roughness düşüşü (parlak/ıslak okunur). */
const WAVE_GLOSS = 0.34;
/** Dalga zaman ölçeği (1 = yukarıdaki sinüs hızları). */
const WAVE_TIME = 1;

/**
 * TÜM su materyallerinin paylaştığı uniform bloğu. Tek sürücü (`WaterFlow`)
 * zamanı ilerletir; materyaller bu nesneyi REFERANSLA kullanır — kopya yok,
 * yani binlerce mesh olsa da tek yazma yeter.
 */
export const waterUniforms = {
  uWaterTime: { value: 0 },
  /**
   * Akış yönü (dünya XZ düzlemi, birim vektör). Haritanın koridoru kırmızı
   * üsten (8, 2) mavi üsse (26, 20) gittiği için nehir de bu çaprazda akar.
   */
  uWaterDir: { value: new THREE.Vector2(0.7071, 0.7071) },
};

/** Mesh (veya en fazla 3 üst düğümü) su adı taşıyor mu? */
export function isWaterSurface(mesh: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = mesh;
  for (let i = 0; node && i < 4; node = node.parent, i++) {
    if (node.name && WATER_NAME_RE.test(node.name)) return true;
  }
  return false;
}

/**
 * Su yüzeyi materyali: kaynak dokuyu/renkleri KORUYARAK akan su efektini
 * enjekte eder.
 *
 * ⚠️ ÖRNEK (instance) SEÇİMİ: haritada su materyali (`material_7`) bir ARAZİ
 * mesh'iyle PAYLAŞILIYOR. Paylaşılan materyali yerinde yamalarsak o arazi de
 * su gibi dalgalanırdı. Bu yüzden çizilen klonda su mesh'lerine bu fonksiyonun
 * ürettiği AYRI örnek takılır (`{ clone: true }`).
 */
export function makeFlowingWater(
  source: THREE.Material,
  opts: { clone?: boolean } = {},
): THREE.Material {
  const material = (
    opts.clone ? source.clone() : source
  ) as THREE.MeshStandardMaterial;
  // Islak yüzey: mat zeminden AYRI — su ışığı yakalar ve yansıtır.
  if (typeof material.roughness === "number") material.roughness = 0.42;
  if (typeof material.metalness === "number") material.metalness = 0.04;
  if (typeof material.envMapIntensity === "number") {
    material.envMapIntensity = 0.7;
  }
  if (material.emissive) {
    // Çok hafif su ışıması: derinlik hissi (bloom eşiğinin altında kalır).
    material.emissive.setRGB(0.01, 0.05, 0.06);
    if (typeof material.emissiveIntensity === "number") {
      material.emissiveIntensity = 0.45;
    }
  }
  material.userData = { ...material.userData, vaelosWater: true };
  /** Işık alan (standart/fiziksel) materyal mi? Roughness modülasyonu ona özel. */
  const lit = typeof material.roughness === "number";

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterUniforms.uWaterTime;
    shader.uniforms.uWaterDir = waterUniforms.uWaterDir;

    // ── VERTEX: dünya konumu (dalga deseni dünyada sabit kalır, mesh'in
    //    kendi UV'sine bağlı değildir) + dokunun kayan UV'si.
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWaterWorld;
        uniform float uWaterTime;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vWaterWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        #ifdef USE_MAP
          // Su dokusu yavaşça akar (harita dokusu REPEAT sarmalıdır → dikişsiz).
          vMapUv -= vec2( uWaterTime * ${FLOW_UV_U.toFixed(4)}, uWaterTime * ${FLOW_UV_V.toFixed(4)} );
        #endif`,
      );

    // ── FRAGMENT: gezinen dalga + ıslak parlaklık.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWaterWorld;
        uniform float uWaterTime;
        uniform vec2 uWaterDir;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        // AKAN SU: akış ekseni boyunca ilerleyen iki sinüs + çapraz bir
        // üçüncü. Doku ve renk aynen kalır; yalnızca aydınlanma dalgalanır.
        float waterAxis = dot( vWaterWorld.xz, uWaterDir );
        float waterCross = ( vWaterWorld.x - vWaterWorld.z ) * 0.6;
        float wt = uWaterTime * ${WAVE_TIME.toFixed(2)};
        float w1 = sin( waterAxis * 2.1 - wt * 1.15 );
        float w2 = sin( waterAxis * 5.4 - wt * 2.05 );
        float w3 = sin( waterCross * 3.3 + wt * 0.75 );
        float waterWave = w1 * 0.5 + w2 * 0.28 + w3 * 0.22;
        float waterSheen = smoothstep( 0.10, 0.95, waterWave );
        diffuseColor.rgb *= 0.95 + 0.10 * ( waterWave * 0.5 + 0.5 );
        diffuseColor.rgb += vec3( 0.07, 0.13, 0.15 ) * waterSheen * ${WAVE_SHEEN.toFixed(2)};`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        lit
          ? `#include <roughnessmap_fragment>
        // Dalga tepeleri ıslak/parlak, çukurlar mat: gezinen ışık şeridi.
        roughnessFactor = clamp( roughnessFactor - waterSheen * ${WAVE_GLOSS.toFixed(2)}, 0.10, 1.0 );`
          : `#include <roughnessmap_fragment>`,
      );
  };
  // Yamalı materyal, aynı parametrelere sahip başka bir materyalle AYNI
  // programı paylaşmasın (paylaşırsa efekt yanlış mesh'lerde görünür).
  material.customProgramCacheKey = () => "vaelos-water-flow";
  material.needsUpdate = true;
  return material;
}

/**
 * Sahnedeki TÜM su yüzeylerine akan su materyalini takar (tek sefer).
 *
 * NEDEN SAHNE ÜZERİNDEN: haritanın çizilen kopyası `SkeletonUtils.clone` ile
 * üretiliyor ve su materyali bir arazi mesh'iyle paylaşılıyor. Su mesh'lerine
 * AYRI materyal örneği takmak için o kopyanın içinde dolaşmak gerekir; sahne
 * kökünden bakmak, haritanın hangi ara bileşende kopyalandığından bağımsız
 * olarak doğru mesh'leri bulur (isim eşleşmesi: nehir/göl/su).
 */
function attachFlowingWater(scene: THREE.Object3D): boolean {
  let found = false;
  let patched = 0;
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (!isWaterSurface(mesh)) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // Zaten yamalıysa tekrar sarmalanmaz (areneye yeniden girişte birikme yok).
    if (list.some((entry) => entry.userData?.vaelosWater)) {
      found = true;
      return;
    }
    found = true;
    patched += 1;
    mesh.material = Array.isArray(mesh.material)
      ? list.map((entry) => makeFlowingWater(entry, { clone: true }))
      : makeFlowingWater(list[0], { clone: true });
  });
  // Teşhis: yalnızca gerçekten yamandığı karede yazılır (ilk buluştan sonra
  // arama tamamen durduğu için tekrar etmez) — akışın bağlandığının kanıtı.
  if (patched > 0) {
    console.log(
      `[waterFlow] ${patched} su yüzeyi akan-su materyaline bağlandı ` +
        `(uv hızı ${FLOW_UV_U}/${FLOW_UV_V}, dalga ×${WAVE_TIME})`,
    );
  }
  return found;
}

/**
 * Su akışını sürer: paylaşılan zaman uniform'unu ilerletir ve ilk karede su
 * yüzeylerine akan su materyalini takar. Tek `useFrame` yeterlidir — kaç su
 * mesh'i olursa olsun kare maliyeti aynıdır. Canvas içine render edilmelidir
 * (MapPalette bunu yapar).
 */
export function WaterFlow(): null {
  const scene = useThree((state) => state.scene);
  // Harita aynı Suspense içinde geldiği için ilk karede hazırdır; yine de
  // yüklenme sırası değişirse diye ilk saniye boyunca yeniden denenir ve su
  // bulunur bulunmaz arama tamamen durur (kare maliyeti ~0).
  const tries = useRef(0);
  useFrame((_, dt) => {
    if (tries.current < 240) {
      tries.current += 1;
      if (attachFlowingWater(scene)) tries.current = 240;
    }
    if (FLOW <= 0) return;
    // Kare atlamalarında (sekme arka plana alındığında) akış zıplamasın.
    waterUniforms.uWaterTime.value += Math.min(dt, 0.05) * FLOW;
  });
  return null;
}
