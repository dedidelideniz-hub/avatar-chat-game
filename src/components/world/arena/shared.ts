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
};

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
  add({ kind: "ring", x, y, ttl: 0.5, maxTtl: 0.5, grow: r * 1.15, color: COLD_FLAME.ring });
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
export const PROJ_POOL = 26;
export const TEXT_POOL = 8;
export const RING_POOL = 12;
export const BURST_POOL = 8;
export const BEAM_POOL = 2;
/* Ateş Topu patlaması tek başına 15 alev bulutu eklediği için havuz, ayak
 * tozu/duman girdileri onları kırpmasın diye geniş tutulur. */
export const SMOKE_POOL = 36;
export const CRACK_POOL = 3;

/* Brawl tarzı vuruş geri bildirimi */
export const HIT_SPARKS = 10; // vuruş başına kıvılcım tanesi
export const SPARK_LIFE = 0.42; // kıvılcım ömrü (saniye)
