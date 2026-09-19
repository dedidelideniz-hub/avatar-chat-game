// ⚔️ MeleeComponent — Kraliyet Savaşçısı'nın YAKIN DÖVÜŞ (melee) kuralı.
//
// Skine bağlı üçüncü yetenek: kısa menzilli sol/sağ çapraz kesişler ve rakip
// yakınsa üstüne atlayıp inen bitirici darbe. Kural (nişan, menzil, süre,
// vuruş anları) burada yaşar; iki arena (bot + PvP) da aynı tabloyu kullanır.
//
// Ayrım (SkillComponent ile aynı desen): bu modül KURALI ve GÖRSELİ yönetir,
// hasarın nasıl uygulandığını bilmez. `stepMelee` vuruş anlarını döndürür;
// hasarı ve ağ olayını sahne bağlar (bot arenası doğrudan, PvP karşı cihaza).
//
// Zamanlama/ölçek sabitleri `@/engine/RoyalMelee` içinde TEK kaynaktan gelir
// (animasyon katmanı ile sim aynı eşikleri okusun diye).
import {
  faceAimYaw,
  isSamuraiFighter,
  type BattleFighter,
} from "@/components/world/Arena3D";
import {
  MELEE_CD,
  MELEE_LEAP_FROM,
  MELEE_LEAP_MIN_PX,
  MELEE_LEAP_SPEED,
  MELEE_LEAP_TO,
  MELEE_LUNGE_RANGE_PX,
  MELEE_RANGE_PX,
  meleeDuration,
  meleeStageCount,
  meleeStrikeArc,
  meleeStrikeDamage,
  meleeStrikeProgress,
} from "@/engine/RoyalMelee";
import type { SkillHost } from "./SkillComponent";
import type { VfxBus } from "./VFXComponent";
import { aimedHit, resolveAim, type AimDir } from "./skillshot";

/** Nişan/atış için ihtiyaç duyulan host dilimi (tam SkillHost fazlası olur). */
type MeleeHost = Pick<SkillHost, "canLock" | "vfx" | "sound">;

/** Yeniden kullanım oranı 0..1 (HUD halkası için). */
export function meleeCharge(f: BattleFighter): number {
  return 1 - Math.max(0, f.meleeCd) / MELEE_CD;
}

/** Bekleme süresini ilerletir (her sim adımında bir kez çağrılır). */
export function tickMelee(f: BattleFighter, dt: number): void {
  if (f.meleeCd > 0) f.meleeCd = Math.max(0, f.meleeCd - dt);
}

/** Şu an yakın dövüş başlatılabilir mi? */
export function canMelee(f: BattleFighter): boolean {
  return (
    isSamuraiFighter(f) &&
    f.hp > 0 &&
    f.meleeCd <= 0 &&
    f.meleeT <= 0 &&
    f.samuraiUltT <= 0 &&
    f.dashT <= 0 &&
    f.hitStunT <= 0
  );
}

export interface MeleePlan {
  /** Çözülen salınım yönü (kilitliyse rakibe bakar). */
  dir: AimDir;
  /** Rakip menzil içinde olduğu için üstüne atlanacak mı? */
  leap: boolean;
}

/**
 * Salınımı planlar ve başlatır. Rakip `MELEE_LUNGE_RANGE_PX` içindeyse nişan
 * OTOMATİK kilitlenir ve üstüne atlanır; değilse yalnızca elle nişan ya da
 * gövdenin baktığı yöne savrulur (haritanın öbür ucuna gitmez).
 */
export function startMelee(
  caster: BattleFighter,
  enemy: BattleFighter,
  host: MeleeHost,
  permitted: boolean,
  aimX?: number,
  aimY?: number,
): MeleePlan | null {
  if (!permitted || !canMelee(caster)) return null;
  const dir = resolveAim(caster, enemy, aimX ?? 0, aimY ?? 0, {
    canLock: host.canLock(enemy, caster),
    rangePx: MELEE_LUNGE_RANGE_PX,
    preferLock: true,
  });
  const dist = Math.hypot(enemy.x - caster.x, enemy.y - caster.y);
  // Zaten dibindeysek atlamaya gerek yok (yerinde keser).
  const leap = dir.locked && dist > MELEE_LEAP_MIN_PX;
  caster.meleeCd = MELEE_CD;
  caster.meleeT = meleeDuration(leap);
  caster.meleeLeap = leap;
  caster.meleeStrikes = 0;
  caster.facing = dir.x >= 0 ? 1 : -1;
  // Salınım boyunca gövde hedefe kilitlenir: sol/sağ kesişler aynı hatta kalır.
  faceAimYaw(caster, dir.x, dir.y, caster.meleeT);
  host.vfx.ring(caster.x, caster.y - 30, 66, "#fbbf24", 0.3);
  host.sound("dash", { volume: 0.5, rate: 1.25 });
  return { dir, leap };
}

/** Bir karede gerçekleşen vuruş. Hasarı sahne uygular. */
export interface MeleeStrike {
  /** 0 = sağdan sola, 1 = soldan sağa, 2 = bitirici iniş. */
  stage: number;
  dmg: number;
  /** Menzil/konide rakip var mıydı? */
  hit: boolean;
}

/** Nişan/atış için gövdenin GERÇEK bakış yönü (kilit > kalıcı bakış). */
function currentDir(f: BattleFighter): AimDir {
  const yaw =
    typeof f.aimYaw === "number" && Number.isFinite(f.aimYaw)
      ? f.aimYaw
      : (f.restYaw ?? 0);
  return { x: Math.sin(yaw), y: Math.cos(yaw), locked: false };
}

/** Vuruş anının görsel patlaması (iki arena da aynı efekti görür). */
function emitMeleeStrikeFx(
  vfx: VfxBus,
  caster: BattleFighter,
  enemy: BattleFighter,
  stage: number,
  hit: boolean,
): void {
  const finish = stage >= 2;
  vfx.burst(
    enemy.x,
    enemy.y - 40,
    finish ? 105 : 72,
    finish ? "#fbbf24" : "#e2e8f0",
    0.3,
  );
  vfx.smoke(enemy.x, enemy.y - 12, finish ? 5 : 3, finish ? 90 : 55);
  if (hit) vfx.coldFlameImpact(enemy.x, enemy.y - 40, finish ? 74 : 52);
  vfx.flash(finish ? 0.4 : 0.18);
  vfx.ring(
    caster.x,
    caster.y - 28,
    finish ? 84 : 58,
    finish ? "#fbbf24" : "#fde68a",
    0.26,
  );
}

/**
 * Yakın dövüşü bir adım ilerletir: süreyi akıtır, atlama penceresindeyse
 * rakibin üstüne (çarpışma kontrollü) yürür, vuruş eşikleri geçildiğinde
 * hasar bilgisini döndürür. Aktif değilse `null` döner ve hiçbir şey yapmaz.
 *
 * Not: Bu karede vuruş yoksa `null` döner (kare başına dizi ayrılmaz); yalnız
 * vuruş anında küçük bir dizi oluşur.
 */
export function stepMelee(
  caster: BattleFighter,
  enemy: BattleFighter,
  dt: number,
  opts: {
    /** Çarpışma kontrollü hareket (sahnenin `moveOnGround` sarmalayıcısı). */
    leapMove: (f: BattleFighter, dx: number, dy: number, dt: number) => void;
    vfx: VfxBus;
  },
): MeleeStrike[] | null {
  if (caster.meleeT <= 0) return null;
  caster.meleeT = Math.max(0, caster.meleeT - dt);
  const dur = meleeDuration(caster.meleeLeap);
  const progress = 1 - caster.meleeT / dur;
  // Salınım boyunca karakter köklenir (joystick girdisi yok sayılır).
  caster.moving = false;
  caster.phase += dt * 7;

  // ── Üstüne atlama: bitirici penceresinde rakibe doğru hamle ──
  if (
    caster.meleeLeap &&
    progress >= MELEE_LEAP_FROM &&
    progress <= MELEE_LEAP_TO
  ) {
    const dx = enemy.x - caster.x;
    const dy = enemy.y - caster.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > MELEE_LEAP_MIN_PX * 0.55) {
      opts.leapMove(
        caster,
        (dx / d) * MELEE_LEAP_SPEED * dt,
        (dy / d) * MELEE_LEAP_SPEED * dt,
        dt,
      );
    }
  }

  // ── Vuruş anları: her aşama kendi strike eşiğinde işler ──
  const total = meleeStageCount(caster.meleeLeap);
  if (
    caster.meleeStrikes >= total ||
    progress < meleeStrikeProgress(caster.meleeLeap, caster.meleeStrikes)
  ) {
    return null;
  }
  const strikes: MeleeStrike[] = [];
  while (
    caster.meleeStrikes < total &&
    progress >= meleeStrikeProgress(caster.meleeLeap, caster.meleeStrikes)
  ) {
    const stage = caster.meleeStrikes;
    caster.meleeStrikes += 1;
    const dir = currentDir(caster);
    const hit = aimedHit(caster, dir, enemy, {
      rangePx: MELEE_RANGE_PX + (stage >= 2 ? 30 : 0),
      halfAngle: meleeStrikeArc(stage),
    });
    emitMeleeStrikeFx(opts.vfx, caster, enemy, stage, hit);
    strikes.push({ stage, dmg: meleeStrikeDamage(stage), hit });
  }
  return strikes;
}
