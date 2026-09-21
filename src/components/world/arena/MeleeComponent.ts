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
import { pushHitImpact } from "./hitImpacts";
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
  host.vfx.ring(caster.x, caster.y, 66, "#fbbf24", 0.3);
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

/* ─────────────── vuruş çıpası: efekt, kılıcın ucunda ─────────────── */

/** Çıpa bayatlama sınırı (ms): kemik katmanı her karede yazar (~16 ms). */
const ANCHOR_MAX_AGE_MS = 120;
/**
 * Yedek erişim (px) — çıpa ölçülemezse (ör. kemik katmanı bu karede yazmadı):
 * kılıç 0.85 birim (42.5 px) + avuç/omuzun öne uzanması ~0.5 birim. Yedek de
 * kılıcın GERÇEKTEN ulaştığı yeri temsil eder ve kural menzili
 * (`MELEE_RANGE_PX` = 96 px, bıçak ucu 68 + rakip yarıçapı ~22) ile aynı
 * ölçektedir — efekt ile kural aynı mesafeyi anlatır, yoksa efekt kılıçtan
 * kopar. SlashTrail yayının dış yarıçapı da aynı ailededir.
 */
const MELEE_BLADE_REACH_PX = 68;
/**
 * Çıpa emniyet sınırı (px): ölçüm bozuksa (yanlış rig ölçeği, beklenmeyen
 * iskelet) efekt haritanın başka yerine düşmesin — yedeğe dönülür.
 */
const ANCHOR_MAX_REACH_PX = MELEE_RANGE_PX + 40;

/**
 * Efektin çıkacağı nokta = kılıcın indiği yer.
 *
 * 1. Kemik katmanının ölçtüğü kılıç ucu (taze ise) — asıl kaynak budur, çünkü
 *    uç, savurmanın her aşamasında gerçekten nerede olduğunu bilir.
 * 2. İsabet varsa ve hedef bıçaktan daha yakınsa uç hedefin ARKASINA düşeceği
 *    için efekt hedefin gövdesinde kalır (impale/atlama sonrası temas).
 * 3. Hiçbiri yoksa bıçağın erişebildiği nokta (bakış yönünde).
 */
function strikePoint(
  caster: BattleFighter,
  enemy: BattleFighter,
  dir: AimDir,
  hit: boolean,
): { x: number; y: number } {
  const d = Math.hypot(enemy.x - caster.x, enemy.y - caster.y);
  const tx = caster.meleeFxX;
  const ty = caster.meleeFxY;
  const at = caster.meleeFxT;
  if (
    typeof tx === "number" &&
    typeof ty === "number" &&
    typeof at === "number" &&
    performance.now() - at <= ANCHOR_MAX_AGE_MS
  ) {
    const tipD = Math.hypot(tx - caster.x, ty - caster.y);
    if (tipD <= ANCHOR_MAX_REACH_PX) {
      // İsabet varsa ve hedef bıçaktan yakınsa efekt hedefin GÖVDESİNDE kalır
      // (uç, hedefin arkasına düşüp “havada kan” görüntüsü vermesin).
      if (hit && d < tipD) return { x: enemy.x, y: enemy.y };
      return { x: tx, y: ty };
    }
  }
  const reach = hit ? Math.min(d, MELEE_BLADE_REACH_PX) : MELEE_BLADE_REACH_PX;
  return { x: caster.x + dir.x * reach, y: caster.y + dir.y * reach };
}

/**
 * Vuruş anının görsel geri bildirimi (iki arena da aynı efekti görür).
 *
 * “Kesme”nin okunması için katmanlar birlikte çalışır:
 *  1. KILIÇ İZİ (kavis) — `arena/SwordArcTrail`: kılıç UCUNUN rotası örneklenip
 *     hilal şerit olarak çizilir. Düz `beam` şeritleri KALDIRILDI: kılıçtan
 *     bağımsız, ekrana fırlayan düz bantlar gibi okunuyorlardı.
 *  2. DARBE (toz + kıvılcım) — `arena/HitImpactVfx`: vuruş noktasının
 *     zemininde dağılan yumuşak toz pufları + 3-4 minik kıvılcım.
 *  3. SAVURMA HALKASI — saldıranın ayağında kısa yay halkası (gövde kilitlenip
 *     savurduğu için “ağırlık” hissi).
 *
 * KALDIRILANLAR (görüşü kapatıyordu): parlak ~2 birimlik beyaz küre
 * (`vfx.burst`), 2.4 birim yükselen iri duman bloğu (`vfx.smoke`), mermi
 * vuruşu efekti (`vfx.coldFlameImpact`) ve tüm ekranı ışıtan bloom nabzı
 * (`vfx.flash`). Darbe artık yalnız kendi yerini boyar.
 */
const MELEE_COOL = "#4aa8ff";

/** Vuruş anının görsel geri bildirimi (iki arena da aynı efekti görür). */
function emitMeleeStrikeFx(
  vfx: VfxBus,
  caster: BattleFighter,
  enemy: BattleFighter,
  dir: AimDir,
  stage: number,
  hit: boolean,
): void {
  const finish = stage >= 2;
  // Çıpa KILIÇ UCUDUR: efekt, kılıcın indiği yerden çıkar (elle verilen
  // yükseklik/kaydırma ofseti yok — onlar efekti kılıçtan koparıyordu).
  const { x, y } = strikePoint(caster, enemy, dir, hit);

  // Darbe katmanı: silah değdiyse kıvılcım + zemin tozu, ıskada yalnız toz.
  pushHitImpact(caster, {
    kind: "strike",
    x,
    y,
    hit,
    heavy: finish,
    t: performance.now(),
  });

  if (finish) {
    // ── İMPALE (bitirici): bıçak gövdeye GİRER ──
    // Kan (okunurluk) ve savurma halkası kalır; patlama/parlama katmanı yok.
    if (hit) {
      vfx.blood(x, y, 98);
      vfx.blood(x - dir.x * 26, y - dir.y * 26, 70);
    }
    vfx.ring(caster.x, caster.y, 96, MELEE_COOL, 0.3);
    return;
  }

  // Çapraz kesiş: kavis iz + darbe katmanından okunur; burada yalnız kan ve
  // savurma halkası kalır.
  if (hit) vfx.blood(x, y, 58);
  vfx.ring(caster.x, caster.y, 64, MELEE_COOL, 0.28);
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
    // DURAKLAMA (standoff): karakter rakibin YANINDA durur, üstünden geçmez.
    // Adım kalan boşlukla sınırlanır; menzil kısaldığı için hop yalnızca son
    // boşluğu kapatır (uzun atlama yok, hedefin içine gömülme yok).
    const standoff = MELEE_LEAP_MIN_PX * 0.55;
    const step = Math.min(MELEE_LEAP_SPEED * dt, Math.max(0, d - standoff));
    if (step > 0.01) {
      opts.leapMove(caster, (dx / d) * step, (dy / d) * step, dt);
      // Kayma/hop tozu: karakter yerden kesilip üstüne süzülüyormuş gibi.
      // İz, hareket yönünün TERSİNE düşer (kuzeye sabitlenmiş ofset yok).
      // Yumuşak toz katmanından gelir (iri beyaz duman bloğu değil); görsel
      // katman aynı karede tekrarlanan isteği kendi kısar.
      pushHitImpact(caster, {
        kind: "dust",
        x: caster.x - (dx / d) * 14,
        y: caster.y - (dy / d) * 14,
        hit: false,
        heavy: false,
        t: performance.now(),
      });
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
