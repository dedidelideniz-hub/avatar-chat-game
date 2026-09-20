// ⚔️ SwordArcTrail — Kraliyet Savaşçısı'nın yakın dövüşü için KILIÇ SAVURMA
// İZİ (sword slash arc trail).
//
// NEDEN VAR: vuruş efektleri eskiden kural katmanında düz "beam" şeritleri
// olarak çiziliyordu — kılıçtan bağımsız, ekrana fırlayan düz sarı bantlar
// gibi okunuyordu. Bu katman izi doğrudan KEMİK katmanının ölçtüğü kılıç
// ucundan üretir:
//
//   · KAVİS (crescent): kılıç ucu her karede örneklenir; son `LIFE` (0.15 sn)
//     boyunca toplanan noktalar bir şerit (ribbon) olur. Noktalar kılıcın
//     gerçekten çizdiği rotadır — düz bir kutu/çizgi değil, savurmanın kavisi.
//   · SİLAHA BAĞLI: iz haritada ilerleyen bir mermi değildir; kılıç nereye
//     giderse iz oraya doğar ve kuyruğundan (en eski örnekten) başlayarak
//     0.15 sn içinde silinir.
//   · ADDİTİF + SAYDAM: transparent, AdditiveBlending, opacity 0.8. İç kenar
//     sıcak beyaz, dış kenar mavi; hem kuyruk hem dış kenar vertex alpha ile
//     saydamlaşır → tek renk bant değil, dışa doğru sönümlenen ışık dalgası.
//
// DÜNYA UZAYINDA çizilir (sahne köküne eklenir): tepe noktaları mutlak
// koordinatlarda üretildiği için dövüşçünün rig ölçek/dönüş zincirine bağlı
// kalmaz; bir kare gecikmeli matris tersine çevirme gibi kırılgan hileler
// gerekmez.
//
// Çıpa iki kaynaktan gelir (öncelik sırası):
//   1) `RoyalMelee`nin her karede yazdığı kılıç ucu (`meleeFxX/Y/H`) — asıl
//      kaynak; iz, kılıcın gerçekten geçtiği yerden geçer.
//   2) Çıpa bayatsa/yoksa: gövdenin baktığı yön × bıçağın erişimi (göğüs
//      hizası). İz yine kılıcın olduğu hatta kalır, ekrana fırlamaz.
import { useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { BattleFighter } from "@/components/world/Arena3D";
import { S } from "./shared";

/* ------------------------------ sabitler -------------------------------- */

/** İzin toplam ömrü (sn): kılıç ucunun son 0.15 sn'lik rotası çizilir. */
const LIFE = 0.15;
/** Örnek tamponu: 0.15 sn @ ~170 fps üst sınırı. */
const MAX_SAMPLES = 26;
/** Şeridin iç kenarı: uçtan geriye (kılıcın gövdeye bakan yarısı). */
const ARC_INNER = 0.6;
/** Şeridin dışa taşan parlaması (ucun ötesi). */
const ARC_OUTER = 0.12;
/** İç kenarın uca göre alçalması (kabza el hizasında kalır). */
const ARC_DROP = 0.28;
/** Çıpa tazelik sınırı (ms) — kemik katmanı her karede yazar (~16 ms). */
const ANCHOR_MAX_AGE_MS = 120;
/** Yedek erişim (dünya birimi): bıçak 0.85 + omuzun öne uzanması ~0.5. */
const FALLBACK_REACH = 1.35;
/**
 * Çıpa emniyet sınırı (dünya birimi): ölçüm bozuksa (beklenmeyen iskelet,
 * yanlış rig ölçeği) iz haritanın başka yerine düşmesin — yedeğe dönülür.
 */
const MAX_REACH = 3.5;
/** Yedek yükseklik: göğüs hizası (dünya birimi). */
const FALLBACK_HEIGHT = 0.95;
/** İç kenar rengi (sıcak beyaz) ve dış kenar rengi (mavi). */
const HOT = new THREE.Color("#eaf7ff");
const COOL = new THREE.Color("#4aa8ff");

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
    // Örnek başına bir şerit dilimi (inner/outer çifti) — indeksler sabit.
    const indices: number[] = [];
    for (let i = 0; i < MAX_SAMPLES - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
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

  /** Kılıç ucu örnekleri (dünya birimi) — ring tampon, kare başına tahsis yok. */
  const ring = useRef({
    x: new Float32Array(MAX_SAMPLES),
    z: new Float32Array(MAX_SAMPLES),
    h: new Float32Array(MAX_SAMPLES),
    t: new Float64Array(MAX_SAMPLES),
    count: 0,
  });

  useFrame(() => {
    const f = fighter.current;
    const now = performance.now();
    const r = ring.current;
    const { geometry, mesh, positionAttr, colorAttr } = built;

    // ── 1) Yeni örnek: yalnız salınım sürerken ──────────────────────────
    if (f.meleeT > 0) {
      const tx = f.meleeFxX;
      const ty = f.meleeFxY;
      const th = f.meleeFxH;
      const tt = f.meleeFxT;
      let wx: number;
      let wz: number;
      let wh: number;
      const anchorFresh =
        typeof tx === "number" &&
        typeof ty === "number" &&
        typeof tt === "number" &&
        now - tt <= ANCHOR_MAX_AGE_MS;
      const anchorNear =
        anchorFresh &&
        Math.hypot(tx / S - f.x / S, ty / S - f.y / S) <= MAX_REACH;
      if (anchorNear) {
        // Ölçülmüş kılıç ucu (asıl kaynak).
        wx = (tx as number) / S;
        wz = (ty as number) / S;
        wh = typeof th === "number" ? th : FALLBACK_HEIGHT;
      } else {
        // Yedek: gövdenin baktığı yön × bıçağın erişimi.
        const yaw = f.aimYaw ?? f.restYaw ?? 0;
        wx = f.x / S + Math.sin(yaw) * FALLBACK_REACH;
        wz = f.y / S + Math.cos(yaw) * FALLBACK_REACH;
        wh = FALLBACK_HEIGHT;
      }
      if (r.count < MAX_SAMPLES) {
        r.count += 1;
      } else {
        // Tampon doldu: en eskiyi düşür (kopya maliyeti önemsiz, 26 örnek).
        r.x.copyWithin(0, 1);
        r.z.copyWithin(0, 1);
        r.h.copyWithin(0, 1);
        r.t.copyWithin(0, 1);
      }
      const i = r.count - 1;
      r.x[i] = wx;
      r.z[i] = wz;
      r.h[i] = wh;
      r.t[i] = now;
    }

    // ── 2) Ömrü dolanları düşür (kuyruk = en eski örnek) ────────────────
    let live = 0;
    for (let i = 0; i < r.count; i++) {
      if (now - r.t[i] > LIFE * 1000) continue;
      if (live !== i) {
        r.x[live] = r.x[i];
        r.z[live] = r.z[i];
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

    // ── 3) Şerit: kılıç ucunun rotası boyunca inner/outer çiftleri ──────
    const cx = f.x / S;
    const cz = f.y / S;
    const pos = positionAttr.array as Float32Array;
    const col = colorAttr.array as Float32Array;
    for (let i = 0; i < live; i++) {
      const px = r.x[i];
      const pz = r.z[i];
      const ph = r.h[i];
      // Radyal yön: gövde merkezinden uca. Bıçak bu yönde uzanır, bu yüzden
      // şerit savurmanın kavisini takip eden bir hilal olur.
      let dx = px - cx;
      let dz = pz - cz;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl;
      dz /= dl;
      const inX = px - dx * ARC_INNER;
      const inZ = pz - dz * ARC_INNER;
      const outX = px + dx * ARC_OUTER;
      const outZ = pz + dz * ARC_OUTER;

      // Yaş sönümü: yeni örnek parlak, kuyruk (en eski) tamamen saydam.
      const fade = 1 - (now - r.t[i]) / (LIFE * 1000);
      // Kuyruk yumuşaklığı: yaşlı örneklerin alfası karesel düşer.
      const tailA = fade * fade;
      // Uç (yeni örnek) daha parlak: bıçağın girdiği an okunur.
      const lead = 0.55 + 0.45 * fade;

      const pi = i * 6;
      pos[pi] = inX;
      pos[pi + 1] = Math.max(0.25, ph - ARC_DROP);
      pos[pi + 2] = inZ;
      pos[pi + 3] = outX;
      pos[pi + 4] = ph + ARC_OUTER * 0.5;
      pos[pi + 5] = outZ;

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
      col[ci + 7] = 0.34 * tailA * lead;
    }
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    geometry.setDrawRange(0, (live - 1) * 6);
  });

  return null;
}
