// 🧨 bombKit — SAMURAY (bomba) skini'nin iki yeteneğinin KURAL katmanı.
//
// Samurayın elinde bomba tutar (bkz. `engine/SamuraiBomb`); bu modül o bombayı
// OYUNA sokan taraftır ve iki yeteneği tanımlar:
//
//   · NORMAL YETENEK (süper yuvası) — **YERE BOMBA TUZAĞI**: karakter elindeki
//     bombayı YERE, durduğu yere bırakır (bkz. `BOMB_PLACE_S`). Fitil
//     `BOMB_TRAP_ARM_S` boyunca yanar, sonra tuzak KURULU olur ve düşman
//     `BOMB_TRAP_TRIGGER_PX` kadar yaklaşınca patlar (yaklaşmazsa ömrü bitince
//     kendiliğinden patlar).
//
//     NEDEN AYAK UCU (eskiden nişan yönünde 3 birimdi): bomba bu karakterin
//     SİLAHI ve eliyle bırakılır — animasyon (bkz. `engine/BombArmPose` →
//     `applyBombActionPose`) elin yetiştiği yere kadar iner, el açılır ve top
//     yere düşer. Tuzak 3 birim öteye düşseydi el bombanın 3 birim uzağında
//     açılmış olurdu (bomba elden çıkıp ışınlanırdı); tuzak noktası bu yüzden
//     karakterin KENDİ konumudur ve el ile yere konan top birebir oraya iner.
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
// Ölçü birimi: oyun pikseli (sim uzayı). Tuzak artık nişan yönüne DEĞİL,
// karakterin durduğu yere konur (el ile yere bırakılır — bkz. `BOMB_PLACE_S`).

// 🧨 Aksiyon çerçevesi TİPİ kemik katmanında tanımlıdır (tek kaynak): bu modül
// onu yalnızca üretir. `import type` olduğu için çalışma zamanında bağımlılık
// oluşmaz (React kancası taşıyan modül sim'e çekilmez).
import type { BombActionFrame } from "@/engine/SamuraiBomb";

/** 🧨 TUZAK BIRAKMA (samurayın normal yeteneği) animasyon süresi (sn).
 *
 *  Bu süre boyunca karakter bombayı eliyle yere indirir; tuzak listeye ancak
 *  `BOMB_PLACE_DROP_AT` anında girer. NEDEN GECİKMELİ: tuzak hemen doğsaydı
 *  ekranda AYNI ANDA iki bomba görünürdü (yere yeni konan tuzak + hâlâ elde
 *  duran bomba). Zamanlama `bombThrowT` ile aynı deseni izler: süre sahne
 *  döngüsünde akar, eşik aşılınca tuzak doğar (`BOMB_PLACE_DROP_AT`). */
export const BOMB_PLACE_S = 0.95;
/** Bombanın YERE DEĞDİĞİ ilerleme oranı (0..1) — tuzak tam bu anda doğar.
 *  Yere değdikten sonra kalan süre elin geri çekilmesine aittir. */
export const BOMB_PLACE_DROP_AT = 0.62;
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
 *  yeni bomba hazır olur. Hem tuzak hem fırlatma aynı süreyi kullanır.
 *
 *  SÜRE AKSİYONUN KUYRUĞUNA GÖRE SEÇİLİR (`0.55`): bu süre
 *  aksiyonun bitişinden ÖNCE dolarsa, kemik katmanı hâlâ bombayı elden
 *  çıkarılmış sayarken sahne onu geri getirir ve top elin havada dururken
 *  belirir (kemik katmanı `visible`ı her kare kendi yazıyor — bkz.
 *  `SamuraiBomb` kare döngüsü). Kalan pay = "boş el":
 *    · fırlatma: bırakış 0.31 sn (`BOMB_ULT_S`×`BOMB_RELEASE_AT`),
 *      geri geliş 0.31+0.55 = 0.86 → aksiyon bitişinden (0.82) 0.04 sn sonra,
 *    · yere bırakma: yere değme 0.59 sn (`BOMB_PLACE_S`×`BOMB_PLACE_DROP_AT`),
 *      geri geliş 0.59+0.55 = 1.14 → aksiyon bitişinden (0.95) 0.19 sn sonra.
 *  Yani kol ne yaptıysa biter, el bir an boş kalır ve hokkabazlık SIFIRDAN
 *  başlar (`juggleTime = 0`): yeni bomba elde dururken doğar. */
export const BOMB_REFILL_S = 0.55;

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

/**
 * Dövüşçünün bomba sayaçlarından kemik katmanının AKSİYON ÇERÇEVESİNİ çözer.
 *
 * KEMİK KATMANI SİMÜLASYONU BİLMEZ (`engine/SamuraiBomb` yalnızca "hangi
 * hareket, ne kadar ilerledi" okur): bombanın elden çıktığı/kaybolduğu anlar
 * buradan türetilir, yani poz ile oyun kuralı AYNI sabitleri okur. İki yerde
 * ayrı eşik yazılsaydı bomba elden bir kare erken/geç çıkardı.
 *
 * SIRA ÖNEMLİ: uçan bomba (`throw`) ve yere bırakma (`place`) sürerken el boş
 * duruşuna geçilmez; `bombHiddenT` YALNIZ aksiyonlar bittikten sonra okunur,
 * yoksa poz kendi kendini keserdi.
 *
 * `out` verilirse çerçeve YENİDEN KULLANILIR (kare başına çöp yok; bu fonksiyon
 * her kare, her dövüşçü için çağrılır).
 */
export function bombActionFor(
  f: {
    bombThrowT?: number;
    bombPlaceT?: number;
    bombHiddenT?: number;
  },
  out?: BombActionFrame,
): BombActionFrame | null {
  const place = f.bombPlaceT ?? 0;
  const throwT = f.bombThrowT ?? 0;
  if (place <= 0 && throwT <= 0 && (f.bombHiddenT ?? 0) <= 0) return null;
  const frame = out ?? { kind: "empty", progress: 0 };
  frame.release = undefined;
  frame.land = undefined;
  if (place > 0) {
    frame.kind = "place";
    frame.progress = 1 - place / BOMB_PLACE_S;
    frame.land = BOMB_PLACE_DROP_AT;
  } else if (throwT > 0) {
    frame.kind = "throw";
    frame.progress = 1 - throwT / BOMB_ULT_S;
    frame.release = BOMB_RELEASE_AT;
  } else {
    frame.kind = "empty";
    frame.progress = 0;
  }
  return frame;
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
