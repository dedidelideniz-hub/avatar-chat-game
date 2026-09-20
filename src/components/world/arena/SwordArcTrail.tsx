// ⚔️ SwordArcTrail — Kraliyet Savaşçısı'nın yakın dövüşü için KILIÇ İZİ
// (ribbon trail / arc mesh).
//
// KURAL: iz, kural katmanının anahtar tablosundan türetilir — `RoyalMelee`nin
// pozu AYNI `STAGE_KEYS` açılarını kullandığı için kılıç ile iz asla ayrışmaz.
//
//   · KAVİSLİ (hilal/muz): kılıç ucu her karede kol açısından hesaplanır; son
//     `LIFE` (0.1 sn) boyunca toplanan noktalar bir şerit olur. Kolu süren açı
//     bir aşamada ~190° döndüğü için şerit ZORUNLU olarak kavisli çıkar — düz
//     bir çizgi hiçbir karede oluşamaz (eski düz şerit/beam yolu kaldırıldı).
//   · KILIÇ UCUNA BAĞLI: iz haritada sabit kalmaz, ileri fırlamaz. Örnekler
//     salınımın o anki kol açısından üretilir; yeni örnek gelmeyi bıraktığı an
//     (salınım bitti) iz kuyruğundan başlayarak 0.1 sn içinde silinir.
//   · ÖLÇEK: yarıçap karakterin kılıç boyuyla sınırlı — `MAX_RADIUS` (1.5 birim)
//     asla aşılmaz; şerit bu yarıçapın çevresinde, ortada kalın, uçlarda sıfıra
//     inen incelikte durur (uçlara doğru incelip kaybolur).
//   · SAYDAMLIK: transparent + `THREE.AdditiveBlending`, `opacity: 0.8`.
//     İç kenar sıcak beyaz, dış kenar mavi; hem kuyruk hem dış kenar vertex
//     alpha ile sönümlenir → içten dışa parlayan yumuşak ışık dalgası.
//
// Dünya uzayında çizilir (sahne köküne eklenir): tepe noktaları mutlak
// koordinatlarda üretildiği için dövüşçünün rig ölçek/dönüş zincirine bağlı
// kalmaz; bir kare gecikmeli matris tersine çevirme hileleri gerekmez.
import { useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { BattleFighter } from "@/components/world/Arena3D";
import { meleeArmAngle, meleeDuration } from "@/engine/RoyalMelee";
import { S } from "./shared";

/* ------------------------------ sabitler -------------------------------- */

/** İzin toplam ömrü (sn): yalnız sallanma anı görünür, sonra silinir. */
const LIFE = 0.1;
/** Örnek tamponu: 0.1 sn @ ~200 fps üst sınırı. */
const MAX_SAMPLES = 20;
/**
 * Kılıç erişimi (dünya birimi): bıçak uzunluğu (0.85) + avuç/omuzun öne
 * uzanması. Şerit bu yarıçapın çevresine oturur.
 */
const BLADE_REACH = 1.2;
/** Şeridin MAKSİMUM yarıçapı (spec): karakterin kılıç boyu 1.5 birim. */
const MAX_RADIUS = 1.5;
/** Ortadaki yarım kalınlık; uçlara doğru sıfıra iner (ince + sivri uçlar). */
const ARC_HALF_WIDTH = 0.3;
/**
 * Örnekleme AÇIYA bağlıdır: yeni örnek yalnız kol en az bu kadar döndüğünde
 * alınır. Ölçüm (bkz. `.scratch/arc.mjs`): kare başına örneklemede kolun
 * durduğu fazlarda (follow-through) noktalar aynı yere yığılıyor ve şerit
 * KISA DÜZ BİR ÇİZGİ gibi görünüyordu. Açı adımıyla her dilim gerçek bir yay
 * parçası olur; kol durunca yeni örnek gelmez, iz 0.1 sn'de söner.
 */
const MIN_ANGLE_STEP = 7;
/** İz yüksekliği: göğüs hizası (dünya birimi) + pozun dikey bileşeni. */
const BASE_Y = 0.95;
/** İç kenarın uca göre alçalması (kabza el hizasında kalır). */
const INNER_DROP = 0.26;
/** İç kenar (sıcak beyaz) ve dış kenar (mavi) rengi. */
const HOT = new THREE.Color("#eaf7ff");
const COOL = new THREE.Color("#4aa8ff");

/** En kısa açı farkı (−180…180) — kol açısı ±180 sınırını aşabildiği için. */
function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function SwordArcTrail({
  fighter,
}: {
  fighter: MutableRefObject<BattleFighter>;
}) {
  const scene = useThree((s) => s.scene);

  const built = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const position = new Float32Array(MAX_SAMPLES * 2 * 3);
    const color = new Float32Array(MAX_SAMPLES * 2 * 4);
    const positionAttr = new THREE.BufferAttribute(position, 3);
    const colorAttr = new THREE.BufferAttribute(color, 4); // 4 → vertex alpha
    positionAttr.setUsage(THREE.DynamicDrawUsage);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positionAttr);
    geometry.setAttribute("color", colorAttr);
    // Her örnek bir şerit dilimi (iç/dış çifti) — indeksler sabit.
    const indices: number[] = [];
    for (let i = 0; i < MAX_SAMPLES - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Additif + toneMapped=false: ACES tone mapping izi kısmaz, UnrealBloom
      // eşiğini geçer (SlashTrail ile aynı dil).
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    mesh.visible = false;
    mesh.raycast = () => {};
    return { geometry, material, mesh, positionAttr, colorAttr };
  }, []);

  useEffect(() => {
    scene.add(built.mesh);
    return () => {
      scene.remove(built.mesh);
      built.geometry.dispose();
      built.material.dispose();
    };
  }, [scene, built]);

  /** Kılıç ucu örnekleri (dünya birimi) — kare başına tahsis yok. */
  const ring = useRef({
    x: new Float32Array(MAX_SAMPLES),
    z: new Float32Array(MAX_SAMPLES),
    y: new Float32Array(MAX_SAMPLES),
    /** Örneğin kol açısı (derece) — açı adımı denetimi için. */
    h: new Float32Array(MAX_SAMPLES),
    t: new Float64Array(MAX_SAMPLES),
    count: 0,
  });

  useFrame(() => {
    const f = fighter.current;
    const now = performance.now();
    const r = ring.current;
    const { geometry, mesh, positionAttr, colorAttr } = built;

    // ── 1) Yeni örnek: kılıç ucu, POZUN anahtar açısından ───────────────
    if (f.meleeT > 0) {
      const progress = 1 - Math.max(0, f.meleeT) / meleeDuration(f.meleeLeap);
      const arm = meleeArmAngle(progress, f.meleeLeap);
      if (arm.weight > 0.02) {
        // Gövdenin baktığı yön (arena px uzayı, modelTurn dahil: görsel ileri).
        const yaw = f.aimYaw ?? f.restYaw ?? 0;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        // Yaw'a dik yan eksen (kolun yatay açısı bu eksende ölçülür).
        const sx = fz;
        const sz = -fx;
        const hr = (arm.h * Math.PI) / 180;
        let ux = fx * Math.cos(hr) + sx * Math.sin(hr);
        let uz = fz * Math.cos(hr) + sz * Math.sin(hr);
        const un = Math.hypot(ux, uz) || 1;
        ux /= un;
        uz /= un;
        // Uç: gövde merkezinden kol yönünde bıçak erişimi kadar.
        const px = f.x + ux * BLADE_REACH * S;
        const py = f.y + uz * BLADE_REACH * S;
        const hy = BASE_Y + arm.lift * 0.5 - arm.lean * 0.3;
        // Yalnız kol anlamlı döndüyse örnek al (duruk fazda düz çizgi olmasın).
        const last = r.count - 1;
        const turned =
          r.count === 0 ||
          Math.abs(angleDelta(arm.h, r.h[last])) >= MIN_ANGLE_STEP;
        if (turned) {
          if (r.count < MAX_SAMPLES) {
            r.count += 1;
          } else {
            // Tampon doldu: en eski örneği düşür (kopya maliyeti yok).
            r.x.copyWithin(0, 1);
            r.z.copyWithin(0, 1);
            r.y.copyWithin(0, 1);
            r.h.copyWithin(0, 1);
            r.t.copyWithin(0, 1);
          }
          const i = r.count - 1;
          r.x[i] = px / S;
          r.z[i] = py / S;
          r.y[i] = hy;
          r.h[i] = arm.h;
          r.t[i] = now;
        }
      }
    }

    // ── 2) Ömrü dolanları düşür (kuyruk = en eski örnek) ────────────────
    let live = 0;
    for (let i = 0; i < r.count; i++) {
      if (now - r.t[i] > LIFE * 1000) continue;
      if (live !== i) {
        r.x[live] = r.x[i];
        r.z[live] = r.z[i];
        r.y[live] = r.y[i];
        r.h[live] = r.h[i];
        r.t[live] = r.t[i];
      }
      live += 1;
    }
    r.count = live;

    if (live < 2) {
      if (mesh.visible) mesh.visible = false;
      if (geometry.drawRange.count !== 0) geometry.setDrawRange(0, 0);
      return;
    }
    mesh.visible = true;

    // ── 3) Şerit: kılıç ucunun çizdiği kavis ────────────────────────────
    const cx = f.x / S;
    const cz = f.y / S;
    const pos = positionAttr.array as Float32Array;
    const col = colorAttr.array as Float32Array;
    const span = Math.max(1, live - 1);
    for (let i = 0; i < live; i++) {
      const px = r.x[i];
      const pz = r.z[i];
      const py = r.y[i];
      // Radyal yön: gövde merkezinden uca. Kılıç bu yönde uzanır.
      let dx = px - cx;
      let dz = pz - cz;
      const radius = Math.min(MAX_RADIUS, Math.hypot(dx, dz) || BLADE_REACH);
      dx = dx / (Math.hypot(dx, dz) || 1);
      dz = dz / (Math.hypot(dx, dz) || 1);
      // İNCELME: ortada kalın, iki uçta sıfıra iner (sivri hilal uçları).
      const shape = Math.sin(Math.PI * (i / span));
      const inner = Math.max(0.2, radius - ARC_HALF_WIDTH * shape);
      const outer = Math.min(MAX_RADIUS, radius + ARC_HALF_WIDTH * 0.5 * shape);
      // Yaş sönümü: yeni örnek parlak, kuyruk (en eski) tamamen saydam.
      const age = (now - r.t[i]) / (LIFE * 1000);
      const tailA = (1 - age) * (1 - age);
      const lead = 0.55 + 0.45 * (1 - age);

      const pi = i * 6;
      pos[pi] = cx + dx * inner;
      pos[pi + 1] = Math.max(0.22, py - INNER_DROP * shape);
      pos[pi + 2] = cz + dz * inner;
      pos[pi + 3] = cx + dx * outer;
      pos[pi + 4] = py + 0.04;
      pos[pi + 5] = cz + dz * outer;

      const ci = i * 8;
      // İç kenar: sıcak beyaz, yüksek alfa.
      col[ci] = HOT.r;
      col[ci + 1] = HOT.g;
      col[ci + 2] = HOT.b;
      col[ci + 3] = 0.9 * tailA * lead;
      // Dış kenar: mavi, düşük alfa → dışa doğru saydamlaşan sönüm.
      col[ci + 4] = COOL.r;
      col[ci + 5] = COOL.g;
      col[ci + 6] = COOL.b;
      col[ci + 7] = 0.32 * tailA * lead;
    }
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    geometry.setDrawRange(0, (live - 1) * 6);
  });

  return null;
}
