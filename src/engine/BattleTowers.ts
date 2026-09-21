// 🛡️ BattleTowers — savunma kulesi EKONOMİSİ ve SİMÜLASYONU.
//
// Oyuncu koridorun kenarındaki KULE ARSALARINDAN birine yaklaştığında HUD'da
// "Kule Satın Al" düğmesi belirir; yeterli altını varsa bastığı an arsaya bir
// savunma kulesi kurulur, altın bakiyesinden düşülür ve kule menziline giren
// rakibi otomatik hedefleyip ateş etmeye başlar.
//
// NEDEN AYRI MODÜL (React state'i yok): kule verisi hem 3B katmanın (bkz.
// components/world/arena/DefenseTowers.tsx) hem de DOM HUD'ın (bkz.
// moba/MobaHud.tsx) okuduğu TEK kaynaktır. İkisi de bu modülün singleton'ını
// okur; kare başına React çizimi olmadığı için savaş alanı akıcı kalır.
//
// ALTIN: kule alımı cüzdandan düşer. HUD bakiyeyi profil sorgusundan tazeler;
// harcama Convex `profiles.spendCoins` ile SUNUCUYA yazılır (tutar orada
// doğrulanır), sunucu yanıtı gelene kadar `pending` sayacı aynı düşüşü iyimser
// olarak gösterir — yani bakiyenin iki kez düşmesi imkânsızdır.
//
// ATEŞ HATTI: kule kendi mermisini uydurmaz — sahnenin KENDİ mermi havuzuna
// `owner: "player"` ile bir mermi bırakır (bkz. `runtime.projs`). Böylece
// hasar, isabet tepkisi, uçan hasar yazısı, skor tablosu, can/ölüm akışı ve
// ulti şarjı dâhil her şey mevcut savaş simülasyonundan geçer; kule ayrı bir
// hasar yolu açmaz.
//
// ZIRH & DAYANIKLILIK: kuleye gelen hasar `1 - TOWER_ARMOR` ile çarpılır, yani
// zırh hasarın bir kısmını emer. Ayrıca kule, MENZİLİNDEKİ oyuncuya gelen
// hasarı önce kendi canından karşılar (`towerGuardAbsorb`) — "yüksek canlı
// kule" böylece oyun anlamı kazanır: tek atışta yıkılmaz, ama zamanla düşer.
//
// Görsel-only hiçbir şey yoktur: bu modül oyun mantığıdır, ancak çarpışma
// ızgarasına/patika bulmaya dokunmaz (kule arsaları yürünebilir zemine
// "snap"lenir, arsa dışına taşmaz).

import type { BattleFx, BattleProj } from "@/components/world/arena/shared";
import { S } from "@/components/world/arena/shared";

/** Kule fiyatı (oyun içi altın). Başlangıç cüzdanı 500 SP olduğu için taze
 * bir oyuncu iki kule kurabilir; üçüncü arsa için altın biriktirmesi gerekir. */
export const TOWER_COST = 250;
/** Kule canı — "tek atışta yıkılmaz" hedefiyle yüksek tutuldu. */
export const TOWER_HP = 2600;
/** Zırh: gelen hasarın bu oranı emilir (0.35 = %35 az hasar). */
export const TOWER_ARMOR = 0.35;
/** Kule menzili (px). Sahnenin mermi menzili 200px (MAX_RANGE_PX) olduğu
 *  için bunun ALTINDA kalır; yoksa mermi hedefe varmadan sönerdi. */
export const TOWER_RANGE_PX = 175;
/** Atışlar arası bekleme (sn). */
export const TOWER_ATTACK_CD = 1.15;
/** Kule mermisinin hasarı (sahne simülasyonu uygular). */
export const TOWER_DAMAGE = 95;
/** Merminin uçuş hızı (px/sn) — oyuncunun temel atışıyla aynı ailede. */
export const TOWER_SHOT_SPEED = 420;
/** Namlu çıkışının gövde dışına kayması (px). */
const TOWER_MUZZLE_PX = 26;
/** "Kule Satın Al" düğmesinin belirdiği yakınlık (px ≈ 2.7 birim). */
export const TOWER_SITE_RADIUS_PX = 135;
/** Kulenin, oyuncuya gelen hasarı emmesi için gereken yakınlık (px ≈ 3.6 birim). */
export const TOWER_GUARD_RADIUS_PX = 180;
/** Kule gövdesinin yarıçapı (px) — projeksiyon/çarpışma değil, yalnız mesafe. */
export const TOWER_BODY_R = 26;

/**
 * KULE ARSALARI — koridorun oyuncu tarafındaki üç nokta (arena birimi).
 *
 * Sabit tablo kullanılır çünkü haritanın KENDİ kuleleri zaten yerleşiktir;
 * arsalar onların üstüne değil, koridorun savunulabilir noktalarına oturur.
 * Yine de kesin konum, yükleme sırasında `nearestWalkable` ile YÜRÜNEBİLİR
 * zemine snap'lenir (bkz. DefenseTowers.tsx → ensureTowerSites): bir arsa
 * kayanın içine düşerse oyuncu oraya yürüyemez ve düğme asla açılmazdı.
 */
export const TOWER_SITE_UNITS: ReadonlyArray<readonly [number, number]> = [
  [6.4, 4.1],
  [9.6, 6.7],
  [12.9, 9.4],
];

export interface TowerSite {
  id: number;
  /** Arena px konumu (yürünebilir zemine snap'lenmiş olabilir). */
  x: number;
  y: number;
}

export interface BattleTower {
  id: string;
  siteId: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Kalan ateş beklemesi (sn). */
  cd: number;
  /** Gövdenin hedefe dönüş açısı (radyan, dünya XZ). */
  yaw: number;
  /** Ateş anındaki kısa parlama (sn). */
  flashT: number;
}

/** Kulenin menzil taramasında gördüğü rakip (dövüşçü veya minyon). */
export interface TowerHostile {
  x: number;
  y: number;
  hp: number;
}

/** Sahnenin kuleye verdiği bağlantılar (ref'ler — kopya yok). */
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
  /** Sahnenin tek seferlik efekt havuzu (namlu halkası, hasar yazısı…). */
  fxs: { current: BattleFx[] };
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
   * Kule alındığı an bakiyeden düşmüş gibi gösterilir; sunucu yanıtı cüzdanı
   * düşürdüğü an bu sayaç temizlenir (bkz. setTowerWallet).
   */
  pending: number;
  /** Bir önceki cüzdan değeri — düşüşü yakalamak için. */
  lastWallet: number;
  towers: BattleTower[];
  sites: TowerSite[];
  /** Arsalar yürünebilir zemine snap'lendi mi? */
  sitesReady: boolean;
  /** Oyuncunun yanında durduğu boş arsa (yoksa null). */
  nearSiteId: number | null;
  seq: number;
}

export const towerState: TowerState = {
  runtime: null,
  wallet: 0,
  pending: 0,
  lastWallet: -1,
  towers: [],
  sites: [],
  sitesReady: false,
  nearSiteId: null,
  seq: 0,
};

/** Sahne kule sistemini açar/kapatır (yalnız bot düellosu kullanır). */
export function configureTowers(runtime: TowerRuntime | null): void {
  // Yeni MAÇ (kapalı → açık) ekonomiyi sıfırdan başlatır; aynı maç içinde
  // sahne yeniden bağlanırsa (yeni runtime nesnesi) harcama geçmişi korunur.
  const fresh = runtime !== null && towerState.runtime === null;
  towerState.runtime = runtime;
  if (fresh) {
    towerState.pending = 0;
    towerState.lastWallet = -1;
  }
  if (!runtime) {
    towerState.towers = [];
    towerState.sites = [];
    towerState.sitesReady = false;
    towerState.nearSiteId = null;
    towerState.seq = 0;
    towerState.pending = 0;
    towerState.lastWallet = -1;
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

/** Arsaları (yürünebilir zemine snap'lenmiş px konumlarıyla) kurar. */
export function setTowerSites(positions: ReadonlyArray<{ x: number; y: number }>): void {
  towerState.sites = positions.map((p, i) => ({ id: i, x: p.x, y: p.y }));
  towerState.sitesReady = towerState.sites.length > 0;
}

/** Arsa id'sinde kurulu kule var mı? */
export function towerAtSite(siteId: number): BattleTower | null {
  return towerState.towers.find((t) => t.siteId === siteId) ?? null;
}

/** Kurulabilir (boş) arsa mı? */
export function isSiteOpen(siteId: number | null): boolean {
  if (siteId === null) return false;
  return towerState.sites.some((s) => s.id === siteId) && !towerAtSite(siteId);
}

/**
 * Oyuncunun arsaya yakınlığını günceller. Düğmenin görünürlüğü TAMAMEN buna
 * bağlıdır: "arsanın yanına gel → düğme çıkar".
 */
export function updateTowerProximity(): void {
  const rt = towerState.runtime;
  if (!rt) return;
  const p = rt.player.current;
  let best: number | null = null;
  let bestDist = TOWER_SITE_RADIUS_PX;
  for (const site of towerState.sites) {
    if (towerAtSite(site.id)) continue;
    const d = Math.hypot(site.x - p.x, site.y - p.y);
    if (d <= bestDist) {
      bestDist = d;
      best = site.id;
    }
  }
  towerState.nearSiteId = best;
}

/**
 * Kuleyi satın alır: yalnız yakınındaki BOŞ arsaya kurulabilir ve altın
 * yetersizse hiçbir şey olmaz. `true` dönerse kule kurulmuştur.
 */
export function buyTower(): boolean {
  const siteId = towerState.nearSiteId;
  if (!isSiteOpen(siteId) || siteId === null) return false;
  if (towerGold() < TOWER_COST) return false;
  const site = towerState.sites.find((s) => s.id === siteId);
  if (!site) return false;
  towerState.pending += TOWER_COST;
  towerState.seq += 1;
  towerState.towers.push({
    id: `tower-${towerState.seq}`,
    siteId,
    x: site.x,
    y: site.y,
    hp: TOWER_HP,
    maxHp: TOWER_HP,
    cd: TOWER_ATTACK_CD * 0.4,
    yaw: 0,
    flashT: 0.35,
  });
  towerState.nearSiteId = null;
  // Altın gerçekten düşülür: sunucu bakiyeyi doğrular ve profili günceller;
  // reaktif cüzdan düşünce `pending` temizlenir. Sunucu reddederse (misafir
  // oyuncu / çevrimdışı test) kule kurulu kalır, harcama bu maçla sınırlı olur.
  towerState.runtime?.spend?.(TOWER_COST, "tower");
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
 * Kulelerin hedefleme + ateş döngüsü. Her kare sahne tarafından çağrılır.
 *
 * Hedef: menzile giren EN YAKIN rakip. Sahne rakip listesini verir
 * (`runtime.hostiles()`): bot düellosunda rakip dövüşçü, minyon dalgaları
 * geldiğinde onlar da aynı listeden geçer — kule hedefi kendisi seçer, yani
 * kule "tek düşmana" bağlı değildir.
 */
export function stepTowers(dt: number): void {
  const rt = towerState.runtime;
  if (!rt) return;
  const hostiles = rt.hostiles().filter((h) => h.hp > 0);

  for (let i = towerState.towers.length - 1; i >= 0; i--) {
    const t = towerState.towers[i];
    t.flashT = Math.max(0, t.flashT - dt);
    t.cd = Math.max(0, t.cd - dt);
    if (hostiles.length === 0) continue;

    // Hedef seçimi: mesafe karar verir (minyon önce değil).
    let enemy: TowerHostile | null = null;
    let dist = Number.POSITIVE_INFINITY;
    for (const h of hostiles) {
      const d = Math.hypot(h.x - t.x, h.y - t.y);
      if (d < dist) {
        dist = d;
        enemy = h;
      }
    }
    if (!enemy || dist > TOWER_RANGE_PX) continue;

    const dx = enemy.x - t.x;
    const dy = enemy.y - t.y;
    if (dist <= 0) continue;

    // Kilitlenme: gövde rakibe döner (yumuşak takip, anlık sıçrama yok).
    t.yaw = turnToward(t.yaw, Math.atan2(dy, dx), 1 - Math.exp(-dt * 7));
    if (t.cd > 0) continue;

    const ux = dx / dist;
    const uy = dy / dist;
    rt.projs.current.push({
      owner: "player",
      x: t.x + ux * TOWER_MUZZLE_PX,
      y: t.y + uy * TOWER_MUZZLE_PX,
      vx: ux * TOWER_SHOT_SPEED,
      vy: uy * TOWER_SHOT_SPEED,
      dmg: TOWER_DAMAGE,
      r: 14,
      travelled: 0,
      pierce: false,
    });
    // Namlu ağzı halkası: sahnenin kendi efekt havuzuna yazılır (ek katman yok).
    rt.fxs.current.push({
      kind: "ring",
      x: t.x + ux * TOWER_MUZZLE_PX,
      y: t.y + uy * TOWER_MUZZLE_PX,
      ttl: 0.24,
      maxTtl: 0.24,
      grow: 34,
      color: "#ffb066",
    });
    t.cd = TOWER_ATTACK_CD;
    t.flashT = 0.18;
  }
}

/** Kuleyi hasarlandırır (zırh uygulanır); can biterse kule yıkılır. */
function damageTower(tower: BattleTower, dmg: number): void {
  const paid = Math.max(0, dmg) * (1 - TOWER_ARMOR);
  tower.hp = Math.max(0, tower.hp - paid);
  const rt = towerState.runtime;
  rt?.fxs.current.push({
    kind: "text",
    x: tower.x,
    y: tower.y - 8,
    ttl: 0.7,
    maxTtl: 0.7,
    text: `-${Math.round(paid)}`,
    color: "#ffd0a8",
  });
  if (tower.hp > 0) return;
  // Yıkım: kule listeden düşer, yerinde kısa bir patlama kalır.
  rt?.fxs.current.push({
    kind: "burst",
    x: tower.x,
    y: tower.y,
    ttl: 0.5,
    maxTtl: 0.5,
    grow: 120,
    color: "#ff8a3c",
  });
  const idx = towerState.towers.indexOf(tower);
  if (idx >= 0) towerState.towers.splice(idx, 1);
}

/**
 * Kule koruması: oyuncuya gelen hasarı, YAKINDAKİ bir kule karşılar.
 *
 * Dönüş: oyuncunun alacağı KALAN hasar. Kule hasarı emdiyse 0 döner (yani
 * oyuncu o vuruşta hasar almaz; hasarı kule, zırhıyla birlikte yer).
 */
export function towerGuardAbsorb(dmg: number): number {
  const rt = towerState.runtime;
  if (!rt) return dmg;
  const p = rt.player.current;
  let guard: BattleTower | null = null;
  let bestDist = TOWER_GUARD_RADIUS_PX;
  for (const t of towerState.towers) {
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (d <= bestDist) {
      bestDist = d;
      guard = t;
    }
  }
  if (!guard) return dmg;
  damageTower(guard, dmg);
  return 0;
}

/** Bir dünya noktasının koridor px'ine çevrilmesi (3B katman yardımcısı). */
export function unitsToPx(x: number, y: number): [number, number] {
  return [x * S, y * S];
}
