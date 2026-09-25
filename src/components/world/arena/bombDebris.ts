// 🪨 Bomba taş parçaları — yeni `"debris"` efekt türünün 3B görünümü.
//
// NEDEN GEREKLİ: barut patlamasında yalnız alev ve duman olsaydı patlama
// "boyanmış bir ışık lekesi" gibi okunurdu. Yerden kopup döne döne savrulan,
// sonra yerçekimiyle düşen KATI parçalar patlamaya ağırlık verir; patlamanın
// kütlesi olduğunu anlatan şey taşlardır (duman değil).
//
// NEDEN ÖRNEKLEME (InstancedMesh): patlama başına ~14 parça, aynı anda birkaç
// patlama olabiliyor; her parçayı ayrı mesh yapmak kare başına onlarca çizim
// çağrısı eklerdi. Tek `InstancedMesh` bütün parçaları TEK çağrıda çizer.
//
// SOĞUYAN TAŞ: malzemenin emissive'i patlamada birden yükselir ve yaşam boyunca
// sıfıra iner — parçalar "az önce fırlamış, hâlâ sıcak" görünür. (Tek malzeme
// paylaşıldığı için tüm parçalar birlikte soğur; bu yeterli ve ucuz.)
//
// IŞIK YOK: malzeme sahnenin mevcut ışıklarıyla aydınlanır (nokta ışığı
// eklemek arenadaki tüm shader'ları yeniden derletirdi).
import * as THREE from "three";
import { BOMB_PALETTE } from "./shared";

/** Patlama başına taş parçası sayısı (tek çizim çağrısı). */
export const DEBRIS_SHARDS = 14;

const GRAVITY = 9.5; // birim/sn² — küçük parçalar hafif okunur ama düşer
const DRAG = 1.2; // hava direnci: parça hemen yavaşlar (kısa menzil)
const GROUND_Y = 0.07; // zemin kotu: parça buraya inince kısa bir sıçrama yapar
const BOUNCE = 0.34; // düşüş enerjisinin ne kadarı geri seker

/** Kare başına ayırma yapmamak için paylaşılan geçici nesneler. */
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpAxis = new THREE.Vector3();
const tmpMatrix = new THREE.Matrix4();

export interface BombDebris {
  /** Sahne köküne eklenir (kendi konumu yoktur; parçalar dünya uzayında savrulur). */
  mesh: THREE.InstancedMesh;
  /** Patlamayı tetikler: parçaları merkezden dışa savurur (`radius` birim). */
  burst(x: number, y: number, radius: number): void;
  /** Kareyi ilerletir; parçalar tükenince mesh gizlenir. */
  update(dt: number): void;
  hide(): void;
  dispose(): void;
}

/** Havuz yuvası için taş fırtınası kurar (parçalar tek `InstancedMesh`te). */
export function createBombDebris(): BombDebris {
  // Kaba, köşeli taş: 4 yüzlü tetrahedron düşük poligonlu ve "kırılmış" durur.
  const geometry = new THREE.TetrahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({
    color: BOMB_PALETTE.rock, // zemin paletiyle aynı aile: taş "yerden" kopmuş okunur
    roughness: 0.96,
    metalness: 0.04,
    flatShading: true,
    emissive: new THREE.Color("#ff5a1f"),
    emissiveIntensity: 0,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, DEBRIS_SHARDS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.raycast = () => {};

  // Parça durumları (kare başına ayırma yok — düz diziler).
  const px = new Float32Array(DEBRIS_SHARDS);
  const py = new Float32Array(DEBRIS_SHARDS);
  const pz = new Float32Array(DEBRIS_SHARDS);
  const vx = new Float32Array(DEBRIS_SHARDS);
  const vy = new Float32Array(DEBRIS_SHARDS);
  const vz = new Float32Array(DEBRIS_SHARDS);
  const size = new Float32Array(DEBRIS_SHARDS);
  const angle = new Float32Array(DEBRIS_SHARDS);
  const spin = new Float32Array(DEBRIS_SHARDS);
  const life = new Float32Array(DEBRIS_SHARDS);
  const max = new Float32Array(DEBRIS_SHARDS);
  const axis = new Float32Array(DEBRIS_SHARDS * 3);

  let alive = 0;

  const hide = () => {
    alive = 0;
    mesh.visible = false;
    material.emissiveIntensity = 0;
  };

  const burst = (x: number, y: number, radius: number) => {
    for (let i = 0; i < DEBRIS_SHARDS; i++) {
      // Yön: yarım küre (yerden yukarı) — parça zemine gömülmesin.
      const a = Math.random() * Math.PI * 2;
      const up = 0.25 + Math.random() * 0.9;
      const speed = radius * (0.9 + Math.random() * 1.3);
      px[i] = x + Math.cos(a) * radius * 0.06;
      py[i] = 0.25 + Math.random() * 0.3;
      pz[i] = y + Math.sin(a) * radius * 0.06;
      vx[i] = Math.cos(a) * speed;
      vz[i] = Math.sin(a) * speed;
      vy[i] = radius * (0.7 + Math.random() * 1.1) * up;
      size[i] = radius * (0.022 + Math.random() * 0.03);
      angle[i] = Math.random() * Math.PI * 2;
      spin[i] = (Math.random() - 0.5) * 16;
      // Ömür, çağıranın yuva süresinden (bkz. `BombBlastVfx` → DEBRIS_LIFE)
      // KISA tutulur: parçalar havada kesilmesin, kendiliğinden sönüp bitsin.
      max[i] = life[i] = 0.95 + Math.random() * 0.4;
      const ax = Math.random() - 0.5;
      const ay = Math.random() - 0.5;
      const az = Math.random() - 0.5;
      const len = Math.hypot(ax, ay, az) || 1;
      axis[i * 3] = ax / len;
      axis[i * 3 + 1] = ay / len;
      axis[i * 3 + 2] = az / len;
    }
    alive = DEBRIS_SHARDS;
    mesh.visible = true;
    // Taşlar "az önce fırladı": sıcak yüzey, yaşam boyunca söner.
    material.emissiveIntensity = 1.15;
  };

  const update = (dt: number) => {
    if (alive <= 0) return;
    const d = Math.min(dt, 1 / 30);
    let live = 0;
    for (let i = 0; i < DEBRIS_SHARDS; i++) {
      if (life[i] <= 0) {
        // Ölü parça ölçek 0 ile çizilir (matris yine de yazılır: örneklemede
        // "eski" bir matris kalmamalı).
        writeMatrix(i, 0, 0, 0, 0);
        continue;
      }
      life[i] -= d;
      if (life[i] <= 0) {
        writeMatrix(i, 0, 0, 0, 0);
        continue;
      }
      live += 1;

      // Fizik: hava direnci + yerçekimi, zemine değince kısa sıçrama.
      const drag = Math.max(0, 1 - DRAG * d);
      vx[i] *= drag;
      vz[i] *= drag;
      vy[i] = vy[i] * drag - GRAVITY * d;
      px[i] += vx[i] * d;
      py[i] += vy[i] * d;
      pz[i] += vz[i] * d;
      if (py[i] < GROUND_Y) {
        py[i] = GROUND_Y;
        vy[i] = -vy[i] * BOUNCE;
        vx[i] *= 0.6;
        vz[i] *= 0.6;
        spin[i] *= 0.6;
      }
      angle[i] += spin[i] * d;

      const k = life[i] / max[i]; // 1 → 0
      // Son %30'da küçülerek kaybolur (yerde "pat" diye silinmesin).
      const shrink = k < 0.3 ? k / 0.3 : 1;
      writeMatrix(i, px[i], py[i], pz[i], size[i] * shrink);
    }

    alive = live;
    mesh.instanceMatrix.needsUpdate = true;
    // Soğuma: en uzun ömürlü parça bile sönerken emissive sıfıra iner.
    material.emissiveIntensity = 1.15 * Math.max(0, live > 0 ? bestLife() : 0);
    if (live === 0) hide();
  };

  /** Yaşayan parçaların en yüksek yaş oranı (malzeme soğuması için). */
  const bestLife = () => {
    let best = 0;
    for (let i = 0; i < DEBRIS_SHARDS; i++) {
      if (life[i] <= 0) continue;
      const k = life[i] / max[i];
      if (k > best) best = k;
    }
    return best;
  };

  /** Bir örneğin matrisini yazar (konum + dönüş + ölçek). */
  const writeMatrix = (
    i: number,
    x: number,
    y: number,
    z: number,
    s: number,
  ) => {
    tmpAxis.set(axis[i * 3], axis[i * 3 + 1], axis[i * 3 + 2]);
    tmpQuat.setFromAxisAngle(tmpAxis, angle[i]);
    tmpPos.set(x, y, z);
    tmpScale.setScalar(s);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    mesh.setMatrixAt(i, tmpMatrix);
  };

  // Başlangıçta tüm örnekler sıfır ölçekte (mesh zaten gizli).
  for (let i = 0; i < DEBRIS_SHARDS; i++) writeMatrix(i, 0, 0, 0, 0);
  mesh.instanceMatrix.needsUpdate = true;

  const dispose = () => {
    mesh.removeFromParent();
    geometry.dispose();
    material.dispose();
    mesh.dispose();
  };

  return { mesh, burst, update, hide, dispose };
}
