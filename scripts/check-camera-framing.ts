/**
 * `cameraFraming.ts` doğrulaması — bina arkasına/üst sokağa girildiğinde
 * kameranın otomatik olarak daha dik (top-down) ve daha yükseğe geçtiğini,
 * cadde dışına çıkıldığında ise eski kadraja döndüğünü kanıtlar.
 *
 * Çalıştır: bun scripts/check-camera-framing.ts
 */
import {
  CAMERA_BACK_ELEVATION,
  CAMERA_BACK_ZOOM,
  CAMERA_ELEVATION,
  CAMERA_ZOOM,
  BUILDINGS,
  ZONE,
  S,
  WORLD_Z_MAX,
} from "../src/engine/constants";
import { cameraFraming, cameraOpenAmount } from "../src/engine/cameraFraming";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✔ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(label);
    console.log(`  ✘ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

/** Kamera yüksekliği (dünya birimi) ve oyuncunun arkasındaki yatay ofset. */
const heightAt = (open: number) => {
  const f = cameraFraming(open);
  return Math.sin(f.elevation) * f.zoom;
};
const behindAt = (open: number) => {
  const f = cameraFraming(open);
  return Math.cos(f.elevation) * f.zoom;
};

console.log("── kamera açıklığı (cameraOpenAmount) ──");
check("Ana caddede (Z -3.2) kapalı", cameraOpenAmount(-3.2) === 0);
check("Kuzey çim / dükkan önü (Z -9) kapalı", cameraOpenAmount(-9) === 0);
check("Geçiş başlangıcında (OPEN_Z_START) 0", cameraOpenAmount(-10.6) === 0);
check("Tam açık eşiğinde (OPEN_Z_FULL) 1", cameraOpenAmount(-12.8) === 1);
check("Arka sokak (Z -15.2) tam açık", cameraOpenAmount(-15.2) === 1);
check("Arka sıra binaların önü (Z -20.1) tam açık", cameraOpenAmount(-20.1) === 1);
check("En güneyde (Z +1.6) kapalı", cameraOpenAmount(1.6) === 0);
check(
  "Geçiş ortası yarım ve [0,1] arasında",
  approx(cameraOpenAmount(-11.7), 0.5, 1e-9),
  `değer ${cameraOpenAmount(-11.7).toFixed(3)}`,
);

console.log("── monotonluk: kuzeye gidildikçe açıklık artar ──");
let monotonic = true;
let prev = -1;
for (let z = 2; z >= -20; z -= 0.05) {
  const v = cameraOpenAmount(z);
  if (v < prev - 1e-12) monotonic = false;
  prev = v;
}
check("Z azaldıkça açıklık hiç düşmez", monotonic);

console.log("── kamera çerçevesi (cameraFraming) ──");
const base = cameraFraming(0);
const back = cameraFraming(1);
check("Açıklık 0 → temel açı", approx(base.elevation, CAMERA_ELEVATION));
check("Açıklık 0 → temel mesafe", approx(base.zoom, CAMERA_ZOOM));
check("Açıklık 1 → dik açı", approx(back.elevation, CAMERA_BACK_ELEVATION));
check("Açıklık 1 → arka mesafe", approx(back.zoom, CAMERA_BACK_ZOOM));
check("Aralık dışı değerler kıstırılır", approx(cameraFraming(-5).elevation, CAMERA_ELEVATION));
check("Aralık dışı (>1) kıstırılır", approx(cameraFraming(9).zoom, CAMERA_BACK_ZOOM));

console.log("── top-down + yükseklik etkisi ──");
const elGain = CAMERA_BACK_ELEVATION - CAMERA_ELEVATION;
check("Dik açı gerçekten daha dik", elGain > 0.2, `Δ ${elGain.toFixed(3)} rad`);
check(
  "Arka kadraj daha yüksek (Y-offset ↑)",
  heightAt(1) > heightAt(0) + 1,
  `${heightAt(0).toFixed(2)} → ${heightAt(1).toFixed(2)} birim`,
);
check(
  "Arka kadraj daha tepeden (yatay ofset ↓)",
  behindAt(1) < behindAt(0) - 0.5,
  `${behindAt(0).toFixed(2)} → ${behindAt(1).toFixed(2)} birim`,
);
check(
  "Kamera hiçbir açıklıkta temel yüksekliğin altına inmez",
  [0, 0.25, 0.5, 0.75, 1].every((o) => heightAt(o) >= heightAt(0) - 1e-9),
);
check(
  "Yükseklik açıklıkla monoton artar",
  [0, 0.25, 0.5, 0.75, 1].every((o, i, arr) => i === 0 || heightAt(o) >= heightAt(arr[i - 1])),
);

console.log("── gerçek harita: dükkan hattının arkası ──");
// Dükkan sırası = kuzey çim şeridinin güney kenarında duran ön cepheler.
const shopBackWalls = BUILDINGS.filter((b) => b.frontZ > ZONE.northGrassTop)
  .map((b) => b.frontZ - b.d);
const deepestShopBack = Math.min(...shopBackWalls);
check(
  "Dükkanların en arka duvarı tam açık bölgede",
  cameraOpenAmount(deepestShopBack) >= 0.95,
  `duvar Z ${deepestShopBack.toFixed(2)} → açıklık ${cameraOpenAmount(deepestShopBack).toFixed(3)}`,
);
// Dükkan arka duvarı ile arka kaldırım arasındaki en dar bölge de tam açık olmalı.
check(
  "Arka kaldırım (ZONE.backWalkTop) tam açık",
  cameraOpenAmount(ZONE.backWalkTop) === 1,
  `Z ${ZONE.backWalkTop}`,
);
// Spawn noktası (px 460) hâlâ kapalı kamerada olmalı.
const spawnZ = WORLD_Z_MAX - 460 / S;
check(
  "Spawn (px y=460) kapalı kamerada kalır",
  cameraOpenAmount(spawnZ) === 0,
  `Z ${spawnZ.toFixed(2)}`,
);

console.log(`\n${failures.length === 0 ? "TÜM KONTROLLER GEÇTİ ✔" : "BAŞARISIZ ✘"}`);
console.log(`${passed}/${passed + failures.length} kontrol geçti.`);
if (failures.length > 0) {
  console.log("Başarısız:", failures.join(", "));
  process.exit(1);
}
