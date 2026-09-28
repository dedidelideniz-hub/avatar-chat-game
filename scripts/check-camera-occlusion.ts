/**
 * KAMERA OCCLUSION doğrulaması (kalıcı betik).
 *
 * `src/engine/buildingOcclusion.ts` saf (React'siz) olduğu için matematiği
 * GERÇEK `three.js` nesneleriyle ölçülebilir: gerçek `BUILDINGS` yerleşimiyle
 * bir sahne kurulur, kamera `FollowCamera` ile aynı formülle konumlandırılır ve
 * ışın/fade davranışı sınanır.
 *
 * Ölçülenler:
 *   · Oyuncu bina sırasının ARKASINA geçince o binanın algılanması + 0.3'e
 *     yumuşak iniş (`transparent` açılır).
 *   · Uzaktaki binaların ETKİLENMEMESİ (malzeme izolasyonu çalışıyor mu).
 *   · Önü açıkken tekrar 1.0 / opak hâle dönüş.
 *   · Kameradan oyuncuya kadar olan mesafeyle sınırlı ışın (arkadaki binayı
 *     yakalamaması) ve `building` etiketi taşımayan geometrinin yok sayılması.
 *   · Mobil yol: ışın atlanan karelerde geçişin yine de akması.
 *   · `resetOccluders` temizliği.
 *
 * Çalıştırma: bun scripts/check-camera-occlusion.ts
 */
import * as THREE from "three";
import {
  BUILDINGS,
  CAMERA_ELEVATION,
  CAMERA_ZOOM,
  PLAYER_3D_HEIGHT,
  S,
  WORLD_WIDTH,
  WORLD_Z_MAX,
} from "../src/engine/constants";
import {
  BUILDING_TAG,
  BUILDING_USER_DATA,
  OCCLUDED_OPACITY,
  castOcclusionRays,
  collectBuildingOccluders,
  resetOccluders,
  updateCameraOcclusion,
  type BuildingOccluder,
} from "../src/engine/buildingOcclusion";

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`);
}
const f = (n: number, d = 3) => n.toFixed(d);

/* ── Sahne: gerçek BUILDINGS yerleşimi ─────────────────────── */
// `GameEngine3D.Building` ile aynı dönüşüm: grup [x, h/2, frontZ - d/2],
// gövde kutusu (w, h, d). Occlusion yalnızca gövdeyi bilmek zorunda olduğu
// için sahnede tek kutu yeter (tente/tabela ışın testini değiştirmez).
const scene = new THREE.Scene();
const SHARED_MAT = new THREE.MeshStandardMaterial({ color: "#c07040" });
const bodyBySign = new Map<string, THREE.Mesh>();

for (const def of BUILDINGS) {
  const group = new THREE.Group();
  group.userData = { ...BUILDING_USER_DATA };
  group.position.set(def.x, def.h / 2, def.frontZ - def.d / 2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), SHARED_MAT);
  bodyBySign.set(def.signText ?? `${def.x}`, body);
  group.add(body);
  scene.add(group);
}
// Etiketsiz prop (çit/lamba gibi): ışın yolunda olsa bile yok sayılmalı.
const prop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 1.2), SHARED_MAT);
prop.position.set(-13, 1, -3.2);
scene.add(prop);

const occluders = collectBuildingOccluders(scene);

/* ── 1) Toplama + malzeme izolasyonu ───────────────────────── */
console.log("KURULUM");
check(occluders.length === BUILDINGS.length, `sahnedeki tüm binalar indekslendi`, `${occluders.length}/${BUILDINGS.length}`);
check(BUILDING_USER_DATA[BUILDING_TAG] === true && prop.userData[BUILDING_TAG] === undefined, "etiket ('building') yalnızca bina köklerinde");

const used = new Set<THREE.Material>();
let sharedAcross = 0;
let stillShared = 0;
for (const occluder of occluders) {
  for (const material of occluder.materials) {
    if (used.has(material)) sharedAcross++;
    used.add(material);
  }
}
for (const body of bodyBySign.values()) if (body.material === SHARED_MAT) stillShared++;
check(sharedAcross === 0, "malzemeler bina başına izole edildi (paylaşım yok)", `${used.size} malzeme`);
check(stillShared === 0, "mesh'ler paylaşılan kaynak yerine kendi klonunu kullanıyor", `${bodyBySign.size} bina`);
check(used.size >= BUILDINGS.length, "her binanın en az bir malzemesi var", `${used.size} ≥ ${BUILDINGS.length}`);

/* ── Konum yardımcıları (CameraOcclusion / FollowCamera ile aynı) ── */
const svgOfX = (x: number) => (x + WORLD_WIDTH / 2) * S;
const svgOfZ = (z: number) => (WORLD_Z_MAX - z) * S;
/** `CameraOcclusion` içindeki px → dünya dönüşümü. */
const pxToWorld = (svgX: number, svgY: number) => ({
  x: svgX / S - WORLD_WIDTH / 2,
  z: WORLD_Z_MAX - svgY / S,
});
/** `FollowCamera` ile aynı kamera konumu. */
const cameraFor = (player: { x: number; z: number }) =>
  new THREE.Vector3(
    player.x,
    Math.sin(CAMERA_ELEVATION) * CAMERA_ZOOM,
    player.z + Math.cos(CAMERA_ELEVATION) * CAMERA_ZOOM,
  );
/** Bileşenin kare döngüsünü taklit eder. */
const run = (
  playerWorld: { x: number; z: number },
  frames = 120,
  castRays = true,
  dt = 1 / 60,
) => {
  const camera = cameraFor(playerWorld);
  for (let i = 0; i < frames; i++) updateCameraOcclusion(occluders, camera, playerWorld, dt, castRays);
  return camera;
};
const opacityOf = (signText: string) => {
  const index = BUILDINGS.findIndex((b) => b.signText === signText);
  const entry = occluders[index];
  return { entry, opacity: entry.materials[0].opacity, transparent: entry.materials[0].transparent };
};
const camera = cameraFor({ x: 0, z: 0 });
const roundTrip = pxToWorld(svgOfX(-13), svgOfZ(-15.2));
check(
  Math.abs(roundTrip.x - -13) < 1e-9 && Math.abs(roundTrip.z - -15.2) < 1e-9 &&
    Math.abs(camera.y - Math.sin(CAMERA_ELEVATION) * CAMERA_ZOOM) < 1e-9,
  "px ↔ dünya dönüşümü ve kamera konumu motorla aynı",
  `oyuncu X ${f(roundTrip.x)} · Z ${f(roundTrip.z)} · kamera y ${f(camera.y)}`,
);

/* ── 2) Oyuncu bina sırasının arkasında ───────────────────── */
// Oyuncu X -13 (FIRIN dükkanının arkası) · Z -15.2 (arka cadde): kamera güneyde
// ve yukarıda, ışın çarşı sırasını KESİP oyuncuya iner.
console.log("\nOYUNCU BİNALARIN ARKASINDA (arka cadde, X -13)");
const behind = pxToWorld(svgOfX(-13), svgOfZ(-15.2));
const behindCam = run(behind);
castOcclusionRays(occluders, behindCam, behind);
const near = opacityOf("FIRIN"); // X -13 · cephe Z -10.9, arkası Z -12.7 (oyuncu tam önünde)
const far = opacityOf("OTEL"); // X -13 · arka sıra, Z -20.1 — oyuncunun KUZEYİNDE (ışın menzilinin dışı)
check(near.entry.occluded, "oyuncunun önündeki bina ışın tarafından algılandı", `${near.entry.meshes.length} mesh tarandı`);
check(!far.entry.occluded, "oyuncunun gerisindeki (menzil dışı) bina algılanmadı");
check(
  Math.abs(near.opacity - OCCLUDED_OPACITY) < 0.02,
  `algılanan bina ${OCCLUDED_OPACITY} opaklığa indi`,
  `${f(near.opacity)} (120 kare)`,
);
check(near.transparent, "algılanan binanın malzemesi şeffaf işaretlendi (`transparent: true`)");
check(!near.entry.materials.some((m) => m.depthWrite === false), "şeffaf binada derinlik yazımı korunuyor (arkadaki katmanlar sıralı)");
check(Math.abs(far.opacity - 1) < 1e-6 && !far.transparent, "menzil dışındaki bina tam opak kaldı", `${f(far.opacity)}`);

/* ── 3) Yalnızca görüşü kesen bina iner ───────────────────── */
const faded = occluders.filter((o) => o.materials[0].opacity < 0.999);
check(faded.length === 1, "tek kare içinde yalnızca görüşü kesen bina şeffaflaştı", `${faded.length} bina`);

/* ── 4) Mobil yol: ışın atlanan karelerde geçiş akıyor ─────── */
console.log("\nMOBİL (ışın iki karede bir)");
resetOccluders(occluders);
const mobileCam = cameraFor(behind);
castOcclusionRays(occluders, mobileCam, behind);
const beforeSkip = opacityOf("FIRIN").opacity;
for (let i = 0; i < 30; i++) updateCameraOcclusion(occluders, mobileCam, behind, 1 / 60, false);
const afterSkip = opacityOf("FIRIN").opacity;
check(afterSkip < beforeSkip - 0.1, "ışın atlanan karelerde de opaklık düşüyor", `${f(beforeSkip)} → ${f(afterSkip)}`);
check(opacityOf("FIRIN").entry.occluded, "ışın atlanan karede önceki algılama korunuyor");
for (let i = 0; i < 120; i++) updateCameraOcclusion(occluders, mobileCam, behind, 1 / 60, false);
check(Math.abs(opacityOf("FIRIN").opacity - OCCLUDED_OPACITY) < 0.02, "geçiş hedefine oturdu", f(opacityOf("FIRIN").opacity));

/* ── 5) Etiketsiz geometri yok sayılır ────────────────────── */
console.log("\nETİKETSİZ GEOMETRİ");
const propBlocked = pxToWorld(svgOfX(-13), svgOfZ(-3.2)); // cadde: prop ile aynı hizada
resetOccluders(occluders);
const roadCam = cameraFor(propBlocked);
castOcclusionRays(occluders, roadCam, propBlocked);
check(
  occluders.every((o) => !o.occluded),
  "ışın yolundaki etiketsiz prop bina sayılmıyor (cadde üstünde hiçbir bina inmez)",
);
check(
  propBlocked.z > -5.2 && behind.z < -13,
  "test noktaları cadde/arka sokakta",
  `Z ${f(propBlocked.z)} · ${f(behind.z)}`,
);

/* ── 6) Önü açılınca tekrar opak ──────────────────────────── */
console.log("\nGÖRÜŞ AÇILINCA GERİ DÖNÜŞ");
resetOccluders(occluders);
run(behind, 120);
const occludedNow = occluders.filter((o) => o.occluded).length;
check(occludedNow > 0, "başlangıçta kesen bina var", `${occludedNow} bina`);
const clear = pxToWorld(svgOfX(-13), svgOfZ(2)); // binaların güneyi (caddenin önü)
run(clear, 120);
const restored = occluders.filter((o) => Math.abs(o.materials[0].opacity - 1) > 1e-6);
const stillTransparent = occluders.filter((o) => o.materials[0].transparent);
check(restored.length === 0, "görüş açılınca tüm binalar 1.0 opaklığa döndü", restored.length ? `${restored.length} kaldı` : "hepsi ✔");
check(stillTransparent.length === 0, "şeffaflık bayrağı kapatıldı (kalıcı alfa sıralaması yok)");

/* ── 7) Işın mesafesi: arkadaki bina yakalanmaz ───────────── */
console.log("\nIŞIN MESAFESİ");
resetOccluders(occluders);
const onRoad = pxToWorld(svgOfX(-13), svgOfZ(-3.2)); // cadde: binalar oyuncunun KUZEYİNDE (arkada)
run(onRoad, 120);
const behindPlayer = occluders.filter((o) => o.occluded);
check(behindPlayer.length === 0, "oyuncunun arkasındaki binalar şeffaflaşmıyor", `${behindPlayer.length} bina`);

/* ── 8) resetOccluders temizliği ──────────────────────────── */
console.log("\nTEMİZLİK");
run(behind, 120);
resetOccluders(occluders);
check(
  occluders.every((o) => Math.abs(o.materials[0].opacity - 1) < 1e-9 && !o.materials[0].transparent && !o.occluded),
  "resetOccluders tüm binaları ilk hâline döndürdü",
);
check(PLAYER_3D_HEIGHT > 1 && OCCLUDED_OPACITY === 0.3, "istenen değerler: opaklık 0.3, ışın karakter boyuna göre");

/* ── Sonuç ────────────────────────────────────────────────── */
console.log(failures === 0 ? "\nTÜM KONTROLLER GEÇTİ ✔" : `\n${failures} KONTROL BAŞARISIZ ✘`);
if (failures > 0) process.exit(1);
