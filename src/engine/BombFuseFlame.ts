// 🔥 BombFuseFlame — bombanın AĞZINDAKİ (fünye ucundaki) CANLI ateş.
//
// NEDEN KOD, NEDEN DOKU DEĞİL: model dosyası (`comical_bomb.glb`) statiktir;
// içinde ne ışıyan uç ne alev animasyonu vardır. Ateş bu yüzden çalışma
// zamanında kurulur ve modelin fünye ucuna (ağzına) oturtulur:
//
//   · 4 katmanlı alev — sıcak taban (body), parlak çekirdek (core), yukarı
//     uzayan dil (tongue) ve çok soluk bir hâle (halo). Hepsi additif
//     sprite'tır; küre mesh'i DEĞİL (kaba beyaz küre şikâyeti tekrarlanmasın).
//   · TİTREME (flicker) — iki bileşen: hızlı düzensiz hedef değişimi + bu
//     hedefe yumuşak yaklaşma. Sinüs tek başına "mekanik" okunurdu.
//   · KOR PARÇACIKLARI — alevden kopup yükselen 3 minik additif kıvılcım;
//     "canlı" hissini veren şey alevin titremesinden çok bunlardır.
//   · NOKTASAL IŞIK — fünye ucundan yumuşak turuncu ışık; eli ve bombanın
//     üstünü aydınlatır. Menzili bomba boyuyla ölçeklenir (haritayı boyamaz).
//
// ÖLÇÜ SÖZLEŞMESİ: tüm boyutlar bombanın dünya genişliğinden (`span`) türetilir.
// Konumlandığı kapsayıcı (bkz. `SamuraiBomb` → `pivot`) DÜNYA birimindedir, bu
// yüzden burada 1 birim = 1 dünya birimi; alev avuçla birlikte doğru ölçekte
// görünür ve skin/ölçek değişse de ayar gerekmez.
//
// Erişilebilirlik: `prefers-reduced-motion` açıksa titreme genliği kısılır
// (alev yine yanar, yalnızca sakin durur) — projedeki çim rüzgârıyla aynı kural.
import * as THREE from "three";

/* ------------------------------- doku ------------------------------------ */

/** Yumuşak radyal alev dokusu (bir kez üretilir, tüm bombalar paylaşır). */
let flameTexture: THREE.Texture | null = null;

function makeFlameTexture(): THREE.Texture {
  if (flameTexture) return flameTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    // Beyaz-sıcak çekirdek → amber → turuncu → tamamen saydam kenar.
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.26, "rgba(255,238,186,0.86)");
    g.addColorStop(0.6, "rgba(255,148,42,0.34)");
    g.addColorStop(1, "rgba(255,88,10,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  flameTexture = tex;
  return tex;
}

/** Animasyon kısıtlı mı? (yalnızca bir kez sorulur) */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ------------------------------ alev katmanı ------------------------------ */

export interface FuseFlame {
  /** Fünye ucuna oturtulacak kapsayıcı (dünya biriminde konumlanır). */
  group: THREE.Group;
  /** Kare başına ilerletir (`dt` saniye). */
  update(dt: number): void;
  dispose(): void;
}

interface Ember {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  life: number;
  max: number;
  vy: number;
  x: number;
  y: number;
  z: number;
  phase: number;
}

/**
 * Bomba ağzı için canlı alev kurar. `span` = bombanın dünya genişliği
 * (samuray bombası için `BOMB_TARGET_WORLD_SPAN`) — tüm ölçüler bundan türer.
 */
export function createFuseFlame(span: number): FuseFlame {
  const tex = makeFlameTexture();
  const motion = prefersReducedMotion() ? 0.25 : 1;
  const baseY = 0.1 * span; // alevin dip kotu (fünye ucunun hemen üstü)

  const group = new THREE.Group();
  group.renderOrder = 9;
  group.userData.isEquipment = true;

  const sprites: THREE.Sprite[] = [];
  const mats: THREE.SpriteMaterial[] = [];

  const mkSprite = (color: string, opacity: number): THREE.Sprite => {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      // Additif: ateş ışık yayar. Koyu zemin üstünde okunur, görüşü kapatmaz
      // (opaklıklar düşük tutuldu).
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.raycast = () => {};
    sprite.frustumCulled = false;
    sprite.renderOrder = 9;
    sprite.userData.isEquipment = true;
    group.add(sprite);
    sprites.push(sprite);
    mats.push(mat);
    return sprite;
  };
  /** Sprite'ın malzemesi (dört katmanın hepsi SpriteMaterial taşır). */
  const matOf = (s: THREE.Sprite) => s.material as THREE.SpriteMaterial;

  // Hâle (en soluk, en büyük): ateşin çevresine yayılan sıcak parıltı.
  const halo = mkSprite("#ff5c12", 0.15);
  // Gövde: alevin turuncu tabanı.
  const body = mkSprite("#ff8a1e", 0.85);
  // Dil: yukarı uzayan, hafif eğilen sarı dil.
  const tongue = mkSprite("#ffd25a", 0.75);
  // Çekirdek: en parlak, en küçük beyaz-sıcak nokta.
  const core = mkSprite("#fff3c4", 0.95);
  const haloMat = matOf(halo);
  const bodyMat = matOf(body);
  const tongueMat = matOf(tongue);
  const coreMat = matOf(core);

  // Nokta ışığı: fünye ucundan ışık verir, titrer. Menzil bomba boyuyla
  // ölçeklenir — haritayı aydınlatmaz, yalnız eli/bombayı ısıtır.
  //
  // ŞİDDET NEDEN BU KADAR KÜÇÜK: three r155+ fiziksel ışık birimleri kullanır
  // (ışıma = şiddet / mesafe²). Alev elin ~0.1 birim uzağında olduğu için
  // şiddet 1 olsaydı aydınlanma güneş ışığının (≈1.6) onlarca katına çıkıp
  // eli bembeyaz yakardı. 0.014, tam elin üstünde güneşle yarışan sıcak bir
  // parıltı verir.
  const LIGHT_INTENSITY = 0.014;
  const light = new THREE.PointLight("#ff7a1e", LIGHT_INTENSITY, span * 6, 2);
  light.userData.isEquipment = true;
  group.add(light);

  // Kor parçacıkları (alevden kopan minik kıvılcımlar).
  const embers: Ember[] = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: i === 0 ? "#fff0c0" : "#ff9a30",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.raycast = () => {};
    sprite.frustumCulled = false;
    sprite.renderOrder = 9;
    sprite.userData.isEquipment = true;
    group.add(sprite);
    mats.push(mat);
    embers.push({
      sprite,
      mat,
      life: Math.random() * 0.6,
      max: 0.6,
      vy: 0,
      x: 0,
      y: 0,
      z: 0,
      phase: Math.random() * Math.PI * 2,
    });
  }

  let time = Math.random() * 10;
  let flick = 1;
  let target = 1;
  let nextPick = 0;

  /** Bir kor parçacığını alevin dibinde yeniden doğurur. */
  const respawn = (e: Ember) => {
    const ang = Math.random() * Math.PI * 2;
    const r = span * 0.08 * Math.random();
    e.x = Math.cos(ang) * r;
    e.z = Math.sin(ang) * r;
    e.y = baseY + span * 0.12;
    e.vy = span * (0.55 + Math.random() * 0.85);
    e.max = e.life = 0.45 + Math.random() * 0.5;
    e.phase = Math.random() * Math.PI * 2;
  };
  for (const e of embers) {
    respawn(e);
    e.life = Math.random() * e.max; // başlangıçta dağınık fazlar
  }

  const update = (dt: number) => {
    // Sekme arka plana düştüğünde alev ışınlanmasın.
    const d = Math.min(dt, 1 / 30);
    time += d;

    // Titreme: hızlı düzensiz hedefler + yumuşak yaklaşma (mekanik sinüs yok).
    if (time >= nextPick) {
      nextPick = time + 0.04 + Math.random() * 0.07;
      target = 0.62 + Math.random() * 0.62;
    }
    flick += (target - flick) * Math.min(1, d * (14 + 10 * motion));
    const amp = 1 - motion; // 0 = canlı, 1 = sakin (reduced-motion)
    const f = 1 + (flick - 1) * motion;

    // Hâle: ateşin çevresindeki ışıma. Bomba boyunu aşmayan ölçüde tutulur ve
    // tepede durur → karakterin üzerini kapatmaz (bkz. "görüş açıklığı" kuralı).
    haloMat.opacity = (0.11 + 0.07 * f) * (1 - 0.25 * amp);
    halo.scale.setScalar(span * (1.05 + 0.35 * f));
    halo.position.set(0, baseY + span * 0.32, 0);

    // Gövde: turuncu taban. Dikeyde hafif uzun (alev dili).
    bodyMat.opacity = 0.6 + 0.3 * f;
    body.scale.set(span * (0.6 + 0.18 * f), span * (0.78 + 0.3 * f), 1);
    body.position.set(0, baseY + span * 0.2, 0);

    // Çekirdek: beyaz-sıcak nokta, hafif seğirir. (Titreşim 1'i aşabildiği
    // için opaklık kırpılır — aksi hâlde değer 1.07'ye çıkıyordu.)
    coreMat.opacity = Math.min(1, 0.7 + 0.3 * f);
    core.scale.setScalar(span * (0.34 + 0.24 * f));
    core.position.set(
      Math.sin(time * 11.3) * 0.03 * span * motion,
      baseY + span * (0.22 + 0.06 * f),
      Math.cos(time * 9.1) * 0.03 * span * motion,
    );

    // Dil: yukarı uzayan sarı kısım; yavaşça sağa sola yalpa yapar.
    tongueMat.opacity = 0.5 + 0.35 * f;
    tongue.scale.set(span * 0.34, span * (0.44 + 0.6 * f), 1);
    tongue.position.set(
      Math.sin(time * 6.7) * 0.05 * span * motion,
      baseY + span * (0.4 + 0.14 * f),
      0,
    );
    // Sprite'ı kendi ekseninde yatırmak "yalayan alev" okuması verir.
    tongueMat.rotation = Math.sin(time * 7.9) * 0.22 * motion;

    // Işık: titremeyle birlikte nefes alır.
    light.intensity = LIGHT_INTENSITY * (0.6 + 0.8 * f) * (1 - 0.35 * amp);
    light.position.set(0, baseY + span * 0.3, 0);

    // Kor parçacıkları: yükselir, hafifçe salınır, söner.
    for (const e of embers) {
      e.life -= d;
      if (e.life <= 0) {
        respawn(e);
        continue;
      }
      e.y += e.vy * d;
      // Yukarı çıkarken yavaşlar (alevden kopan korun davranışı).
      e.vy -= e.vy * 1.1 * d;
      const k = 1 - e.life / e.max;
      const sway = Math.sin(time * 5.4 + e.phase) * span * 0.12 * motion;
      e.sprite.position.set(e.x + sway * k, e.y, e.z + sway * 0.5 * k);
      e.sprite.scale.setScalar(span * (0.16 - 0.08 * k));
      const fade = 1 - k;
      e.mat.opacity = 0.9 * fade * fade;
    }
  };

  const dispose = () => {
    group.removeFromParent();
    group.clear();
    for (const m of mats) m.dispose();
    light.dispose();
  };

  // İlk kareyi hemen uygula (alev bir kare boyunca sıfır ölçekte kalmasın).
  update(1 / 60);

  return { group, update, dispose };
}

/* ------------------------- ağız (fünye) noktası --------------------------- */

/** Fünye/ateş taşıyan düğümleri tanıyan ad kalıbı (malzeme veya mesh adı). */
const FUSE_RE = /fuse|fitil|wick|glow|flame|fire|ember|spark|alev/i;

/**
 * Bir malzeme/düğüm adı fünye ya da ateş ucuna mı işaret ediyor? Model
 * değişse de (comical_bomb / bomba / prosedürel) aynı kuralla bulunur.
 */
export const isFuseLikeName = (name: string): boolean => FUSE_RE.test(name);

/**
 * GÖVDE kutusu (model kökünün uzayında) — fitil/ateş mesh'leri HARİÇ.
 *
 * NEDEN hariç: ölçek normalizasyonu "gövde kaç birim?" sorusuna dayanır. Tüm
 * modelin kutusu kullanılırsa, YANA/UZAĞA uzanan bir fitil ya da kıvılcım XZ
 * genişliğini şişirir ve bomba olduğundan küçük ölçeklenir (ekranda "ufacık"
 * görünür). Aynı ayrım, bombanın AĞIRLIK MERKEZİNİ bulurken de gerekir: fitil
 * tepeye doğru uzadığı için tüm modelin kutu merkezi gövdenin merkezi DEĞİLDİR.
 *
 * Çağıran, ebeveynsiz (dünya = yerel) bir klon geçirir — kutu bu yüzden
 * doğrudan model kökünün uzayındadır.
 */
function bodyBox(root: THREE.Object3D): THREE.Box3 | null {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  let any = false;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (isFuseLikeName(o.name)) return;
    const list = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    if (list.some((m) => m && isFuseLikeName(m.name))) return;
    box.expandByObject(mesh);
    any = true;
  });
  return any ? box : null;
}

/** Gövde genişliği (XZ) — yalnızca gövde mesh'lerinden; hiç bulunamazsa tüm model. */
export function measureBodySpan(root: THREE.Object3D): number {
  const box = bodyBox(root) ?? new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  return Math.max(size.x, size.z);
}

/**
 * Gövdenin MERKEZİ (model kökünün uzayında) — fünye hariç.
 *
 * NEDEN GEREKLİ: bomba avuca oturtulurken referans, gövdenin (kürenin)
 * merkezidir. Modelin origin'i kürenin merkezinde DEĞİLSE (Blender'da pivot
 * tabana konmuşsa) bomba avucun dışına kaçar ya da içine gömülür. Bu yüzden
 * merkez ölçülür ve model buna göre kaydırılır — modele özel sabit gerekmez.
 */
export function measureBodyCenter(root: THREE.Object3D): THREE.Vector3 {
  const box = bodyBox(root) ?? new THREE.Box3().setFromObject(root);
  // Ölçüm dünya uzayında yapılır; çağıran modelin KENDİ biriminde bekler.
  const center = box.getCenter(new THREE.Vector3());
  return root.worldToLocal(center);
}

/**
 * Fünye YÖNÜ (model kökünün uzayında, birim vektör): ağız noktasından gövde
 * merkezine giden vektörün tersi. Modelin fitili hangi eksende çizilmiş olursa
 * olsun (yukarı, yana, eğik), bu yön bulunur ve fünye istenen dünya yönüne
 * hizalanır — bkz. `SamuraiBomb.mount` pivot rotasyonu.
 */
export function measureFuseDirection(root: THREE.Object3D): THREE.Vector3 {
  const dir = findFuseAnchor(root).sub(measureBodyCenter(root));
  if (dir.lengthSq() < 1e-10) return new THREE.Vector3(0, 1, 0);
  return dir.normalize();
}

/**
 * Modelin AĞIZ noktasını (fünyenin yanan ucu), model kökünün KENDİ uzayında
 * döndürür.
 *
 * İki strateji:
 *  1. Fünye/ateş olduğu belli mesh veya malzemeler varsa (ad kalıbı) hepsinin
 *     birleşik kutusunun TEPE merkezi kullanılır — yanan uç orasıdır.
 *  2. Ad ipucu yoksa modelin en üst noktası (kutu tepe merkezi) kullanılır;
 *     fünye her zaman yukarı bakar, dolayısıyla ağız orasıdır.
 *
 * Dönen nokta model köküne GÖRELİDİR: çağıran onu modelin ölçeğiyle çarparak
 * kapsayıcı uzayına taşır (bkz. `SamuraiBomb.mount`).
 */
export function findFuseAnchor(root: THREE.Object3D): THREE.Vector3 {
  root.updateWorldMatrix(true, true);

  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (found) return;
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (FUSE_RE.test(o.name)) {
      found = o;
      return;
    }
    const list = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of list) {
      if (m && FUSE_RE.test(m.name)) {
        found = o;
        return;
      }
    }
  });

  if (found) {
    // TÜM fitil/ateş parçalarının birleşik kutusu: tek tek bakıldığında
    // "komik bomba" gibi modellerde ilk bulunan parça fitilin ORTASI olabiliyor
    // (alev gövdenin üstünde değil ortasında yanıyormuş gibi görünür).
    const box = new THREE.Box3();
    let any = false;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      if (!FUSE_RE.test(o.name) && !list.some((m) => m && FUSE_RE.test(m.name))) return;
      box.expandByObject(mesh);
      any = true;
    });
    if (any) {
      // Ağız = kümenin TEPESİ (yanan uç), ortası değil.
      return root.worldToLocal(
        new THREE.Vector3(
          (box.min.x + box.max.x) / 2,
          box.max.y,
          (box.min.z + box.max.z) / 2,
        ),
      );
    }
    const single = new THREE.Box3().setFromObject(found);
    return root.worldToLocal(single.getCenter(new THREE.Vector3()));
  }

  const box = new THREE.Box3().setFromObject(root);
  return root.worldToLocal(
    new THREE.Vector3(
      (box.min.x + box.max.x) / 2,
      box.max.y,
      (box.min.z + box.max.z) / 2,
    ),
  );
}
