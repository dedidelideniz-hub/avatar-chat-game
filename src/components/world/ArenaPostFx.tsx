// ArenaPostFx — savaş alanının bloom (neon ışıma) + RENK DERECELENDİRME
// (tone mapping / pozlama / doygunluk) katmanı.
//
// Referanstaki görüntüdeki gibi lav nehirlerinin, kor havuzlarının, yetenek
// ışınlarının ve mavi üs kristalinin etrafa taşarak parlaması için sahne artık
// doğrudan ekrana değil bir EffectComposer zincirinden geçer:
//
//   RenderPass → UnrealBloomPass → ColorGrade → OutputPass
//
// * TONE MAPPING + POZLANA — renderer ACES yerine Khronos Neutral eğrisiyle ve
//   1.15 pozlamayla çalışır; renkler griye çekilmez (bkz. TONE_MAPPING,
//   EXPOSURE).
// * COLOR GRADE — bloom'dan sonra, tone mapping'den önce doygunluk + vibrance
//   uygulanır: ekran gerçekten "patlar" ama parlak katmanların bloom eşiği
//   değişmediği için ekranı saran ışıma oluşmaz (bkz. COLOR_GRADE_SHADER).
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
// VFX katmanı ağır bir efekt (patlama, ışın, ulti) ürettiğinde bloom şiddetini
// kısa süreliğine yükseltir; böylece ışık patlaması parçacıklarla AYNI karede
// tetiklenir (bkz. arena/VFXComponent.ts).
import { resetBloomPulse, stepBloomPulse } from "./arena/VFXComponent";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Çalışan composer sayısı — hiçbiri yoksa sahneyi biz normal çizeriz. */
let workingComposers = 0;

/** Işık bütçesi: sahnedeki hiçbir nokta ışığı bu değerin üzerine çıkamaz.
 *  Arena3D'nin dövüşçü ışıkları (1.2 / 0.9) ve savaş alanı haritasının üs rim
 *  ışıkları (2.4 / 2.2) aynı karede yanınca zemin turuncu-cyan bir sise
 *  dönüyor ve TÜM ışıklar birbirine karışıyordu. Bu tavan hepsini ölçülü bir
 *  seviyeye indirir; altındaki ışıklara (lav havuzları, atmosfer) dokunulmaz. */
const POINT_LIGHT_CAP = 0.5;
/** Genel pozlama (tek çarpan). 1'in ALTINDA görüntü koyulaşır, ÜSTÜNDE açar:
 *  arena artık ACES'in kısık/kül grisi tonuyla değil, Khronos Neutral tone
 *  mapping ile çizildiği için (bkz. TONE_MAPPING) dolgu ışığını kısmak
 *  görüntüyü öldürmez; pozlama canlılığı geri verir. */
const EXPOSURE = 1.3;
/** Arenanın tone mapping eğrisi. ACES filmik eğri renkleri omzunda griye
 *  çeker ("mat/gri harita" şikâyetinin yarısı buydu) ve doygunluğu düşürür;
 *  Neutral (Khronos PBR Neutral) eğrisi renkleri olduğu yerde bırakıp
 *  yalnızca tepeleri yumuşatır — MOBA paleti için doğru seçim. */
const TONE_MAPPING = THREE.NeutralToneMapping;

/* ------------------------------------------------------------------ */
/* RENK DERECELENDİRME (post-processing color grade)                   */
/* ------------------------------------------------------------------ */
/* Işık hesabı doğru olsa bile ham render "mat" okunur; üstelik albedo
   doygunluğu ile EKRAN doygunluğu aynı şey değildir. Bu geçiş, tone
   mapping'den ÖNCE (lineer HDR tamponunda) tek bir ucuz shader ile:

     • DOYGUNLUK (uSaturation) — rengi kendi parlaklığı etrafında dışa açar,
     • VIBRANCE (uVibrance) — ZATEN doygun pikselleri patlatmadan soluk
       olanları öne çıkarır; çim/kristal canlanır, cilt ve taş bozulmaz.

   Bloom'dan SONRA, tone mapping'den ÖNCE durur: parlayan katmanların eşiği
   değişmez (ekranı saran ışıma oluşmaz), yalnızca son görüntünün rengi
   canlanır. Pozlama bilinçli olarak BURADA değil renderer'da
   (`gl.toneMappingExposure`) durur ki bloom kurulamazsa bile kaybolmasın
   (bkz. dosya sonundaki yedek `gl.render` yolu). */
// AETHELGARD PALETİ: referans kare "açık ve doygun" bir gündüz arenası; pozlama
// ve renk derecelendirmesi o yöne çekildi. Bloom eşiği DEĞİŞMEDİ — parlaklık
// arttı ama ışıma yalnızca gerçekten parlak öğelerde (kristaller, yetenekler)
// kalır, ekranı saran bir sise dönüşmez.
const COLOR_GRADE = {
  saturation: 1.3,
  vibrance: 0.34,
};

const COLOR_GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: COLOR_GRADE.saturation },
    uVibrance: { value: COLOR_GRADE.vibrance },
  },
  vertexShader: `varying vec2 vGradeUv;

void main() {
  vGradeUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,
  fragmentShader: `uniform sampler2D tDiffuse;
uniform float uSaturation;
uniform float uVibrance;
varying vec2 vGradeUv;

void main() {
  vec4 texel = texture2D( tDiffuse, vGradeUv );
  vec3 color = max( texel.rgb, 0.0 );
  float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  float maxC = max( max( color.r, color.g ), color.b );
  float minC = min( min( color.r, color.g ), color.b );
  // Vibrance payı: renk zaten doygun (chroma/maxC → 1) ise ek doygunluk
  // verilmez; soluk pikseller (çim, taş, sis) tam payı alır.
  float headroom = 1.0 - clamp( ( maxC - minC ) / max( maxC, 1e-4 ), 0.0, 1.0 );
  float amount = uSaturation + uVibrance * headroom;
  vec3 graded = mix( vec3( luma ), color, amount );
  gl_FragColor = vec4( max( graded, 0.0 ), texel.a );
}`,
};

/** Sahne bir kez mount edilir; yine de dokunmatik cihaz kontrolü için. */
function isCoarsePointer() {
  if (typeof window === "undefined") return false;
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

export function ArenaPostFx({
  // ── bloom (neon ışıma) eşiği ─────────────────────────────────────────
  // Eşik YÜKSEK tutulur (0.88): yalnızca GERÇEKTEN parlak öğeler — üs/kule
  // kristalleri, zemindeki nişan çemberi, menzil halkaları, mermiler, yetenek
  // efektleri ve lav — etraflarına ışık saçar. Zemin/gövde gibi normal
  // parlaklıktaki yüzeyler eşiği geçmediği için kare "her yeri saran sis"e
  // dönüşmez.
  //
  // NOT: Son görsel cila turunda eşik 0.64'e indirilip şiddet/yarıçap
  // yükseltilmişti; bu savaş alanını sisli/parlak gösterdiği için eski
  // (seçici) değerlere geri alındı.
  strength = 0.62,
  radius = 0.38,
  threshold = 0.88,
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
  /** Bloom geçişi: VFX nabzı her karede şiddetini modüle eder. */
  const bloomRef = useRef<UnrealBloomPass | null>(null);
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
    const prevToneMapping = gl.toneMapping;
    const prevStyle = {
      width: el.style.width,
      height: el.style.height,
      display: el.style.display,
    };
    const dprCap = isCoarsePointer() ? 1.5 : 2;
    // ACES → Neutral: renkleri griye çeken omuz eğrisi yerine renkleri
    // koruyan eğri. OutputPass bu değeri her karede okuyup kendi shader'ını
    // yeniden kurar, yani çalışma anında değiştirmek güvenlidir.
    gl.toneMapping = TONE_MAPPING;
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
      gl.toneMapping = prevToneMapping;
      el.style.width = prevStyle.width;
      el.style.height = prevStyle.height;
      el.style.display = prevStyle.display;
    };
  }, [gl]);

  useEffect(() => {
    // Önceki maçtan kalan ışık nabzı yeni arenaya taşınmasın.
    resetBloomPulse();
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
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        strength,
        radius,
        threshold,
      );
      bloomRef.current = bloom;
      composer.addPass(bloom);
      // Renk derecelendirme: doygunluk + vibrance (bloom'dan sonra, tone
      // mapping'den önce — bkz. COLOR_GRADE_SHADER).
      composer.addPass(new ShaderPass(COLOR_GRADE_SHADER));
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
      bloomRef.current = null;
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

  useFrame((_state, dt) => {
    // --- VFX ↔ bloom senkronu -------------------------------------------
    // Efekt katmanı bir ışık patlaması tetiklediyse (patlama/ışın/ulti) bloom
    // şiddeti kısa süreliğine yükselir ve yumuşakça söner. Böylece parlama
    // parçacıkların doğduğu karenin aynısında görünür, sonradan gelmez.
    const pulse = stepBloomPulse(dt);
    const bloom = bloomRef.current;
    if (bloom) bloom.strength = strength + pulse;

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
