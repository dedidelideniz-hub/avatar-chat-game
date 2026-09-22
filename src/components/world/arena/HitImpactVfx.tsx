// 💥 HitImpactVfx — darbe & toz efekt katmanı (dövüşçü başına bir tane).
//
// Eski darbe geri bildirimi `vfx.burst` (parlak ~2 birimlik küre + bloom
// nabzı), `vfx.smoke` (2.4 birim yükselen iri duman bloğu) ve `vfx.flash`
// (tüm ekranı ışıtan bloom nabzı) üçlüsüydü. Üçü birlikte darbenin olduğu yeri
// değil ekranın tamamını boyuyordu — "kaba beyaz küre / toz bloğu / sert beyaz
// parlama" olarak okunan şey buydu.
//
// Bu katman onların yerine iki hafif sistem kurar:
//
//   · TOZ — yumuşak radyal dokulu sprite'lar (küre mesh'i DEĞİL), %34-50
//     opaklıkta, zeminde dağılan, 0.15-0.20 sn içinde dışa doğru açılıp
//     sönen küçük puflar. Yükselmez: vurulan noktanın zemininde kalır.
//     İkinci bir "tad" vardır: 👣 ADIM TOZU (`FOOT_DUST`) — yürüyen karakterin
//     ayak arkasından çıkar, daha büyük/daha uzun ömürlüdür ve hareketin
//     tersine savrulur (konum kararı `arena/footDust`, çağrılar iki arenada).
//   · KIVILCIM — temas anında 3-4 minik parlak parçacık (additif, 0.10-0.16
//     sn, yer çekimiyle düşer). Ağır/bitirici vuruşta 5.
//
// Ne bloom nabzı ne tam ekran parlama vardır: efekt yalnız darbenin olduğu
// yeri boyar, karakterin ya da düşmanın üzerini kapatmaz.
//
// Kuyruk (sim → görsel) `arena/hitImpacts`; ölçüler tek yerden değişir ve iki
// arena da (bot + PvP) aynı katmanı görür. Havuzlar önceden ayrılır, kare
// başına tahsis yoktur.
import { useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
// Yalnızca tip: Arena3D bu modülü çizer, modül Arena3D'yi çalışma zamanında
// içe aktarmaz (döngüsel bağımlılık olmaz).
import type { BattleFighter } from "@/components/world/Arena3D";
import { drainHitImpacts, type HitImpact } from "./hitImpacts";
import { HUD, S } from "./shared";

/* -------------------------------- ölçüler -------------------------------- */

const TAU = Math.PI * 2;
/** Havuz boyutları: aynı anda en fazla bu kadar parçacık yaşar. */
const DUST_POOL = 32;
const SPARK_POOL = 12;
/** Toz ömrü (sn) — istenen üst sınır 0.2 sn. */
const DUST_LIFE_MIN = 0.15;
const DUST_LIFE_MAX = 0.2;
/**
 * Toz ayarı: puf başına ömür/ölçü/hız. İki ayrı "tad" vardır — darbe tozu ve
 * adım tozu — böylece adım tozu belirginleştirilirken darbe geri bildirimi
 * aynen korunur.
 */
interface DustTune {
  /** Kaç puf çıkar. */
  count: number;
  /** Ömür aralığı (sn). */
  life0: number;
  life1: number;
  /** Doğuş / açılmış yarıçap aralığı (arena birimi, HUD ile ölçeklenir). */
  size0: [number, number];
  size1: [number, number];
  /** Opaklık aralığı: spec 0.3-0.5 — asla görüşü kapatmaz. */
  alpha0: number;
  alpha1: number;
  /** Nokta çevresine dağılma yarıçapı ve dışa doğru hız (birim, birim/sn). */
  spread: number;
  speed: number;
  /** Dikey hız aralığı (birim/sn). */
  rise0: number;
  rise1: number;
  /** Adım tozu: pufların itildiği GERİ yön (dünya XZ, birim vektör). */
  backX?: number;
  backZ?: number;
  /** Adım tozu: geriye itme hızı ve yanal saçılma (birim/sn). */
  backSpeed?: number;
  lateral?: number;
}

/** Darbe/havalanma tozu — mevcut ayarlar (yumuşak, zeminde dağılan puflar). */
const HIT_DUST: DustTune = {
  count: 3,
  life0: DUST_LIFE_MIN,
  life1: DUST_LIFE_MAX,
  size0: [0.12, 0.17],
  size1: [0.36, 0.5],
  alpha0: 0.34,
  alpha1: 0.5,
  spread: 0.42,
  speed: 0.5,
  rise0: 0.18,
  rise1: 0.4,
};

/**
 * 👣 ADIM TOZU — eskiden `vfx.smoke` ile isteniyordu: iri, yükselen duman
 * sistemi, 2 puf ve küçük büyümeyle neredeyse görünmez kalıyordu. Burada
 * zemine yapışık, sayıca daha çok ve daha büyük açılan puf lar var:
 *   · ömür 0.30-0.44 sn (toz bir an asılı kalır, sonra söner),
 *   · açılmış yarıçap ~0.55-0.77 birim (darbe tozunun ~1.4 katı: artık okunur),
 *   · opaklık 0.38-0.52 (bant içinde: görüş kapanmaz, ekran sislenmez),
 *   · puflar hareket yönünün TERSİNE itilir → ayak arkasından savrulma okunur.
 * Konumun ayağın arkasına kaydırılması çağıranda yapılır (`arena/footDust`).
 */
const FOOT_DUST: DustTune = {
  count: 4,
  life0: 0.3,
  life1: 0.44,
  size0: [0.18, 0.26],
  size1: [0.5, 0.7],
  alpha0: 0.38,
  alpha1: 0.52,
  spread: 0.2,
  speed: 0.35,
  rise0: 0.1,
  rise1: 0.26,
  backSpeed: 0.75,
  lateral: 0.4,
};

/**
 * Adım tozu en fazla bu sıklıkta üretilir (ms). Kendi kısıtı vardır ki yoğun
 * yürüyüş ne darbe tozunu aç bıraksın ne de tersi olsun.
 */
const FOOT_MIN_INTERVAL_MS = 90;
/** Kıvılcım ömrü (sn), dışa açılma hızı (birim/sn) ve yer çekimi. */
const SPARK_LIFE_MIN = 0.1;
const SPARK_LIFE_MAX = 0.16;
const SPARK_SPEED = 3.4;
const SPARK_GRAVITY = 9;
/** Zemin düzleminin biraz üstü: puflar zemine gömülmesin. */
const GROUND_Y = 0.05;
/** Göğüs hizası: silahın değdiği yerden çıkarlar. */
const SPARK_Y = 0.9;
/** Havalanma tozu her karede istenebilir; 60 ms'den sık üretilmez. */
const DUST_MIN_INTERVAL_MS = 60;
/** Bayat kuyruk koruması: önceki maçın darbeleri yeni arenada patlamasın. */
const QUEUE_MAX_AGE_MS = 450;

/** Toz rengi (toprak) ve kıvılcım rengi (soğuk beyaz). */
const DUST_COLOR = "#cec3ae";
const SPARK_COLOR = "#eaf7ff";

/* ------------------------------- dokular --------------------------------- */

/**
 * Yumuşak radyal doku: merkezde yarı saydam, kenara doğru tamamen saydam.
 * Bir kez üretilip paylaşılır (katman dövüşçü başına kurulur).
 */
function makeSoftTexture(key: string, core: number, mid: number): THREE.Texture {
  const cached = textureCache.get(key);
  if (cached) return cached;
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
    g.addColorStop(0, `rgba(255,255,255,${core})`);
    g.addColorStop(0.45, `rgba(255,255,255,${mid})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

const textureCache = new Map<string, THREE.Texture>();

/* ------------------------------ parçacıklar ------------------------------ */

interface Puff {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  /** Kalan / toplam ömür (sn); `life <= 0` → boş yuva. */
  life: number;
  max: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Yarıçap: doğar küçük, dışa doğru hızla açılır. */
  size0: number;
  size1: number;
  alpha: number;
}

interface Spark {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  life: number;
  max: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
}

interface ImpactState {
  group: THREE.Group;
  dust: Puff[];
  sparks: Spark[];
  lastDustAt: number;
  lastFootAt: number;
}

/** Boş yuva arar (havuzlar küçük; doğrusal tarama yeterli). */
function freePuff(pool: Puff[]): Puff | null {
  for (const p of pool) if (p.life <= 0) return p;
  return null;
}

function freeSpark(pool: Spark[]): Spark | null {
  for (const s of pool) if (s.life <= 0) return s;
  return null;
}

/* ------------------------------- katman ---------------------------------- */

export function HitImpactVfx({
  fighter,
}: {
  fighter: MutableRefObject<BattleFighter>;
}) {
  const scene = useThree((s) => s.scene);

  const st = useMemo<ImpactState>(() => {
    const dustTex = makeSoftTexture("dust", 0.9, 0.42);
    const sparkTex = makeSoftTexture("spark", 1, 0.3);
    const group = new THREE.Group();
    group.renderOrder = 7;

    const dust: Puff[] = [];
    for (let i = 0; i < DUST_POOL; i++) {
      const mat = new THREE.SpriteMaterial({
        map: dustTex,
        color: DUST_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        // Toz IŞIMAZ: normal karışım + yarı saydamlık gerçek toz okuması verir
        // (additif olsaydı parlak bir küreye dönerdi).
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.raycast = () => {};
      group.add(sprite);
      dust.push({
        sprite,
        mat,
        life: 0,
        max: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size0: 0,
        size1: 0,
        alpha: 0,
      });
    }

    const sparks: Spark[] = [];
    for (let i = 0; i < SPARK_POOL; i++) {
      const mat = new THREE.SpriteMaterial({
        map: sparkTex,
        color: SPARK_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.raycast = () => {};
      group.add(sprite);
      sparks.push({
        sprite,
        mat,
        life: 0,
        max: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 0,
      });
    }

    return { group, dust, sparks, lastDustAt: 0, lastFootAt: 0 };
  }, []);

  /** Adım tozu ayarının kopyası: yön alanı her adımda buraya yazılır (tahsis yok). */
  const footTune = useMemo<DustTune>(() => ({ ...FOOT_DUST }), []);

  useEffect(() => {
    scene.add(st.group);
    return () => {
      scene.remove(st.group);
      for (const p of st.dust) p.mat.dispose();
      for (const s of st.sparks) s.mat.dispose();
    };
  }, [scene, st]);

  /* ------------------------------ üretim ------------------------------ */

  /** Pufları verilen ayarla doğurur (`z`, arena pikseli y'sinin dünya karşılığı). */
  const spawnDust = (x: number, z: number, tune: DustTune, count: number) => {
    for (let i = 0; i < count; i++) {
      const p = freePuff(st.dust);
      if (!p) return;
      const ang = Math.random() * TAU;
      const r = 0.05 + Math.random() * tune.spread;
      p.x = x + Math.cos(ang) * r;
      p.z = z + Math.sin(ang) * r;
      p.y = GROUND_Y + Math.random() * 0.06;
      // Dışa dağılma + (adım tozunda) hareketin tersine savrulma.
      const back = tune.backSpeed ?? 0;
      p.vx = Math.cos(ang) * tune.speed + (tune.backX ?? 0) * back;
      p.vz = Math.sin(ang) * tune.speed + (tune.backZ ?? 0) * back;
      if (tune.lateral) {
        p.vx += (Math.random() - 0.5) * tune.lateral;
        p.vz += (Math.random() - 0.5) * tune.lateral;
      }
      p.vy = tune.rise0 + Math.random() * (tune.rise1 - tune.rise0);
      p.max = p.life = tune.life0 + Math.random() * (tune.life1 - tune.life0);
      p.size0 =
        (tune.size0[0] + Math.random() * (tune.size0[1] - tune.size0[0])) * HUD;
      p.size1 =
        (tune.size1[0] + Math.random() * (tune.size1[1] - tune.size1[0])) * HUD;
      p.alpha = tune.alpha0 + Math.random() * (tune.alpha1 - tune.alpha0);
      p.sprite.visible = true;
      p.sprite.position.set(p.x, p.y, p.z);
      p.sprite.scale.setScalar(p.size0);
      p.mat.opacity = p.alpha;
    }
  };

  /** Darbe/havalanma tozu (kısılır: atlama boyunca her karede istenebilir). */
  const spawnHitDust = (
    x: number,
    z: number,
    now: number,
    count = HIT_DUST.count,
  ) => {
    if (now - st.lastDustAt < DUST_MIN_INTERVAL_MS) return;
    st.lastDustAt = now;
    spawnDust(x, z, HIT_DUST, count);
  };

  /**
   * 👣 Adım tozu: konum çağıranda ayak arkasına kaydırılmıştır (bkz.
   * `arena/footDust`); burada puflar o noktanın zemininden çıkar ve hareket
   * yönünün tersine savrulur.
   */
  const spawnFootDust = (
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    now: number,
  ) => {
    if (now - st.lastFootAt < FOOT_MIN_INTERVAL_MS) return;
    st.lastFootAt = now;
    const len = Math.hypot(dirX, dirZ);
    if (len > 1e-4) {
      // Kopya ayır mıyoruz: yön, adım başına tek kullanım için yazılır.
      footTune.backX = -dirX / len;
      footTune.backZ = -dirZ / len;
    } else {
      footTune.backX = 0;
      footTune.backZ = 0;
    }
    spawnDust(x, z, footTune, FOOT_DUST.count);
  };

  const spawnSparks = (x: number, y: number, heavy: boolean) => {
    // 3-4 minik kıvılcım (ağır vuruşta 5).
    const count = heavy ? 5 : Math.random() < 0.5 ? 3 : 4;
    for (let i = 0; i < count; i++) {
      const s = freeSpark(st.sparks);
      if (!s) return;
      const ang = Math.random() * TAU;
      const up = 0.35 + Math.random() * 0.5;
      const flat = Math.sqrt(Math.max(0, 1 - up * up));
      s.x = x + Math.cos(ang) * 0.1;
      s.z = y + Math.sin(ang) * 0.1;
      s.y = SPARK_Y + (Math.random() - 0.5) * 0.24;
      s.vx = Math.cos(ang) * flat * SPARK_SPEED * (0.8 + Math.random() * 0.6);
      s.vz = Math.sin(ang) * flat * SPARK_SPEED * (0.8 + Math.random() * 0.6);
      s.vy = up * SPARK_SPEED * (0.7 + Math.random() * 0.6);
      s.max = s.life =
        SPARK_LIFE_MIN + Math.random() * (SPARK_LIFE_MAX - SPARK_LIFE_MIN);
      s.size = (0.07 + Math.random() * 0.04) * HUD;
      s.sprite.visible = true;
      s.sprite.position.set(s.x, s.y, s.z);
      s.sprite.scale.setScalar(s.size);
      s.mat.opacity = 1;
    }
  };

  const applyImpact = (im: HitImpact, now: number) => {
    if (now - im.t > QUEUE_MAX_AGE_MS) return;
    // Arena pikseli → dünya birimi (efekt katmanı dünya uzayında çizer).
    const x = im.x / S;
    const z = im.y / S;
    if (im.kind === "footstep") {
      spawnFootDust(x, z, im.dirX ?? 0, im.dirY ?? 0, now);
      return;
    }
    if (im.kind === "dust") {
      spawnHitDust(x, z, now);
      return;
    }
    // Silah teması: minik kıvılcımlar (ıskada yok) + zemin tozu.
    if (im.hit) spawnSparks(x, z, im.heavy);
    spawnHitDust(x, z, now, im.hit ? 4 : 3);
  };

  /* ------------------------------- güncelle ------------------------------ */

  useFrame((_, rawDt) => {
    // Arka plana düşen karede (sekme değişimi) parçacıklar ışınlanmasın.
    const dt = Math.min(rawDt, 1 / 30);
    const now = performance.now();

    const pending = drainHitImpacts(fighter.current);
    if (pending) for (const im of pending) applyImpact(im, now);

    for (const p of st.dust) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        p.mat.opacity = 0;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      // Hafif frenleme: toz dağılırken yavaşlar, zeminden fazla yükselmez.
      p.vx -= p.vx * 2.4 * dt;
      p.vz -= p.vz * 2.4 * dt;
      p.vy -= p.vy * 2.8 * dt;
      if (p.y < GROUND_Y) p.y = GROUND_Y;
      const k = 1 - p.life / p.max;
      // easeOutQuad: hızlı açılır, sonra yavaşlar (patlama değil, dağılma).
      const grow = 1 - (1 - k) * (1 - k);
      p.sprite.position.set(p.x, p.y, p.z);
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * grow);
      const fade = 1 - k;
      p.mat.opacity = p.alpha * fade * fade;
    }

    for (const s of st.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.sprite.visible = false;
        s.mat.opacity = 0;
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vy -= SPARK_GRAVITY * dt;
      if (s.y < GROUND_Y) {
        s.y = GROUND_Y;
        s.vy = 0;
      }
      const k = 1 - s.life / s.max;
      s.sprite.position.set(s.x, s.y, s.z);
      s.sprite.scale.setScalar(s.size * (1 - 0.45 * k));
      const fade = 1 - k;
      s.mat.opacity = fade * fade;
    }
  });

  return null;
}
