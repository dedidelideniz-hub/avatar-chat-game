// 🧪 qaStore — otomatik QA (test botu + sahne teşhisi + performans) verisinin
// tek sahibi.
//
// React state DEĞİL, paylaşılan mutable bir nesnedir (`aimState`, `bloomPulse`
// ile aynı desen): yazan taraf sahne döngüsü (60 fps), okuyan taraf QA paneli
// (600 ms'de bir yoklar). Böylece teşhis ölçümleri oyunun render döngüsünde
// hiçbir React yeniden çizimi tetiklemez — mobilde kritik.
//
// Kayıtlar `tag + mesaj + koordinat` ile TEKRARSUZLAŞTIRILIR: aynı bulgu
// (örn. aynı kaplamasız mesh) yüzlerce kez loglanmaz, sayacı artar. Bu, log
// taşmasını ve mobilde bellek baskısını engeller.

export type QaLevel = "info" | "warn" | "error";

export interface QaEntry {
  id: number;
  level: QaLevel;
  /** Bulgu sınıfı: TEXTURE / GEOMETRY / BOUNDS / BLOCKED / PERF / … */
  tag: string;
  msg: string;
  /** Oyun uzayı koordinatı (px). -1 = konum yok. */
  x: number;
  y: number;
  /** Aynı bulgu kaç kez görüldü. */
  count: number;
  /** İlk görülme zamanı (performance.now()). */
  at: number;
  /** Son görülme zamanı. */
  last: number;
}

/** Alan (bölge) bazlı FPS: harita 6×5 hücreye bölünür, her hücre ~5.7×4.4 birim. */
export interface QaSpot {
  col: number;
  row: number;
  minFps: number;
  sumFps: number;
  samples: number;
  /** Hücre merkezi (px) — raporda bölge bu koordinatla anılır. */
  x: number;
  y: number;
}

export interface QaHeavy {
  name: string;
  tris: number;
  x: number;
  y: number;
}

export interface QaStore {
  /** Otomatik test botu geziyor mu? */
  botOn: boolean;
  /** Son taramanın durumu (panel için). */
  scanning: boolean;
  /** Taranan mesh sayısı / son tarama zamanı. */
  scanned: number;
  scanAt: number;
  /** Anlık ve ortalama FPS. */
  fps: number;
  avgFps: number;
  /** Kaydedilen en düşük FPS ve nerede olduğu. */
  worstFps: number;
  worstAt: string;
  /** Cihaz/çizim yükü (mobil rapor için). */
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** Test botunun anlık konumu (px) — panelde canlı takip. */
  botX: number;
  botY: number;
  /** Botun tamamladığı tur sayısı. */
  laps: number;
  entries: QaEntry[];
  spots: QaSpot[];
  heavy: QaHeavy[];
  /** Panel bu sayacı izler: arttığında listeyi tazeler. */
  revision: number;
}

export const qa: QaStore = {
  botOn: true,
  scanning: false,
  scanned: 0,
  scanAt: 0,
  fps: 60,
  avgFps: 60,
  worstFps: 999,
  worstAt: "-",
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  botX: 0,
  botY: 0,
  laps: 0,
  entries: [],
  spots: [],
  heavy: [],
  revision: 0,
};

/** Log üst sınırı — mobilde belleği korumak için sabit tavan. */
export const QA_MAX_ENTRIES = 240;
/** Aynı bulgu için en fazla kaç kayıt tutulur (koordinat başına). */
const QA_MAX_PER_TAG = 60;

const seen = new Map<string, QaEntry>();
let nextId = 1;

/** Koordinatı 0.5 birime yuvarlar: aynı noktadaki tekrar aynı kayda yazılır. */
function coordKey(x: number, y: number): string {
  if (x < 0 || y < 0) return "n";
  return `${Math.round((x / 50) * 2)}:${Math.round((y / 50) * 2)}`;
}

/**
 * Bulguyu kaydeder (aynı bulgu tekrar ederse sayacı artar).
 * `x`/`y` oyun px'idir; konum yoksa -1 verilir.
 */
export function qaLog(
  level: QaLevel,
  tag: string,
  msg: string,
  x = -1,
  y = -1,
): void {
  const key = `${level}|${tag}|${msg}|${coordKey(x, y)}`;
  const now = performance.now();
  const existing = seen.get(key);
  if (existing) {
    existing.count += 1;
    existing.last = now;
    qa.revision += 1;
    return;
  }
  // Etiket bazlı tavan: bir bulgu sınıfı listeyi tek başına doldurmasın.
  let perTag = 0;
  for (const e of qa.entries) if (e.tag === tag) perTag += 1;
  if (perTag >= QA_MAX_PER_TAG) return;

  const entry: QaEntry = {
    id: nextId++,
    level,
    tag,
    msg,
    x,
    y,
    count: 1,
    at: now,
    last: now,
  };
  seen.set(key, entry);
  qa.entries.unshift(entry);
  if (qa.entries.length > QA_MAX_ENTRIES) {
    const dropped = qa.entries.pop();
    if (dropped) {
      seen.delete(
        `${dropped.level}|${dropped.tag}|${dropped.msg}|${coordKey(dropped.x, dropped.y)}`,
      );
    }
  }
  qa.revision += 1;
}

/**
 * "Taramayı çalıştır" düğmesinin tetikleyicisi: panel `at`i tazeler, sahne
 * katmanı değişimi görüp taramayı başlatır (iki taraf birbirini import etmez).
 */
export const qaScanTrigger = { at: 0 };

/** Panelden tarama ister. */
export function qaRequestScan(): void {
  qaScanTrigger.at = performance.now();
  qa.revision += 1;
}

/** Test botu aç/kapat (panel düğmesi). */
export function qaSetBot(on: boolean): void {
  qa.botOn = on;
  qaLog("info", "BOT", on ? "test botu açıldı" : "test botu durduruldu");
  qa.revision += 1;
}

/** Bütün bulguları ve FPS bölgelerini temizler (özet sayaçlar korunur). */
export function qaClear(): void {
  seen.clear();
  qa.entries.length = 0;
  qa.spots.length = 0;
  qa.heavy.length = 0;
  qa.worstFps = 999;
  qa.worstAt = "-";
  qa.revision += 1;
}

/** Bulguları panoya/rapora yapıştırılabilir düz metne çevirir. */
export function qaReport(): string {
  const px = (x: number, y: number) =>
    x < 0
      ? "-"
      : `(${Math.round(x)}px, ${Math.round(y)}px) / (${(x / 50).toFixed(1)}, ${(y / 50).toFixed(1)}) birim`;
  const lines: string[] = [];
  lines.push("=== VAELOS QA RAPORU ===");
  lines.push(
    `FPS anlık ${qa.fps.toFixed(1)} / ortalama ${qa.avgFps.toFixed(1)} / en düşük ${qa.worstFps === 999 ? "-" : qa.worstFps.toFixed(1)} @ ${qa.worstAt}`,
  );
  lines.push(
    `Çizim: ${qa.drawCalls} call / ${qa.triangles.toLocaleString()} üçgen / ${qa.geometries} geometri / ${qa.textures} doku`,
  );
  lines.push(
    `Test botu: ${qa.botOn ? "açık" : "kapalı"} @ ${px(qa.botX, qa.botY)}, tur ${qa.laps}, taranan mesh ${qa.scanned}`,
  );

  const worst = qa.spots
    .filter((s) => s.samples >= 3)
    .sort((a, b) => a.sumFps / a.samples - b.sumFps / b.samples)
    .slice(0, 6);
  if (worst.length) {
    lines.push("");
    lines.push("--- FPS DÜŞÜK BÖLGELER ---");
    for (const s of worst) {
      lines.push(
        `hücre ${s.col},${s.row} ort ${(s.sumFps / s.samples).toFixed(1)} fps (min ${s.minFps.toFixed(1)}) @ ${px(s.x, s.y)}`,
      );
    }
  }
  if (qa.heavy.length) {
    lines.push("");
    lines.push("--- EN AĞIR OBJELER (üçgen) ---");
    for (const h of qa.heavy)
      lines.push(`${h.tris.toLocaleString()} △  ${h.name} @ ${px(h.x, h.y)}`);
  }

  const order: Record<QaLevel, number> = { error: 0, warn: 1, info: 2 };
  const sorted = [...qa.entries].sort(
    (a, b) => order[a.level] - order[b.level],
  );
  const count = (lv: QaLevel) =>
    qa.entries.filter((e) => e.level === lv).length;
  lines.push("");
  lines.push(
    `--- BULGULAR: ${count("error")} hata / ${count("warn")} uyarı / ${count("info")} bilgi ---`,
  );
  for (const e of sorted) {
    lines.push(
      `[${e.level.toUpperCase()}][${e.tag}]${e.x >= 0 ? ` ${px(e.x, e.y)}` : ""} ${e.msg}${e.count > 1 ? ` (×${e.count})` : ""}`,
    );
  }
  return lines.join("\n");
}
