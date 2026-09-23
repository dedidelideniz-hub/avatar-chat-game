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
/**
 * EKRAN-ÖLÇEKLİ dünya HUD'u (can barı, isim etiketi, uçan hasar yazısı,
 * kimlik halkası, efekt havuzu boyları).
 *
 * Bu değer kameranın yakınlığına bağlıdır: kamera yakınlaştıkça dünya
 * birimi başına ekranda kaplanan alan büyür, yani bu öğeler KÜÇÜLMELİ ki
 * ekrandaki boyları sabit kalsın.
 *
 *   2 (eski, uzak kamera) → 1.1: takip mesafesi 17.6 → 8.8 birime indi
 *   (görünen yükseklik ~15 → ~7.5 birim). Ölçek 2/1.85 ≈ 0.55 ile çarpıldı;
 *   ekranda ise ~%10 daha büyük görünüyorlar (yakın planda biraz daha okunur).
 *
 * KARAKTERE göre ölçeklenen efektler (mermi, alev küresi) bunu KULLANMAZ —
 * onlar kameradan bağımsızdır: bkz. `CHAR_HUD`.
 */
export const HUD = 1.1;

/** Dövüşçü GÖVDE ölçeği kazancı (arena).
 *
 *  Arenadaki her görünüm (varsayılan / Samuray / Kraliyet Savaşçısı / Şövalye,
 *  oyuncu-bot-rakip) `FIGHTER_MODEL_H × RIG_ROOT_SCALE` = 0.72 birimlik ortak
 *  boya normalize edilir; bu sabit o ortak boyun üstüne uygulanır.
 *
 *  NEDEN 2.05: projenin ölçek kuralı 1 birim ≈ 1 metre ve cadde tarafındaki
 *  karakterler `PLAYER_3D_HEIGHT = 1.92` birime normalize ediliyor. Arena
 *  haritası da aynı ölçekte (34×22 birim) ve dövüşçü çarpışma yarıçapı
 *  `FIGHTER_R = 22px = 0.44 birim` — yani ~1.8-2.0 birimlik bir gövdenin omuz
 *  genişliği. Eski 0.72 birimlik gövde hem haritadaki heykellerin yanında hem
 *  de cadde karakterine kıyasla "karınca" gibi kalıyordu. 1.5 × 2.05 × 0.48 =
 *  1.48 birim: menzil çemberi (4 birim) hâlâ ~2.7 gövde boyu.
 *
 *  Gövdeyi kullanan TÜM görsel katmanlar bu sabitle ölçeklenir (kemik
 *  bağlantıları, göğüs hizası efektleri, baş-üstü HUD yükseltisi, şampiyon
 *  aurası/ışığı, ayak halkaları, namlu çıkışı, yedek prosedürel gövde). */
export const BODY_SCALE_GAIN = 2.05;

/**
 * KARAKTERE göre ölçeklenen efektlerin tabanı (mermi gövdesi, büyü halkaları,
 * alev dilleri, namlu şimşeği).
 *
 * Bunlar karakterin boyuna göre değerlendirilir (mermi karakterden küçük
 * kalsın), kamera yakınlığından bağımsızdır; bu yüzden ekran ölçeği `HUD`
 * değişse bile mutlak boylarını korur → 2.0. */
export const CHAR_HUD = 2;

/** Baş-üstü HUD (can barı + isim etiketi) oranı.
 *  RIG_ROOT_SCALE ile AYNI adımı izler: gövde %15 küçülüp sonra %20 büyüdüğü
 *  için bar da aynı yolu izledi (0.85 × 1.2 ≈ 1.0). Bar boyutu burada sabittir;
 *  karakterin gövde kazancından gelen yükseklik artışı `Arena3D`'deki
 *  `HEAD_UI_LIFT` ile karşılanır — bar büyüyen karakterin kafasına gömülmez,
 *  boyu da büyümez. */
export const HEAD_UI_SCALE = 1;

/**
 * BÜYÜ/MERMİ ÇIKIŞ NOKTASI — "eldan ateş etme" ofseti (dünya birimi).
 *
 * Atış karakterin MERKEZİNDEN değil, elinden çıksın diye kullanılır:
 *   · `fwd`  — nişan yönünde öne kayma (gövde yarıçapının dışına taşar),
 *   · `side` — kullanılan el tarafına yanal kayma,
 *   · `up`   — yerden yükseklik; hem namlu şimşeği hem merminin uçuş
 *              yüksekliğidir. Gövde `BODY_SCALE_GAIN` ile büyüdüğü için
 *              (Arena3D) karakter 1.48 birim, el ≈ 0.82 birim: 0.85 "elden
 *              çıkıyor" hissini verirken mermiyi zemin engebelerinin de
 *              üzerinde tutar.
 * Değerler `S` ile çarpılarak oyun px'ine çevrilir (sim px uzayında çalışır).
 * (Yalnızca GÖRSEL çıkış noktasıdır: isabet kontrolü iki boyutlu x/y üzerinden
 * yapılır, hasar/menzil bu değerden etkilenmez.)
 */
export const MUZZLE = {
  fwd: 0.42,
  side: 0.2,
  up: 0.85,
} as const;

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
  /** 🧨 SAMURAY ULTİSİ — FIRLATILAN BOMBA.
   *  `explodeR` taşıdığı için normalde "Ateş Topu" sayılırdı (soğuk alev
   *  küresi); bu bayrak görseli ve patlamayı SICAK bomba paletine çevirir
   *  (bkz. `ProjectilePool`, `createVfxBus().bombBlast`). */
  bomb?: boolean;
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
 *  NOT: Değerler `CHAR_HUD` (=2) ile çarpılarak dünyaya uygulanır: mermi
 *  KARAKTERE göre ölçeklenir, kamera yakınlığından bağımsızdır (ekran ölçeği
 *  olan `HUD` değişse bile mutlak boyu korunur). Karakter gövdesi ~0.7 birim
 *  olduğundan mermi kasıtlı olarak karakterden küçük tutulur; büyütmek /
 *  küçültmek için yalnızca bu tabloyu değiştirmek yeterlidir. */
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

/** 🧨 Bomba paleti — FIRLATILAN bomba mermisi ve patlaması.
 *
 * Neden ayrı: arenadaki her mermi bilinçli olarak "soğuk alev büyüsü"
 * paletini kullanır (bkz. `COLD_FLAME`). Bomba bu dilin DIŞINDA olmalıdır —
 * elinde barut taşıyan bir karakterin attığı şey büyü değil, patlayıcıdır;
 * oyuncu iki tehdidi renkten ayırt edebilsin diye sıcak demir/ateş tonları.
 */
export const BOMB_PALETTE = {
  iron: "#2b2f38", // demir gövde
  brass: "#c9952f", // pirinç bilezik
  spark: "#ffd166", // yanan fitil ucu
  flame: "#ff8a2b", // alev çekirdeği
  trail: "#ffb347", // uçuş izi
  ring: "#ffa53d", // patlama halkası
  blast: "#ff5a1f", // patlama çekirdeği
  smoke: "#6b6b6b", // barut dumanı
} as const;

/**
 * 🧨 BARUT PATLAMASI (bomba tuzağı + fırlatılan bomba) — sıcak VFX.
 *
 * Soğuk alev patlamasından (`pushColdFlameFx`) bilinçli olarak AYRIDIR:
 * oyuncu "büyü" ile "patlayıcı"yı tek bakışta ayırabilmelidir. Bu yüzden:
 *   · hızlı sönen geniş bir şok halkası (patlamanın ayak izi),
 *   · `burst` — 3D patlama havuzu SABİT TURUNCU bir küre çizer; büyünün onu
 *     kullanmama sebebi (bkz. `pushColdFlameFx` notu) burada tam tersine
 *     döner: barut patlaması için doğru görüntü odur.
 *   · alev pufları (kısa, sıcak) + iri barut dumanı (uzun, koyu).
 * Görsel yarıçap hasar yarıçapından KÜÇÜKTÜR (aynı `FIREBALL_VFX_SCALE`
 * kuralı): gerçek hasar alanını zemin halkası ve tuzakta kurulunca görünen
 * tehlike diski anlatır; patlama katmanı görüşü kapatmasın diye sıkı tutulur.
 */
export function pushBombBlastFx(
  add: (fx: BattleFx) => void,
  x: number,
  y: number,
  damageR: number,
): void {
  const r = damageR * FIREBALL_VFX_SCALE;
  add({
    kind: "ring",
    x,
    y,
    ttl: 0.44,
    maxTtl: 0.44,
    grow: r * 1.15,
    color: BOMB_PALETTE.ring,
  });
  add({
    kind: "burst",
    x,
    y,
    ttl: 0.36,
    maxTtl: 0.36,
    grow: r * 0.8,
    color: BOMB_PALETTE.blast,
  });
  // Alev pufları: sıcak, kısa ömürlü (patlamanın ilk yarısı).
  for (let i = 0; i < 7; i++) {
    const life = 0.24 + Math.random() * 0.2;
    add({
      kind: "smoke",
      x: x + (Math.random() - 0.5) * r * 0.7,
      y: y + (Math.random() - 0.5) * r * 0.7,
      ttl: life,
      maxTtl: life,
      grow: r * (0.5 + Math.random() * 0.4),
      color: i % 2 === 0 ? BOMB_PALETTE.flame : BOMB_PALETTE.spark,
    });
  }
  // Barut dumanı: koyu, uzun ömürlü — patlama geçtikten sonra da kalır.
  for (let i = 0; i < 10; i++) {
    const life = 0.7 + Math.random() * 0.6;
    add({
      kind: "smoke",
      x: x + (Math.random() - 0.5) * r * 1.1,
      y: y + (Math.random() - 0.5) * r * 1.1,
      ttl: life,
      maxTtl: life,
      grow: r * (0.55 + Math.random() * 0.5),
      color: i % 3 === 0 ? BOMB_PALETTE.smoke : "#4a4a4a",
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

/* Brawl tarzı vuruş geri bildirimi — Hit Particle System.
 * (Kıvılcımlar `FighterRig` içinde yaşar: vurulan karakterin kendi rig'inde
 *  yönlü bir yelpaze hâlinde fışkırır, ayrı bir zemin-efekti havuzu gerekmez.) */
export const HIT_SPARKS = 10; // vuruş başına kıvılcım kıymığı tanesi
export const SPARK_LIFE = 0.42; // kıvılcım ömrü (saniye)
