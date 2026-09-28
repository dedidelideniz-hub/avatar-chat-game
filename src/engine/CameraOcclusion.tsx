/**
 * KAMERA OCCLUSION — sahne bileşeni (React kabuğu).
 *
 * Matematik `buildingOcclusion.ts` içinde (saf, test edilebilir). Bu bileşen
 * yalnızca bağlantıyı kurar:
 *   · binalar sahneye girdikten sonra bir kez indekslenir (malzeme izolasyonu
 *     + kaba küreler),
 *   · her karede ışın(lar) yeniden atılır ve opaklıklar yumuşakça güncellenir.
 *
 * `<FollowCamera />`den SONRA render edilir: ışın, kameranın bu karedeki
 * (oyuncuyu takip etmiş) gerçek konumundan atılmalı.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { S, WORLD_WIDTH, WORLD_Z_MAX } from "./constants";
import {
  collectBuildingOccluders,
  resetOccluders,
  updateCameraOcclusion,
  type BuildingOccluder,
} from "./buildingOcclusion";

export function CameraOcclusion({
  playerPosRef,
  isMobile = false,
}: {
  playerPosRef: React.RefObject<{ x: number; y: number }>;
  /** Mobilde ışın iki karede bir atılır (geçiş yine her karede akıcı). */
  isMobile?: boolean;
}) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const occludersRef = useRef<BuildingOccluder[]>([]);
  const frameRef = useRef(0);

  useEffect(() => {
    occludersRef.current = collectBuildingOccluders(scene);
    return () => {
      // Sahne kapanırken binalar tam opak kalsın (yeniden bağlanınca
      // yarı saydam bir bina ile başlamayalım).
      resetOccluders(occludersRef.current);
      occludersRef.current = [];
    };
  }, [scene]);

  useFrame((_, dt) => {
    const occluders = occludersRef.current;
    if (occluders.length === 0) return;

    frameRef.current += 1;
    const castRays = !isMobile || frameRef.current % 2 === 0;
    const p = playerPosRef.current;

    updateCameraOcclusion(
      occluders,
      camera.position,
      { x: p.x / S - WORLD_WIDTH / 2, z: WORLD_Z_MAX - p.y / S },
      dt,
      castRays,
    );
  });

  return null;
}
