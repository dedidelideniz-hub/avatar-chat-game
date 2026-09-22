// 🛡️ BattleTowers — HARİTANIN KENDİ KULELERİNİN aktive edilmesi + simülasyonu.
//
// Kule MODELLERİ ÜRETİLMEZ. Haritanın GLB'sinde zaten duran orijinal küçük
// kuleler (mesh adı `...Tower...`) bulunur, boyutları haritanın kendi
// ölçeğinde kalır ve asla büyütülmez. Oyuncu bir kulenin yanına geldiğinde
// HUD'da "Kuleyi Aktif Et" düğmesi belirir; altın ödendiğinde YENİ bir kule
// doğmaz — o ORİJİNAL kule pasif durumdan aktif duruma geçer. Aynı kuleye
// tekrar altın ödenirse seviyesi artar (hasar + menzil + can).
//
// NEDEN AYRI MODÜL (React state'i yok): kule verisi hem 3B katmanın (bkz.
// components/world/arena/DefenseTowers.tsx) hem de DOM HUD'ın (bkz.
// moba/MobaHud.tsx) okuduğu TEK kaynaktır. İkisi de bu modülün singleton'ını
// okur; kare başına React çizimi olmadığı için savaş alanı akıcı kalır.
//
// KULELERİ KİM BULUR: 3B katman haritayı tarar (isimden) ve bulduğu kuleleri
// `setTowerPosts` ile buraya yazar. Sabit koordinat tablosu yoktur: harita
// güncellenirse kuleler kendiliğinden doğru yerde bulunur.
//
// TAKIM AYRIMI: her kule oyuncunun başlangıç noktasına mı yoksa rakibin
// başlangıcına mı yakın olduğuna göre "ally"/"enemy" olarak işaretlenir.
// Oyuncu YALNIZ kendi tarafındaki kuleleri aktive edebilir; rakip kuleleri
// dokunulmaz ve ateş etmez (bot düellosunda tarafsız kalır).
//
// ALTIN: kule alımı cüzdandan düşer. HUD bakiyeyi profil sorgusundan tazeler;
// harcama Convex `profiles.spendCoins` ile SUNUCUYA yazılır (tutar orada
// doğrulanır), sunucu yanıtı gelene kadar `pending` sayacı aynı düşüşü iyimser
// olarak gösterir — yani bakiyenin iki kez düşmesi imkânsızdır.
//
// ATEŞ HATTI: kule kendi mermisini uydurmaz — sahnenin KENDİ mermi havuzuna
// `owner: "player"` ile bir mermi bırakır (bkz. `runtime.projs`). Böylece
// hasar, isabet tepkisi, uçan hasar yazısı, skor tablosu, can/ölüm akışı ve
// ulti şarjı dâhil her şey mevcut savaş simülasyonundan geçer.
//
// ZIRH & DAYANIKLILIK: kuleye gelen hasar `1 - TOWER_ARMOR` ile çarpılır, yani
// zırh hasarın bir kısmını emer. Ayrıca aktif kule, MENZİLİNDEKİ oyuncuya
// gelen hasarı önce kendi canından karşılar (`towerGuardAbsorb`). Kule canı
// bittiğinde YIKILMAZ (haritanın orijinal mesh'ine dokunulmaz): pasif duruma
// döner, yani korumayı ve ateşi keser — tekrar altınla aktive edilebilir.

import type { BattleProj } from "@/components/world/arena/shared";

/** Kule seviyesi: 0 = pasif (haritadaki orijinal hâli), 1-3 = aktif seviyeler. */
export const MAX_TOWER_LEVEL = 3;
/** Zırh: gelen hasarın bu oranı emilir (0.28 = %28 az hasar). */
export const TOWER_ARMOR = 0.28;

export interface TowerLevelStats {
  /** Menzil (px). Sahnenin mermi menzili 200px (MAX_RANGE_PX) olduğu için
   *  bunun ALTINDA kalır; yoksa mermi hedefe varmadan sönerdi. */
  range: number;
  /** Kule mermisinin hasarı (sahne simülasyonu uygular). */
  dmg: number;
  /** Kule canı — "tek atışta yıkılmaz" hedefiyle yüksek tutuldu. */
  hp: number;
}

/**
 * Seviye tablosu (tek kaynak). 0. satır PASİF hâldir: menzil/hasar yoktur.
 * Seviye yükseldikçe hem ateş gücü hem dayanıklılık artar.
 */
export const TOWER_LEVELS: readonly TowerLevelStats[] = [
  { range: 0, dmg: 0, hp: 0 },
  { range: 138, dmg: 50, hp: 880 },
  { range: 152, dmg: 76, hp: 1320 },
  { range: 168, dmg: 104, hp: 1820 },
];

/** Seviye atlama fiyatları: [0→1 aktifle, 1→2, 2→3]. */
export const TOWER_UPGRADE_COST: readonly number[] = [250, 420, 640];

/** Atışlar arası bekleme (sn) — yavaşlarsa kule daha az baskı kurar. */
export const TOWER_ATTACK_CD = 1.3;
/** Boşta tarama hızı (rad/sn) — ateş başı sağa sola bu hızla döner. */
export const TOWER_SCAN_SPEED = 0.62;
/** Boşta tarama açısı (radyan): orta yönün iki yanına ±0.62 rad ≈ ±35°. */
export const TOWER_SCAN_ARC = 0.62;
/** Merminin uçuş hızı (px/sn) — oyuncunun temel atışıyla aynı ailede. */
export const TOWER_SHOT_SPEED = 430;
/** Namlu çıkışının kule merkezinden kayması (px). */
const TOWER_MUZZLE_PX = 22;
/** "Kuleyi Aktif Et" düğmesinin belirdiği yakınlık (px = 3 birim). */
export const TOWER_SITE_RADIUS_PX = 150;
/** Aktif kulenin, oyuncuya gelen hasarı emmesi için gereken yakınlık (px ≈ 3.6 birim). */
export const TOWER_GUARD_RADIUS_PX = 180;

/** 3B katmanın bulduğu orijinal kule mesh'inin bu modüle verdiği veri. */
export interface TowerPostSeed {
  /** Kararlı kimlik: haritadaki mesh adından türetilir (aynı kule = aynı id). */
  id: string;
  /** Tespit edilen mesh adı (konsol logu / teşhis). */
  name: string;
  /** Arena px konumu (3B dünya konumu × S). */
  x: number;
  y: number;
  /** Kulenin oturduğu zemin yüksekliği (dünya birimi) — halka buraya oturur. */
  baseY: number;
  /** Kulenin tepe noktası (dünya birimi) — ışıma çekirdeği buraya yerleşir. */
  top: number;
  /**
   * Kulenin KENDİ yatay ayak izi (dünya birimi). Zemin halkası bu yarıçapa
   * oturur — kule büyütülmez, halka da kulenin kendi ölçeğini aşmaz.
   */
  radius: number;
  /** Kulenin kendi takım rengi (harita adından: kırmızı üs / mavi üs). */
  color: string;
  /** Oyuncunun tarafı mı? Yalnız "ally" kuleleri etkileşime açıktır. */
  side: "ally" | "enemy";
  /**
   * Düğmenin belirdiği yakınlık (px). Normalde `TOWER_SITE_RADIUS_PX`, ama 3B
   * katman kule çevresinin tamamen kapalı olduğunu görürse en yakın yürünebilir
   * zemine kadar genişletir — aksi hâlde düğme hiç açılmazdı.
   */
  reachPx: number;
  /**
   * Nişan alınacak hedef yokken ateş başının SALINDIĞI orta yön (radyan).
   * Koridora (rakip üse) bakar: kule boşta da "bekçilik" yapar gibi sağa sola
   * döner, yani canlı olduğu okunur.
   */
  baseYaw: number;
}

/** Kurulu kule durumu (seed + canlı simülasyon alanları). */
export interface TowerPost extends TowerPostSeed {
  level: number;
  hp: number;
  maxHp: number;
  /** Kalan ateş beklemesi (sn). */
  cd: number;
  /** Ateş başının baktığı yön (radyan, dünya XZ). */
  yaw: number;
  /** Tarama (boşta salınım) fazı. */
  scanT: number;
  /**
   * Menzilde hedef var mı? 3B katman bunu okur: hedef kilitliyken ateş başı
   * parlar, hedef yokken yalnız yumuşak tarama ışığı kalır.
   */
  locked: boolean;
  /** Ateş anındaki kısa parlama (sn) — 3B katman tepeden ışıma çizer. */
  flashT: number;
}

/** Kulenin menzil taramasında gördüğü rakip (dövüşçü veya minyon). */
export interface TowerHostile {
  x: number;
  y: number;
  hp: number;
}

/** Sahnenin kule sistemine verdiği bağlantılar (ref'ler — kopya yok). */
export interface TowerRuntime {
  player: { current: { x: number; y: number; hp: number } };
  /**
   * Menzile giren rakipler. Tek düşman yerine LİSTE verilir: bot düellosunda
   * rakip dövüşçü, minyon dalgaları eklendiğinde onlar da aynı listeye girer
   * ve kule en yakın hedefi kendiliğinden seçer.
   */
  hostiles: () => readonly TowerHostile[];
  /** Sahnenin mermi havuzu: kule atışı buradan geçer. */
  projs: { current: BattleProj[] };
  /**
   * Harcamayı gerçek cüzdana yazar (Convex `profiles.spendCoins`).
   * Verilmezse alım yalnız bu maç için geçerli olur (maç sonunda bakiye
   * eski hâline döner) — test/misafir senaryosu.
   */
  spend?: (amount: number, reason: string) => void;
}

interface TowerState {
  runtime: TowerRuntime | null;
  /** Oyuncunun cüzdanı (profil bakiyesi — reaktif olarak tazelenir). */
  wallet: number;
  /**
   * Sunucuya yazılmış ama profilde HENÜZ görünmeyen harcama (iyimser sayım).
   * Kule aktive edildiği an bakiyeden düşmüş gibi gösterilir; sunucu yanıtı
   * cüzdanı düşürdüğü an bu sayaç temizlenir (bkz. setTowerWallet).
   */
  pending: number;
  /** Bir önceki cüzdan değeri — düşüşü yakalamak için. */
  lastWallet: number;
  /** Haritadan bulunan kuleler (seviye/can durumuyla birlikte). */
  posts: TowerPost[];
  /** Harita taraması bitti mi? (3B katman bir kez yazar.) */
  postsReady: boolean;
  /** Oyuncunun yanında durduğu kule (yoksa null) — yalnız "ally" kuleleri. */
  nearPostId: string | null;
  /** Kuleleri "benim/rakip" diye ayıran başlangıç noktaları (px). */
  allyAnchor: { x: number; y: number } | null;
  enemyAnchor: { x: number; y: number } | null;
}

export const towerState: TowerState = {
  runtime: null,
  wallet: 0,
  pending: 0,
  lastWallet: -1,
  posts: [],
  postsReady: false,
  nearPostId: null,
  allyAnchor: null,
  enemyAnchor: null,
};

/** Sahne kule sistemini açar/kapatır (yalnız bot düellosu kullanır). */
export function configureTowers(runtime: TowerRuntime | null): void {
  // Yeni MAÇ (kapalı → açık) her şeyi sıfırdan başlatır: seviyeler, canlar ve
  // altın geçmişi. Aynı maç içinde sahne yeniden bağlanırsa (yeni runtime
  // nesnesi) harcama geçmişi korunur.
  const fresh = runtime !== null && towerState.runtime === null;
  towerState.runtime = runtime;
  if (fresh) {
    towerState.pending = 0;
    towerState.lastWallet = -1;
  }
  if (!runtime) {
    towerState.posts = [];
    towerState.postsReady = false;
    towerState.nearPostId = null;
    towerState.allyAnchor = null;
    towerState.enemyAnchor = null;
    towerState.pending = 0;
    towerState.lastWallet = -1;
    return;
  }
  // Takım ayrımı için başlangıç noktalarını bir kez yakala: kule, kimin
  // spawn'ına daha yakınsa o tarafındır.
  towerState.allyAnchor = { x: runtime.player.current.x, y: runtime.player.current.y };
  if (!towerState.enemyAnchor) {
    const hostiles = runtime.hostiles();
    towerState.enemyAnchor = hostiles[0]
      ? { x: hostiles[0].x, y: hostiles[0].y }
      : { x: 1700 - runtime.player.current.x, y: 1100 - runtime.player.current.y };
  }
}

/**
 * Cüzdanı tazeler (profil bakiyesi; HUD her karede günceller).
 *
 * Cüzdan DÜŞTÜĞÜ an bekleyen iyimser harcama (düşüş kadar) silinir: sunucu
 * yazımı profile yansıdı demektir, aynı altını iki kez düşmeyiz.
 */
export function setTowerWallet(wallet: number): void {
  const last = towerState.lastWallet;
  if (last >= 0 && wallet < last) {
    towerState.pending = Math.max(0, towerState.pending - (last - wallet));
  }
  towerState.lastWallet = wallet;
  towerState.wallet = wallet;
}

/** Kullanılabilir altın: cüzdan eksi henüz profile yansımamış harcama. */
export function towerGold(): number {
  return Math.max(0, towerState.wallet - towerState.pending);
}

/**
 * Haritadan bulunan orijinal kuleleri kaydeder (3B katman bir kez çağırır).
 *
 * Aynı id ile tekrar çağrılırsa SEVİYE ve CAN KORUNUR: yalnız konum/tepe
 * bilgisi tazelenir. Yeni bulunan kuleler pasif (seviye 0) başlar.
 */
export function setTowerPosts(seeds: readonly TowerPostSeed[]): void {
  const previous = new Map(towerState.posts.map((p) => [p.id, p]));
  towerState.posts = seeds.map((seed) => {
    const old = previous.get(seed.id);
    if (!old) {
      return {
        ...seed,
        level: 0,
        hp: 0,
        maxHp: TOWER_LEVELS[1].hp,
        cd: 0,
        yaw: seed.baseYaw,
        scanT: Math.random() * Math.PI * 2,
        locked: false,
        flashT: 0,
      };
    }
    return { ...old, ...seed, side: seed.side };
  });
  towerState.postsReady = towerState.posts.length > 0;
}

/** Yanında durulan (etkileşime açık) kule. */
export function nearPost(): TowerPost | null {
  const id = towerState.nearPostId;
  if (id === null) return null;
  return towerState.posts.find((p) => p.id === id) ?? null;
}

/** Yanındaki kule yükseltilebilir mi (pasif veya en üst seviyenin altında)? */
export function isNearTowerUpgradable(): boolean {
  const post = nearPost();
  return post !== null && post.level < MAX_TOWER_LEVEL;
}

/** Yanındaki kulenin bir sonraki seviyesinin fiyatı (yoksa null). */
export function nextTowerCost(): number | null {
  const post = nearPost();
  if (!post || post.level >= MAX_TOWER_LEVEL) return null;
  return TOWER_UPGRADE_COST[post.level];
}

/** Yanındaki kulenin bir sonraki seviyesinin istatistikleri (yoksa null). */
export function nextTowerStats(): TowerLevelStats | null {
  const post = nearPost();
  if (!post || post.level >= MAX_TOWER_LEVEL) return null;
  return TOWER_LEVELS[post.level + 1];
}

/** Seviyeye göre istatistikler (0 = pasif). */
export function towerStats(level: number): TowerLevelStats {
  return TOWER_LEVELS[Math.max(0, Math.min(MAX_TOWER_LEVEL, level))];
}

/**
 * Oyuncunun kulelere yakınlığını günceller. Düğmenin görünürlüğü TAMAMEN buna
 * bağlıdır: "kulenin yanına gel → düğme çıkar".
 */
export function updateTowerProximity(): void {
  const rt = towerState.runtime;
  if (!rt) return;
  const p = rt.player.current;
  let best: string | null = null;
  // Eşik kule başına değiştiği için başlangıç sonsuz: en yakın kule, kendi
  // erişim yarıçapının içindeyse seçilir.
  let bestDist = Number.POSITIVE_INFINITY;
  for (const post of towerState.posts) {
    if (post.side !== "ally") continue;
    if (post.level >= MAX_TOWER_LEVEL) continue;
    const d = Math.hypot(post.x - p.x, post.y - p.y);
    // Kule çevresi tamamen kapalıysa erişim yarıçapi genişletilmiş olabilir
    // (bkz. TowerPostSeed.reachPx); karşılaştırma her kule için ayrı yapılır.
    const reach = Math.max(TOWER_SITE_RADIUS_PX, post.reachPx);
    if (d <= reach && d <= bestDist) {
      bestDist = d;
      best = post.id;
    }
  }
  towerState.nearPostId = best;
}

/**
 * Yanındaki ORİJİNAL kuleyi aktive eder / seviyesini yükseltir. Yeni bir kule
 * modeli yaratmaz; altın yetersizse hiçbir şey olmaz. `true` dönerse seviye
 * artmıştır.
 */
export function upgradeNearTower(): boolean {
  const post = nearPost();
  if (!post || post.level >= MAX_TOWER_LEVEL) return false;
  const cost = TOWER_UPGRADE_COST[post.level];
  if (towerGold() < cost) return false;
  towerState.pending += cost;
  post.level += 1;
  const stats = towerStats(post.level);
  // Seviye atlarken kule tam canla uyanır (ilk aktivasyonda ve her
  // güçlendirmede): önceki seviyede aldığı hasar sıfırlanır.
  post.hp = stats.hp;
  post.maxHp = stats.hp;
  post.cd = TOWER_ATTACK_CD * 0.3;
  post.flashT = 0.4;
  towerState.nearPostId = null;
  // Altın gerçekten düşülür: sunucu bakiyeyi doğrular ve profili günceller;
  // reaktif cüzdan düşünce `pending` temizlenir. Sunucu reddederse (misafir
  // oyuncu / çevrimdışı test) seviye artmış kalır, harcama bu maçla sınırlı olur.
  towerState.runtime?.spend?.(cost, "tower");
  return true;
}

/** Açıyı en kısa yoldan hedefe döndürür (radyan). */
function turnToward(current: number, target: number, k: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * k;
}

/**
 * Aktif kulelerin hedefleme + ateş döngüsü. Her kare sahne tarafından çağrılır.
 *
 * Hedef: menzile giren EN YAKIN rakip. Sahne rakip listesini verir
 * (`runtime.hostiles()`): bot düellosunda rakip dövüşçü, minyon dalgaları
 * geldiğinde onlar da aynı listeden geçer — kule hedefi kendisi seçer.
 * Pasif (seviye 0) kuleler hiç ateş etmez.
 */
export function stepTowers(dt: number): void {
  const rt = towerState.runtime;
  if (!rt) return;
  const hostiles = rt.hostiles().filter((h) => h.hp > 0);

  for (const post of towerState.posts) {
    post.flashT = Math.max(0, post.flashT - dt);
    if (post.level <= 0 || post.hp <= 0) {
      post.locked = false;
      continue;
    }
    post.cd = Math.max(0, post.cd - dt);
    const stats = towerStats(post.level);

    // Hedef seçimi: mesafe karar verir (minyon önce değil).
    let enemy: TowerHostile | null = null;
    let dist = Number.POSITIVE_INFINITY;
    for (const h of hostiles) {
      const d = Math.hypot(h.x - post.x, h.y - post.y);
      if (d < dist) {
        dist = d;
        enemy = h;
      }
    }

    // HEDEF YOK → TARAMA: ateş başı orta yön (koridor) çevresinde sağa sola
    // salınır. Böylece kule boşta da canlı görünür ve sağa/sola döner.
    if (!enemy || dist > stats.range || dist <= 0) {
      post.locked = false;
      post.scanT += dt * TOWER_SCAN_SPEED;
      post.yaw = post.baseYaw + Math.sin(post.scanT) * TOWER_SCAN_ARC;
      continue;
    }

    const dx = enemy.x - post.x;
    const dy = enemy.y - post.y;
    // KİLİTLENME: baş hedefe döner (yumuşak takip, anlık sıçrama yok).
    post.locked = true;
    post.yaw = turnToward(post.yaw, Math.atan2(dy, dx), 1 - Math.exp(-dt * 7));
    if (post.cd > 0) continue;

    const ux = dx / dist;
    const uy = dy / dist;
    rt.projs.current.push({
      owner: "player",
      x: post.x + ux * TOWER_MUZZLE_PX,
      y: post.y + uy * TOWER_MUZZLE_PX,
      vx: ux * TOWER_SHOT_SPEED,
      vy: uy * TOWER_SHOT_SPEED,
      dmg: stats.dmg,
      r: 14,
      travelled: 0,
      pierce: false,
    });
    post.cd = TOWER_ATTACK_CD;
    post.flashT = 0.18;
  }
}

/**
 * Kuleyi hasarlandırır (zırh uygulanır). Can biterse kule YIKILMAZ: haritanın
 * orijinal mesh'ine dokunulmaz, kule pasif duruma (seviye 0) döner ve ateşi
 * keser. Böylece "dayanıklılık" oyun anlamı kazanır ama harita bozulmaz.
 */
function damagePost(post: TowerPost, dmg: number): void {
  const paid = Math.max(0, dmg) * (1 - TOWER_ARMOR);
  post.hp = Math.max(0, post.hp - paid);
  if (post.hp > 0) return;
  post.level = 0;
  post.hp = 0;
  post.maxHp = 0;
  post.cd = 0;
  post.locked = false;
}

/**
 * Kule koruması: oyuncuya gelen hasarı, YAKINDAKİ AKTİF bir kule karşılar.
 *
 * Dönüş: oyuncunun alacağı KALAN hasar. Kule hasarı emdiyse 0 döner (yani
 * oyuncu o vuruşta hasar almaz; hasarı kule, zırhıyla birlikte yer).
 */
export function towerGuardAbsorb(dmg: number): number {
  const rt = towerState.runtime;
  if (!rt) return dmg;
  const p = rt.player.current;
  let guard: TowerPost | null = null;
  let bestDist = TOWER_GUARD_RADIUS_PX;
  for (const post of towerState.posts) {
    if (post.level <= 0 || post.hp <= 0) continue;
    const d = Math.hypot(post.x - p.x, post.y - p.y);
    if (d <= bestDist) {
      bestDist = d;
      guard = post;
    }
  }
  if (!guard) return dmg;
  damagePost(guard, dmg);
  return 0;
}
