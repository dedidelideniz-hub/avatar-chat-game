import * as THREE from "three";

/* ── Yerde açılan GERÇEK 3D yarık efekti ───────────────────────────── */
/* Düz bir ışık şeridi yerine 4 katman:
 *   1) is/kara leke  — zemine yapışık, kenarları tırtıklı yanık izi
 *   2) kırılan plakalar — yarığın iki yanında YUKARI doğru kırılmış,
 *      tırtıklı taş plakalar (enine kesiti görünür → gerçek 3D)
 *   3) akkor iç şerit — plakaların arasındaki erimiş/parlayan çekirdek
 *   4) uç parlaması + yerden fırlayan taş parçaları
 *
 * Harita zemini opak olduğu ve y=0'ın altını keseceği için "derinlik"
 * aşağı değil, YUKARI kırılan plakalarla veriliyor; böylece kamera hangi
 * açıdan bakarsa baksın yarık hacimli okunur.
 *
 * Geometriler +X boyunca 1 birim uzunlukta üretilir; yarığın boyu grup
 * ölçeklenmeden sadece mesh'lerin scale.x'i ile açılır (taş parçaları
 * ölçekten etkilenmesin).
 */

const SEGS = 32;
const HALF_W = 0.42; // yarık bölgesinin yarı genişliği (dünya birimi)
const LIP_H = 0.14; // kırılan plakanın tepe yüksekliği

const jitter = (i: number, seed: number) => Math.sin(i * 2.31 + seed) * 0.07;

/** İki yanı için: iç kenar (zeminde) → tepe (yukarı) → dış kenar (zeminde). */
function buildPlateGeometry(side: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= SEGS; i++) {
    const x = i / SEGS;
    const zc = jitter(i, 0);
    const lift = LIP_H * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + side)));
    pos.push(x, 0.02, zc + side * 0.05); // 0: iç kenar (kırık ağzı)
    pos.push(x, lift, zc + side * 0.21); // 1: tepe (kırılmış plaka ucu)
    pos.push(x, 0.02, zc + side * HALF_W); // 2: dış kenar
  }
  for (let i = 0; i < SEGS; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    idx.push(a + 0, a + 1, b + 1, a + 0, b + 1, b + 0);
    idx.push(a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Zemine yapışık yanık/kara leke şeridi (yarıktan biraz geniş). */
function buildScorchGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const w = HALF_W * 1.15;
  for (let i = 0; i <= SEGS; i++) {
    const x = i / SEGS;
    const zc = jitter(i, 0.6);
    pos.push(x, 0.008, zc - w);
    pos.push(x, 0.008, zc + w);
  }
  for (let i = 0; i < SEGS; i++) {
    const g = i * 2;
    const h = (i + 1) * 2;
    idx.push(g + 0, g + 1, h + 1, g + 0, h + 1, h + 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Plakaların arasındaki akkor (erimiş) çekirdek şeridi. */
function buildMoltenGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= SEGS; i++) {
    const x = i / SEGS;
    const zc = jitter(i, 0);
    pos.push(x, 0.035, zc - 0.075);
    pos.push(x, 0.035, zc + 0.075);
  }
  for (let i = 0; i < SEGS; i++) {
    const g = i * 2;
    const h = (i + 1) * 2;
    idx.push(g + 0, g + 1, h + 1, g + 0, h + 1, h + 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const plateGeoL = buildPlateGeometry(-1);
const plateGeoR = buildPlateGeometry(1);
const scorchGeo = buildScorchGeometry();
const moltenGeo = buildMoltenGeometry();
const debrisGeometry = new THREE.DodecahedronGeometry(0.06, 0);
const tipGeometry = new THREE.PlaneGeometry(1.15, 0.85);

const DEBRIS_COUNT = 10;

export interface GroundCrack {
  group: THREE.Group;
  plateL: THREE.Mesh;
  plateR: THREE.Mesh;
  scorch: THREE.Mesh;
  molten: THREE.Mesh;
  tip: THREE.Mesh;
  debris: THREE.Mesh[];
  rockMat: THREE.MeshStandardMaterial;
  scorchMat: THREE.MeshBasicMaterial;
  moltenMat: THREE.MeshBasicMaterial;
  tipMat: THREE.MeshBasicMaterial;
}

/** Bir yarık nesnesi (havuzda yeniden kullanılır). */
export function buildGroundCrack(): GroundCrack {
  const group = new THREE.Group();
  group.visible = false;

  const rockMat = new THREE.MeshStandardMaterial({
    color: "#2b1c0e",
    roughness: 0.95,
    metalness: 0.08,
    emissive: "#5a2a05",
    emissiveIntensity: 0.55,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
  });

  const plateL = new THREE.Mesh(plateGeoL, rockMat);
  const plateR = new THREE.Mesh(plateGeoR, rockMat);
  plateL.frustumCulled = false;
  plateR.frustumCulled = false;
  group.add(plateL, plateR);

  const scorchMat = new THREE.MeshBasicMaterial({
    color: "#0d0906",
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const scorch = new THREE.Mesh(scorchGeo, scorchMat);
  scorch.frustumCulled = false;
  group.add(scorch);

  const moltenMat = new THREE.MeshBasicMaterial({
    color: "#ff9a1f",
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const molten = new THREE.Mesh(moltenGeo, moltenMat);
  molten.frustumCulled = false;
  group.add(molten);

  const tipMat = new THREE.MeshBasicMaterial({
    color: "#ffd68a",
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const tip = new THREE.Mesh(tipGeometry, tipMat);
  tip.rotation.x = -Math.PI / 2;
  tip.frustumCulled = false;
  group.add(tip);

  const debris: THREE.Mesh[] = [];
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const chunk = new THREE.Mesh(debrisGeometry, rockMat);
    chunk.userData.seed = i * 12.9898;
    chunk.frustumCulled = false;
    chunk.visible = false;
    group.add(chunk);
    debris.push(chunk);
  }

  return {
    group,
    plateL,
    plateR,
    scorch,
    molten,
    tip,
    debris,
    rockMat,
    scorchMat,
    moltenMat,
    tipMat,
  };
}

export interface GroundCrackUpdate {
  /** Dünya uzayında kılıcın indiği nokta. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Kalan ömür oranı: 1 → 0. */
  t: number;
}

/**
 * Yarığı her karede günceller: vuruş noktasından rakibe doğru AÇILIR
 * (~0.15s), uç parlaması önde ilerler, taş parçaları fırlayıp düşer,
 * akkor çekirdek pulse atar, sonra yarık sönerek kaybolur.
 */
export function updateGroundCrack(crack: GroundCrack, u: GroundCrackUpdate): void {
  const dx = u.x2 - u.x1;
  const dz = u.y2 - u.y1;
  const len = Math.max(Math.hypot(dx, dz), 0.05);
  const progress = Math.min(1, Math.max(0, 1 - u.t));
  const fade = Math.min(1, u.t / 0.4); // 1 → 0 (sönme)

  crack.group.visible = true;
  crack.group.position.set(u.x1, 0, u.y1);
  // Geometri +X boyunca uzanır; three.js'te Ry(θ) +X'i (cosθ, 0, −sinθ)
  // yaptığı için yön eşlemesi atan2(−dz, dx) olmalı — düz atan2(dz, dx)
  // z'yi aynalıyor ve yarık ters yöne (rakibin arkasına) gidiyordu.
  crack.group.rotation.y = Math.atan2(-dz, dx);

  const open = Math.min(1, progress / 0.12);
  const openLen = Math.max(len * open, 0.02);
  crack.plateL.scale.set(openLen, 1, 1);
  crack.plateR.scale.set(openLen, 1, 1);
  crack.scorch.scale.set(openLen, 1, 1);
  crack.molten.scale.set(openLen, 1, 1);

  crack.rockMat.opacity = 0.4 + 0.6 * fade;
  crack.scorchMat.opacity = 0.2 + 0.5 * fade;

  const pulse = 0.72 + 0.28 * Math.sin(progress * 46);
  crack.moltenMat.opacity = Math.min(1, open * 1.6) * (0.28 + 0.72 * fade) * pulse;

  crack.tip.visible = open < 1 ? true : fade > 0.25;
  crack.tip.position.set(openLen, 0.045, 0);
  crack.tipMat.opacity = (open < 1 ? 0.95 : 0.3) * fade;
  crack.tip.scale.setScalar(0.7 + (1 - fade) * 0.7);

  const launch = Math.min(1, progress / 0.3);
  for (let i = 0; i < crack.debris.length; i++) {
    const chunk = crack.debris[i];
    const seed = chunk.userData.seed as number;
    const along = ((i + 1) / (crack.debris.length + 1)) * openLen;
    const arc = Math.sin(launch * Math.PI);
    chunk.visible = fade > 0.05;
    chunk.position.set(
      along,
      0.05 + arc * (0.26 + 0.2 * Math.abs(Math.sin(seed))),
      jitter(i, 1.7) * 2.4,
    );
    chunk.rotation.set(seed + launch * 4.2, seed * 0.7, seed * 1.3);
    chunk.scale.setScalar(0.7 + 0.55 * Math.abs(Math.cos(seed)));
  }
}
