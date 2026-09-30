/**
 * 🪑 GERÇEK AVATARLARDA OTURMA DOĞRULAMASI.
 *
 * Dört gerçek GLB'yi (varsayılan + üç deri) GLTFLoader + Meshopt ile yükler,
 * oyunun çalışma zamanıyla AYNI sırayı kurar (dış grup = dünya konumu/yön,
 * iç grup = ölçek + ayak ofseti, sonra `BenchSitController`) ve oturma pozunu
 * ÖLÇER. Doğrulanan asıl şeyler:
 *
 *   1. Kalça gerçekten MİNDERE OTURUYOR: kalçanın gerisindeki en alçak doku
 *      tepe noktası minderin üst yüzeyine değiyor (havada asılı değil, içine
 *      gömülü de değil).
 *   2. Diz minder hizasında ve minderin ÖN KENARININ dışında; baldır dikey
 *      sarkıyor (çömelme yok, bacakların içinden çıta geçmiyor).
 *   3. Ayak betona girmiyor, minderin altında kalıyor; taban yere paralel.
 *   4. Otururken yürüyüş ve idle GERÇEKTEN duruyor (eylem çalışmıyor).
 *   5. Poz 120 kare boyunca sabit (animasyon ezmiyor, kare başına titremiyor).
 *   6. Kalkışta BÜTÜN dönüşümler kaydedilen hâline dönüyor ve idle yeniden
 *      başlıyor.
 *
 * Çalıştır: bun scripts/check-sit-model-pose.ts
 */
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader, MeshoptDecoder } from "three-stdlib";
import {
  BENCHES,
  BENCH_SEAT_DEPTH,
  BENCH_SEAT_TOP,
  BENCH_WIDTH,
  PLAYER_3D_HEIGHT,
  benchSeatSpot,
  benchSeatYaw,
} from "../src/engine/constants";
import {
  BenchSitController,
  captureStandingPose,
  canSit,
  findSitBones,
  tipOf,
} from "../src/engine/SitPose";
import { getSeatState, setBenchSeatState } from "../src/engine/benchSeat";

(globalThis as any).ProgressEvent = class {
  constructor(type: string, init = {}) { Object.assign(this, init, { type }); }
};
let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  console.log((ok ? "✔ " : "✘ ") + label + (detail ? " - " + detail : ""));
  if (ok) passed++; else failures.push(label);
}
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder());
async function load(file: string) {
  const json = JSON.parse(readFileSync(`public/models/${file}.glb`, "utf8"));
  delete json.images; delete json.textures; delete json.samplers; delete json.materials;
  for (const mesh of json.meshes ?? []) for (const p of mesh.primitives ?? []) delete p.material;
  return await new Promise<any>((resolve, reject) => loader.parse(JSON.stringify(json), "", resolve, reject));
}
const pos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

/**
 * Kalça ekleminin ALTINDAKİ en alçak yüzey (dünya Y) — "mindere değen doku".
 * Testin KENDİ ölçümü: `SitPose` ile aynı fikri kullanır ama bağımsız kodla ve
 * TÜM tepeleri tarayarak, böylece "kalça mindere oturuyor mu" iddiası poz
 * koduyla birlikte yanlış olamaz.
 */
function lowestButtY(root: THREE.Object3D, pelvis: THREE.Vector3) {
  const v = new THREE.Vector3();
  let lowest = Infinity;
  root.traverse((obj) => {
    const mesh = obj as THREE.SkinnedMesh;
    if (!(mesh as any).isMesh) return;
    const attr = mesh.geometry?.getAttribute?.("position");
    if (!attr) return;
    const step = 1;
    for (let i = 0; i < attr.count; i += step) {
      if ((mesh as any).isSkinnedMesh) mesh.getVertexPosition(i, v);
      else v.fromBufferAttribute(attr, i);
      mesh.localToWorld(v);
      const dx = v.x - pelvis.x;
      const dz = v.z - pelvis.z;
      if (dx * dx + dz * dz > 0.14 * 0.14) continue;
      if (pelvis.y - v.y <= 0 || pelvis.y - v.y > 0.4) continue;
      if (v.y < lowest) lowest = v.y;
    }
  });
  return lowest;
}

const FILES = ["character", "skin-savasci", "skin-samuray", "skin-sevalye"] as const;
/** Oyunun `MODEL_YAW_OFFSET` tablosu ile aynı (bkz. GlbAvatar3D). */
const YAW_OFFSET: Record<string, number> = { "skin-savasci": Math.PI };

for (const file of FILES) {
  for (const facing of [1, -1] as const) {
    const label = `${file} facing ${facing}`;
    const gltf = await load(file);
    const root = gltf.scene as THREE.Object3D;
    const restore = captureStandingPose(root);
    const original: { o: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion }[] = [];
    root.traverse((o) => original.push({ o, p: o.position.clone(), q: o.quaternion.clone() }));

    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const scale = PLAYER_3D_HEIGHT / (box.max.y - box.min.y);
    const feetOffset = -box.min.y;
    const inner = new THREE.Group();
    inner.scale.setScalar(scale);
    inner.rotation.y = YAW_OFFSET[file] ?? 0;
    inner.add(root);
    const group = new THREE.Group();
    group.add(inner);

    // Poz testi bankın KONUMUNDAN bağımsızdır; önemli olan yöndür (facing).
    // Haritada o yönde bank yoksa (ör. hepsi kuzey kaldırımda, facing 1)
    // sentetik bir tanım kullanılır ki poz geometrisi yine iki yönde sınansın.
    const bench =
      BENCHES.find((b) => (b.facing ?? 1) === facing) ?? { x: 0, z: -6.85, facing };
    const spot = benchSeatSpot(bench);
    group.position.set(spot.x, 0.02, spot.z);
    group.rotation.y = benchSeatYaw(bench);

    const bones = findSitBones(root);
    const controller = new BenchSitController(root, bones, restore);
    const mixer = new THREE.AnimationMixer(root);
    const walkClip = gltf.animations.find((a: THREE.AnimationClip) => /walk|run/i.test(a.name)) ?? gltf.animations[0];
    const idleClip = gltf.animations.find((a: THREE.AnimationClip) => /idle|standing/i.test(a.name)) ?? gltf.animations[0];
    const walk = walkClip ? mixer.clipAction(walkClip).play() : null;
    const idle = idleClip ? mixer.clipAction(idleClip) : null;
    mixer.update(0.37);
    controller.sitOnBench(mixer, idle);

    check(`${label}: bacak iskeleti bulundu`, canSit(bones));
    check(
      `${label}: otururken yürüyüş ve idle gerçekten durdu`,
      !walk?.isRunning() && !idle?.isRunning(),
    );

    const frame = () => {
      mixer.update(1 / 60); // çalışan eylem yok → kemiklere dokunmaz
      inner.position.y = feetOffset * scale;
      controller.update(inner, group, facing, 1 / 60);
    };
    for (let i = 0; i < 150; i++) frame();

    const thighL = bones.thighL!;
    const shinL = bones.shinL!;
    const footL = bones.footL!;
    const hip = pos(thighL);
    const hipR = bones.thighR ? pos(bones.thighR) : hip;
    const pelvis = hip.clone().add(hipR).multiplyScalar(0.5);
    const knee = pos(tipOf(thighL)!);
    const shinBase = pos(shinL);
    const ankle = pos(tipOf(shinL)!);
    const footEnd = footL ? pos(tipOf(footL) ?? footL) : ankle;
    const thighDir = knee.clone().sub(hip).normalize();
    const shinDir = ankle.clone().sub(shinBase).normalize();
    const footDir = footEnd.clone().sub(ankle).normalize();

    // 1) KALÇA MİNDERE OTURUYOR.
    const buttY = lowestButtY(root, pelvis);
    check(
      `${label}: kalça dokusu mindere değiyor (havada asılı değil)`,
      Number.isFinite(buttY) && buttY < BENCH_SEAT_TOP + 0.06,
      `but y ${Number.isFinite(buttY) ? buttY.toFixed(3) : "yok"} · minder ${BENCH_SEAT_TOP}`,
    );
    // Tolerans GENİŞ: kalça ekleminin altında aşağı sarkan RİJİT giysi
    // (samuray hakaması, şövalye zırhı) mindere otururken çıtaların birkaç
    // santim içinden geçer — bu bilinçli kabul edildi, çünkü alternatifi
    // karakteri minderin üstünde havada bırakmaktır. Buradaki eşik, gövdenin
    // (dokunun) bankın içine gerçekten GÖMÜLMEDİĞİNİ doğrular.
    check(
      `${label}: kalça dokusu çıtanın derinine gömülmüyor`,
      buttY > BENCH_SEAT_TOP - 0.28,
      `but y ${buttY.toFixed(3)} · minder ${BENCH_SEAT_TOP}`,
    );
    check(
      `${label}: kalça eklemi minderin hemen üstünde (0.04–0.26)`,
      pelvis.y - BENCH_SEAT_TOP > 0.04 && pelvis.y - BENCH_SEAT_TOP < 0.26,
      `kalça ${pelvis.y.toFixed(3)} = minder + ${(pelvis.y - BENCH_SEAT_TOP).toFixed(3)}`,
    );
    check(
      `${label}: kalça minderin üstünde, ön kenarın gerisinde`,
      pelvis.y > BENCH_SEAT_TOP &&
        (pelvis.z - bench.z) * facing > -BENCH_SEAT_DEPTH / 2 &&
        (pelvis.z - bench.z) * facing < 0.2,
      `z kayma ${((pelvis.z - bench.z) * facing).toFixed(3)} · y ${pelvis.y.toFixed(3)}`,
    );
    check(
      `${label}: kalça bankın enini aşmıyor`,
      Math.abs(pelvis.x - bench.x) < BENCH_WIDTH / 2,
      `x farkı ${Math.abs(pelvis.x - bench.x).toFixed(3)}`,
    );

    // 2) DİZ MİNDER HİZASINDA, ÖN KENARIN DIŞINDA.
    check(
      `${label}: uyluk öne uzanıyor ve diz kalçanın ALTINA iniyor`,
      thighDir.z * facing > 0.75 && thighDir.y < -0.02 && thighDir.y > -0.8 && knee.y < hip.y,
      `yön (${thighDir.x.toFixed(2)}, ${thighDir.y.toFixed(2)}, ${thighDir.z.toFixed(2)}) · diz ${knee.y.toFixed(3)} < kalça ${hip.y.toFixed(3)}`,
    );
    check(
      `${label}: diz minder hizasında (çömelme yok, gömülme yok)`,
      knee.y < BENCH_SEAT_TOP + 0.08 && knee.y > BENCH_SEAT_TOP - 0.16,
      `diz ${knee.y.toFixed(3)} · minder ${BENCH_SEAT_TOP}`,
    );
    check(
      `${label}: diz ve ayak minderin ÖN KENARINI aşmış (bacaklar engelde değil)`,
      (knee.z - bench.z) * facing > BENCH_SEAT_DEPTH / 2 + 0.02 &&
        (ankle.z - bench.z) * facing > BENCH_SEAT_DEPTH / 2,
      `diz ${((knee.z - bench.z) * facing).toFixed(3)} · ayak ${((ankle.z - bench.z) * facing).toFixed(3)} · ön kenar ${(BENCH_SEAT_DEPTH / 2).toFixed(2)}`,
    );

    // 3) BALDIR DİKEY SARKIYOR, AYAK YERE PARALEL.
    check(
      `${label}: baldır aşağı sarkıyor (diz bükülü)`,
      shinDir.y < -0.97 && Math.abs(shinDir.z) < 0.2,
      `baldır (${shinDir.x.toFixed(2)}, ${shinDir.y.toFixed(2)}, ${shinDir.z.toFixed(2)})`,
    );
    check(
      `${label}: ayak minderin altında ve betona girmiyor`,
      ankle.y < BENCH_SEAT_TOP - 0.02 && ankle.y > -0.04,
      `ayak y ${ankle.y.toFixed(3)}`,
    );
    check(
      `${label}: ayak tabanı yere paralel`,
      footDir.z * facing > 0.8 && footDir.y > -0.35 && footDir.y < 0.35,
      `ayak yönü (${footDir.x.toFixed(2)}, ${footDir.y.toFixed(2)}, ${footDir.z.toFixed(2)})`,
    );
    // Bacaklar birbirini kesmesin: iki diz arasında boşluk kalsın.
    if (bones.thighR) {
      const kneeR = pos(tipOf(bones.thighR)!);
      check(
        `${label}: iki bacak birbirini kesmiyor`,
        knee.distanceTo(kneeR) > 0.12,
        `dizler arası ${knee.distanceTo(kneeR).toFixed(3)}`,
      );
    }

    // 4) POZ SABİT (animasyon ezmiyor).
    const before = pos(bones.footL ?? bones.shinL!);
    for (let i = 0; i < 120; i++) frame();
    check(
      `${label}: poz 120 kare boyunca sabit`,
      pos(bones.footL ?? bones.shinL!).distanceTo(before) < 1e-4,
    );

    // 5) AKSİYON AĞIRLIĞI 0 İKEN DE TABAN POZ AYNI OLMALI.
    // Oyun döngüsünde yürüyüşten çıkan `fadeOut` idle'ın ağırlığını 0'a
    // düşürür. O durumda taban bind (T) pozuna kaymamalı — kayarsa oturan
    // karakterin kolları öne uzanmış kalır (ekran görüntüsündeki görünüm).
    const signature = () => {
      const out: number[] = [];
      root.traverse((o) => {
        if ((o as THREE.Bone).isBone) out.push(o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w);
      });
      return out;
    };
    const firstPose = signature();
    controller.unsit(mixer);
    idle?.setEffectiveWeight(0);
    walk?.setEffectiveWeight(0);
    controller.sitOnBench(mixer, idle);
    for (let i = 0; i < 150; i++) frame();
    const secondPose = signature();
    const poseDiff = firstPose.reduce((m, v, i) => Math.max(m, Math.abs(v - secondPose[i])), 0);
    check(
      `${label}: idle ağırlığı 0 iken de taban poz aynı (bind pozuna kaymıyor)`,
      poseDiff < 1e-6,
      `maks fark ${poseDiff.toExponential(2)}`,
    );
    controller.unsit(mixer);

    // 6) KALKIŞ: dönüşümler aynen geri yükleniyor, idle yeniden başlıyor.
    controller.unsit(mixer);
    check(
      `${label}: kalkışta BÜTÜN model dönüşümleri geri yüklendi`,
      original.every(
        (t) =>
          t.o.position.distanceTo(t.p) < 1e-6 &&
          1 - Math.abs(t.o.quaternion.dot(t.q)) < 1e-6,
      ),
    );
    idle?.reset().play();
    mixer.update(1 / 60);
    check(`${label}: ayakta durma animasyonu yeniden başladı`, idle ? idle.isRunning() : true);
  }
}

// ── İskeletsiz model: gövde geriye yatar, kalça pivotu alçalır. ──
const bare = new THREE.Group();
const bareInner = new THREE.Group();
bareInner.add(bare);
const bareOuter = new THREE.Group();
bareOuter.add(bareInner);
const fallback = new BenchSitController(bare, findSitBones(bare), captureStandingPose(bare));
fallback.sitOnBench(new THREE.AnimationMixer(bare));
fallback.update(bareInner, bareOuter, 1, 0.6);
check(
  "rigsiz model: gövde geriye yatar ve pivot alçalır",
  bareInner.rotation.x < 0 && bareInner.position.y < 0,
  `açı ${bareInner.rotation.x.toFixed(3)} · y ${bareInner.position.y.toFixed(3)}`,
);

// ── REGRESYON: "Otur" düğmesi → depo → avatar bağlantısı ─────────────
// Oyun ağacında `seat` prop'u HER ZAMAN `null` geçirilir (World.tsx prop
// vermez → GameEngine3D `seat = null` → PlayerAvatar3D `seat={null}`).
// Eski kod `seat !== undefined ? seat : (readSeatStore ? getSeatState() : null)`
// yazıyordu; `null !== undefined` her zaman true olduğu için depo dalı ÖLÜ
// KODDU ve `getSeatState()` hiç çağrılmıyordu. Bu yüzden "Banka oturuldu"
// bildirimi çıkıyor ama karakter ASLA oturmuyordu. Avatarın okuma ifadesi
// mutlaka `??` kullanmalı.
const avatarSrc = readFileSync("src/engine/GlbAvatar3D.tsx", "utf8");
check(
  "avatar oturma durumunu `??` ile okuyor (null prop depoyu ezmiyor)",
  /seatRef\.current\s*=\s*seat\s*\?\?/.test(avatarSrc),
);
check(
  "avatar eski `seat !== undefined ?` tuzağını kullanmıyor",
  !/seatRef\.current\s*=\s*seat\s*!==/.test(avatarSrc),
);

// Depo davranışı: banka oturulunca geçerli SeatState, kalkınca null.
// Dizin BENCHES'ten türetilir (sabit "3" yazmak bank listesi kısalınca kırılır).
const storeIndex = BENCHES.length - 1;
setBenchSeatState({ near: storeIndex, seated: storeIndex });
const storeSeat = getSeatState();
check(
  "banka oturulunca depo geçerli oturma durumu (facing + yaw) veriyor",
  !!storeSeat &&
    (storeSeat.facing === 1 || storeSeat.facing === -1) &&
    Math.abs(Math.abs(storeSeat.yaw) - (storeSeat.facing < 0 ? Math.PI : 0)) < 1e-6,
  storeSeat
    ? `facing ${storeSeat.facing} · yaw ${storeSeat.yaw.toFixed(3)}`
    : "null",
);
setBenchSeatState({ near: null, seated: null });
check(
  "oturulmuyorken depo null döner (ayakta/yürüyen hâl)",
  getSeatState() === null,
);

console.log(`${passed}/${passed + failures.length} kontrol geçti`);
if (failures.length) process.exit(1);
