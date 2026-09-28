/**
 * SINIR ÇİTİ HATTI — kaldırım ile çimin birleştiği çizgi boyunca KESİNTİSİZ
 * çit döşeme matematiği (React'ten bağımsız, test edilebilir).
 *
 * Eskiden çit, `FENCES` listesindeki üç kısa parça hâlinde duruyordu. Artık
 * hat baştan sona tek bir çizgi: çıtalar `FENCE_SPACING` adımıyla uç uca
 * dizilir ve kalan mesafe adıma eşit dağıtılır → ilk çıta `startX`, son çıta
 * `endX`, arada boşluk yok. Korkuluklar her bayın ortasına, bay genişliği
 * kadar (payıyla) yerleşir → uç uca kesintisiz bir üst korkuluk çizgisi.
 *
 * `StreetDetail.StreetFences` bu listeyi iki `InstancedMesh`'e yazar; ölçüm ve
 * hizalar `scripts/check-grass-ground.ts` içinde gerçek verilerle doğrulanır.
 */
import { FENCE_SPACING, type FenceLineDef } from "./constants";

export interface FenceSlat {
  x: number;
  z: number;
}

export interface FenceRail {
  x: number;
  z: number;
  /** Korkuluk segmentinin X uzunluğu. */
  len: number;
}

export interface FenceLineBuild {
  slats: FenceSlat[];
  rails: FenceRail[];
  /** Çıtalar arası gerçek adım (hat uzunluğu bölünerek eşitlenir). */
  step: number;
  bays: number;
}

/** Tek bir sınır hattını uç uca çıta + korkuluk dizisine çevirir. */
export function buildFenceLine(line: FenceLineDef, spacing = FENCE_SPACING): FenceLineBuild {
  const slats: FenceSlat[] = [];
  const rails: FenceRail[] = [];
  const length = line.endX - line.startX;
  if (!line.enabled || length <= 0 || spacing <= 0) {
    return { slats, rails, step: 0, bays: 0 };
  }

  // Bay sayısı yuvarlanır → adım tam `spacing` civarında kalır ama hat
  // uzunluğuna TAM oturur (uçlarda artan/eksik mesafe kalmaz).
  const bays = Math.max(1, Math.round(length / spacing));
  const step = length / bays;

  for (let i = 0; i <= bays; i++) slats.push({ x: line.startX + i * step, z: line.z });
  for (let i = 0; i < bays; i++) {
    rails.push({ x: line.startX + (i + 0.5) * step, z: line.z, len: step + 0.02 });
  }

  return { slats, rails, step, bays };
}

/** Tüm etkin hatları tek listede toplar. */
export function buildFenceLines(lines: readonly FenceLineDef[], spacing = FENCE_SPACING) {
  const slats: FenceSlat[] = [];
  const rails: FenceRail[] = [];
  for (const line of lines) {
    const built = buildFenceLine(line, spacing);
    slats.push(...built.slats);
    rails.push(...built.rails);
  }
  return { slats, rails };
}
