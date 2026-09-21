// ✨ CharacterRimLight — dövüşçülerin DIŞ HATTINI parlayan kenar ışığı (rim).
//
// Wild Rift'te şampiyonların siluetinde arkadan vuran tatlı bir ışık şeridi
// gezer: karakter hangi zeminde durursa dursun kadrajdan "pırıl pırıl" ayrılır
// ve zemine yapışık okunmaz. Aynı etki burada GERÇEK BİR IŞIK KAYNAĞI
// eklemeden, materyal gölgelendiricisine Fresnel terimi enjekte edilerek
// kurulur:
//
//     rim = ( 1 − dot( normalize( vViewPosition ), normal ) ) ^ RIM_POWER
//
// Yüzey kameraya dönükken (dot ≈ 1) terim 0 olur; siluette (dot ≈ 0)
// maksimuma çıkar — yani ışık tam olarak karakterin KENARINA düşer. Sonuç
// `totalEmissiveRadiance`'a eklenir, dolayısıyla:
//
//   • Sahnenin ışık sayısı ARTMAZ. Nokta/yönlü ışık eklemenin aksine kare
//     maliyeti yoktur; dokunmatik cihazlarda da açık kalabilir.
//   • Gölge/ışık hesabını bozmaz: gövde yine haritanın ışığıyla aydınlanır,
//     kenar yalnızca üstüne biner (karakter "kendi kendine" parlamaz).
//   • Şiddet bloom eşiğinin (0.8) ALTINDA tutulur: kenar canlı okunur ama
//     efekt katmanları gibi ekranı kapatmaz.
//
// Şiddet/keskinlik aşağıdaki RIM_* sabitlerindedir; RIM_STRENGTH = 0 verirseniz
// kenar ışığı tamamen söner.
//
// KLON NOTU: `Material.clone()` (ve `applyCharacterTint` içindeki boyama
// klonu) `onBeforeCompile`'ı KOPYALAMAZ. Bu yüzden yama, boyama/klonlama
// bittikten SONRA uygulanmalıdır (bkz. Arena3D → GlbFighterBodyCore). Aynı
// materyale iki kez yama uygulanmasın diye takip WeakSet ile yapılır:
// yeni klonlar "yama yok" sayılır, mevcut örnekler atlanır.
import * as THREE from "three";

/** Kenar ışığının keskinliği: büyük değer = daha ince, jilet gibi bir şerit. */
const RIM_POWER = 2.35;
/** Kenar ışığının şiddeti (bloom eşiğinin altında). 0 → tamamen kapalı. */
const RIM_STRENGTH = 0.42;
/** Renk seçilmemiş karakterlerin kenar ışığı: hafif buzlu beyaz. */
const RIM_NEUTRAL = "#dcefff";

/** Yaması uygulanmış materyaller (klonlar temiz başlar). */
const RIM_PATCHED = new WeakSet<THREE.Material>();

/**
 * Kenar ışığı rengi: karakterin seçtiği renk varsa onun BERRAK/parlak hâli,
 * yoksa nötr buzlu beyaz. Koyu bir gövde rengi seçilse bile kenar ışığı
 * "pırıl pırıl" okunmalı, bu yüzden parlaklık (L) zorlanır; ton (H) korunur —
 * böylece kenar, karakterin kimliğini taşır.
 */
export function characterRimColor(tint?: string | null): THREE.Color {
  if (!tint) return new THREE.Color(RIM_NEUTRAL);
  const base = new THREE.Color(tint);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  return new THREE.Color().setHSL(
    hsl.h,
    Math.min(1, hsl.s * 0.85 + 0.3),
    0.72,
  );
}

/** Tek bir materyale kenar ışığı yamasını uygular (idempotent). */
function patchMaterial(source: THREE.Material, color: THREE.Color): boolean {
  const material = source as THREE.MeshStandardMaterial;
  // `MeshPhysicalMaterial` da isMeshStandardMaterial'dır; ikisi de
  // `normal_fragment_begin` + `emissivemap_fragment` zincirini taşır.
  if (!material.isMeshStandardMaterial) return false;
  if (RIM_PATCHED.has(material)) return false;

  const r = color.r.toFixed(4);
  const g = color.g.toFixed(4);
  const b = color.b.toFixed(4);
  const power = RIM_POWER.toFixed(2);
  const strength = RIM_STRENGTH.toFixed(3);

  material.onBeforeCompile = (shader) => {
    // Standart/fiziksel gölgelendiricilerde ikisi de daima vardır; yine de
    // beklenmedik bir materyalde shader'a dokunmadan çıkılır (güvenli yama).
    if (!shader.fragmentShader.includes("#include <emissivemap_fragment>"))
      return;
    if (!shader.fragmentShader.includes("vViewPosition")) return;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      // KENAR IŞIĞI (rim light): normal ile göz vektörü arasındaki açı
      // büyüdükçe — yani siluete doğru — parlayan Fresnel terimi.
      {
        float rimFacing = clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 );
        float rimK = pow( 1.0 - rimFacing, ${power} );
        totalEmissiveRadiance += vec3( ${r}, ${g}, ${b} ) * ( rimK * ${strength} );
      }`,
    );
  };
  // Renk başına ayrı program: farklı renkteki dövüşçüler aynı derlenmiş
  // programı paylaşıp birbirinin kenar rengini almasın.
  material.customProgramCacheKey = () => `vaelos-rim-${r}-${g}-${b}`;
  RIM_PATCHED.add(material);
  material.needsUpdate = true;
  return true;
}

/**
 * Bir karakter kökünün (klonun) tüm ışık alan materyallerine kenar ışığını
 * uygular. Dönüş: yamalanan materyal sayısı (teşhis/QA için).
 *
 * Sıralama: boyama (`applyCharacterTint`) ve ekipman bağlama bittikten SONRA
 * çağrılır — o adımlar materyalleri klonlayabildiği için yama en sonda
 * uygulanmazsa klonlarda kaybolur.
 */
export function applyCharacterRimLight(
  root: THREE.Object3D,
  color: THREE.Color,
): number {
  let patched = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const entry of list) {
      if (patchMaterial(entry, color)) patched += 1;
    }
  });
  return patched;
}
