import * as THREE from "three";

/* ── Yerde açılan 3D yarık efekti ────────────────────────────────────
 * Eski sürümdeki düz renkli "taş plakaları", kara yanık dikdörtgeni ve
 * saydam iz katmanları tamamen KALDIRILDI (zemine basılmış 2D blok gibi
 * duruyorlardı). Yerine katmanlı, gerçek 3D bir sistem:
 *
 *   1) Kor magma şeridi — THREE.AdditiveBlending + prosedürel gürültülü
 *      (fbm) shader. Kenarları yumuşak parlayan, kıvrılan akkor çatlak;
 *      düz renk kaplaması yok, ışık olarak toplanıyor.
 *   2) Yükselen kor dilimleri — çatlağın iki yanından yukarı taşan hacimli
 *      parlaklık. Efekt yandan da hacimli okunur, düz bir şerit gibi durmaz.
 *   3) 3D taş parçacıkları — InstancedMesh; yerden fırlayıp yerçekimiyle
 *      döne döne düşer, sonra küçülerek kaybolur.
 *   4) Toz bulutu — soft point parçacıkları; havalanıp dağılarak söner.
 *
 * Oluştuktan 0.5s sonra parlaklık azalır ve ölçek küçülerek efekt yok olur.
 *
 * Yön matematiği korunmuştur: three.js'te Ry(θ) +X eksenini
 * (cosθ, 0, −sinθ) yaptığı için dünya yönü eşlemesi atan2(−dz, dx).
 */

const SEGS = 40;
const HALF_W = 0.42; // yarık bölgesinin yarı genişliği (dünya birimi)
const LIFT = 0.03; // şerit kenarlarının hafif kalkması (hacim)
const BLADE_H = 0.28; // yükselen kor diliminin yüksekliği
const LIFE = 1.25; // toplam ömür (saniye) — sim tarafındaki ttl ile aynı
const OPEN_DUR = 0.16; // vuruş noktasından rakibe doğru açılma süresi
const HOLD = 0.5; // açıldıktan sonra sabit kaldığı süre
const DEBRIS_COUNT = 16;
const DUST_COUNT = 30;
const GRAVITY = 7;
const DEFAULT_PIXEL_SCALE = 480;
const GROUND_Y = 0.012; // zeminin hafif üstünde dur (batmayı önler)
const CAP_START_R = 0.58; // vuruş noktası patlama halkası yarıçapı
const CAP_END_R = 0.46; // hat sonu parlama halkası yarıçapı
const CAP_DUR = 0.45; // halkaların genişleme süresi

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const alignQuat = new THREE.Quaternion();
const yawQuat = new THREE.Quaternion();
const rayOrigin = new THREE.Vector3();

/* Prosedürel gürültü — hem magma şeridi hem dilimler kullanır. */
const NOISE_GLSL = `
float ccHash(float n) { return fract(sin(n) * 43758.5453123); }
float ccNoise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(ccHash(i), ccHash(i + 1.0), u);
}
float ccFbm(float x) {
  float v = 0.0;
  float a = 0.5;
  for (int k = 0; k < 4; k++) { v += a * ccNoise(x); x *= 2.07; a *= 0.5; }
  return v;
}
`;

const STRIP_VERT = `
uniform float uLift;
varying vec2 vUv;
void main() {
  vUv = uv;
  float e = abs(uv.y - 0.5) * 2.0;
  vec3 p = position;
  p.y += e * e * uLift;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const STRIP_FRAG = `
varying vec2 vUv;
uniform float uTime;
uniform float uOpen;
uniform float uFade;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uEdge;
${NOISE_GLSL}
void main() {
  // Çatlağın kıvrılan merkez çizgisi ve genişliği
  float centre = 0.5 + (ccFbm(vUv.x * 8.0 + 3.1) - 0.5) * 0.55;
  float d = abs(vUv.y - centre);
  float wid = 0.05 + 0.075 * ccFbm(vUv.x * 19.0 + 7.3);

  float core = 1.0 - smoothstep(wid * 0.30, wid, d);
  float halo = 1.0 - smoothstep(wid, wid + 0.42, d);

  // Önde ilerleyen açılma ucu
  float reveal = 1.0 - smoothstep(uOpen - 0.07, uOpen + 0.015, vUv.x);
  float tip = exp(-pow((vUv.x - uOpen) * 15.0, 2.0));

  float flick = 0.80 + 0.20 * sin(uTime * 26.0 + vUv.x * 55.0);
  float vein = 0.70 + 0.30 * ccFbm(vUv.x * 46.0 + uTime * 2.2);

  float inten = (core * 1.25 * vein + halo * 0.50) * reveal * flick * uFade;
  inten += tip * reveal * 0.85 * uFade;

  vec3 col = mix(uEdge, uMid, clamp(halo, 0.0, 1.0));
  col = mix(col, uHot, clamp(core, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.97, 0.90), clamp(tip * 0.75, 0.0, 1.0));

  gl_FragColor = vec4(col, clamp(inten, 0.0, 1.0));
}
`;

const BLADE_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BLADE_FRAG = `
varying vec2 vUv;
uniform float uTime;
uniform float uOpen;
uniform float uFade;
uniform vec3 uMid;
uniform vec3 uEdge;
void main() {
  float reveal = 1.0 - smoothstep(uOpen - 0.07, uOpen + 0.015, vUv.x);
  float h = pow(1.0 - vUv.y, 1.7); // taban parlak → tepede söner
  float flick = 0.75 + 0.25 * sin(uTime * 18.0 + vUv.x * 26.0);
  float inten = h * reveal * flick * uFade * 0.5;
  vec3 col = mix(uEdge, uMid, h);
  gl_FragColor = vec4(col, clamp(inten, 0.0, 1.0));
}
`;

const DUST_VERT = `
attribute float aAlpha;
attribute float aSize;
uniform float uScale;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (uScale / max(-mv.z, 0.001));
  gl_Position = projectionMatrix * mv;
}
`;

const DUST_FRAG = `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(1.0, 0.2, length(c) * 2.0) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a * 0.5);
}
`;

const CAP_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CAP_FRAG = `
varying vec2 vUv;
uniform float uProg;
uniform float uFade;
uniform vec3 uHot;
uniform vec3 uMid;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.42, d);
  float ring = exp(-pow((d - uProg) * 6.0, 2.0)) * (1.0 - uProg * 0.55);
  float edge = 1.0 - smoothstep(0.74, 1.0, d);
  float inten = (core * 1.25 + ring * 1.15) * edge * uFade;
  vec3 col = mix(uMid, uHot, clamp(core + ring * 0.6, 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(inten, 0.0, 1.0));
}
`;

function makeStripMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uTime: { value: 0 },
      uOpen: { value: 0 },
      uFade: { value: 0 },
      uLift: { value: LIFT },
      uHot: { value: new THREE.Color("#fff3d0") },
      uMid: { value: new THREE.Color("#ff7a12") },
      uEdge: { value: new THREE.Color("#8c1200") },
    },
    vertexShader: STRIP_VERT,
    fragmentShader: STRIP_FRAG,
  });
}

function makeBladeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uTime: { value: 0 },
      uOpen: { value: 0 },
      uFade: { value: 0 },
      uMid: { value: new THREE.Color("#ff8a24") },
      uEdge: { value: new THREE.Color("#701000") },
    },
    vertexShader: BLADE_VERT,
    fragmentShader: BLADE_FRAG,
  });
}

function makeDustMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uScale: { value: DEFAULT_PIXEL_SCALE },
      uColor: { value: new THREE.Color("#a4907a") },
    },
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
  });
}

function makeCapMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    uniforms: {
      uProg: { value: 0 },
      uFade: { value: 0 },
      uHot: { value: new THREE.Color("#fff0cc") },
      uMid: { value: new THREE.Color("#ff7a12") },
    },
    vertexShader: CAP_VERT,
    fragmentShader: CAP_FRAG,
  });
}

/** Zemin üzerindeki akkor şerit (uzunluk +X boyunca 0..1). */
function buildStripGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= SEGS; i++) {
    const x = i / SEGS;
    pos.push(x, 0, -HALF_W, x, 0, HALF_W);
    uv.push(x, 0, x, 1);
  }
  for (let i = 0; i < SEGS; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Çatlağın yanından yukarı taşan dikey ışık dilimi. */
function buildBladeGeometry(side: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= SEGS; i++) {
    const x = i / SEGS;
    const z = side * (0.03 + 0.05 * Math.abs(Math.sin(i * 1.9 + side)));
    const h = BLADE_H * (0.72 + 0.4 * Math.abs(Math.sin(i * 1.3 + side)));
    pos.push(x, 0.01, z);
    pos.push(x, h, z + side * 0.06);
    uv.push(x, 0, x, 1);
  }
  for (let i = 0; i < SEGS; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function buildDustGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(DUST_COUNT * 3), 3),
  );
  g.setAttribute(
    "aAlpha",
    new THREE.Float32BufferAttribute(new Float32Array(DUST_COUNT), 1),
  );
  g.setAttribute(
    "aSize",
    new THREE.Float32BufferAttribute(new Float32Array(DUST_COUNT), 1),
  );
  return g;
}

/** Zemin düzleminde, merkezi uv=(0.5,0.5) olan kare (ölçek = çap). */
function buildCapGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
      3,
    ),
  );
  g.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

const debrisGeometry = new THREE.IcosahedronGeometry(0.062, 0);
const capGeometry = buildCapGeometry();

interface DebrisInfo {
  along: number;
  delay: number;
  life: number;
  size: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  kx: number;
  ky: number;
  kz: number;
}

interface DustInfo {
  along: number;
  delay: number;
  life: number;
  size: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** Deterministik pseudo-rastgele — havuz her yüklemede aynı görünür. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface GroundCrack {
  group: THREE.Group;
  strip: THREE.Mesh;
  stripMat: THREE.ShaderMaterial;
  bladeL: THREE.Mesh;
  bladeR: THREE.Mesh;
  bladeMatL: THREE.ShaderMaterial;
  bladeMatR: THREE.ShaderMaterial;
  debris: THREE.InstancedMesh;
  debrisMat: THREE.MeshStandardMaterial;
  dust: THREE.Points;
  dustMat: THREE.ShaderMaterial;
  capStart: THREE.Mesh;
  capEnd: THREE.Mesh;
  capMat: THREE.ShaderMaterial;
  /** Yarık ortasına vuran geçici ışık — sahne KÖKÜNE eklenmeli. */
  light: THREE.PointLight;
  /** Arena3D'nin yeni efekt başına ayarladığı zemin bilgisi. */
  groundNormal: THREE.Vector3;
  groundY: number;
  lastFx: unknown;
  dummy: THREE.Object3D;
  debrisInfo: DebrisInfo[];
  dustInfo: DustInfo[];
}

export function buildGroundCrack(): GroundCrack {
  const group = new THREE.Group();
  group.visible = false;

  const stripMat = makeStripMaterial();
  const strip = new THREE.Mesh(buildStripGeometry(), stripMat);
  strip.frustumCulled = false;
  strip.renderOrder = 4;

  const bladeMatL = makeBladeMaterial();
  const bladeMatR = makeBladeMaterial();
  const bladeL = new THREE.Mesh(buildBladeGeometry(-1), bladeMatL);
  const bladeR = new THREE.Mesh(buildBladeGeometry(1), bladeMatR);
  bladeL.frustumCulled = false;
  bladeR.frustumCulled = false;
  bladeL.renderOrder = 3;
  bladeR.renderOrder = 3;

  group.add(bladeL, bladeR, strip);

  // Sıcak taş parçaları: katı gövde + kor emissive.
  const debrisMat = new THREE.MeshStandardMaterial({
    color: "#241610",
    roughness: 0.92,
    metalness: 0.05,
    emissive: new THREE.Color("#ff6a14"),
    emissiveIntensity: 1,
  });
  const debris = new THREE.InstancedMesh(debrisGeometry, debrisMat, DEBRIS_COUNT);
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.frustumCulled = false;
  group.add(debris);

  const dustMat = makeDustMaterial();
  const dust = new THREE.Points(buildDustGeometry(), dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  // Vuruş noktası ve hat sonu için dairesel patlama/parlama halkaları.
  const capMat = makeCapMaterial();
  const capStart = new THREE.Mesh(capGeometry, capMat);
  const capEnd = new THREE.Mesh(capGeometry, capMat);
  capStart.frustumCulled = false;
  capEnd.frustumCulled = false;
  capStart.renderOrder = 5;
  capEnd.renderOrder = 5;
  group.add(capStart, capEnd);

  // Yarık hattının tam ortasına vuran geçici turuncu ışık. Grup değil
  // sahne köküne eklenir: grup gizlenirken de ışık sayısı sabit kalsın ve
  // three'nin materyalleri yeniden derlemesine yol açmasın.
  const light = new THREE.PointLight(new THREE.Color("#ff7a1a"), 0, 5.5, 2);

  const rng = makeRng(0x5eed1);
  const debrisInfo: DebrisInfo[] = [];
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const along =
      0.05 + (0.9 * i) / Math.max(1, DEBRIS_COUNT - 1) + (rng() - 0.5) * 0.04;
    debrisInfo.push({
      along: Math.min(0.98, Math.max(0.02, along)),
      delay: Math.max(0, along - 0.03) * OPEN_DUR + rng() * 0.04,
      life: 0.55 + rng() * 0.35,
      size: 0.7 + rng() * 0.9,
      z: (rng() - 0.5) * HALF_W * 1.4,
      vx: (rng() - 0.5) * 0.6,
      vy: 1.7 + rng() * 1.5,
      vz: (rng() - 0.5) * 1.2,
      rx: rng() * Math.PI * 2,
      ry: rng() * Math.PI * 2,
      rz: rng() * Math.PI * 2,
      sx: (rng() - 0.5) * 14,
      sy: (rng() - 0.5) * 14,
      sz: (rng() - 0.5) * 14,
      kx: 0.75 + rng() * 0.6,
      ky: 0.75 + rng() * 0.6,
      kz: 0.75 + rng() * 0.6,
    });
  }

  const dustInfo: DustInfo[] = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    const along = rng();
    dustInfo.push({
      along,
      delay: along * OPEN_DUR + rng() * 0.05,
      life: 0.7 + rng() * 0.5,
      size: 0.22 + rng() * 0.33,
      z: (rng() - 0.5) * HALF_W * 2,
      vx: (rng() - 0.5) * 0.5,
      vy: 0.7 + rng() * 0.9,
      vz: (rng() - 0.5) * 0.9,
    });
  }

  return {
    group,
    strip,
    stripMat,
    bladeL,
    bladeR,
    bladeMatL,
    bladeMatR,
    debris,
    debrisMat,
    dust,
    dustMat,
    capStart,
    capEnd,
    capMat,
    light,
    groundNormal: new THREE.Vector3(0, 1, 0),
    groundY: 0,
    lastFx: null,
    dummy: new THREE.Object3D(),
    debrisInfo,
    dustInfo,
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
  /** Nokta boyutu için çizim tamponu yüksekliği / 2 (opsiyonel). */
  pixelScale?: number;
}

/**
 * Yarığı her karede günceller: vuruş noktasından rakibe doğru AÇILIR
 * (~0.16s), magma çekirdeği akkor parlar, taşlar fırlayıp düşer, toz
 * havalanır; 0.5s sonra parlaklık azalır ve ölçek küçülerek yok olur.
 */
export function updateGroundCrack(crack: GroundCrack, u: GroundCrackUpdate): void {
  const dx = u.x2 - u.x1;
  const dz = u.y2 - u.y1;
  const len = Math.max(Math.hypot(dx, dz), 0.05);

  const progress = Math.min(1, Math.max(0, 1 - u.t));
  const elapsed = progress * LIFE;

  crack.group.visible = true;
  crack.group.position.set(u.x1, crack.groundY + GROUND_Y, u.y1);
  // Geometri +X boyunca uzanır; Ry(θ) +X'i (cosθ, 0, −sinθ) yaptığı için
  // yön eşlemesi atan2(−dz, dx) olmalı. Zemin normali verilmişse önce
  // zemine hizalanır, sonra bu normal etrafında döndürülür.
  alignQuat.setFromUnitVectors(UP, crack.groundNormal);
  yawQuat.setFromAxisAngle(UP, Math.atan2(-dz, dx));
  crack.group.quaternion.copy(alignQuat).multiply(yawQuat);

  const open = Math.min(1, elapsed / OPEN_DUR);
  const holdEnd = OPEN_DUR + HOLD;
  const collapse =
    elapsed <= holdEnd
      ? 1
      : Math.max(0, 1 - (elapsed - holdEnd) / Math.max(0.001, LIFE - holdEnd));
  const fade = collapse * collapse;

  // Yarık yönünde açılır; sonra ölçek küçülerek yok olur.
  crack.strip.scale.set(len, 1, 1);
  crack.bladeL.scale.set(len, 1, 1);
  crack.bladeR.scale.set(len, 1, 1);
  crack.group.scale.setScalar(Math.max(0.0001, collapse));

  crack.stripMat.uniforms.uTime.value = elapsed;
  crack.stripMat.uniforms.uOpen.value = open;
  crack.stripMat.uniforms.uFade.value = fade;

  const setBlade = (m: THREE.ShaderMaterial) => {
    m.uniforms.uTime.value = elapsed;
    m.uniforms.uOpen.value = open;
    m.uniforms.uFade.value = fade;
  };
  setBlade(crack.bladeMatL);
  setBlade(crack.bladeMatR);

  // ── Vuruş noktası + hat sonu patlama halkaları ───────────────────────
  crack.capMat.uniforms.uProg.value = Math.min(1, elapsed / CAP_DUR);
  crack.capMat.uniforms.uFade.value = fade;
  crack.capStart.scale.setScalar(CAP_START_R);
  crack.capEnd.scale.setScalar(CAP_END_R);
  crack.capEnd.position.set(len, 0, 0);

  // ── Geçici ışık: yarık hattının tam ortası, turuncu parıltı ──────────
  crack.light.position.set(
    (u.x1 + u.x2) / 2,
    crack.groundY + 0.35,
    (u.y1 + u.y2) / 2,
  );
  crack.light.intensity = 6 * fade * (0.55 + 0.45 * open);

  // ── 3D taş parçacıkları (yerçekimli, dönerek düşer) ──────────────────
  const dummy = crack.dummy;
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const d = crack.debrisInfo[i];
    const lt = elapsed - d.delay;
    let scale = 0;
    if (lt > 0 && lt < d.life && fade > 0.03) {
      const p = lt / d.life;
      const y = Math.max(0, d.vy * lt - 0.5 * GRAVITY * lt * lt) + 0.03;
      dummy.position.set(d.along * len + d.vx * lt, y, d.z + d.vz * lt);
      dummy.rotation.set(d.rx + lt * d.sx, d.ry + lt * d.sy, d.rz + lt * d.sz);
      scale = d.size * Math.min(1, lt / 0.05) * (1 - p * p);
    }
    dummy.scale.set(scale * d.kx, scale * d.ky, scale * d.kz);
    dummy.updateMatrix();
    crack.debris.setMatrixAt(i, dummy.matrix);
  }
  crack.debris.instanceMatrix.needsUpdate = true;
  crack.debrisMat.emissiveIntensity = 0.2 + 1.2 * fade;

  // ── Toz bulutu ───────────────────────────────────────────────────────
  const dustGeo = crack.dust.geometry;
  const dPos = dustGeo.getAttribute("position") as THREE.BufferAttribute;
  const dAlpha = dustGeo.getAttribute("aAlpha") as THREE.BufferAttribute;
  const dSize = dustGeo.getAttribute("aSize") as THREE.BufferAttribute;
  for (let i = 0; i < DUST_COUNT; i++) {
    const p = crack.dustInfo[i];
    const lt = elapsed - p.delay;
    let a = 0;
    let size = p.size;
    let x = 0;
    let y = -10;
    let z = 0;
    if (lt > 0 && fade > 0.03) {
      const puff = Math.min(1, lt / 0.12);
      const die = Math.max(0, 1 - lt / p.life);
      y = 0.03 + p.vy * lt - 0.6 * lt * lt;
      x = p.along * len + p.vx * lt;
      z = p.z + p.vz * lt;
      a = puff * die * die * 0.9 * fade;
      size = p.size * (0.7 + 0.7 * Math.min(1, lt / 0.3));
    }
    dPos.setXYZ(i, x, y, z);
    dAlpha.setX(i, a);
    dSize.setX(i, size);
  }
  dPos.needsUpdate = true;
  dAlpha.needsUpdate = true;
  dSize.needsUpdate = true;
  crack.dustMat.uniforms.uScale.value = u.pixelScale ?? DEFAULT_PIXEL_SCALE;
}

/**
 * Yeni bir yarık başlarken zemini BİR KEZ örnekler: çatlağın yüksekliğini ve
 * normalini bulur, böylece efekt zemine tam oturur, eğimlerde doğru açıyla
 * uzanır ve zeminin içine batmaz. `targets` çağıran tarafından süzülmüş
 * (terrain/ground/decal) mesh listesidir. Aynı `fxKey` için tekrar çalışmaz.
 */
export function sampleGroundCrack(
  crack: GroundCrack,
  fxKey: unknown,
  raycaster: THREE.Raycaster,
  targets: THREE.Object3D[],
  midX: number,
  midZ: number,
): void {
  if (crack.lastFx === fxKey) return;
  crack.lastFx = fxKey;
  crack.groundY = 0;
  crack.groundNormal.set(0, 1, 0);
  if (targets.length === 0) return;

  rayOrigin.set(midX, 8, midZ);
  raycaster.set(rayOrigin, DOWN);
  const hit = raycaster.intersectObjects(targets, false)[0];
  if (!hit || !hit.face) return;

  crack.groundY = hit.point.y;
  crack.groundNormal
    .copy(hit.face.normal)
    .transformDirection(hit.object.matrixWorld)
    .normalize();
  if (crack.groundNormal.y < 0) crack.groundNormal.negate();
  // Uçurum/dik yüzeylere yapışmasın: neredeyse düz değilse zemine dön.
  if (crack.groundNormal.y < 0.55) crack.groundNormal.set(0, 1, 0);
}
