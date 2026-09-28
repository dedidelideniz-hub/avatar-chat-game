// 🏃 MovementComponent — zemin kontrolü, kapsül çarpışması ve pürüzsüz kayma.
//
// Karakter fiziğinin TEK sahibi bu modüldür. Arena bileşenleri artık kendi
// hareket matematiğini taşımaz; sadece "şu yöne şu kadar git" der.
//
//   · `moveOnGround` — sahne sınırına kırpma + kapsül tabanlı kayma
//     (wall sliding, step offset, alt adım; bkz. ./slide.ts) + gövde yönü
//     (facing / vy) ve adım animasyonu fazı.
//   · `stepDash` — dash süresini işler ve dash vektörünü zeminde kaydırır.
//   · `resolveSpawn` — doğuş noktası gerçek bir engelin içinde kalıyorsa
//     en yakın yürünebilir noktaya taşır.
//
// Yürünebilirlik GÖRÜNMEZ DÜZ TABAN COLLIDER'ından gelir (BattleMapModel):
// yükseklik/eğim/dikiş hesabı yoktur, yalnızca KALIN gerçek engeller hareketi
// keser. Bu yüzden düz yolda takılma olmaz.
import { findNearestWalkablePosition } from "@/components/world/BattleMapModel";
import { slideStep } from "./slide";

/** Simülasyon alanı (px) — dövüşçüler bu dikdörtgenin içinde tutulur. */
export const ARENA_W = 1700;
export const ARENA_H = 1100;
/** Kenar payı: gövde bu kadar içeride kalır (harita dışına çıkılamaz). */
export const EDGE_PAD = 40;
/** Dash (şimşek yeteneği) hızı — px/s. */
export const DASH_SPEED = 820;

/** Yürüme hızı — px/s.
 *
 *  TEK KAYNAK: oyuncu, bot ve PvP'deki rakip AYNI hızda yürür. Eskiden oyuncu
 *  90 px/sn ile yürürken botlar `botSpeedMul` ile 81–103 px/sn arasında
 *  değişiyordu: hem hızlar eşit değildi hem de kolun verdiği his sertti.
 *  Hız buraya taşındı, dengeli ve biraz daha yavaş bir tempoya çekildi. */
export const WALK_SPEED = 74;

/** Kolun ölü bölgesi (sapma oranı): bu kadar sapmadan hareket başlamaz. */
export const MOVE_DEAD_ZONE = 0.14;
/** Kolun tam hıza ulaştığı sapma; üstü doygun (fazlası hız eklemez). */
export const MOVE_FULL_AT = 0.85;
/** Ölü bölgeden sonraki hız eğrisi üssü: 1 doğrusal, >1 ince kontrol. */
const MOVE_CURVE = 1.25;
/** Kalkış yumuşatma oranı (1/sn) — ani kalkışta karakter sıçramaz. */
const MOVE_ACCEL_RATE = 13;
/** Duruş yumuşatma oranı (1/sn) — bırakınca çok kısa bir süzülme. */
const MOVE_BRAKE_RATE = 20;
/** Yürürken gövdenin dönüş hızı (rad/sn) — ~802°/sn (180° ≈ 0.22 sn).
 *
 *  Eskiden 4 yönlü `facing/vy` yüzünden 16 rad/sn'lik dönüş bile "kare
 *  atlamış" gibi okunuyordu; yön artık analog olduğu için biraz yavaşlatılıp
 *  dönüşün GÖRÜLMESİ sağlandı — his burada yumuşuyor. */
export const TURN_RATE = 14;
/** Nişan/ulti kilidinde dönüş hızı (rad/sn): mermi çıkmadan gövde dönmüş olur. */
export const TURN_RATE_AIM = 24;
/** Dash sırasında temas hasarı için gövde merkezleri arası mesafe (px). */
export const DASH_HIT_R = 90;

/** Hareketin dokunduğu gövde alanı (BattleFighter bunu yapısal olarak sağlar). */
export interface GroundBody {
  x: number;
  y: number;
  facing: number;
  vy: number;
  moving: boolean;
  phase: number;
  /** Analog yürüme yönü (birim vektör, sim uzayı).
   *
   *  `facing`/`vy` yalnızca 4 yönü taşır; gövde pozunu artık bu sürekli
   *  açı belirler (bkz. Arena3D → `dirYaw`). Böylece çapraz yürüyüşte
   *  karakter kare kare dört yöne zıplamaz, girdiyi takip eder. */
  dirX?: number;
  dirY?: number;
  /** Yumuşatılmış girdi vektörü (yalnız oyuncu tarafı kullanır). */
  moveVX?: number;
  moveVY?: number;
  /** Girdi büyüklüğü (0..1): adım döngüsü bu oranda yavaşlar.
   *
   *  GLB yolu yürüme klibini zaten gerçek hıza ölçekler; prosedürel gövde
   *  fazla yürüyordu, bu yüzden yarı itilmiş kolda ayaklar kayardı. */
  moveScale?: number;
}

export interface GroundConfig {
  /** Gövde yarıçapı (kapsül/küre tabanı). */
  radius: number;
  /** Verilen konum engelli mi? (BattleMapModel.hitsRockCollision) */
  blocked: (x: number, y: number, r: number) => boolean;
  /** Sahne sınırları — varsayılan ARENA_W/H + EDGE_PAD. */
  bounds?: { w: number; h: number; pad: number };
  /** Adım animasyonu faz hızı (varsayılan 10). */
  phaseRate?: number;
}

const DEFAULT_BOUNDS = { w: ARENA_W, h: ARENA_H, pad: EDGE_PAD };

/**
 * Gövdeyi (dx, dy) kadar hareket ettirir; çarpışmaya göre düzeltilmiş konumu
 * yazar ve gerçekten ilerleyip ilerlemediğini döndürür.
 *
 * Dönüş değeri İSTENEN değil GERÇEKLEŞEN yer değiştirmedir: bot, önünde kalın
 * bir engel varken yerinde yürüme animasyonu oynatmaz.
 */
export function moveOnGround(
  body: GroundBody,
  dx: number,
  dy: number,
  dt: number,
  cfg: GroundConfig,
): boolean {
  const bounds = cfg.bounds ?? DEFAULT_BOUNDS;
  const pad = bounds.pad;
  const toX = clamp(body.x + dx, pad, bounds.w - pad);
  const toY = clamp(body.y + dy, pad, bounds.h - pad);
  // Sürtünmesiz kayma: hedef nokta reddedilirse gövde engelin önünde
  // kilitlenmez; hareket engelin teğetine izdüşürülür, küçük arazi dikişleri
  // step offset ile aşılır, dash sırasında tünelleme olmaz.
  const next = slideStep(
    body.x,
    body.y,
    toX - body.x,
    toY - body.y,
    cfg.blocked,
    cfg.radius,
  );
  body.x = next.x;
  body.y = next.y;
  if (Math.abs(dx) > 0.01) body.facing = dx > 0 ? 1 : -1;
  // Analog yön İSTENEN vektörden okunur (gerçekleşenden değil): duvara
  // yaslanmışken de gövde baktığı yönde kalır, engel yönü dondurmaz.
  const wish = Math.hypot(dx, dy);
  if (wish > 0.001) {
    body.dirX = dx / wish;
    body.dirY = dy / wish;
  }
  body.moving = next.moved;
  // Dikey yön gövde pozunu belirler (yukarı/aşağı bakış).
  if (body.moving) {
    if (Math.abs(dy) > Math.abs(dx)) body.vy = dy > 0 ? 1 : -1;
    else body.vy = 0; // yatay hareket
  } else {
    body.vy = 0;
  }
  // Adım döngüsü hızla ölçeklenir; alt sınır 0.4 (çok yavaş yürüyüşte de
  // bacaklar kımıldasın) yoksa ağır çekim hissi doğardı.
  if (body.moving)
    body.phase +=
      dt * (cfg.phaseRate ?? 10) * (0.4 + 0.6 * (body.moveScale ?? 1));
  return body.moving;
}

/** Dash süresini işler ve gövdeyi dash vektörü boyunca kaydırır. */
export function stepDash(
  body: GroundBody & { dashT: number; dashVX: number; dashVY: number },
  dt: number,
  cfg: GroundConfig,
): void {
  body.dashT -= dt;
  moveOnGround(body, body.dashVX * DASH_SPEED * dt, body.dashVY * DASH_SPEED * dt, dt, cfg);
}

/** Analog girdi vektörü (x: sağ, y: aşağı), her bileşen −1..1. */
export interface MoveInput {
  x: number;
  y: number;
}

/**
 * Kol/klavye girdisini ölü bölge + yumuşak eğriden geçirir.
 *
 * Ölü bölge parmak titremesini yok eder; eğri ise kolun yarısında yürüyen,
 * sonuna kadar itilince tam hızda koşan "dozlanabilir" bir kontrol verir
 * (Brawl Stars'daki rahat his büyük ölçüde bu eğriden gelir).
 */
export function shapeStick(raw: MoveInput): MoveInput {
  const mag = Math.hypot(raw.x, raw.y);
  if (mag <= MOVE_DEAD_ZONE) return { x: 0, y: 0 };
  const t = Math.min(
    1,
    (mag - MOVE_DEAD_ZONE) / (MOVE_FULL_AT - MOVE_DEAD_ZONE),
  );
  const gain = Math.pow(t, MOVE_CURVE);
  return { x: (raw.x / mag) * gain, y: (raw.y / mag) * gain };
}

/**
 * Hedef girdiye üstel yaklaşım: kalkış yumuşak, duruş keskin.
 *
 * Durum gövdenin kendisinde tutulur (`moveVX/moveVY`) — sahne başına ayrı ref
 * yok. Düşük kare hızında katsayı 1'e kırpılır, yoksa gövde hedefi aşar.
 */
export function smoothMoveInput(
  body: GroundBody,
  target: MoveInput,
  dt: number,
): MoveInput {
  const curX = body.moveVX ?? target.x;
  const curY = body.moveVY ?? target.y;
  const rate =
    Math.hypot(target.x, target.y) > 0 ? MOVE_ACCEL_RATE : MOVE_BRAKE_RATE;
  const k = Math.min(1, rate * dt);
  let nx = curX + (target.x - curX) * k;
  let ny = curY + (target.y - curY) * k;
  // Duruşta tamamen sıfıra in: kalan 0.01'lik artık karakterin sürünmesine
  // (ve adım animasyonunun boşta oynamasına) yol açmasın.
  if (!target.x && !target.y && Math.hypot(nx, ny) < 0.03) {
    nx = 0;
    ny = 0;
  }
  body.moveVX = nx;
  body.moveVY = ny;
  return { x: nx, y: ny };
}

/**
 * Doğuş noktası gerçek bir engelin içinde kalıyorsa gövdeyi en yakın
 * yürünebilir noktaya taşır. `false` dönerse çarpışma ızgarası henüz hazır
 * değildir (GLB asenkron yüklenir) — çağıran taraf sonraki karede tekrar dener.
 */
export function resolveSpawn(body: GroundBody, radius: number): boolean {
  const spot = findNearestWalkablePosition(body.x, body.y, radius);
  if (!spot) return false;
  body.x = spot[0];
  body.y = spot[1];
  body.moving = false;
  return true;
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
