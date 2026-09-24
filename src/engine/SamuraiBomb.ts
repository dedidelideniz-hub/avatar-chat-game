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
//             → model   (GÖVDE KÜRESİNİN çapı `BOMB_TARGET_WORLD_SPAN`'a
//                        normalize; fitil/boyun ölçek referansı DEĞİLDİR)
//
// M O D E L   Ö L Ç Ü M Ü  (`BombFuseFlame`): ölçek, merkez, fünye yönü ve
// ağız noktası modelin GERÇEK YÜZEY KÖŞELERİNDEN okunur. İki ayrıntı kritik:
//
//   · Kaba `Box3` YETMEZ. Döndürülmüş bir dışa aktarımda (Sketchfab) eksen-
//     hizalı kutu, gövdeden kat kat büyük çıkar; kullanıcının modelinde XZ
//     genişliği 3.63 ölçülüyordu, gerçek çap 1.96 → bomba 1.85 kat küçük
//     ölçeklenip elde "ufacık" kalıyordu.
//   · MERKEZ, gövde küresinin merkezidir — tüm parçaların kutu merkezi değil.
//     Fitil/boyun yukarı uzadığı için kutu merkezi yukarı kayar ve bomba avuca
//     yarım yarıçap gömülürdü (bkz. `measureBodyBall`).
//
// A V U Ç T A   O T U R M A  (`calibrateBombGrip`) — kullanıcı geri bildirimi:
// "bomba avuca oturmak yerine ele saplanmış, yukarı fırlamış gibi duruyor".
// Sebep: topun merkezi avuç MERKEZİNDE bırakılmıştı → kürenin yarısı elin
// içinde kalıyor, parmaklar topun ortasından geçiyordu. Şimdi konum EL-YEREL
// olarak avuç çukurundan GÖVDEDEN UZAĞA doğru bir yarıçap + ince pay kadar
// dışarıdadır (bkz. `bombSeatLocal` / BOMB_CARRY_OUT): avuç normali bazı
// rig'lerde gövdeye döndüğü için bomba ele gömülüyordu; dışa yön referansı
// prop'u karakterin silüetinin dışında tutar. Fünye de düz yukarı değil,
// gövdeden uzağa ~38° yatıktır (BOMB_TILT_OUT_DEG).
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
// 🤹 CANLI TUTUŞ (`engine/BombJuggle`): bomba elde sabit durmaz — TUT → AT →
// YAKALA ritmiyle sağ ve sol el arasında durmadan atılır (tutuşta avuca oturur,
// uçuşta yay çizip takla atar, yakalanınca hafifçe ezilir).
//
// 🤹 KOL HAREKETİ (`engine/BombArmPose`): bombanın konumu el kemiklerinden
// türetildiği için, ellerin NEREDE olduğu atışın nerede görüneceğini belirler.
// Idle klibi kolları kalça hizasında bıraktığı için ilk sürümde top iki SABİT
// elin arasında süzülen bir küre gibi okunuyordu (kullanıcı geri bildirimi:
// "bomba oynuyor fakat kolları oynamıyor"). Artık her karede iki kol da
// hedeflenen el noktalarına iki-kemik IK ile getirilir; hedefler aynı
// `BombJuggle` fazından sürülür (fırlatan el bırakıştan sonra yükselir,
// yakalayan el top gelirken uzanır, tutan el topu göğüs önünde taşır). Sıra
// ŞART: önce kol pozlanır, SONRA avuç noktaları okunur — böylece top kolu bir
// kare geriden takip etmez ve atış ile kol kendiliğinden senkron kalır.
//
// Yönelim de iki elin KENDİ kalibrasyonundan gelir ve uçuş boyunca aralarında
// yumuşakça geçer: fünye sağ elde sağa, sol elde sola yatar (tek taban
// kullanılsaydı fünye top sola geçtiğinde gövdenin üstüne devrilirdi). Kavrama
// pozu ve parmak geometrisi de İKİ elde kurulur, böylece top hangi ele
// geçerse geçsin "kavranmış" görünür. Sol el bulunamazsa katman sessizce eski
// hâline (elde sabit tutuş) döner.
//
// Parmaklar: `applyFingerGrip` + `buildFingerMeshes` ile kapalı yumruk kurulur,
// bomba gerçekten "kavranmış" görünür (bu rig'te parmak geometrisi yok).
//
// 🧨 AKSIYONLAR (`readAction` girdisi): bomba bu karakterin SİLAHI olduğu için
// iki yetenek de onu elden çıkarır ve ikisi de GÖRÜNÜR bir hareketle yapılır:
//
//   ▸ `throw` (ulti)  → kol geriye yukarı çekilir, kamçı gibi öne savrulur;
//     bomba bırakış anında elden gizlenir ve mermi olarak uçar
//     (`SkillComponent.fireBombThrow`).
//   ▸ `place` (tuzak) → karakter öne eğilir, kol bombayı ayağının dibine
//     indirir, parmaklar açılır ve top YERE DÜŞER; tuzak tam top yere değdiği
//     karede doğar (bkz. `arena/bombKit` → `BOMB_PLACE_DROP_AT`).
//   ▸ `empty`         → bomba elden çıktı, yenisi henüz hazır değil: eller
//     taşıma noktasında gevşek durur (hokkabazlık OYNAMAMALI, yoksa karakter
//     görünmez bir top çeviriyormuş gibi okunur).
//
// AKSİYON KAPISI DIŞARIDAN GELİR (`readAction`): bu modül simülasyonu bilmez
// (sokak/pazar avatarları da bu katmanı kullanır ve onlarda yetenek yoktur).
// Sahne, dövüşçünün sayaçlarından tek satırlık bir çerçeve geçirir; süre ve
// eşikler tek kaynakta kalır. Aksiyon bitince hokkabazlık SIFIRDAN başlar
// (`juggleTime = 0`), yani top elde dururken doğar — havada yakalanmaz.
//
// Hiçbiri oyun mantığına girmez: yalnızca görsel katman. Envanter, mağaza,
// hasar ve ağ (PvP) katmanı etkilenmez.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader, MeshoptDecoder, SkeletonUtils } from "three-stdlib";
import { findBone } from "./EquipmentRegistry";
import { prepareHeldEquipment } from "./HeldEquipment";
import {
  BOMB_BODY_EMISSIVE,
  BOMB_BODY_EMISSIVE_COLOR,
  BOMB_CONTAINER_MODEL_SCALE,
  BOMB_FINGER_GRIP,
  BOMB_FLAME_SPAN,
  BOMB_FUSE_EMISSIVE,
  BOMB_FUSE_MATERIAL,
  BOMB_MODEL_SPAN,
  BOMB_TARGET_WORLD_SPAN,
  applyFingerGrip,
  bombGripWorldQuat,
  bombSeatLocal,
  buildFingerMeshes,
  buildStructuralBomb,
  calibrateBombGrip,
  handBoneMaxScale,
  handWorldQuat,
  leftHandBone,
  palmHoldPoint,
  rightHandBone,
} from "./HandGrip";
import { sampleBombJuggle, sampleJuggleTiming, type JuggleSample } from "./BombJuggle";
import {
  PLACE_FALL_SPAN,
  applyBombActionPose,
  applyBombArmPose,
  findBombArmRig,
  type BombArmRig,
} from "./BombArmPose";
import {
  createBombAura,
  createFuseFlame,
  findFuseAnchor,
  isFuseLikeName,
  measureBodyCenter,
  measureBodySpan,
  measureFuseDirection,
  type BombAura,
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
 * 🧨 Aksiyona giriş harmanının süresi (sn).
 *
 * Kısa tutulur: fırlatma savurmasının kendisi ~0.5 sn'dir, rampa onu yavaşlatmamalı
 * ama kolun (ve topun) bir karede atlamasını da engellemeli. 0.14 sn ≈ 8 kare.
 */
const ACTION_INTRO_S = 0.14;

/** Yere bırakılan bombanın duracağı noktayı hesaplarken kullanılan geçici. */
const footScratch = new THREE.Vector3();

/**
 * 🧨 Yere bırakılan bombanın DURACAĞI dünya noktası.
 *
 * Yatayda karakterin KENDİ gövde ekseni (klonun dünya konumu), dikeyde ZEMİN +
 * bomba yarıçapı. Zemin "model kökü y = 0" varsayımıyla değil, en alçak AYAK
 * kemiğinden canlı okunur: gövde alçalıp yükselse de (duruş, eğilme) top yere
 * doğru yere iner. Ayak kemiği bulunamayan rig'lerde klon konumunun yüksekliği
 * referans alınır (top yine yerden kopmaz).
 *
 * Tuzak da karakterin konumuna konduğu için (`SkillComponent.placeBombTrap`)
 * top ile tuzak AYNI noktada buluşur — aradaki fark bir karelik görünmez bir
 * yer değiştirme bile yaratmaz.
 */
function groundHoldPoint(
  clone: THREE.Object3D,
  rig: BombArmRig,
  out: THREE.Vector3,
): THREE.Vector3 {
  clone.getWorldPosition(out);
  let ground = Number.POSITIVE_INFINITY;
  for (const foot of rig.feet) {
    foot.getWorldPosition(footScratch);
    ground = Math.min(ground, footScratch.y);
  }
  out.y =
    (Number.isFinite(ground) ? ground : out.y) + BOMB_TARGET_WORLD_SPAN / 2;
  return out;
}

/**
 * 🧨 Aksiyon çerçevesi — sahnenin kemik katmanına geçirdiği TEK girdi.
 *
 * Sahne bunu dövüşçünün sayaçlarından türetir (`arena/bombKit` →
 * `bombActionFor`) ve bu modül oyun kurallarını hiç bilmez: yalnızca "hangi
 * hareket, ne kadar ilerledi" bilgisiyle pozu ve bombanın konumunu sürer.
 */
export interface BombActionFrame {
  /** "empty" → bomba elde değil (yenisi hazırlanıyor), eller boş durur. */
  kind: "throw" | "place" | "empty";
  /** Aksiyonun 0..1 ilerlemesi ("empty"de 0). */
  progress: number;
  /** Fırlatmada bombanın ELDEN ÇIKTIĞI ilerleme (mermi o anda doğar). */
  release?: number;
  /** Yere bırakmada bombanın YERE DEĞDİĞİ ilerleme (tuzak o anda doğar). */
  land?: number;
}

/**
 * Bomba katmanı. Döndürdüğü `bombRef` (kapsayıcı grup) yetenek katmanı için
 * açıktır: ulti fırlatılırken el boşalsın istenirse `visible` ile kapatılır.
 *
 * `readAction` verilirse fırlatma / yere bırakma animasyonları da bu katman
 * sürer (bkz. modül başlığı); verilmezse (sokak avatarları) yalnız hokkabazlık
 * oynar ve davranış eskisiyle birebir aynıdır.
 */
export function useSamuraiBomb(
  clone: THREE.Object3D,
  skinUrl: string | null | undefined,
  readAction?: () => BombActionFrame | null,
): { bombRef: React.MutableRefObject<THREE.Group | null> } {
  const bombRef = useRef<THREE.Group | null>(null);
  const handRef = useRef<THREE.Object3D | null>(null);
  /** Fünye ucundaki canlı alev (model her değiştiğinde yeniden kurulur). */
  const flameRef = useRef<FuseFlame | null>(null);
  /** Gövde hâlesi — kuş bakışı okunurluk katmanı (aynı yaşam döngüsü). */
  const auraRef = useRef<BombAura | null>(null);
  // Per-instance material clones are disposed when the attached model is replaced/unmounted.
  const equippedMaterials = useRef<THREE.Material[]>([]);
  /** 🤹 Atış animasyonu: zamanlayıcı, iki el ve yeniden kullanılan geçici vektörler. */
  const otherHandRef = useRef<THREE.Object3D | null>(null);
  const boneScaleRef = useRef(1);
  const juggleTime = useRef(0);
  /**
   * Poz içindeki hafif salınımın saati (`SWAY_SPEED`).
   *
   * Hokkabazlık zamanından AYRI akar: aksiyon başlarken `juggleTime` sıfıra
   * döner (döngü tutuştan başlasın diye), ama salınım sıfırlansaydı eller
   * aksiyona geçerken bir karede sıçrardı.
   */
  const swayTime = useRef(0);
  /** 🧨 Aksiyon durumu: hangi hareket oynuyor, hangi el yapıyor, düşüş nerede başladı. */
  const actionKind = useRef<BombActionFrame["kind"] | null>(null);
  const actionRight = useRef(true);
  const fallStarted = useRef(false);
  const fallFrom = useRef(new THREE.Vector3());
  /**
   * 🧨 Aksiyona GİRİŞ harmanı: yetenek hokkabazlığın ortasında (el uzanmış,
   * top havadayken) basılabilir. Aksiyonun ilk karelerinde eller ve bomba
   * BULUNDUKLARI noktadan aksiyon pozuna akar; yoksa ikisi de ışınlanır.
   */
  const actionIntroT = useRef(0);
  const actionFromR = useRef(new THREE.Vector3());
  const actionFromL = useRef(new THREE.Vector3());
  const bombFrom = useRef(new THREE.Vector3());
  /** 🤹 Kol zinciri (iki-kemik IK) — bomba konumu bu pozlandıktan SONRA okunur. */
  const armRigRef = useRef<BombArmRig | null>(null);
  const juggle = useRef<JuggleSample>({
    position: new THREE.Vector3(),
    tossT: 0,
    legT: 0,
    spinAngle: 0,
    spinAxis: new THREE.Vector3(1, 0, 0),
    squash: 1,
    handMix: 0,
    holding: true,
    direction: 1,
  });
  const scratch = useRef({
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    aOut: new THREE.Vector3(),
    bOut: new THREE.Vector3(),
    pull: new THREE.Vector3(),
    /** Yere bırakılan topun hedef noktası (aksiyon sırasında kullanılır). */
    land: new THREE.Vector3(),
    spin: new THREE.Quaternion(),
    desired: new THREE.Quaternion(),
    rightBase: new THREE.Quaternion(),
    leftBase: new THREE.Quaternion(),
    flip: new THREE.Quaternion(),
  });
  // GLB arka planda hazır olduğunda katmanı yeniden kurar (yapısal → GLB geçişi).
  const [ready, setReady] = useState(0);

  useEffect(() => {
    if (!clone || !isBombSkin(skinUrl)) return;
    clone.updateWorldMatrix(true, true);
    // Resolve the actual wrist/hand bone first. The registry's broad MAIN_HAND
    // aliases can match `RightHandIndex1` on some Mixamo exports, which places
    // the bomb on a finger bone and makes both the palm offset and grip pose wrong.
    const hand = rightHandBone(clone) ?? findBone(clone, "MAIN_HAND");
    if (!hand) return;
    // Karşı el: atışın hedefi. Bulunamazsa aşağıdaki kare döngüsü atışı atlar.
    const otherHand = leftHandBone(clone) ?? findBone(clone, "OFF_HAND");

    const boneScale = Math.max(handBoneMaxScale(hand), 1e-9);
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
      // ÖLÇEK REFERANSI = GÖVDE KÜRESİNİN ÇAPI (ya da kutunun XZ genişliği).
      // Fitil/kıvılcım mesh'leri ile üçgene bağlı olmayan "başıboş" köşeler
      // ölçümden ÇIKARILIR (bkz. `measureBodySpan` / `bodyPoints`): yana uzanan
      // bir fitil ya da yüzeyden kopuk köşeler kutuyu şişirip bombayı olduğundan
      // küçük ölçekler. Avuçta oturma mesafesi de aynı referanstan türediği
      // için (yarıçap) bomba hangi model olursa olsun avuca değer.
      //
      // ÜÇÜ DE ölçek uygulanmadan ÖNCE ölçülür (modelin kendi birimi).
      const span = measureBodySpan(model) || BOMB_MODEL_SPAN;
      // Gövde merkezi = GÖVDE KÜRESİNİN merkezi. Modelin origin'i kürenin
      // merkezinde değilse (Blender'da pivot tabana konmuşsa) top avucun dışına
      // kaçar ya da içine gömülür; boyun/kapak yüzünden kutu merkezi de yukarı
      // kayar — ikisi de bu ölçümle düzelir.
      const bodyCenter = measureBodyCenter(model);
      // Fünye yönü: ağız noktasından gövde merkezine giden vektörün tersi.
      const fuseDir = measureFuseDirection(model);
      // `grip` kemiğin en büyük world-axis ölçeğinin tersini taşır; bu çarpım
      // parent zincirini ~1 dünya ölçeğine indirger ve kemik ölçeğinin prop'u
      // tekrar büyütmesini önler.
      const chain = grip.scale.x * boneScale * pivot.scale.x || 1;
      const prepared = prepareHeldEquipment(model, {
        targetWorldSpan: BOMB_TARGET_WORLD_SPAN,
        sourceSpan: span,
        parentWorldScale: chain,
      });
      for (const material of equippedMaterials.current) material.dispose();
      equippedMaterials.current = prepared.materials;
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
          } else if (m.emissive && !m.emissiveMap) {
            // 🧨 GÖVDE IŞIMASI (okunurluk): kendi emissive DOKUSU olmayan
            // malzemelere zayıf sıcak bir taban verilir, böylece bomba kuş
            // bakışı kadrajda/karakterin silüeti içinde kaybolmaz (bkz.
            // HandGrip → BOMB_BODY_EMISSIVE). Dokulu modelde (comical_bomb)
            // ışımayı modelin kendi dokusu + `emissive_strength` taşır; oraya
            // düz renk yazmak emissive = renk × doku olduğu için siyah
            // kısımlarda hiç görünmezdi. `toneMapped` ELLENMEZ: gövde ateş
            // değil, yalnız hafif kendinden aydınlık kalmalı.
            m.emissive.set(BOMB_BODY_EMISSIVE_COLOR);
            m.emissiveIntensity = BOMB_BODY_EMISSIVE;
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

      // Önceki alev/hâle ve model varsa (yapısal → GLB) tek seferde değiştir.
      flameRef.current?.dispose();
      flameRef.current = null;
      auraRef.current?.dispose();
      auraRef.current = null;
      for (const child of [...pivot.children]) pivot.remove(child);
      pivot.add(model);

      // Alev modelin fünye ucunda durur; bomba genişliğinden bağımsız, kendi
      // ölçeğiyle kurulur (fitil alevi bomba çapıyla büyümez).
      const flame = createFuseFlame(BOMB_FLAME_SPAN);
      flame.group.position.copy(anchor);
      pivot.add(flame.group);
      flameRef.current = flame;

      // 🧨 GÖVDE HÂLESİ: pivot ORİJİNİ tam olarak ölçülen gövde merkezidir
      // (pivot konumu −gövde merkezi kadar kaydırılır), yani hâle ek offset
      // gerektirmez. Ölçüsü normalize edilmiş DÜNYA yarıçapından gelir; kapsayıcı
      // uzayı (grip) dünya biriminde olduğu için doğrudan karşılaştırılabilir.
      const aura = createBombAura(BOMB_TARGET_WORLD_SPAN / 2);
      pivot.add(aura.group);
      auraRef.current = aura;
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
    otherHandRef.current = otherHand;
    boneScaleRef.current = boneScale;
    juggleTime.current = 0;

    // Parmak pozu: yumruk DEĞİL, topu saran avuç (bkz. `BOMB_FINGER_GRIP`).
    // Kapalı yumrukta parmak uçları topun İÇİNE kıvrılıyordu.
    //
    // İKİ ele de uygulanır: bomba sağ↔sol el arasında gezdiği için topun
    // bulunduğu el "kavrıyor" görünmezse (parmaklar açık kalırsa) top elde
    // değil, elin yanında duran bir küre gibi okunur.
    applyFingerGrip(clone, BOMB_FINGER_GRIP, hand);
    const fingers = buildFingerMeshes(clone, hand);
    if (otherHand) {
      applyFingerGrip(clone, BOMB_FINGER_GRIP, otherHand);
      fingers.push(...buildFingerMeshes(clone, otherHand));
    }

    // 🤹 KOL ZİNCİRİ: bomba iki elin arasında atıldığı için kolların da
    // hedeflenen noktalara gitmesi gerekir (bkz. `engine/BombArmPose`). Ölçüm
    // BURADA, model henüz dinlenme pozundayken yapılır: kol boyları ve yan
    // eksen klibin pozundan bağımsızdır, dinlenme pozunda ise omuzlar daha
    // güvenilir okunur. Zincir eksikse `null` kalır ve katman eski davranışına
    // (kollar klibe göre, bomba iki el arasında) döner — bomba kaybolmaz.
    armRigRef.current = otherHand ? findBombArmRig(clone) : null;

    // İlk kareyi de doğru göster: kapsayıcı avuca kalibre edilir. Yönelim zaten
    // her karede tazelendiği için (bkz. kare döngüsü) burada ölçülen şey
    // yalnızca ilk karenin KONUMUDUR.
    calibrateBombGrip(hand, grip, clone);

    return () => {
      grip.removeFromParent();
      for (const seg of fingers) seg.removeFromParent();
      flameRef.current?.dispose();
      flameRef.current = null;
      auraRef.current?.dispose();
      auraRef.current = null;
      for (const material of equippedMaterials.current) material.dispose();
      equippedMaterials.current = [];
      if (bombRef.current === grip) bombRef.current = null;
      if (handRef.current === hand) handRef.current = null;
      if (otherHandRef.current === otherHand) otherHandRef.current = null;
      armRigRef.current = null;
    };
  }, [clone, skinUrl, ready]);

  // Kılıçla aynı kural: yönelim CANLI el pozundan türetilir. Farkı: kol pozunu
  // artık `BombArmPose` IK ile her karede sürdüğü için elin dönüşü sürekli
  // değişir; taban yönelim de bu yüzden HER KAREDE yeniden hesaplanır. (Eskiden
  // 20. karede bir kez tazeleniyordu ve ilk 20 kare boyunca top kalibrasyonsuz
  // konumda kalıp o karede sıçrıyordu.)
  useFrame((_, dt) => {
    // Ateş ve gövde hâlesi her karede canlı kalır (titreme, ışık, nabız).
    flameRef.current?.update(dt);
    auraRef.current?.update(dt);
    const grip = bombRef.current;
    const hand = handRef.current;
    if (!grip || !hand) return;

    const other = otherHandRef.current;
    const t = scratch.current;
    const armRig = armRigRef.current;
    // Salınım saati aksiyondan bağımsız akar (bkz. `swayTime`).
    swayTime.current += dt;

    // 🧨 AKSiYON KAPISI: yalnız kol zinciri ve iki el varsa aksiyon oynar;
    // yoksa (tek elli rig) hokkabazlık eski hâlinde devam eder.
    const action = armRig && other ? (readAction?.() ?? null) : null;
    const kind = action?.kind ?? null;
    if (kind !== actionKind.current) {
      actionKind.current = kind;
      // Bomba HANGİ elde ise o el fırlatır / yere koyar: hokkabazlık son
      // turunda topu hangi ele bıraktıysa aksiyon oradan başlar (tutuş fazında
      // `handMix` tam 0 ya da tam 1'dir — bkz. `BombJuggle`).
      if (kind === "throw" || kind === "place") {
        actionRight.current = juggle.current.handMix < 0.5;
      }
      fallStarted.current = false;
      // Giriş harmanı: ellerin ve topun ŞU ANKİ noktaları mandallanır (bu
      // karede poz henüz uygulanmadı, yani kemikler bir önceki karenin
      // hokkabazlık pozunu taşır — harman tam o noktadan başlar).
      actionIntroT.current = 0;
      if (kind && armRig && other) {
        palmHoldPoint(hand, clone, t.a, null);
        actionFromR.current.copy(t.a);
        clone.worldToLocal(actionFromR.current);
        palmHoldPoint(other, clone, t.b, null);
        actionFromL.current.copy(t.b);
        clone.worldToLocal(actionFromL.current);
        grip.getWorldPosition(bombFrom.current);
      }
      // Hokkabazlık TUTUŞTAN başlar: bomba geri geldiğinde elde dururken
      // doğar, havada yakalanmaya çalışılmış gibi okunmaz ve döngü sınırında
      // zıplama olmaz.
      juggleTime.current = 0;
    }
    // Aksiyon sürerken harman zamanı ilerler (kısa bir rampa).
    if (kind) actionIntroT.current += dt;

    // 🤹 Faz TEK yerden ilerler: kol pozu ile bomba aynı zamanı okumak zorunda,
    // yoksa top kolu bir kare geriden takip eder. Aksiyon sırasında döngü
    // durur — sıfırda bekler, aksiyon bitince oradan devam eder.
    if (!kind) juggleTime.current += dt;

    if (action && armRig && other) {
      // 🧨 AKSİYON: hokkabazlık yerine tek seferlik hareket oynar.
      const p = THREE.MathUtils.clamp(action.progress, 0, 1);
      const intro = kind === "empty" ? 1 : Math.min(1, actionIntroT.current / ACTION_INTRO_S);
      const isPlace = action.kind === "place";
      // Bombanın ELDEN ÇIKTIĞI an: fırlatmada sim'in eşiği (`BOMB_RELEASE_AT`),
      // yere bırakmada düşüşün başlangıcı — yere DEĞME anı sim'den (`land`) ve
      // tuzak o karede doğuyor, aradaki süre düşüşün kendisidir.
      const release = isPlace
        ? Math.max(0.1, (action.land ?? 0.72) - PLACE_FALL_SPAN)
        : (action.release ?? 0.62);
      const right = actionRight.current;
      const holder = right ? hand : other;

      if (action.kind === "empty") {
        // Bomba elde YOK: kollar hokkabazlığın TUTUŞ BAŞI pozunda durur
        // (top çevirme yok, görünmez bir top çevrilmiş gibi okunmaz) ve
        // bomba geri geldiğinde döngü sıfırdan, oradan devam eder.
        applyBombActionPose(
          clone,
          armRig,
          { kind: "empty", progress: 0, release: 0, right },
          swayTime.current,
        );
        return;
      }

      // 🤹 ÖNCE KOLLAR, SONRA TOP — hokkabazlıkla aynı kural: bombanın konumu
      // avuç noktasından türetildiği için kol pozlanmadan okunamaz.
      applyBombActionPose(
        clone,
        armRig,
        {
          kind: action.kind,
          progress: p,
          release,
          right,
          intro,
          from: { right: actionFromR.current, left: actionFromL.current },
        },
        swayTime.current,
      );
      palmHoldPoint(holder, clone, t.a, t.aOut);
      // Giriş harmanı topu da kapsar: bomba, bulunduğu noktadan avuca akar
      // (aksiyon başlarken top havadaysa elde değil, yolda görünür).
      if (intro < 1) t.a.lerp(bombFrom.current, 1 - intro);

      // Yönelim: bombayı tutan elin kalibrasyonu (fünye o elde okunur yatar).
      t.desired.copy(bombGripWorldQuat(holder, clone));
      t.flip.copy(handWorldQuat(hand)).invert();
      grip.quaternion.copy(t.flip).multiply(t.desired);
      grip.scale.setScalar(BOMB_CONTAINER_MODEL_SCALE / boneScaleRef.current);

      if (p < release) {
        // Bomba HÂLÂ ELDE: avuca oturur ve kolla birlikte savrulur.
        grip.position.copy(t.a);
        hand.worldToLocal(grip.position);
        grip.visible = true;
        return;
      }

      if (action.kind === "throw") {
        // 🧨 Bomba elden ÇIKTI: mermi sim tarafında doğdu (bkz.
        // `SkillComponent.fireBombThrow`). Elde tutulan model gizlenir, yoksa
        // aynı top iki kez görünürdü (elde + uçarken).
        grip.visible = false;
        return;
      }

      // ── YERE BIRAKMA: DÜŞÜŞ ─────────────────────────────────────────
      // Top, bırakıldığı noktadan ZEMİNE iner ve hız kazanır; yatayda
      // karakterin gövde eksenine yerleşir (tuzak da oraya konur).
      if (!fallStarted.current) {
        fallStarted.current = true;
        fallFrom.current.copy(t.a);
      }
      const land = action.land ?? 0.72;
      const fall = THREE.MathUtils.clamp(
        (p - release) / Math.max(1e-4, land - release),
        0,
        1,
      );
      groundHoldPoint(clone, armRig, t.land);
      t.a.lerpVectors(fallFrom.current, t.land, fall * fall);
      grip.position.copy(t.a);
      hand.worldToLocal(grip.position);
      // Top yere değdiği karede gizlenir: tuzak TAM o anda doğar (`placeBombTrap`).
      grip.visible = p < land;
      return;
    }

    // 🤹 HOKKABAZLIK: kol pozu faz alanlarından sürülür (konumdan önce
    // çağrılabilir), sonra avuç noktaları okunur.
    if (armRig && other) {
      applyBombArmPose(
        clone,
        armRig,
        sampleJuggleTiming(juggleTime.current, juggle.current),
        swayTime.current,
      );
    }

    if (!other) return; // tek elli rig: kalibre edilmiş sabit tutuş kalır

    const handQuat = handWorldQuat(hand);

    // Atışın iki ucu: ellerin AVUÇ merkezleri, elde tutuş ötelemesiyle birlikte
    // (aynı geometri el tutuşuyla paylaşılır — bkz. `palmHoldPoint`).
    palmHoldPoint(hand, clone, t.a, t.aOut);
    palmHoldPoint(other, clone, t.b, t.bOut);
    // Yol gövdenin İÇİNDEN geçmesin: yay, iki elin ortasından dışa doğru bükülür.
    //
    // DİKKAT: eller gövdenin iki YANINDA dururken dışa yönler birbirini götürür
    // (sağ el +X, sol el −X) ve bükülme YÖNSÜZ kalır. O durumda bükülme hiç
    // uygulanmaz; sabit bir "ileri" ekseni varsaymak yayı gövdenin içine ya da
    // arkasına savururdu. Topu gövdenin önünden geçiren şey zaten yayın
    // YÜKSEKLİĞİDİR (bkz. `JUGGLE_ARC`): top ellerin üstünden, göğüs hizasından
    // aşar. Bükülme yalnız kollar asimetrikken (yürüyüş salınımı) devreye girer.
    const pull = t.pull.copy(t.aOut).add(t.bOut);
    if (pull.lengthSq() > 0.09) pull.normalize();
    else pull.set(0, 0, 0);

    const sample = sampleBombJuggle(t.a, t.b, pull, juggleTime.current, juggle.current);

    // Konum: dünya → kapsayıcının parent'ı (sağ el) yerel uzayı.
    grip.position.copy(sample.position);
    hand.worldToLocal(grip.position);

    // Yönelim: HER el için İSTENEN dünya yönelimi ayrı ayrı hesaplanır (fünye
    // gövdeden uzağa yatar; sağ elde sağa, sol elde sola — tek taban top sola
    // geçtiğinde fünyeyi gövdenin üstüne devirirdi), sonra topun hangi elde
    // olduğuna göre (`handMix`) aralarında yumuşak geçiş yapılır. Takla ise
    // DÜNYA uzayında bindirilir (bomba uçtuğu yöne yuvarlanır) ve sonuç sağ elin
    // yerel uzayına çevrilir — kapsayıcı o elin çocuğudur.
    //
    // Kapsayıcıya DOKUNMAYAN bu hesaplama bilinçli: `calibrateBombGrip` de
    // kapsayıcının KONUMUNU yazar, oysa konum biraz aşağıda atış eğrisinden
    // geliyor.
    t.rightBase.copy(bombGripWorldQuat(hand, clone));
    t.leftBase.copy(bombGripWorldQuat(other, clone));
    t.desired.copy(t.rightBase).slerp(t.leftBase, sample.handMix);
    t.spin.setFromAxisAngle(sample.spinAxis, sample.spinAngle);
    t.desired.premultiply(t.spin);
    t.flip.copy(handQuat).invert();
    grip.quaternion.copy(t.flip).multiply(t.desired);

    // Yakalama ezilmesi: kapsayıcı ölçeği dünya normalizasyonunu taşıdığı için
    // squash doğrudan buraya bindirilir (bomba havada hafifçe esner).
    grip.scale.setScalar((BOMB_CONTAINER_MODEL_SCALE / boneScaleRef.current) * sample.squash);
  });

  return { bombRef };
}
