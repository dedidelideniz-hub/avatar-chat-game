// ⚔️ Arena için paylaşılan sabitler, tipler ve efekt yardımcıları.
//
// Arena3D.tsx tek dosyada 70 KB'yi aştığı için modüllere bölündü: mermi
// havuzu ayrı dosyaya taşındı ve hem onun hem de Arena3D'nin ihtiyaç duyduğu
// ortak parçalar burada toplandı. Arena3D bu isimleri yeniden dışa aktarır,
// böylece mevcut `import ... from "@/components/world/Arena3D"` çağrıları
// değişmeden çalışmaya devam eder.

/** World px → 3D units.
 *  Enlarged battlefield: the whole 5v5 terrain is now spread over a much
 *  wider world footprint, so the map reads as a big arena while the
 *  fighters (fixed 1.5-unit bodies) stay small figures on it. The sim
 *  still runs in 0..1700px; this only changes how those px map to 3D. */
export const S = 50;
export const ARENA_W = 34; // 1700 px / S
export const ARENA_D = 22; // 1100 px / S
export const CX = ARENA_W / 2;
export const CZ = ARENA_D / 2; // z = +y/S so the map is NOT mirrored (up = up)
/** Readability scale for fixed-size world HUD/effects on the larger map. */
export const HUD = 2;

/** Karakterle birlikte küçülen baş-üstü HUD (can barı + isim etiketi) oranı.
 *  RIG_ROOT_SCALE ile aynı adımı izler: gövde %15 küçülünce bar ve isim de
 *  %15 küçülür, böylece barın karaktere göre duruşu değişmez. Ölçek gruba
 *  verildiği için barın yüksekliği de aynı oranda iner. */
export const HEAD_UI_SCALE = 0.85;

export interface BattleProj {
  owner: "player" | "bot";
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  r: number;
  travelled: number;
  pierce: boolean;
  explodeR?: number;
}

export type BattleFx =
  | {
      kind: "text";
      x: number;
      y: number;
      ttl: number;
      maxTtl: number;
      text: string;
      color: string;
    }
  | {
      kind: "ring";
      x: number;
      y: number;
      ttl: number;
      maxTtl: number;
      grow: number;
      color: string;
    }
  | {
      kind: "burst";
      x: number;
      y: number;
      ttl: number;
      maxTtl: number;
      grow: number;
      color: string;
    }
  | {
      kind: "beam";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      ttl: number;
      maxTtl: number;
    }
  | {
      kind: "smoke";
      x: number;
      y: number;
      ttl: number;
      maxTtl: number;
      grow: number;
      color: string;
    }
  | {
      kind: "samuraiCrack";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      ttl: number;
      maxTtl: number;
    };

/** Ateş Topu (ana ateş) — fiziksel ateş yerine antik büyüyle harmanlanmış
 *  ruhani / soğuk alev paleti. Hasar yarıçapı DEĞİŞMEZ; sadece patlamanın
 *  görseli küçülür ve soğuk (buz mavisi → mor) bir büyüye dönüşür. */
export const COLD_FLAME = {
  core: "#ede9fe", // buzlu mor-beyaz çekirdek
  ring: "#67e8f9", // çiyan yer dalgası / soğuk şok dalgası
  wispA: "#a5f3fc", // soğuk alev dili (buz mavisi)
  wispB: "#c4b5fd", // ruhani alev dili (eflatun)
  /** Rakip ateşi aynı ruhani stil, ama pembe tonla ayrılır (PvP okunurluğu). */
  enemyA: "#f5d0fe",
  enemyB: "#f0abfc",
  /** "Güçlü Vuruş" ana mermisi — fiziksel ateş değil, antik büyüyle
   *  harmanlanmış soğuk/ruhani alev oku. İki taraf da aynı stili kullanır,
   *  ton farkıyla ayrılır: oyuncu buz mavisi, düşman eflatun. */
  bolt: {
    player: {
      core: "#f8fdff", // buzlu beyaz çekirdek
      emissive: "#0284c7", // soğuk büyü ışıması
      glow: "#7dd3fc", // additive iç ışıma
      halo: "#bae6fd", // geniş dış hale
      tail: "#22d3ee", // alev kuyruğu
      trail: "#38bdf8", // uçuş izi (yakın, kalın)
      wisp: "#a78bfa", // ruhani ikinci alev tonu
      ring: "#67e8f9", // dönen büyü halkası
      ground: "#0ea5e9", // zemindeki soğuk ışık lekesi
    },
    enemy: {
      core: "#fbf7ff",
      emissive: "#6d28d9",
      glow: "#c4b5fd",
      halo: "#ddd6fe",
      tail: "#a855f7",
      trail: "#c084fc",
      wisp: "#67e8f9",
      ring: "#e9d5ff",
      ground: "#7c3aed",
    },
  },
};

/** Ana merminin (soğuk alev oku) VFX ölçüleri — tek yerden ayar için.
 *  NOT: Değerler HUD (=2) ile çarpılarak dünyaya uygulanır. Karakter gövdesi
 *  1.5 birim olduğundan mermi kasıtlı olarak karakterin çok altında tutulur;
 *  büyütmek/ küçültmek için yalnızca bu tabloyu değiştirmek yeterlidir. */
export const BOLT_VFX = {
  core: 0.055, // çekirdek yarıçapı (× HUD) → ~0.11 birim
  glow: 0.08, // iç ışıma yarıçapı
  halo: 0.12, // dış hale yarıçapı (mermi, karakterden küçük kalsın)
  tailLen: 0.2, // alev kuyruğu uzunluğu
  tailR: 0.045, // alev kuyruğu taban yarıçapı
  streak: 0.26, // uçuş izi uzunluğu (hızla ölçeklenir, bunu aşmaz)
  ground: 0.15, // zemindeki ışık lekesi yarıçapı
  /** Namlu şimşeği mermi çıktıktan sonra kaç dünya-px boyunca görünür kalır. */
  muzzlePx: 78,
};

/**
 * Ana mermi çarptığında (düşmana ya da engele) soğuk alev kıvılcımı: ince bir
 * büyü halkası + buzlu/ruhani alev pufları. Fiziksel turuncu patlama yerine
 * antik büyü hissi verir; hasar değerlerine dokunmaz.
 */
export function pushColdFlameImpact(
  add: (fx: BattleFx) => void,
  x: number,
  y: number,
  size = 56,
): void {
  add({
    kind: "ring",
    x,
    y,
    ttl: 0.34,
    maxTtl: 0.34,
    grow: size,
    color: COLD_FLAME.ring,
  });
  const n = size > 60 ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const life = 0.22 + Math.random() * 0.24;
    add({
      kind: "smoke",
      x: x + (Math.random() - 0.5) * size * 0.6,
      y: y + (Math.random() - 0.5) * size * 0.6,
      ttl: life,
      maxTtl: life,
      grow: size * (0.45 + Math.random() * 0.4),
      color:
        i % 3 === 0
          ? COLD_FLAME.core
          : i % 3 === 1
            ? COLD_FLAME.wispB
            : COLD_FLAME.wispA,
    });
  }
}

/** Görsel patlama yarıçapı = hasar yarıçapı × bu değer.
 *  Eski ateş topu karakterin ~3.5 katı büyüklükteydi; artık sıkı ve okunur. */
export const FIREBALL_VFX_SCALE = 0.55;

/** Bir merminin Ateş Topu (soğuk alev) olup olmadığı. */
export function isFireballProj(p: BattleProj | undefined): boolean {
  return !!p && p.explodeR !== undefined;
}

/**
 * Ateş Topu patlaması için soğuk alev VFX'i ekler. Fiziksel turuncu ateş
 * yerine: zeminde ince bir büyü halkası + buzlu bir çekirdek parlaması +
 * yükselip sönen ruhani alev dilleri.
 *
 * NOT: 3D patlama havuzu (`burst` mesh'i) rengi sabit turuncuya boyanmıştır,
 * bu yüzden fiziksel ateş görüntüsünü vermemesi için "burst" yerine rengi
 * efekt başına taşıyan "smoke"/alev katmanı kullanılır. `damageR` yalnızca
 * hasar içindir; görsel onun küçültülmüş hâlidir, oyun hissi değişmez.
 */
export function pushColdFlameFx(
  add: (fx: BattleFx) => void,
  x: number,
  y: number,
  damageR: number,
): void {
  const r = damageR * FIREBALL_VFX_SCALE;
  // Zeminde yayılan ince büyü halkası (soğuk şok dalgası).
  add({
    kind: "ring",
    x,
    y,
    ttl: 0.5,
    maxTtl: 0.5,
    grow: r * 1.15,
    color: COLD_FLAME.ring,
  });
  // Buzlu çekirdek: kısa ömürlü, parlak ve hızla yükselen ruhani alev kütlesi.
  for (let i = 0; i < 6; i++) {
    const life = 0.3 + Math.random() * 0.18;
    add({
      kind: "smoke",
      x: x + (Math.random() - 0.5) * 34,
      y: y + (Math.random() - 0.5) * 34,
      ttl: life,
      maxTtl: life,
      grow: r * 0.6 + Math.random() * 20,
      color: i % 3 === 0 ? COLD_FLAME.core : COLD_FLAME.wispA,
    });
  }
  // Dışa saçılan soğuk alev dilleri — buz mavisi ve eflatun.
  for (let i = 0; i < 9; i++) {
    const life = 0.6 + Math.random() * 0.55;
    add({
      kind: "smoke",
      x: x + (Math.random() - 0.5) * 76,
      y: y + (Math.random() - 0.5) * 76,
      ttl: life,
      maxTtl: life,
      grow: r * 0.7 + Math.random() * 26,
      color: i % 2 === 0 ? COLD_FLAME.wispA : COLD_FLAME.wispB,
    });
  }
}

/* Efekt havuzlarının boyutları. */
export const PROJ_POOL = 18;
export const TEXT_POOL = 8;
export const RING_POOL = 12;
export const BURST_POOL = 8;
export const BEAM_POOL = 2;
/* Ateş Topu patlaması tek başına 15 alev bulutu, mermi çarpmaları da birkaç
 * soğuk puf eklediği için havuz, ayak tozu/duman girdileri onları kırpmasın
 * diye geniş tutulur. */
export const SMOKE_POOL = 44;
export const CRACK_POOL = 3;

/* Brawl tarzı vuruş geri bildirimi */
export const HIT_SPARKS = 10; // vuruş başına kıvılcım tanesi
export const SPARK_LIFE = 0.42; // kıvılcım ömrü (saniye)
