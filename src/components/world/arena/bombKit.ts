// 🧨 bombKit — SAMURAY (bomba) skini'nin iki yeteneğinin KURAL katmanı.
//
// Samurayın elinde bomba tutar (bkz. `engine/SamuraiBomb`); bu modül o bombayı
// OYUNA sokan taraftır ve iki yeteneği tanımlar:
//
//   · NORMAL YETENEK (süper yuvası) — **YERE BOMBA TUZAĞI**: nişan noktasına
//     bir bomba bırakılır. Fitil `BOMB_TRAP_ARM_S` boyunca yanar, sonra tuzak
//     KURULU olur ve düşman `BOMB_TRAP_TRIGGER_PX` kadar yaklaşınca patlar
//     (yaklaşmazsa ömrü bitince kendiliğinden patlar).
//
//   · ULTİ — **BOMBA FIRLATMA**: karakter bombayı nişan yönünde savurur;
//     mermi menzil sonunda patlar ve `BOMB_THROW_BLAST_PX` yarıçapında hasar
//     verir. Fırlatma mantığı `SkillComponent.fireBombThrow` içinde, mermi
//     görseli `arena/ProjectilePool` içinde (`proj.bomb`).
//
// NEDEN AYRI MODÜL: tuzak, iki arenada da (bot + PvP) aynı kurallarla
// işlemelidir. Simülasyon burada SAF ve React'sizdir; sahne yalnızca listeyi
// tutar, her kare `stepBombTraps` çağırır ve patlama anını (hasar + VFX)
// kendi katmanında uygular. Böylece PvP ağ katmanı ile bot arenası ayrışırken
// tuzak davranışı tek kaynaktan gelir.
//
// Ölçü birimi: oyun pikseli (sim uzayı). `MAX_RANGE_PX` = 200 px (4 birim)
// olduğu için tuzak menzili (150 px) tam menzilin hemen içindedir — tuzak
// "bir adım öne" bırakılır, haritanın öbür ucuna değil.
import { S } from "./shared";
import { MAX_RANGE_PX } from "./skillshot";

/** Tuzağın bırakılabileceği en uzak mesafe (px) — 3 birim. */
export const BOMB_TRAP_RANGE_PX = 3 * S;
/** Fitil süresi (sn): bu süre boyunca tuzak KURULU DEĞİLDİR (yaklaşan patlatmaz). */
export const BOMB_TRAP_ARM_S = 1.2;
/** Kurulduktan sonra tuzak kaç saniye bekler (sonra kendiliğinden patlar). */
export const BOMB_TRAP_LIFE_S = 8;
/** Düşman bu mesafeye girerse tuzak tetiklenir (px) — 1.1 birim. */
export const BOMB_TRAP_TRIGGER_PX = 55;
/** Tuzak patlamasının hasar yarıçapı (px). */
export const BOMB_TRAP_BLAST_PX = 140;
/** Tuzak patlaması hasarı. */
export const BOMB_TRAP_DAMAGE = 300;

/** Ulti bombasının uçuş hızı (px/s) — diğer mermilerden yavaş, "savrulma". */
export const BOMB_THROW_SPEED = 300;
/** Ulti bombasının patlama yarıçapı (px). */
export const BOMB_THROW_BLAST_PX = 165;
/** Ulti bombasının hasarı — yere vuruş ultisinden (360) yüksek: isabet etmesi
 *  daha zor (uçuş + menzil sonu), karşılığı daha ağır olmalı. */
export const BOMB_THROW_DAMAGE = 460;
/** Ulti animasyon süresi (sn) — Kraliyet ultisiyle aynı zamanlama. */
export const BOMB_ULT_S = 0.82;
/** Bombanın ELDEN BIRAKILDIĞI ilerleme oranı (0..1) — ulti ile aynı eşik. */
export const BOMB_RELEASE_AT = 0.62;
/** Bomba elden çıktıktan (fırlatma/bırakma) sonra elin boş kaldığı süre (sn).
 *  Görsel geri bildirim: karakter bir an "elinde bomba yok" görünür, sonra
 *  yeni bomba hazır olur. Hem tuzak hem fırlatma aynı süreyi kullanır. */
export const BOMB_REFILL_S = 1.2;

export type BombOwner = "player" | "bot";

export interface BombTrap {
  owner: BombOwner;
  /** Tuzak noktası (sim px). */
  x: number;
  y: number;
  /** Kalan fitil (sn) — 0'a inince tuzak KURULU olur. */
  fuse: number;
  /** Kurulduktan sonraki kalan ömür (sn). */
  ttl: number;
  /**
   * RAKİBİN tuzağı mı? PvP'de karşı cihazın bıraktığı tuzak yalnızca
   * GÖRSEL olarak simüle edilir: hasar ve olay gönderimi onu bırakan tarafa
   * aittir (çift hasar olmasın).
   */
  remote?: boolean;
}

/**
 * PAYLASILAN TUZAK DURUMU — `aimState` / `bloomPulse` ile aynı desen: React
 * state'i DEĞİL, mutable bir nesnedir. Sahne kendi tuzak listesini buraya
 * bağlar, çizim katmanı (`BombTrapPool`) her kare buradan okur. Böylece tuzak
 * bırakmak hiçbir React yeniden çizimi yapmaz ve çizim katmanına prop
 * taşımak gerekmez.
 *
 * Aynı anda TEK arena aktiftir (bot arenası ya da PvP), o yüzden tek liste
 * yeterlidir; sahne sökülürken bağ çözülür (`bindBombTraps` dönen temizleyici).
 */
export const bombTrapState: { traps: BombTrap[] } = { traps: [] };

/**
 * Sahnenin tuzak listesini çizim katmanına bağlar. Dizi KOPYALANMAZ: sahne
 * aynı diziyi `stepBombTraps` ile yerinde güncellediği için paylaşılan
 * referans geçerli kalır. Dönen fonksiyon bağı çözer (sahne sökülürken).
 */
export function bindBombTraps(traps: BombTrap[]): () => void {
  bombTrapState.traps = traps;
  return () => {
    if (bombTrapState.traps === traps) bombTrapState.traps = [];
  };
}

/** Yeni tuzak kaydı (liste sahibi sahne). */
export function makeBombTrap(
  owner: BombOwner,
  x: number,
  y: number,
  remote = false,
): BombTrap {
  return {
    owner,
    x,
    y,
    fuse: BOMB_TRAP_ARM_S,
    ttl: BOMB_TRAP_ARM_S + BOMB_TRAP_LIFE_S,
    remote,
  };
}

/** Tuzak noktası: nişan yönünde, menzil sınırına kırpılmış mesafe. */
export function bombTrapPoint(
  from: { x: number; y: number },
  dir: { x: number; y: number },
): { x: number; y: number } {
  const reach = Math.min(BOMB_TRAP_RANGE_PX, MAX_RANGE_PX);
  return { x: from.x + dir.x * reach, y: from.y + dir.y * reach };
}

/**
 * Tuzakları bir adım ilerletir.
 *
 * `enemyOf(owner)` o tuzağın HEDEFİNİ verir (yoksa null → düşman yok, tuzak
 * yalnızca ömrüyle patlar). Patlayan tuzak listeden düşürülür ve `onBlast`
 * ile sahneye bildirilir; liste ÜZERİNDE splice yapılmaz (yerinde sıkıştırma),
 * çünkü sahne aynı listeyi her kare okuyor ve kalan diziyi kaydırmak kare
 * başına boşuna iş yapar.
 */
export function stepBombTraps(
  traps: BombTrap[],
  dt: number,
  enemyOf: (owner: BombOwner) => { x: number; y: number } | null,
  onBlast: (trap: BombTrap) => void,
): void {
  let write = 0;
  for (let read = 0; read < traps.length; read++) {
    const trap = traps[read];
    trap.fuse = Math.max(0, trap.fuse - dt);
    trap.ttl -= dt;

    let boom = trap.ttl <= 0;
    if (!boom && trap.fuse <= 0) {
      const enemy = enemyOf(trap.owner);
      if (enemy) {
        boom =
          Math.hypot(enemy.x - trap.x, enemy.y - trap.y) <= BOMB_TRAP_TRIGGER_PX;
      }
    }

    if (boom) {
      onBlast(trap);
      continue; // listeden düşer (write'a yazılmaz)
    }
    if (write !== read) traps[write] = trap;
    write += 1;
  }
  traps.length = write;
}
