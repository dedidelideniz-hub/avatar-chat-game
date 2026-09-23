import * as THREE from "three";

export interface HeldEquipmentOptions {
  /** Desired visible body diameter in world units. */
  targetWorldSpan: number;
  /** Measured body diameter in the source model's local units. */
  sourceSpan: number;
  /** Combined scale of the equipment's parent chain, excluding the model. */
  parentWorldScale?: number;
}

export interface HeldEquipmentResult {
  /** Local uniform scale applied to the model root. */
  modelScale: number;
  /** Per-instance materials created here; dispose these when detaching the model. */
  materials: THREE.Material[];
}

/**
 * Normalize a GLB prop to a predictable world-space size and make every part
 * render reliably when attached to an animated hand bone. Materials are
 * cloned per instance before editing so shared GLTF caches/other characters
 * are not modified.
 */
export function prepareHeldEquipment(
  root: THREE.Object3D,
  { targetWorldSpan, sourceSpan, parentWorldScale = 1 }: HeldEquipmentOptions,
): HeldEquipmentResult {
  const denominator = Math.max(sourceSpan * parentWorldScale, 1e-9);
  const modelScale = targetWorldSpan / denominator;
  root.scale.setScalar(modelScale);

  const materialClones = new Map<THREE.Material, THREE.Material>();
  const getPresentedMaterial = (source: THREE.Material): THREE.Material => {
    const cached = materialClones.get(source);
    if (cached) return cached;

    const material = source.clone();
    if (material instanceof THREE.MeshStandardMaterial && !/fuse|fitil|wick|glow|flame|fire|ember|spark|alev/i.test(material.name)) {
      if (material.emissiveMap) {
        // Keep the GLB's emissive texture and authored strength; a warm near-white
        // tint adds a subtle readable warmth without washing out its artwork.
        material.emissive.set("#fff0df");
        material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.35);
      } else {
        material.emissive.set("#ff5420");
        material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.28);
      }
    }

    materialClones.set(source, material);
    return material;
  };

  root.traverse((object) => {
    object.visible = true;
    object.frustumCulled = false;
    object.userData.isEquipment = true;

    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(getPresentedMaterial)
      : getPresentedMaterial(mesh.material);
  });

  root.updateMatrixWorld(true);
  return { modelScale, materials: [...materialClones.values()] };
}
