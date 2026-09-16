// ArenaPostFx — savaş alanının GERÇEK bloom (neon ışıma) katmanı.
//
// Referanstaki görüntüdeki gibi lav nehirlerinin, kor havuzlarının, yetenek
// ışınlarının ve mavi üs kristalinin etrafa taşarak parlaması için sahne artık
// doğrudan ekrana değil bir EffectComposer zincirinden geçer:
//
//   RenderPass → UnrealBloomPass → OutputPass
//
// * Bloom artık DENGELİ: eşik orta (0.62), şiddet orta (0.7), yarıçap 0.35.
//   Lav damarları, kristaller, lane kenar çizgileri, menzil halkaları ve
//   yetenek efektleri etraflarına ışık saçar; ama eşik yüksek kaldığı için
//   zemin/gövde gibi normal parlaklıktaki yüzeyler taşmaz ve kare "her yeri
//   saran sis"e dönüşmez.
// * OutputPass, tone mapping + sRGB dönüşümünü kapanışta yapar; three render
//   target'lara çizerken tone mapping'i kendisi kapatır (WebGLPrograms:
//   `currentRenderTarget === null ? toneMapping : NoToneMapping`), yani görüntü
//   iki kez tone map edilmez ve arenanın mevcut tonu aynen korunur.
//
// React Three Fiber notu: `useFrame(..., 1)` (öncelik > 0) R3F'in kendi
// otomatik çizimini devre dışı bırakır ve kareyi biz çizeriz — drei EffectComposer
// ile aynı desen. Bloom kurulamazsa (WebGL kısıtı vb.) hiçbir şey bozulmaz:
// sahne normal `gl.render` ile çizilmeye devam eder, arena 2D yedeğine düşmez.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Çalışan composer sayısı — hiçbiri yoksa sahneyi biz normal çizeriz. */
let workingComposers = 0;

/** Sahne bir kez mount edilir; yine de dokunmatik cihaz kontrolü için. */
function isCoarsePointer() {
  if (typeof window === "undefined") return false;
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

export function ArenaPostFx({
  strength = 0.7,
  radius = 0.35,
  threshold = 0.62,
}: {
  strength?: number;
  radius?: number;
  threshold?: number;
} = {}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const composerRef = useRef<EffectComposer | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const width = el.clientWidth || 1;
    const height = el.clientHeight || 1;
    // Dokunmatik cihazda çözünürlük 1.25x ile sınırlanır: bloom hedefleri
    // zaten yarı çözünürlükte hesaplandığı için görüntü netliği korunur,
    // kare maliyeti telefonda kabul edilebilir kalır. Masaüstünde cihazın
    // gerçek piksel oranı aynen kullanılır (görüntü eskisinden yumuşamaz).
    const pixelRatio = Math.min(
      gl.getPixelRatio(),
      isCoarsePointer() ? 1.25 : Infinity,
    );

    let composer: EffectComposer | null = null;
    try {
      composer = new EffectComposer(gl);
      composer.setPixelRatio(pixelRatio);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(
        new UnrealBloomPass(
          new THREE.Vector2(width, height),
          strength,
          radius,
          threshold,
        ),
      );
      composer.addPass(new OutputPass());
      composer.setSize(width, height);
      workingComposers += 1;
    } catch (error) {
      console.warn(
        "[Vaelos] Bloom kurulamadı, normal render'a dönülüyor.",
        error,
      );
      composer?.dispose();
      composer = null;
    }

    composerRef.current = composer;
    return () => {
      composerRef.current = null;
      composer?.dispose();
      if (composer) workingComposers = Math.max(0, workingComposers - 1);
    };
    // `size` bilerek dışarıda: yeniden boyutlandırma aşağıdaki ayrı effect'te.
  }, [gl, scene, camera, strength, radius, threshold]);

  // Yeniden boyutlandırma / ekran yönü değişimi: composer'ı canlı canvas
  // ölçüsüne hizala (aksi halde bloom katmanı esner).
  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const el = gl.domElement;
    composer.setPixelRatio(
      Math.min(gl.getPixelRatio(), isCoarsePointer() ? 1.25 : Infinity),
    );
    composer.setSize(
      el.clientWidth || size.width,
      el.clientHeight || size.height,
    );
  }, [gl, size]);

  useFrame(() => {
    const composer = composerRef.current;
    if (composer) {
      composer.render();
      return;
    }
    // Bloom yok: R3F'in otomatik çizimi kapalı kaldığı için sahneyi biz çizeriz.
    if (workingComposers === 0) gl.render(scene, camera);
  }, 1);

  return null;
}
