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
  body.moving = next.moved;
  // Dikey yön gövde pozunu belirler (yukarı/aşağı bakış).
  if (body.moving) {
    if (Math.abs(dy) > Math.abs(dx)) body.vy = dy > 0 ? 1 : -1;
    else body.vy = 0; // yatay hareket
  } else {
    body.vy = 0;
  }
  if (body.moving) body.phase += dt * (cfg.phaseRate ?? 10);
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
