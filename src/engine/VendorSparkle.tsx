import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Satıcı parıltısı (sim efekti).
 *
 * Caddedeki satıcı NPC'lerin etrafında yukarı süzülen, dönerek parlayan
 * yıldız tozları. Kaynak dosyası yok — 4 köşeli yıldız dokusu canvas'ta
 * runtime'da üretilir, bu yüzden mobilde indirilecek ekstra asset yoktur.
 *
 * Additive + depthWrite kapalı olduğu için karakterin arkasında ve önünde
 * doğal bir ışıltı gibi görünür; malzeme paylaşılmaz (her satıcı kendi
 * spritelarına sahip).
 */
function makeSparkTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(c);
  const pad = 4;
  // Yumuşak hale
  const glow = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  glow.addColorStop(0, "rgba(255,255,255,0.95)");
  glow.addColorStop(0.28, "rgba(255,236,170,0.55)");
  glow.addColorStop(1, "rgba(255,200,80,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  // 4 köşeli yıldız kolları
  ctx.fillStyle = "rgba(255,255,255,0.98)";
  ctx.beginPath();
  ctx.moveTo(pad, size / 2);
  ctx.lineTo(size - pad, size / 2);
  ctx.lineTo(size / 2, pad);
  ctx.lineTo(size / 2, size - pad);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.moveTo(size / 2 - 5, size / 2);
  ctx.lineTo(size / 2, size / 2 - 5);
  ctx.lineTo(size / 2 + 5, size / 2);
  ctx.lineTo(size / 2, size / 2 + 5);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function VendorSparkle({
  count = 9,
  radius = 0.42,
  height = 1.7,
  color = "#ffe9a8",
}: {
  count?: number;
  radius?: number;
  height?: number;
  color?: string;
}) {
  const group = useRef<THREE.Group>(null);
  const texture = useMemo(makeSparkTexture, []);

  useEffect(() => () => texture.dispose(), [texture]);

  // Her kıvılcımın yörüngesi sabit (rastgele ama bir kez üretilir) —
  // kare başına yeni değer üretmek yerine faz kaydırarak animasyon yapılır.
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2 + Math.random() * 0.6,
        orbit: radius * (0.55 + Math.random() * 0.75),
        start: Math.random(),
        rise: 0.22 + Math.random() * 0.3,
        size: 0.1 + Math.random() * 0.11,
        phase: Math.random() * Math.PI * 2,
      })),
    [count, radius],
  );

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < g.children.length; i++) {
      const seed = seeds[i];
      const sprite = g.children[i] as THREE.Sprite;
      if (!seed || !sprite) continue;
      const p = (seed.start + t * seed.rise) % 1; // 0 → 1 yukarı süzülme
      const angle = seed.angle + t * 0.7;
      const orbit = seed.orbit * (1 - p * 0.3);
      sprite.position.set(
        Math.cos(angle) * orbit,
        p * height,
        Math.sin(angle) * orbit,
      );
      const twinkle = 0.55 + 0.45 * Math.sin(t * 6 + seed.phase);
      const mat = sprite.material as THREE.SpriteMaterial;
      mat.opacity = Math.sin(p * Math.PI) * twinkle;
      sprite.scale.setScalar(seed.size * (0.7 + 0.55 * twinkle));
    }
  });

  return (
    <group ref={group}>
      {seeds.map((seed, i) => (
        <sprite key={i}>
          <spriteMaterial
            map={texture}
            color={color}
            transparent
            opacity={0.85}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}
