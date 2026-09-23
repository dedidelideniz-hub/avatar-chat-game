// 🧨 SamuraiBomb — "Samuray" skininin elinde tuttuğu bomba (SAMAN AYRI KATMAN).
//
// NEDEN AYRI MODÜL: kraliyet silahı `RoyalWarriorEffects` içinde ve yalnız
// kraliyet skinlerine (`moda-savasci` / `skin-savasci`) bağlı. Samuray
// (`skin-samuray.glb`) o listede DEĞİL ve olmamalı — kendi kimliği var. Bu
// yüzden bomba, aynı el-kemiği altyapısını (`engine/HandGrip`) kullanan ama
// kendi skin kapısı olan bağımsız bir katman olarak yazıldı.
//
// ZİNCİR (kılıçla birebir aynı kural):
//
//   el kemiği → `grip`  (kemik ölçeğini 1'e indirir; içindeki birim = dünya
//                        birimi, art arda eklenen model dünya ölçeğinde durur)
//             → `pivot` (model-uzayı offset'i: gövde avucun içine oturur)
//             → model   (dünya genişliği `BOMB_TARGET_WORLD_SPAN`'a normalize)
//
// A V U Ç T A   O T U R M A  (`calibrateBombGrip`) — kullanıcı geri bildirimi:
// "bomba avuca oturmak yerine ele saplanmış, yukarı fırlamış gibi duruyor".
// Sebep: topun merkezi avuç MERKEZİNDE bırakılmıştı → kürenin yarısı elin
// içinde kalıyor, parmaklar topun ortasından geçiyordu. Artık konum EL-YEREL
// olarak avuç normali boyunca ~bir yarıçap dışarıdadır (bkz. BOMB_SEAT_OUT) ve
// fünye düz yukarı değil, gövdeden uzağa ~32° yatıktır (BOMB_TILT_OUT_DEG).
//
// Yönelim CANLI el pozundan türetilir (kemik adı ya da dosya bağımlı sabit
// yok): dünya yukarısı referans alınıp el-yerel dondurulur, yani kol salınsa
// bile fünye okunur bir yönde kalır; konum ise avuçla birlikte gider.
//
// GÖRSEL MODEL: önce `public/models/comical_bomb.glb`, yüklenemezse
// `public/models/bomba.glb`, o da yoksa `buildStructuralBomb()` prosedürel
// modeli. Sıra önemli: kullanıcının eklediği model her zaman kazanır, ama
// dosya eksik/bozuk olduğunda el asla boş kalmaz.
//
// Bu projede modeller saf ASCII JSON glTF olarak durur (bkz.
// `public/ASSETS.md`): hosting boru hattı dosyaları UTF-8'e çevirdiği için
// gerçek binary GLB bozulur. Elde binary bir GLB varsa önce çevrilmelidir:
// `node scripts/glb-to-embedded-json.mjs public/models/comical_bomb.glb`.
//
// 🔥 AĞIZ ATEŞİ: modelin fünye ucunda ÇALIŞMA ZAMANINDA kurulan canlı alev
// (`engine/BombFuseFlame`) — titreyen 4 katmanlı alev, kopan kor parçacıkları
// ve fünye ucundan ışık veren titrek nokta ışığı. Ağız noktası modelden
// otomatik bulunur (fünye/ateş adlı mesh-malzeme, yoksa modelin tepesi), yani
// hem `comical_bomb.glb` hem `bomba.glb` hem prosedürel yedek aynı kuralla
// yanar — modele özel sabit yok.
//
// Parmaklar: `applyFingerGrip` + `buildFingerMeshes` ile kapalı yumruk kurulur,
// bomba gerçekten "kavranmış" görünür (bu rig'te parmak geometrisi yok).
//
// Hiçbiri oyun mantığına girmez: yalnızca görsel katman. Envanter, mağaza,
// hasar ve ağ (PvP) katmanı etkilenmez.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader, MeshoptDecoder, SkeletonUtils } from "three-stdlib";
import { findBone } from "./EquipmentRegistry";
import {
  BOMB_CONTAINER_MODEL_SCALE,
  BOMB_FINGER_GRIP,
  BOMB_FLAME_SPAN,
  BOMB_FUSE_EMISSIVE,
  BOMB_FUSE_MATERIAL,
  BOMB_MODEL_SPAN,
  BOMB_TARGET_WORLD_SPAN,
  applyFingerGrip,
  bombSeatLocal,
  buildFingerMeshes,
  buildStructuralBomb,
  calibrateBombGrip,
  handBoneScale,
  rightHandBone,
} from "./HandGrip";
import {
  createFuseFlame,
  findFuseAnchor,
  isFuseLikeName,
  measureBodyCenter,
  measureBodySpan,
  measureFuseDirection,
  type FuseFlame,
} from "./BombFuseFlame";

/**
 * Bomba modelleri, ÖNCELİK SIRASIYLA. İlk yüklenen kullanılır:
 *   1. `comical_bomb.glb` — kullanıcının eklediği asıl model,
 *   2. `bomba.glb`        — projede üretilmiş yedek model,
 *   3. (dosya yok)        — `buildStructuralBomb()` prosedürel model.
 */
const BOMB_URLS = ["/models/comical_bomb.glb", "/models/bomba.glb"] as const;

/**
 * Bombayı elinde tutan skinler. Şimdilik YALNIZ Samuray: yeni bir skin isterse
 * tek yapılacak şey URL'i buraya eklemek (kapı tek yerde).
 */
const BOMB_SKIN_URLS = new Set<string>(["/models/skin-samuray.glb"]);

export const isBombSkin = (skinUrl: string | null | undefined): boolean =>
  !!skinUrl && BOMB_SKIN_URLS.has(skinUrl);

/** Bomba GLB'si Meshopt ile sıkıştırılmış olabilir; decoder three-stdlib'de. */
const bombLoader = (() => {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder());
  return loader;
})();

/** Yüklenen bomba sahnesi (tüm dövüşçüler paylaşır) + uçuştaki yükleme. */
let bombCache: THREE.Object3D | null = null;
let bombLoading: Promise<void> | null = null;

/**
 * Modelleri sırayla dener; hepsi başarısız olursa `null` döner (çağıran
 * prosedürel modele düşer). Her aday için ayrı uyarı basılır ki "neden yedek
 * model görünüyor" sorusu konsoldan okunabilsin.
 */
async function loadBombScene(): Promise<THREE.Object3D | null> {
  for (const url of BOMB_URLS) {
    try {
      const gltf = await bombLoader.loadAsync(url);
      return gltf.scene;
    } catch (e) {
      console.warn(`[Samurai] bomba modeli yüklenemedi: ${url}`, e);
    }
  }
  return null;
}

/**
 * Bomba katmanı. Döndürdüğü `bombRef` (kapsayıcı grup) yetenek katmanı için
 * açıktır: ulti fırlatılırken el boşalsın istenirse `visible` ile kapatılır.
 */
export function useSamuraiBomb(
  clone: THREE.Object3D,
  skinUrl: string | null | undefined,
): { bombRef: React.MutableRefObject<THREE.Group | null> } {
  const bombRef = useRef<THREE.Group | null>(null);
  const handRef = useRef<THREE.Object3D | null>(null);
  /** Fünye ucundaki canlı alev (model her değiştiğinde yeniden kurulur). */
  const flameRef = useRef<FuseFlame | null>(null);
  const frames = useRef(0);
  const calibrated = useRef(false);
  // GLB arka planda hazır olduğunda katmanı yeniden kurar (yapısal → GLB geçişi).
  const [ready, setReady] = useState(0);

  useEffect(() => {
    if (!clone || !isBombSkin(skinUrl)) return;
    clone.updateWorldMatrix(true, true);
    const hand = findBone(clone, "MAIN_HAND") ?? rightHandBone(clone);
    if (!hand) return;

    const boneScale = Math.max(handBoneScale(hand), 1e-9);
    const grip = new THREE.Group();
    // Avuçtaki oturma noktası EL-YEREL: top avucun çukurunda durur ve kol ne
    // yaparsa yapsın oradan kaymaz (bkz. `bombSeatLocal` ölçümleri).
    grip.position.copy(bombSeatLocal(hand));
    // Kemik ölçeğini söndür: kapsayıcı içindeki 1 birim = 1 dünya birimi.
    grip.scale.setScalar(BOMB_CONTAINER_MODEL_SCALE / boneScale);
    // `pivot` MODEL-UZAYI düzeltmesidir (gövde merkezi → orijin, fünye → +Y).
    // Değerleri model ölçülerek `mount` içinde kurulur.
    const pivot = new THREE.Group();
    grip.add(pivot);

    const mount = (source: THREE.Object3D) => {
      const model = SkeletonUtils.clone(source);
      model.updateMatrixWorld(true);
      // Gövde genişliği (X/Z) hedefe normalize edilir; fünye serbest kalır.
      // Fitil/kıvılcım mesh'leri ölçümden ÇIKARILIR (bkz. `measureBodySpan`):
      // yana uzanan bir fitil kutuyu şişirip bombayı olduğundan küçük ölçekler.
      //
      // ÜÇÜ DE ölçek uygulanmadan ÖNCE ölçülür (modelin kendi birimi).
      const span = measureBodySpan(model) || BOMB_MODEL_SPAN;
      // Gövde merkezi: modelin origin'i kürenin merkezinde değilse (Blender'da
      // pivot tabana konmuşsa) top avucun dışına kaçar ya da içine gömülür.
      const bodyCenter = measureBodyCenter(model);
      // Fünye yönü: ağız noktasından gövde merkezine giden vektörün tersi.
      const fuseDir = measureFuseDirection(model);
      const chain = grip.scale.x * boneScale * pivot.scale.x || 1;
      model.scale.setScalar(BOMB_TARGET_WORLD_SPAN / (span * chain));
      model.position.set(0, 0, 0);
      // Pivot: gövde merkezini kapsayıcının orijinine çek ve modelin fünyesini
      // +Y'ye hizala. `calibrateBombGrip` fünyeyi +Y varsayar; modelin fitili
      // yana/eğik çizilmişse bile bomba doğru yönde durur.
      const align = new THREE.Quaternion().setFromUnitVectors(
        fuseDir,
        new THREE.Vector3(0, 1, 0),
      );
      pivot.quaternion.copy(align);
      pivot.position
        .copy(bodyCenter)
        .multiplyScalar(model.scale.x)
        .applyQuaternion(align)
        .negate();
      model.traverse((o) => {
        o.userData.isEquipment = true;
        // Sahne frustum culling'i kapatılır: kemik animasyonunda model
        // ekrandan bir an silinmesin (kılıç katmanıyla aynı kural).
        o.frustumCulled = false;
        const mesh = o as THREE.Mesh;
        const list = Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : [];
        for (const entry of list) {
          const m = entry as THREE.MeshStandardMaterial;
          // Fitil ucunun ışıması: GLB'de emissive kuvveti 1'in üstüne çıkamaz
          // (ekstra uzantı gerekir), bu yüzden malzeme ADIYLA hedeflenir.
          // Ad kalıbı kullanılır: `comical_bomb.glb` kendi adını taşıyabilir
          // (Fuse/Glow/Flame…), prosedürel yedek ise `BombaFuseGlow`.
          if (m.name === BOMB_FUSE_MATERIAL || isFuseLikeName(m.name)) {
            m.emissiveIntensity = BOMB_FUSE_EMISSIVE;
            m.toneMapped = false;
          }
        }
      });
      // 🔥 Ağız ateşinin oturacağı nokta: fünyenin yanan ucu. Model köküne
      // GÖRELİ bulunur, gövde merkezine göre kaydırılır (pivot o kadar kaydı)
      // ve pivot rotasyonundan geçirilerek kapsayıcı uzayına taşınır.
      const anchor = findFuseAnchor(model)
        .sub(bodyCenter)
        .multiplyScalar(model.scale.x)
        .applyQuaternion(align);

      // Önceki alev ve model varsa (yapısal → GLB) tek seferde değiştir.
      flameRef.current?.dispose();
      flameRef.current = null;
      for (const child of [...pivot.children]) pivot.remove(child);
      pivot.add(model);

      // Alev modelin fünye ucunda durur; bomba genişliğinden bağımsız, kendi
      // ölçeğiyle kurulur (fitil alevi bomba çapıyla büyümez).
      const flame = createFuseFlame(BOMB_FLAME_SPAN);
      flame.group.position.copy(anchor);
      pivot.add(flame.group);
      flameRef.current = flame;
    };

    mount(bombCache ?? buildStructuralBomb());
    if (!bombCache && !bombLoading) {
      bombLoading = loadBombScene().then((scene) => {
        bombLoading = null;
        if (!scene) return; // tüm adaylar düştü → prosedürel model kalır
        bombCache = scene;
        setReady((n) => n + 1); // katmanı GLB ile yeniden kur
      });
    }

    grip.userData.isEquipment = true;
    grip.traverse((o) => {
      o.userData.isEquipment = true;
      o.frustumCulled = false;
    });
    hand.add(grip);
    bombRef.current = grip;
    handRef.current = hand;
    frames.current = 0;
    calibrated.current = false;

    // Parmak pozu: yumruk DEĞİL, topu saran avuç (bkz. `BOMB_FINGER_GRIP`).
    // Kapalı yumrukta parmak uçları topun İÇİNE kıvrılıyordu.
    applyFingerGrip(clone, BOMB_FINGER_GRIP);
    const fingers = buildFingerMeshes(clone);

    // İlk kareyi de doğru göster: kalibrasyon 20. karede (idle klibi oturunca)
    // tazelenir, ama ilk 0.33 sn boyunca bomba elde savrulmasın.
    calibrateBombGrip(hand, grip, clone);

    return () => {
      grip.removeFromParent();
      for (const seg of fingers) seg.removeFromParent();
      flameRef.current?.dispose();
      flameRef.current = null;
      if (bombRef.current === grip) bombRef.current = null;
      if (handRef.current === hand) handRef.current = null;
    };
  }, [clone, skinUrl, ready]);

  // Kılıçla aynı kural: yönelim CANLI el pozundan kalibre edilir. Kurulumda bir
  // kez (ilk kare doğru olsun), sonra 20. karede TAZELENİR — idle klibi o an
  // oturmuş olur (kılıç kalibrasyonuyla aynı zamanlama).
  useFrame((_, dt) => {
    // Ateş her karede canlı kalır (titreme, kor parçacıkları, ışık).
    flameRef.current?.update(dt);
    const grip = bombRef.current;
    const hand = handRef.current;
    if (!grip || !hand || calibrated.current) return;
    frames.current += 1;
    if (frames.current < 20) return;
    calibrateBombGrip(hand, grip, clone);
    calibrated.current = true;
  });

  return { bombRef };
}
