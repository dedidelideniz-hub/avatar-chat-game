import { GlbCharacterPortrait } from "@/engine/GlbAvatar3D";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Oyun girişindeki 3D karakter sahnesi.
 *
 * Oyun içi avatarla AYNI rigged GLB modeli kullanılır (kuşanılmış eşyalar
 * dahil), üzerine oyuncunun seçtiği "karakter rengi" boyanır ve karakter
 * karanlık bir MOBA kaidesinde durur: renkli rün halkası, ışık sütunu ve
 * zemine vuran renk parıltısı. Böylece renk seçimi anında okunur.
 *
 * Sahne tek bir Canvas'tır ve gameplay koduna hiç dokunmaz — giriş
 * ekranından çıkıldığında tamamen söküllür.
 */
function RuneRing({ color }: { color: string }) {
  const group = useRef<THREE.Group>(null);
  const ticks = useMemo(() => new Array(12).fill(0), []);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.35;
  });
  return (
    <group ref={group} position={[0, 0.03, 0]}>
      {ticks.map((_, i) => {
        const angle = (i / ticks.length) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * 1.02, 0, Math.sin(angle) * 1.02]}
            rotation={[0, -angle, 0]}
          >
            <boxGeometry args={[0.05, 0.02, 0.16]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={i % 2 === 0 ? 0.9 : 0.4}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Aura({ color }: { color: string }) {
  const inner = useRef<THREE.Mesh>(null);
  const outer = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (inner.current) {
      const s = 1 + Math.sin(t * 1.6) * 0.03;
      inner.current.scale.set(s, 1, s);
    }
    if (outer.current) {
      const m = outer.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.22 + Math.sin(t * 1.6 + 1) * 0.12;
    }
  });
  return (
    <group>
      {/* kaide */}
      <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.28, 48]} />
        <meshBasicMaterial color="#05070f" transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[1.18, 1.3, 0.09, 48]} />
        <meshStandardMaterial
          color="#0d1526"
          metalness={0.72}
          roughness={0.34}
        />
      </mesh>
      {/* iç halka — karakterin ayak izi */}
      <mesh ref={inner} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.86, 0.95, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.85}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* dış halka — nefes alan parıltı */}
      <mesh ref={outer} position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.14, 1.24, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <RuneRing color={color} />
      {/* ışık sütunu */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.42, 0.62, 3, 28, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function EntryCharacterStage({
  equipped = [],
  color,
  spin = true,
  className,
}: {
  equipped?: string[];
  color: string;
  spin?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 1.05, 4.3], fov: 38 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
        onCreated={({ gl }) => {
          // Bu sahne oyun dünyasının canvas'ıyla aynı sayfada yaşamaz ama
          // mobil tarayıcı bağlam kaybında siyah kare bırakmasın.
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
          });
        }}
      >
        <ambientLight intensity={0.55} />
        <hemisphereLight args={["#8fb6ff", "#120c06", 0.5]} />
        <directionalLight position={[2.6, 4.4, 3.4]} intensity={1.35} />
        {/* Seçilen renk karakterin arkasından vurur (rim light) + kaide parıltısı */}
        <pointLight position={[-1.6, 2.2, -2.2]} intensity={9} distance={9} color={color} />
        <pointLight position={[0, 0.3, 0]} intensity={4.5} distance={4} color={color} />
        <fog attach="fog" args={["#05070f", 7, 14]} />
        <Suspense fallback={null}>
          <group position={[0, 0, 0]}>
            <GlbCharacterPortrait
              equipped={equipped}
              height={2.15}
              spin={spin}
              tint={color}
            />
          </group>
        </Suspense>
        <Aura color={color} />
      </Canvas>
    </div>
  );
}
