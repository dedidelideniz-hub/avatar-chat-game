// 💥 BombBlastVfx — barut patlamasının AĞIR görsel katmanları.
//
// Üç katman tek yerde toplanır, çünkü üçü de aynı "olay"dan doğar ve üçü de
// kendi havuzunu/fiziğini ister:
//
//   · 💥 ZEMİN ŞOK DALGASI — merkezden dışa açılan SAYDAM basınç diski (bkz.
//     `./shockwave`). İki kademe: hızlı-sıcak ayak izi + yavaş-geniş toz
//     dalgası. İnce torus halkalarının anlatamadığı "havayı iten kütle" budur.
//   · 🪨 TAŞ PARÇALARI — yerden kopup döne döne savrulan, yerçekimiyle düşen
//     katı parçalar (bkz. `./bombDebris`). Patlamanın KÜTLESİ olduğunu anlatan
//     tek katman: alev ve duman yalnız ışıktır.
//   · ⚔️ KILIÇ KESİK İZİ — tam merkezde anlık beliren, parlayıp kaybolan kesik
//     (bkz. `./slashFlash`). Samuray temasını patlamanın içine taşır; patlama
//     artık "ateş" olmadan önce "kılıçla yarılmış" bir olay olarak okunur.
//
// VERİ YOLU: simülasyon (VFX veri yolu) `pushBombBlastEvent` ile posta
// kutusuna yazar, bu bileşen her karede kuyruğu boşaltıp havuzlarına dağıtır
// (bkz. `./bombBlast`). Böylece `Arena3D → FxPool`un ömrüne bağlı kalmadan
// kendi ömürlerini kendileri yönetir.
//
// ⚠️ IŞIK YOK: hepsi additif ya da sahnenin mevcut ışıklarıyla çizilir; nokta
// ışığı eklemek ışık SAYISINI değiştirip arenadaki tüm shader'ları yeniden
// derletir (yetenek anındaki donmanın kaynağı — bkz. `engine/BombFuseFlame`).
//
// MALİYET: yuvalar ÖNCEDEN kurulur; patlama anında hiçbir nesne/materyal
// yaratılmaz, yalnız uniform ve matris yazılır. Tavan: 4 disk + 3 taş fırtınası
// + 3 kesik = en fazla 10 çizim çağrısı, normalde çok daha az.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { drainBombBlastEvents, resetBombBlastEvents } from "./bombBlast";
import { createBombDebris, type BombDebris } from "./bombDebris";
import { makeSlashTexture } from "./slashFlash";
import { createShockwaveMaterial } from "./shockwave";
import { BOMB_PALETTE, S } from "./shared";

/** Şok dalgası yuvası: iki kademe × iki eşzamanlı patlama. */
const SHOCK_SLOTS = 4;
/** Taş fırtınası yuvası (her yuva kendi 14 parçasını yönetir). */
const DEBRIS_SLOTS = 3;
/** Kılıç kesiği yuvası. */
const SLASH_SLOTS = 3;

/**
 * Şok dalgası KADEMELERİ: patlama iki dalga üretir.
 *   · ayak izi — hızlı, sıcak tonda, patlamanın hemen ardından kaybolur,
 *   · toz dalgası — yavaş, solgun ve GENİŞ: hasar alanının dışındaki oyuncu da
 *     baskıyı hisseder (okunurluk).
 * `scale` çarpanı patlamanın görsel yarıçapına uygulanır.
 */
const SHOCK_LAYERS = [
  { scale: 1.5, life: 0.42, color: BOMB_PALETTE.blast },
  { scale: 2.6, life: 0.85, color: BOMB_PALETTE.smoke },
] as const;

/** Taş fırtınasının yayılma yarıçapı ve yuvanın meşgul kalma süresi (sn). */
const DEBRIS_SCALE = 1.15;
const DEBRIS_LIFE = 1.5;
/** Kılıç kesiği: çok kısa ömür — bir "çakma" gibi belirir ve gider. */
const SLASH_LIFE = 0.26;
const SLASH_SCALE = 1.45;

/** Havuz yuvasının zaman durumu (kare başına ayırma yok). */
interface TimerSlot {
  active: boolean;
  x: number;
  z: number;
  /** Dünya birimi cinsinden hedef yarıçap/ölçek. */
  grow: number;
  age: number;
  life: number;
  /** Şok dalgası kademesi (renk/parlaklık için). */
  layer: number;
}

const makeSlots = (count: number): TimerSlot[] =>
  Array.from({ length: count }, () => ({
    active: false,
    x: 0,
    z: 0,
    grow: 0,
    age: 0,
    life: 0,
    layer: 0,
  }));

/** Boş yuva bulur; yoksa 0'ı döndürür (en eski efektin üzerine yazar). */
function freeSlot(slots: TimerSlot[]): number {
  for (let i = 0; i < slots.length; i++) if (!slots[i].active) return i;
  return 0;
}

export function BombBlastVfx() {
  const shockRefs = useRef<(THREE.Mesh | null)[]>([]);
  const slashRefs = useRef<(THREE.Sprite | null)[]>([]);
  // Disk başına bir malzeme: `uProgress`/`uOpacity` yuva başına bağımsızdır
  // (iki patlama üst üste binebilir), shader programı paylaşılır.
  const shockMaterials = useMemo(
    () =>
      Array.from({ length: SHOCK_SLOTS }, () => createShockwaveMaterial(BOMB_PALETTE.blast)),
    [],
  );
  const debris = useMemo<BombDebris[]>(
    () => Array.from({ length: DEBRIS_SLOTS }, () => createBombDebris()),
    [],
  );
  const slashTexture = useMemo(() => makeSlashTexture(), []);

  // Etkiler sahne köküne eklenir: taşlar kendi dünya koordinatlarında savrulur
  // ve bu bileşenin yeniden kurulmasından etkilenmemelidir (yarıklarla aynı desen).
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    resetBombBlastEvents();
    for (const d of debris) scene.add(d.mesh);
    return () => {
      for (const d of debris) {
        d.mesh.removeFromParent();
        d.dispose();
      }
    };
  }, [debris, scene]);
  useEffect(
    () => () => {
      // Disk malzemeleri bu bileşene aittir; kesik dokusu ise modül düzeyinde
      // PAYLAŞILAN bir singleton'dır (fünye alevi dokusuyla aynı kural) ve
      // sahne yeniden kurulduğunda tekrar kullanılır — atılmaz.
      for (const m of shockMaterials) m.dispose();
    },
    [shockMaterials],
  );

  const shocks = useRef<TimerSlot[]>(makeSlots(SHOCK_SLOTS));
  const slashes = useRef<TimerSlot[]>(makeSlots(SLASH_SLOTS));
  /** Taş yuvaları: kalan süre (sn). 0 → yuva boş. */
  const debrisTime = useRef<number[]>(Array.from({ length: DEBRIS_SLOTS }, () => 0));

  useFrame((_state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30); // uzun karede fizik ışınlanmasın

    // 1) POSTA KUTUSU: bu karede patlayan bombaları havuzlara dağıt.
    const events = drainBombBlastEvents();
    for (const e of events) {
      const radius = e.r / S; // px → dünya birimi
      for (let l = 0; l < SHOCK_LAYERS.length; l++) {
        const layer = SHOCK_LAYERS[l];
        const slot = shocks.current[freeSlot(shocks.current)];
        slot.active = true;
        slot.x = e.x / S;
        slot.z = e.y / S;
        slot.grow = radius * layer.scale;
        slot.age = 0;
        slot.life = layer.life;
        slot.layer = l;
      }
      const slash = slashes.current[freeSlot(slashes.current)];
      slash.active = true;
      slash.x = e.x / S;
      slash.z = e.y / S;
      slash.grow = radius * SLASH_SCALE;
      slash.age = 0;
      slash.life = SLASH_LIFE;

      let index = debrisTime.current.findIndex((t) => t <= 0);
      if (index < 0) index = 0; // hepsi meşgulse en eskisinin üzerine yaz
      debrisTime.current[index] = DEBRIS_LIFE;
      debris[index].burst(e.x / S, e.y / S, radius * DEBRIS_SCALE);
    }

    // 2) ŞOK DALGALARI: cephe merkezden diskin kenarına ilerler.
    for (let i = 0; i < SHOCK_SLOTS; i++) {
      const slot = shocks.current[i];
      const mesh = shockRefs.current[i];
      if (!slot.active) {
        if (mesh && mesh.visible) mesh.visible = false;
        continue;
      }
      slot.age += dt;
      const progress = Math.min(1, slot.age / slot.life);
      if (progress >= 1) {
        slot.active = false;
        if (mesh && mesh.visible) mesh.visible = false;
        continue;
      }
      if (mesh) {
        mesh.visible = true;
        mesh.position.set(slot.x, 0.06, slot.z);
        mesh.scale.setScalar(Math.max(0.12, slot.grow));
        const mat = mesh.material as THREE.ShaderMaterial;
        mat.uniforms.uProgress.value = progress;
        // Parlak doğar, ikinci yarısında hızla söner.
        const fade = 1 - progress;
        mat.uniforms.uOpacity.value = fade * fade * 0.95;
        (mat.uniforms.uColor.value as THREE.Color).set(
          SHOCK_LAYERS[slot.layer].color,
        );
      }
    }

    // 3) KILIÇ KESİĞİ: anlık belirir, büyür, söner.
    for (let i = 0; i < SLASH_SLOTS; i++) {
      const slot = slashes.current[i];
      const sprite = slashRefs.current[i];
      if (!slot.active) {
        if (sprite && sprite.visible) sprite.visible = false;
        continue;
      }
      slot.age += dt;
      const progress = Math.min(1, slot.age / slot.life);
      if (progress >= 1) {
        slot.active = false;
        if (sprite && sprite.visible) sprite.visible = false;
        continue;
      }
      if (sprite) {
        sprite.visible = true;
        // Patlamanın merkezinde, göz hizasının biraz altında (gövde yüksekliği).
        sprite.position.set(slot.x, 0.62, slot.z);
        sprite.scale.setScalar(Math.max(0.4, slot.grow) * (0.72 + 0.38 * progress));
        const mat = sprite.material as THREE.SpriteMaterial;
        mat.rotation = 0.38 + progress * 0.3; // kesik izi hafifçe döner
        const fade = 1 - progress;
        mat.opacity = fade * fade * 0.95;
      }
    }

    // 4) TAŞLAR: fizik `bombDebris` içinde; burada yalnız yuva ömrü sayılır.
    for (let i = 0; i < DEBRIS_SLOTS; i++) {
      if (debrisTime.current[i] <= 0) continue;
      debrisTime.current[i] -= dt;
      debris[i].update(dt);
      if (debrisTime.current[i] <= 0) debris[i].hide();
    }
  });

  return (
    <group>
      {/* 💥 zemin şok dalgası diskleri (saydam basınç cephesi) */}
      {Array.from({ length: SHOCK_SLOTS }).map((_, i) => (
        <mesh
          key={`shock-${i}`}
          ref={(el) => {
            shockRefs.current[i] = el;
          }}
          visible={false}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
          material={shockMaterials[i]}
        >
          <circleGeometry args={[1, 56]} />
        </mesh>
      ))}
      {/* ⚔️ merkezdeki kılıç kesik izi */}
      {Array.from({ length: SLASH_SLOTS }).map((_, i) => (
        <sprite
          key={`slash-${i}`}
          ref={(el) => {
            slashRefs.current[i] = el;
          }}
          visible={false}
        >
          <spriteMaterial
            map={slashTexture}
            color={BOMB_PALETTE.spark}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}
