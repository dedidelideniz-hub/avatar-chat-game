// ArenaPostFx — savaş alanının GERÇEK bloom (neon ışıma) katmanı.
//
// Referanstaki görüntüdeki gibi lav nehirlerinin, kor havuzlarının, yetenek
// ışınlarının ve mavi üs kristalinin etrafa taşarak parlaması için sahne artık
// doğrudan ekrana değil bir EffectComposer zincirinden geçer:
//
//   RenderPass → UnrealBloomPass → OutputPass
//
// * SELECTIVE bloom: eşik (threshold) yüksek tutulduğu için yalnızca GERÇEKTEN
//   parlak öğeler — üs/kule kristalleri, zemindeki nişan çemberi, menzil
//   halkaları, mermiler, yetenek efektleri ve lav — etraflarına ışık saçar.
//   Zemin/gövde gibi normal parlaklıktaki yüzeyler eşiği geçmediği için kare
//   "her yeri saran sis"e dönüşmez.
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

/** Işık bütçesi: sahnedeki hiçbir nokta ışığı bu değerin üzerine çıkamaz.
 *  Arena3D'nin dövüşçü ışıkları (1.2 / 0.9) ve savaş alanı haritasının üs rim
 *  ışıkları (2.4 / 2.2) aynı karede yanınca zemin turuncu-cyan bir sise
 *  dönüyor ve TÜM ışıklar birbirine karışıyordu. Bu tavan hepsini ölçülü bir
 *  seviyeye indirir; altındaki ışıklara (lav havuzları, atmosfer) dokunulmaz. */
const POINT_LIGHT_CAP = 0.5;
/** Genel pozlama: arena ACES ile tone map edildiği için tek çarpanla bütün
 *  sahne kısılabilir. 1'in altındaki değer görüntüyü koyulaştırır. */
const EXPOSURE = 1;

/** Sahne bir kez mount edilir; yine de dokunmatik cihaz kontrolü için. */
function isCoarsePointer() {
  if (typeof window === "undefined") return false;
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

export function ArenaPostFx({
  strength = 0.45,
  radius = 0.32,
  threshold = 0.8,
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
  /** Işık bütçesi için önbelleğe alınmış nokta ışıkları (her kare traverse yok). */
  const lightsRef = useRef<THREE.PointLight[]>([]);
  const frameRef = useRef(0);

  // --- Responsive render ayarları: pozlama + canvas yerleşimi + piksel oranı.
  // WebView'de canvas'ın satır içi (inline) davranışı altında birkaç piksel
  // boşluk kalabiliyor ve bu, ölçeklenen sahnede "basık" görüntüye katkı
  // yapıyor; bu yüzden canvas blok olarak tam ekrana sabitlenir. Piksel oranı
  // cihaz oranıyla sınırlanır (üst sınır 2): düşük çözünürlükte bulanık,
  // gereksiz yüksek oranda boşa GPU tüketen görüntü engellenir.
  useEffect(() => {
    const el = gl.domElement;
    const prevExposure = gl.toneMappingExposure;
    const prevStyle = {
      width: el.style.width,
      height: el.style.height,
      display: el.style.display,
    };
    const dprCap = isCoarsePointer() ? 1.5 : 2;
    gl.toneMappingExposure = EXPOSURE;
    gl.setPixelRatio(
      Math.min(
        typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
        dprCap,
      ),
    );
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.display = "block";
    return () => {
      gl.toneMappingExposure = prevExposure;
      el.style.width = prevStyle.width;
      el.style.height = prevStyle.height;
      el.style.display = prevStyle.display;
    };
  }, [gl]);

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
    // --- Işık bütçesi ---------------------------------------------------
    // Sahne yüklendikçe (harita GLB'si sonradan gelir) ışık listesi tazelenir;
    // aradaki karelerde önbellek kullanılır, yani kare başına traverse yok.
    frameRef.current += 1;
    if (frameRef.current === 1 || frameRef.current % 30 === 0) {
      const list: THREE.PointLight[] = [];
      scene.traverse((obj) => {
        const light = obj as THREE.PointLight;
        if (light.isPointLight && !light.userData?.mobaLight) list.push(light);

        // --- SEÇİLİ (UNLIT) IŞIMA KATMANLARI ----------------------------
        // Karakterin altındaki nişan çemberi, menzil halkaları, lav, kor ve
        // yetenek efektleri additif karışımlıdır; ACES tone mapping bunları
        // kısıyor, parlak ortam ışığı da üzerlerine bindiğinde soluk/gölgede
        // kalıyorlardı. Bu katmanlar bir kez `toneMapped = false` ile
        // işaretlenir: ışık hesabına hiç girmezler ve her koşulda canlı
        // renkte parlayıp bloom eşiğini geçerler. Opak yüzeyler (zemin, gövde)
        // additif olmadığı için bu geçişten etkilenmez.
        const holder = obj as { material?: THREE.Material | THREE.Material[] };
        const source = holder.material;
        if (!source) return;
        const materials = Array.isArray(source) ? source : [source];
        for (const entry of materials) {
          if (entry.userData?.vaelosUnlit) continue;
          if (entry.blending !== THREE.AdditiveBlending) continue;
          if (entry.toneMapped !== false) {
            entry.toneMapped = false;
            // Değişen `toneMapped` shader program anahtarı olduğu için
            // materyalin yeniden derlenmesi gerekir (her materyal için bir kez).
            entry.needsUpdate = true;
          }
          entry.userData = { ...entry.userData, vaelosUnlit: true };
        }
      });
      lightsRef.current = list;
    }
    for (const light of lightsRef.current) {
      if (light.intensity > POINT_LIGHT_CAP) light.intensity = POINT_LIGHT_CAP;
    }

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
