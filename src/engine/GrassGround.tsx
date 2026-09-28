/**
 * ÇİM ZEMİN — `public/models/grass_ground.glb` karolarıyla döşenmiş zemin.
 *
 * Eski kodla çizilen düz renkli / satranç (grid) dokulu çim düzlemleri
 * kaldırıldı; zemin artık gerçek modelden geliyor. Model 4×4 birimlik düz bir
 * zemindir ve KENDİ boyutu kadar adımla döşenir → kenarlar tam uç uca gelir,
 * boşluk kalmaz (doku 1024², kenar uyumu ~11/255 → dikiş görünmez).
 *
 * PERFORMANS: karolar tek `InstancedMesh` içinde çizilir (bu sahnede 54 örnek,
 * 2 üçgen/karo) → zemin **tek draw call**. Geometri/materyal modeller arasında
 * paylaşılır, örnek başına klon yoktur.
 */
import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { GRASS_GROUND_ZONES } from "./constants";
import {
  GRASS_GROUND_URL,
  buildGrassGroundPlacements,
  prepareGrassGround,
} from "./grassGroundPrep";

/** Model/döşeme hazırlığı — `useGLTF` önbelleği asla değiştirilmez (klonlanır). */
function useGrassGroundTile() {
  const { scene } = useGLTF(GRASS_GROUND_URL);
  const tile = useMemo(() => prepareGrassGround(scene), [scene]);

  useEffect(
    () => () => {
      for (const item of tile.owned) item.dispose();
    },
    [tile.owned],
  );

  useEffect(() => {
    const { report, size } = tile;
    console.info(
      `[çim zemin] ${GRASS_GROUND_URL} · ${report.sourceMeshes} mesh → ${report.triangles} üçgen · ` +
        `karo ${size.x.toFixed(2)}×${size.z.toFixed(2)} birim · ` +
        `normal ${report.normalUp ? "+Y ✔" : "düzeltildi ✔"} · ` +
        `dokular: ${report.maps.join(", ") || "yok"}` +
        `${report.metalnessFixed ? " · metalness 0'a çekildi" : ""}`,
    );
  }, [tile]);

  return tile;
}

function GrassGroundMesh() {
  const tile = useGrassGroundTile();
  const ref = useRef<THREE.InstancedMesh>(null);

  const { placements } = useMemo(
    () => buildGrassGroundPlacements(tile, GRASS_GROUND_ZONES),
    [tile],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    placements.forEach((p, i) => {
      position.set(p.x, p.y, p.z);
      matrix.compose(position, quat, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    // Karolar sahneye yayıldığı için kaba küre örnek matrislerinden hesaplanmalı.
    mesh.computeBoundingSphere();
  }, [placements]);

  if (placements.length === 0) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[tile.geometry, tile.material, placements.length]}
      receiveShadow
    />
  );
}

/**
 * Model bozuksa/indirilemezse SADECE zemin katmanı düşer; yol, kaldırım ve
 * caddenin geri kalanı çalışmaya devam eder. İlkel yedek zemin ÇİZİLMEZ
 * (istem: "kodla oluşturulan çim plane yapısını tamamen sil").
 */
class GrassGroundBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[çim zemin] ${GRASS_GROUND_URL} yüklenemedi:`, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function GrassGround() {
  return (
    <GrassGroundBoundary>
      <Suspense fallback={null}>
        <GrassGroundMesh />
      </Suspense>
    </GrassGroundBoundary>
  );
}

/* İndirme, sahne kurulmadan önce başlasın (cadde zeminsiz görünmesin). */
useGLTF.preload(GRASS_GROUND_URL);
