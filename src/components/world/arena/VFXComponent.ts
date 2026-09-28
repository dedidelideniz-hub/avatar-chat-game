// ✨ VFXComponent — savaş alanının efekt (VFX) katmanı.
//
// Arena kodunda dağınık duran efekt üretimi (uçan hasar yazısı, zemin halkası,
// patlama, duman, ışın, yarık) ve bu efektlerin UnrealBloomPass ile senkron
// çalışan ışık patlaması bu modülde toplanır. İki arena da (bot + PvP) aynı
// veri yolunu kullanır, yani bir efektin rengi/ölçüsü tek yerden değişir.
//
// · `createVfxBus(sink)` — efektleri simülasyonun `fxs` dizisine yazar.
// · `tickFx(list, dt)` — tek geçişte ömür azaltma + ölü efekt temizleme
//   (splice yok, kalan diziyi kaydırmaz, çöp üretmez).
// · `pulseBloom` / `stepBloomPulse` — ağır bir efekt (patlama, ulti, ışın)
//   anında UnrealBloomPass şiddetini kısa süreliğine yükseltir; böylece ışık
//   patlaması parçacıklarla AYNI karede tetiklenir (bkz. ArenaPostFx).
//
// `bloomPulse` React state DEĞİL, paylaşılan mutable bir nesnedir — `aimState`
// ile aynı desen: yazan taraf efekt katmanı, okuyan taraf render döngüsü.
// Böylece efekt başına hiçbir React yeniden çizimi olmaz.
import type { BattleFx } from "./shared";
import {
  COLD_FLAME,
  pushBombBlastFx,
  pushColdFlameFx,
} from "./shared";
// Darbe katmanı (yumuşak toz + minik kıvılcım): iri duman bloğu ve bloom
// nabzı yerine geçer.
import { pushHitImpact } from "./hitImpacts";

/* ---------------------------------- bloom --------------------------------- */

/** VFX kaynaklı ışık patlaması (0..1). ArenaPostFx her karede okur. */
export const bloomPulse = { value: 0 };
/** Nabzın bloom şiddetine eklenen çarpanı (temel 0.45 → tepe ~1.0). */
const BLOOM_GAIN = 0.55;
/** Saniyedeki sönüm hızı (yüksek = daha kısa, daha keskin parlama). */
const BLOOM_DECAY = 5.5;

/** Bir efekt için bloom'u tetikler (aynı karede parlar, ~0.2 sn'de söner). */
export function pulseBloom(amount: number): void {
  const next = bloomPulse.value + amount;
  bloomPulse.value = next > 1 ? 1 : next;
}

/**
 * Nabzı sıfırlar (sahne kurulurken): önceki maçtan kalan parlama yeni arenaya
 * taşınmaz.
 */
export function resetBloomPulse(): void {
  bloomPulse.value = 0;
}

/**
 * Nabzı bir adım ilerletir ve bloom şiddetine eklenecek değeri döndürür.
 * Çağıran taraf render döngüsüdür (ArenaPostFx), parametre kare delta'sıdır.
 */
export function stepBloomPulse(dt: number): number {
  const v = bloomPulse.value;
  if (v <= 0) return 0;
  const next = v - dt * BLOOM_DECAY;
  bloomPulse.value = next > 0 ? next : 0;
  return bloomPulse.value * BLOOM_GAIN;
}

/* ---------------------------------- bus ----------------------------------- */

export interface VfxBus {
  /** Ham efekt (özel durumlar için kaçış kapısı). */
  add(fx: BattleFx): void;
  /** Uçan hasar/iade yazısı. */
  text(x: number, y: number, text: string, color: string): void;
  /** Zeminde genişleyen halka (şok dalgası, buff). */
  ring(x: number, y: number, grow: number, color: string, ttl: number): void;
  /** Patlama: kısa, parlak ve bloom tetikleyen küre. */
  burst(x: number, y: number, grow: number, color: string, ttl: number): void;
  /** Yükselen duman bulutu (ayak tozu, patlama dumanı). */
  smoke(x: number, y: number, count?: number, grow?: number): void;
  /** Süreli ışın (isik yeteneği, uzak vuruş). */
  beam(x1: number, y1: number, x2: number, y2: number, ttl?: number): void;
  /** Samuray ultisinin yeri yaran çizgisi. */
  crack(x1: number, y1: number, x2: number, y2: number, ttl?: number): void;
  /** Ateş Topu patlaması (soğuk alev büyüsü). */
  coldFlame(x: number, y: number, damageR: number): void;
  /**
   * 🧨 Barut patlaması (bomba tuzağı + fırlatılan bomba) — sıcak, tozlu.
   *
   * `power` güç kademesidir: 1 = yerdeki tuzak, 2 = fırlatılan bomba (ulti).
   * Ulti daha geniş katmanlar, ek şok halkası ve kamera sarsıntısı üretir
   * (bkz. `pushBombBlastFx`); verilmezse tuzak davranışı korunur.
   */
  bombBlast(x: number, y: number, damageR: number, power?: number): void;
  /** KAN FIŞKIRMASI: bıçak gövdeye girdiğinde kısa, koyu kırmızı püskürme
   *  (yakın dövüş bitiricisinin okunurluğu buna bağlı). */
  blood(x: number, y: number, size?: number): void;
  /** Mermi çarpması: ince büyü halkası + kıvılcım pufları. */
  coldFlameImpact(x: number, y: number, size?: number): void;
  /** Ağır vuruştan sonra ekranı ışıtan bloom patlaması. */
  flash(amount: number): void;
}

/**
 * Efektleri verilen toplayıcıya yazan veri yolu. Sahneler bunu
 * `createVfxBus((fx) => fxs.current.push(fx))` ile kurar.
 */
export function createVfxBus(sink: (fx: BattleFx) => void): VfxBus {
  return {
    add: sink,
    text: (x, y, text, color) =>
      sink({ kind: "text", x, y, ttl: 0.9, maxTtl: 0.9, text, color }),
    ring: (x, y, grow, color, ttl) =>
      sink({ kind: "ring", x, y, ttl, maxTtl: ttl, grow, color }),
    burst: (x, y, grow, color, ttl) => {
      sink({ kind: "burst", x, y, ttl, maxTtl: ttl, grow, color });
      // Patlama her zaman parlama ile birlikte gelir: bloom parçacıklarla
      // aynı karede yükselir.
      pulseBloom(0.55);
    },
    smoke: (x, y, count = 4, grow = 100) => {
      for (let i = 0; i < count; i++) {
        const life = 0.7 + Math.random() * 0.5;
        sink({
          kind: "smoke",
          x: x + (Math.random() - 0.5) * 80,
          y: y + (Math.random() - 0.5) * 80,
          ttl: life,
          maxTtl: life,
          grow: grow + Math.random() * 60,
          color: i % 2 === 0 ? "#c9c9c9" : "#b3b3b3",
        });
      }
    },
    beam: (x1, y1, x2, y2, ttl = 0.32) => {
      sink({ kind: "beam", x1, y1, x2, y2, ttl, maxTtl: ttl });
      pulseBloom(0.75);
    },
    crack: (x1, y1, x2, y2, ttl = 1.25) => {
      sink({ kind: "samuraiCrack", x1, y1, x2, y2, ttl, maxTtl: ttl });
      pulseBloom(0.85);
    },
    coldFlame: (x, y, damageR) => {
      pushColdFlameFx(sink, x, y, damageR);
      pulseBloom(0.7);
    },
    bombBlast: (x, y, damageR, power = 1) => {
      pushBombBlastFx(sink, x, y, damageR, power);
      // Barut, arenadaki en parlak ışık olayıdır (soğuk alevden yüksek);
      // ultide nabız tepeye oturur: patlama karenin tamamını ışıtır.
      pulseBloom(power >= 2 ? 1 : 0.85);
    },
    blood: (x, y, size = 74) => {
      // "smoke" türü RENK taşır (3D katman sprite rengini doğrudan fx.color'dan
      // yazar); kan bu yüzden smoke fx'leriyle koyu kırmızı püskürtme olarak
      // çizilir. Ömür kısa + büyüme küçük → dar, hızlı bir fışkırma okunur.
      const colors = ["#7f1d1d", "#b91c1c", "#ef4444", "#991b1b"];
      for (let i = 0; i < 8; i++) {
        const life = 0.28 + Math.random() * 0.34;
        sink({
          kind: "smoke",
          x: x + (Math.random() - 0.5) * size,
          y: y + (Math.random() - 0.5) * size * 0.8,
          ttl: life,
          maxTtl: life,
          grow: size * (0.45 + Math.random() * 0.6),
          color: colors[i % colors.length],
        });
      }
      pulseBloom(0.32);
    },
    coldFlameImpact: (x, y, size = 56) => {
      // Mermi çarpması: İNCE büyü halkası (merminin kimliği) + yumuşak darbe
      // katmanı. Eski iri, 2.4 birim yükselen duman bloğu ve onunla gelen
      // bloom nabzı KALDIRILDI — temas noktası artık görüşü kapatmaz.
      sink({
        kind: "ring",
        x,
        y,
        ttl: 0.3,
        maxTtl: 0.3,
        grow: size * 0.7,
        color: COLD_FLAME.ring,
      });
      pushHitImpact(null, {
        kind: "strike",
        x,
        y,
        hit: true,
        heavy: size > 58,
        t: performance.now(),
      });
    },

    flash: pulseBloom,
  };
}

/* ---------------------------------- tick ---------------------------------- */

/**
 * Tek geçişte efekt ömürlerini azaltır ve ölüleri diziden düşürür.
 * `splice(i, 1)` her ölü efektte kalan diziyi kaydırdığı (ve dizi tamponunu
 * yeniden ayırabildiği) için yerinde sıkıştırma yapılır; sıralama korunur.
 */
export function tickFx(list: BattleFx[], dt: number): void {
  let write = 0;
  for (let read = 0; read < list.length; read++) {
    const fx = list[read];
    fx.ttl -= dt;
    if (fx.ttl > 0) {
      if (write !== read) list[write] = fx;
      write += 1;
    }
  }
  list.length = write;
}
