/**
 * SINIR ÇİTLERİ — YATAY hatlar (kaldırım ↔ çim çizgisi) ve DİKEY kenarlar
 * (sokak asfaltı ↔ çim) için ortak, React'ten bağımsız çit matematiği.
 *
 * Eskiden çit, `FENCES` listesindeki üç kısa parça hâlinde duruyordu. Artık hat
 * baştan sona tek bir koşu: çıtalar `FENCE_SPACING` adımıyla uç uca dizilir ve
 * kalan mesafe adıma eşit dağıtılır → ilk çıta başlangıçta, son çıta bitişte,
 * arada boşluk yok. Korkuluklar her bayın ortasına, bay genişliği kadar
 * (payıyla) yerleşir → uç uca kesintisiz bir üst korkuluk çizgisi.
 *
 * İki kullanım AYNI matematiği paylaşır, yalnızca uzandığı eksen farklıdır:
 *   · `buildFenceLine`  → X boyunca, sabit Z (cadde boyu sınır çiti)
 *   · `buildFenceEdge`  → Z boyunca, sabit X (dikey sokak kenarı)
 * Korkuluğun ekseni `FenceRail.axis` içinde taşınır; `StreetDetail.StreetFences`
 * ölçeği buna göre seçer.
 *
 * `StreetDetail.StreetFences` bu listeyi iki `InstancedMesh`'e yazar; ölçüm ve
 * hizalar `scripts/check-grass-ground.ts` ve `scripts/check-map-scale.ts`
 * içinde gerçek verilerle doğrulanır.
 */
import {
  FENCE_SPACING,
  type FenceEdgeDef,
  type FenceLineDef,
} from "./constants";

export interface FenceSlat {
  x: number;
  z: number;
}

export interface FenceRail {
  x: number;
  z: number;
  /** Korkuluk segmentinin uzunluğu (kendi ekseninde). */
  len: number;
  /** Korkuluğun uzandığı eksen: "x" yatay hat, "z" dikey sokak kenarı. */
  axis: "x" | "z";
}

export interface FenceLineBuild {
  slats: FenceSlat[];
  rails: FenceRail[];
  /** Çıtalar arası gerçek adım (koşu uzunluğu bölünerek eşitlenir). */
  step: number;
  bays: number;
}

/**
 * Tek bir çit koşusunu uç uca çıta + korkuluk dizisine çevirir.
 * `fixed` = sabit eksendeki konum, `start`..`end` = koşu boyunca aralık.
 */
function buildRun(
  fixed: number,
  start: number,
  end: number,
  axis: "x" | "z",
  spacing: number,
): FenceLineBuild {
  const slats: FenceSlat[] = [];
  const rails: FenceRail[] = [];
  const length = end - start;
  if (length <= 0 || spacing <= 0) {
    return { slats, rails, step: 0, bays: 0 };
  }

  // Bay sayısı yuvarlanır → adım tam `spacing` civarında kalır ama koşu
  // uzunluğuna TAM oturur (uçlarda artan/eksik mesafe kalmaz).
  const bays = Math.max(1, Math.round(length / spacing));
  const step = length / bays;
  const point = (along: number): FenceSlat =>
    axis === "x" ? { x: along, z: fixed } : { x: fixed, z: along };

  for (let i = 0; i <= bays; i++) slats.push(point(start + i * step));
  for (let i = 0; i < bays; i++) {
    rails.push({ ...point(start + (i + 0.5) * step), len: step + 0.02, axis });
  }

  return { slats, rails, step, bays };
}

/** Yatay (X boyunca) sınır hattı. */
export function buildFenceLine(
  line: FenceLineDef,
  spacing = FENCE_SPACING,
): FenceLineBuild {
  if (!line.enabled) return { slats: [], rails: [], step: 0, bays: 0 };
  return buildRun(line.z, line.startX, line.endX, "x", spacing);
}

/** Dikey (Z boyunca) sokak kenarı — çime geçişi kesen hat. */
export function buildFenceEdge(
  edge: FenceEdgeDef,
  spacing = FENCE_SPACING,
): FenceLineBuild {
  if (!edge.enabled) return { slats: [], rails: [], step: 0, bays: 0 };
  // Z kuzeye doğru KÜÇÜLÜR: koşuyu artan sıraya çevirip aynı matematiği kullan.
  return buildRun(
    edge.x,
    Math.min(edge.startZ, edge.endZ),
    Math.max(edge.startZ, edge.endZ),
    "z",
    spacing,
  );
}

/** Tüm yatay hatları + dikey kenarları tek listede toplar (2 draw call). */
export function buildFences(
  lines: readonly FenceLineDef[],
  edges: readonly FenceEdgeDef[],
  spacing = FENCE_SPACING,
) {
  const slats: FenceSlat[] = [];
  const rails: FenceRail[] = [];
  for (const line of lines) {
    const built = buildFenceLine(line, spacing);
    slats.push(...built.slats);
    rails.push(...built.rails);
  }
  for (const edge of edges) {
    const built = buildFenceEdge(edge, spacing);
    slats.push(...built.slats);
    rails.push(...built.rails);
  }
  return { slats, rails };
}
