// 🧍 Prosedürel düşük-poligon dövüşçü gövdesi.
//
// GLB karakter akışı hazır olana kadar gösterilir ve GLB indirilemezse kalıcı
// yedek olarak kalır. Renkler oyuncunun avatar konfigürasyonundan gelir
// (deri/saç/gömlek/pantolon/ayakkabı), böylece herkes kendi görünümünü korur.
//
// Arena3D.tsx 70 KB sınırına dayandığı için bu JSX modüle taşındı; rig'in
// animasyon ref'leri (bob/legL/legR/armL/armR) prop olarak bağlanır, yani
// yürüme/koşma sallanması aynen çalışmaya devam eder.
import { RoundedBox } from "@react-three/drei";
import type { MutableRefObject } from "react";
import type * as THREE from "three";
import type { AvatarConfig } from "@/lib/avatar";
import { BODY_SCALE_GAIN } from "./shared";

/** Yedek/prosedürel gövde GLB karakteriyle AYNI boyda çizilir (aynı
 *  `BODY_SCALE_GAIN`): yoksa model akışı sırasında — ya da GLB hiç
 *  yüklenemediğinde — karakter bir anda yarı boya düşerdi. */
export function ProceduralBody({
  c,
  bob,
  legL,
  legR,
  armL,
  armR,
}: {
  c: AvatarConfig;
  bob: MutableRefObject<THREE.Group | null>;
  legL: MutableRefObject<THREE.Group | null>;
  legR: MutableRefObject<THREE.Group | null>;
  armL: MutableRefObject<THREE.Group | null>;
  armR: MutableRefObject<THREE.Group | null>;
}) {
  return (
    <group ref={bob} scale={BODY_SCALE_GAIN}>
      {/* legs + shoes */}
      <group ref={legL} position={[0, 0.5, 0.1]}>
        <RoundedBox
          args={[0.18, 0.52, 0.2]}
          radius={0.06}
          position={[0, -0.26, 0]}
        >
          <meshStandardMaterial color={c.pants} roughness={0.9} />
        </RoundedBox>
        <RoundedBox
          args={[0.2, 0.12, 0.32]}
          radius={0.045}
          position={[0, -0.54, 0.03]}
        >
          <meshStandardMaterial color={c.shoes} roughness={0.55} />
        </RoundedBox>
      </group>
      <group ref={legR} position={[0, 0.5, -0.1]}>
        <RoundedBox
          args={[0.18, 0.52, 0.2]}
          radius={0.06}
          position={[0, -0.26, 0]}
        >
          <meshStandardMaterial color={c.pants} roughness={0.9} />
        </RoundedBox>
        <RoundedBox
          args={[0.2, 0.12, 0.32]}
          radius={0.045}
          position={[0, -0.54, 0.03]}
        >
          <meshStandardMaterial color={c.shoes} roughness={0.55} />
        </RoundedBox>
      </group>
      {/* torso */}
      <RoundedBox
        args={[0.54, 0.6, 0.3]}
        radius={0.13}
        position={[0, 0.8, 0]}
        castShadow
      >
        <meshStandardMaterial color={c.shirt} roughness={0.85} />
      </RoundedBox>
      {/* arms + hands */}
      <group ref={armL} position={[0.33, 0.88, 0]}>
        <RoundedBox
          args={[0.16, 0.54, 0.18]}
          radius={0.07}
          position={[0, -0.27, 0]}
        >
          <meshStandardMaterial color={c.shirt} roughness={0.85} />
        </RoundedBox>
        <mesh position={[0, -0.52, 0]}>
          <sphereGeometry args={[0.09, 10, 10]} />
          <meshStandardMaterial color={c.skin} roughness={0.8} />
        </mesh>
      </group>
      <group ref={armR} position={[-0.33, 0.88, 0]}>
        <RoundedBox
          args={[0.16, 0.54, 0.18]}
          radius={0.07}
          position={[0, -0.27, 0]}
        >
          <meshStandardMaterial color={c.shirt} roughness={0.85} />
        </RoundedBox>
        <mesh position={[0, -0.52, 0]}>
          <sphereGeometry args={[0.09, 10, 10]} />
          <meshStandardMaterial color={c.skin} roughness={0.8} />
        </mesh>
      </group>
      {/* head */}
      <group position={[0, 1.3, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.2, 20, 20]} />
          <meshStandardMaterial color={c.skin} roughness={0.75} />
        </mesh>
        {/* gozler + goz bebekleri */}
        {[0.075, -0.075].map((sx) => (
          <group key={sx} position={[sx, 0.03, 0.15]}>
            <mesh>
              <sphereGeometry args={[0.05, 10, 10]} />
              <meshStandardMaterial color="#ffffff" roughness={0.3} />
            </mesh>
            <mesh position={[0, 0, 0.035]}>
              <sphereGeometry args={[0.024, 8, 8]} />
              <meshStandardMaterial color="#1f2937" roughness={0.2} />
            </mesh>
          </group>
        ))}
        {/* eyebrows */}
        {[0.075, -0.075].map((sx) => (
          <mesh key={sx} position={[sx, 0.095, 0.165]}>
            <boxGeometry args={[0.075, 0.02, 0.02]} />
            <meshStandardMaterial color={c.hairColor} roughness={0.8} />
          </mesh>
        ))}
        {/* mouth */}
        <mesh position={[0, -0.3, 0.19]}>
          <boxGeometry args={[0.1, 0.022, 0.02]} />
          <meshStandardMaterial color="#8a4a3a" roughness={0.7} />
        </mesh>
        {/* hair styles */}
        {c.hair !== "none" && (
          <group>
            <mesh position={[0, 0.17, 0]} scale={[1.02, 0.72, 1.02]}>
              <sphereGeometry args={[0.2, 18, 18]} />
              <meshStandardMaterial color={c.hairColor} roughness={0.9} />
            </mesh>
            {c.hair === "spiky" &&
              Array.from({ length: 6 }).map((_, i) => {
                const a = (i / 6) * Math.PI * 2;
                return (
                  <mesh
                    key={i}
                    position={[Math.cos(a) * 0.13, 0.3, Math.sin(a) * 0.13]}
                    rotation={[Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4]}
                  >
                    <coneGeometry args={[0.055, 0.26, 8]} />
                    <meshStandardMaterial color={c.hairColor} roughness={0.9} />
                  </mesh>
                );
              })}
            {c.hair === "long" && (
              <mesh position={[0, -0.12, -0.17]}>
                <boxGeometry args={[0.34, 0.62, 0.13]} />
                <meshStandardMaterial color={c.hairColor} roughness={0.9} />
              </mesh>
            )}
            {c.hair === "curly" &&
              Array.from({ length: 8 }).map((_, i) => {
                const a = (i / 8) * Math.PI * 2;
                return (
                  <mesh
                    key={i}
                    position={[Math.cos(a) * 0.12, 0.26, Math.sin(a) * 0.12]}
                  >
                    <sphereGeometry args={[0.085, 10, 10]} />
                    <meshStandardMaterial
                      color={c.hairColor}
                      roughness={0.95}
                    />
                  </mesh>
                );
              })}
            {c.hair === "bob" &&
              [0.17, -0.17].map((sx) => (
                <mesh key={sx} position={[sx, -0.08, 0]}>
                  <boxGeometry args={[0.13, 0.38, 0.34]} />
                  <meshStandardMaterial color={c.hairColor} roughness={0.9} />
                </mesh>
              ))}
          </group>
        )}
      </group>
    </group>
  );
}
