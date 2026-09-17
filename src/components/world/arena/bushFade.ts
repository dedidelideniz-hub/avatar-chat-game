// 🌿 Çalı görünürlüğü (bush stealth) — Arena3D dosya boyutu için modüle taşındı.
//
// Arena3D baş-üstü HUD ve efekt katmanlarıyla 75 KB'yi aştığı için bu yardımcı
// ayrı dosyaya alındı; Arena3D onu eskisi gibi içe aktarıp yeniden dışa aktarır,
// böylece mevcut çağrılar değişmeden çalışır.
import * as THREE from "three";

/**
 * Apply bush visibility to every mesh in a fighter's current hierarchy.
 * GLTFLoader can return shared material instances, so clone each material
 * before changing opacity and force the shader to pick up the new flags.
 */
export function applyBushTransparency(
  characterGroup: THREE.Object3D,
  isInBush: boolean,
) {
  characterGroup.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const current = mesh.material;
    const materials = Array.isArray(current)
      ? current.map((material) => {
          if (material.userData._bushMaterialClone) return material;
          const unique = material.clone();
          unique.userData._bushMaterialClone = true;
          return unique;
        })
      : [
          current.userData._bushMaterialClone
            ? current
            : Object.assign(current.clone(), {
                userData: {
                  ...current.userData,
                  _bushMaterialClone: true,
                },
              }),
        ];
    mesh.material = Array.isArray(current) ? materials : materials[0];
    for (const material of materials) {
      material.transparent = isInBush;
      material.opacity = isInBush ? 0.4 : 1;
      material.needsUpdate = true;
    }
  });
}
