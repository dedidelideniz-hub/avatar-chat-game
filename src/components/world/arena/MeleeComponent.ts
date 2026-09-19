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
  MELEE_STEP_SPEED,
  meleeDuration,
  meleeStageCount,
  meleeStageOf,
  meleeStageWindow,
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

/**
 * Vuruş anının görsel patlaması (iki arena da aynı efekti görür).
 *
 * “Kesme”nin okunması için üç katman birlikte çalışır:
 *  1. KESME ŞERİDİ — hedefin gövdesini boyunca çapraz uzanan iki parlak kılıç
 *     izi (`beam`). Aşamaya göre eğim aynalanır; bitirici daha uzun ve dik.
 *  2. KIVILCIM — hasar noktasında darbe parlaması + kıvılcım pufu.
 *  3. SAVURMA HALKASI — saldıranın ayağında kısa yay halkası (gövde kilitlenip
 *     savurduğu için “ağırlık” hissi).
 */
function emitMeleeStrikeFx(
  vfx: VfxBus,
  caster: BattleFighter,
  enemy: BattleFighter,
  dir: AimDir,
  stage: number,
  hit: boolean,
): void {
  const finish = stage >= 2;
  // Vuruş ıskaladıysa iz rakibin üstünde DEĞİL, bıçağın havada bittiği
  // noktada çizilir (yanlış "kesildi" izlenimi olmasın).
  const x = hit ? enemy.x : caster.x + dir.x * MELEE_RANGE_PX * 0.72;
  const y = (hit ? enemy.y : caster.y + dir.y * MELEE_RANGE_PX * 0.72) - 46;

  if (finish) {
    // ── İMPALE (bitirici): bıçak gövdeye GİRER ──
    // 1) İleri saplama şeridi: bıçağın içeri sürüldüğü hat.
    vfx.beam(
      x - dir.x * 64,
      y + 6 - dir.y * 64,
      x + dir.x * 34,
      y + 6 + dir.y * 34,
      0.16,
    );
    // 2) KAN FIŞKIRMASI — vuruş isabetliyse rakibin gövdesinden.
    if (hit) {
      vfx.blood(x, y + 30, 98);
      vfx.blood(x - dir.x * 26, y + 8, 70);
    }
    vfx.burst(x, y, 122, "#fbbf24", 0.34);
    vfx.smoke(x, y + 40, 5, 95);
    if (hit) vfx.coldFlameImpact(x, y, 82);
    vfx.flash(0.44);
    vfx.ring(caster.x, caster.y - 28, 96, "#fbbf24", 0.3);
    return;
  }

  // Kesme şeridi ekseni: salınım yönüne DİK, aşamaya göre ± eğimli.
  const tilt = stage === 1 ? 1 : -1;
  const axRaw = -dir.y * 0.74 + dir.x * 0.5 * tilt;
  const ayRaw = dir.x * 0.74 + dir.y * 0.5 * tilt;
  const an = Math.hypot(axRaw, ayRaw) || 1;
  const ax = axRaw / an;
  const ay = ayRaw / an;
  const half = 92;
  // 1) Ana kesme izi (bıçağın geçtiği hat).
  vfx.beam(x + ax * half, y + ay * half, x - ax * half, y - ay * half, 0.18);
  // 2) Hafif geride/paralel ikinci şerit → çift kenarlı “biçme” görüntüsü.
  const offX = dir.x * 22;
  const offY = dir.y * 22 + 18;
  vfx.beam(
    x + ax * half * 0.72 + offX,
    y + ay * half * 0.72 + offY,
    x - ax * half * 0.5 + offX,
    y - ay * half * 0.5 + offY,
    0.15,
  );

  vfx.burst(x, y, 78, "#f8fafc", 0.32);
  vfx.smoke(x, y + 34, 3, 58);
  if (hit) {
    vfx.coldFlameImpact(x, y, 54);
    // Kesiş de kan bırakır (daha hafif).
    vfx.blood(x, y + 26, 58);
  }
  vfx.flash(0.2);
  vfx.ring(caster.x, caster.y - 28, 64, "#fde68a", 0.28);
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
      // Kayma/hop tozu: karakter yerden kesilip üstüne süzülüyormuş gibi.
      opts.vfx.smoke(caster.x - (dx / d) * 12, caster.y - 14, 2, 40);
    }
  }

  // ── ÖNE ADIM (step-in): her kesme fazında kısa bir yakınlaşma ──
  // Karakter yerinde durup kılıç sallamaz; her darbe biraz yaklaşır. Bitirici
  // aşamasının yürüyüşünü zaten atlama üstlendiği için orada devre dışı.
  const stepStage = meleeStageOf(caster.meleeLeap, progress);
  const stepFinish = caster.meleeLeap && stepStage >= 2;
  if (!stepFinish) {
    const sw = meleeStageWindow(caster.meleeLeap, stepStage);
    const sl = (progress - sw.start) / Math.max(1e-6, sw.end - sw.start);
    if (sl >= 0.3 && sl <= 0.6) {
      const gap = Math.hypot(enemy.x - caster.x, enemy.y - caster.y);
      if (gap > MELEE_RANGE_PX * 0.45) {
        const dir = currentDir(caster);
        opts.leapMove(
          caster,
          dir.x * MELEE_STEP_SPEED * dt,
          dir.y * MELEE_STEP_SPEED * dt,
          dt,
        );
      }
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
    emitMeleeStrikeFx(opts.vfx, caster, enemy, dir, stage, hit);
    strikes.push({ stage, dmg: meleeStrikeDamage(stage), hit });
  }
  return strikes;
}
