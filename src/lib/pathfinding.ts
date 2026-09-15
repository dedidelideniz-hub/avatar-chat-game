/**
 * Grid-based A* pathfinding for the Vaelos street map.
 *
 * The world is discretised into cells.  Obstacle rectangles are
 * "burned" into the grid (inflated by PLAYER_RADIUS so the character
 * circle never overlaps a stall).  A* then finds the shortest walkable
 * path from start → goal.
 *
 * ⚡ PERFORMANS NOTU — bu uygulama ana iş parçacığını (main thread) meşgul
 * etmeyecek şekilde yazıldı:
 *
 *   · Izgara ve tüm çalışma tamponları `Int32Array` / `Float64Array` / `Uint8Array`
 *     tip dizileridir. Eski sürüm `boolean[][]`, `Map<number, Node>`, `Set` ve
 *     `${c},${r}` string anahtarları kullanıyordu: her düğüm için nesne, hash
 *     hesabı ve çöp (garbage) demekti.
 *   · Açık liste artık ikili yığın (binary heap + decrease-key): eskiden her
 *     adımda tüm açık liste taranıp en küçük `f` aranıyordu (O(n)); şimdi
 *     O(log n). Yığın kapasitesi N olduğu için düğüm başına tek girdi olur.
 *   · Tamponlar modül seviyesinde BİR KEZ ayrılır; her arama "nesil damgası"
 *     (generation stamp) ile sıfırlanır — yani çağrı başına dizi doldurma ve
 *     nesne ayırma yoktur.
 *
 * Sonuç: yol bulma, kare döngüsünü (rAF) takacak bir iş olmaktan çıkar.
 *
 * NOT (Web Worker): Bu iş yükü ana kare bütçesinin çok altına indiği için
 * ayrı bir iş parçacığına taşınmadı — `postMessage` gidiş-dönüşü bu süreden
 * pahalıdır ve asenkron hâle getirmek tüm çağrı yerlerini (tap-to-walk)
 * değiştirmeyi gerektirirdi. İş yükü büyürse (ör. onlarca minyonun sürekli yol
 * araması) bu modül olduğu gibi bir worker'a taşınabilir; `findPath` saf bir
 * fonksiyondur ve hiçbir tarayıcı API'sine dokunmaz.
 */

import { OBSTACLES, WALKABLE_ZONES, PLAYER_RADIUS } from "./shop";

/* ── grid constants ─────────────────────────────────────────── */

const CELL = 16; // px per cell — small enough for smooth paths,
// large enough to keep the open list tiny.
const COLS = Math.ceil(1600 / CELL); // 100
const ROWS = Math.ceil(900 / CELL); // 57
const N = COLS * ROWS;

/* ── walkability bitmap (built once, module-level) ──────────── */

// 1 = walkable, 0 = blocked
const walkable = new Uint8Array(N);

(() => {
  // 1) mark everything inside a walkable zone
  for (const z of WALKABLE_ZONES) {
    const c0 = Math.floor(z.x / CELL);
    const r0 = Math.floor(z.y / CELL);
    const c1 = Math.ceil((z.x + z.w) / CELL);
    const r1 = Math.ceil((z.y + z.h) / CELL);
    for (let r = r0; r < r1 && r < ROWS; r++)
      for (let c = c0; c < c1 && c < COLS; c++) walkable[r * COLS + c] = 1;
  }

  // 2) burn obstacles (inflated by PLAYER_RADIUS) — mark as blocked
  for (const o of OBSTACLES) {
    const pad = PLAYER_RADIUS;
    const c0 = Math.floor((o.x - pad) / CELL);
    const r0 = Math.floor((o.y - pad) / CELL);
    const c1 = Math.ceil((o.x + o.w + pad) / CELL);
    const r1 = Math.ceil((o.y + o.h + pad) / CELL);
    for (let r = r0; r < r1 && r < ROWS; r++)
      for (let c = c0; c < c1 && c < COLS; c++) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) walkable[r * COLS + c] = 0;
      }
  }
})();

/* ── kalıcı çalışma tamponları (çağrı başına ayırma yok) ─────── */

/** Nesil damgası: `seen[i] === gen` ise `i` düğümü bu aramada görüldü. */
let gen = 0;
const seen = new Int32Array(N); // bu aramada görüldü mü (damga)
const closed = new Int32Array(N); // kapalı (işi bitmiş) düğümün damgası
const parent = new Int32Array(N); // ebeveyn düğüm indeksi
const gScore = new Float64Array(N); // başlangıçtan buraya maliyet

/** İkili yığın (açık liste). 1 tabanlı: kök = 1. */
const heapNode = new Int32Array(N + 1);
const heapF = new Float64Array(N + 1);
const heapPos = new Int32Array(N); // düğümün yığındaki indeksi (0 = yığında yok)
let heapSize = 0;

function heapSiftUp(i: number) {
  const node = heapNode[i];
  const f = heapF[i];
  while (i > 1) {
    const p = i >> 1;
    if (heapF[p] <= f) break;
    heapNode[i] = heapNode[p];
    heapF[i] = heapF[p];
    heapPos[heapNode[i]] = i;
    i = p;
  }
  heapNode[i] = node;
  heapF[i] = f;
  heapPos[node] = i;
}

function heapSiftDown(i: number) {
  const node = heapNode[i];
  const f = heapF[i];
  while (true) {
    const c = i << 1;
    if (c > heapSize) break;
    const c1 = c + 1;
    const child = c1 <= heapSize && heapF[c1] < heapF[c] ? c1 : c;
    if (heapF[child] >= f) break;
    heapNode[i] = heapNode[child];
    heapF[i] = heapF[child];
    heapPos[heapNode[i]] = i;
    i = child;
  }
  heapNode[i] = node;
  heapF[i] = f;
  heapPos[node] = i;
}

function heapPush(node: number, f: number) {
  heapSize++;
  heapNode[heapSize] = node;
  heapF[heapSize] = f;
  heapPos[node] = heapSize;
  heapSiftUp(heapSize);
}

function heapPop(): number {
  const top = heapNode[1];
  heapPos[top] = 0;
  if (heapSize > 1) {
    heapNode[1] = heapNode[heapSize];
    heapF[1] = heapF[heapSize];
    heapPos[heapNode[1]] = 1;
  }
  heapSize--;
  if (heapSize > 1) heapSiftDown(1);
  else if (heapSize === 1) heapPos[heapNode[1]] = 1;
  return top;
}

/** Yol geri kurulumu için geçici indeksler. */
const pathNodes = new Int32Array(N);
/** `resolveBlocked` BFS kuyruğu. */
const bfsQueue = new Int32Array(N);
const bfsSeen = new Int32Array(N);
let bfsGen = 0;

/* ── helpers ────────────────────────────────────────────────── */

function toGridCol(wx: number) {
  return Math.max(0, Math.min(COLS - 1, Math.round(wx / CELL)));
}

function toGridRow(wy: number) {
  return Math.max(0, Math.min(ROWS - 1, Math.round(wy / CELL)));
}

function toWorldX(c: number) {
  return c * CELL + CELL / 2;
}

function toWorldY(r: number) {
  return r * CELL + CELL / 2;
}

/** 4-directional neighbours only — no diagonal movement. */
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Octile distance — eski sürümle aynı heuristic (yol şekilleri değişmesin). */
function heuristic(c: number, r: number, gc: number, gr: number): number {
  const dx = Math.abs(c - gc);
  const dy = Math.abs(r - gr);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * Engelli bir hücre verilirse en yakın yürünebilir hücreyi bulur (BFS).
 * Düğüm indeksi ya da -1 döner.
 */
function resolveBlocked(c0: number, r0: number): number {
  const start = r0 * COLS + c0;
  if (walkable[start]) return start;

  bfsGen++;
  let head = 0;
  let tail = 0;
  bfsQueue[tail++] = start;
  bfsSeen[start] = bfsGen;

  while (head < tail) {
    const cur = bfsQueue[head++];
    const cc = cur % COLS;
    const rr = (cur / COLS) | 0;
    for (let d = 0; d < 4; d++) {
      const nc = cc + DIRS[d][0];
      const nr = rr + DIRS[d][1];
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const nk = nr * COLS + nc;
      if (bfsSeen[nk] === bfsGen) continue;
      bfsSeen[nk] = bfsGen;
      if (walkable[nk]) return nk;
      bfsQueue[tail++] = nk;
    }
  }
  return -1; // truly unreachable
}

/**
 * Find a path from world-start to world-goal.
 * Returns world-coordinate waypoints (including start & goal) or
 * an empty array if unreachable.
 *
 * Dönen noktalar TAZE nesnelerdir: çağıran taraf saklayabilir
 * (ör. `targetRef.current = path[last]`) — sonraki arama onları bozmaz.
 */
export function findPath(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): { x: number; y: number }[] {
  const startNode = resolveBlocked(toGridCol(sx), toGridRow(sy));
  const goalNode = resolveBlocked(toGridCol(gx), toGridRow(gy));

  if (startNode < 0 || goalNode < 0) return [];
  if (startNode === goalNode)
    return [
      {
        x: toWorldX(startNode % COLS),
        y: toWorldY((startNode / COLS) | 0),
      },
    ];

  // Yeni arama: nesil damgasını artırmak tüm tamponları "boş" yapar — doldurma
  // maliyeti yok.
  gen++;
  heapSize = 0;

  const gc = goalNode % COLS;
  const gr = (goalNode / COLS) | 0;

  seen[startNode] = gen;
  parent[startNode] = -1;
  gScore[startNode] = 0;
  const h0 = heuristic(startNode % COLS, (startNode / COLS) | 0, gc, gr);
  heapPush(startNode, h0);

  let found = false;

  while (heapSize > 0) {
    const current = heapPop();
    if (current === goalNode) {
      found = true;
      break;
    }
    closed[current] = gen;

    const cc = current % COLS;
    const cr = (current / COLS) | 0;
    const cg = gScore[current] + 1;

    for (let d = 0; d < 4; d++) {
      const nc = cc + DIRS[d][0];
      const nr = cr + DIRS[d][1];
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const nk = nr * COLS + nc;
      if (!walkable[nk]) continue;
      if (closed[nk] === gen) continue;
      if (seen[nk] === gen && cg >= gScore[nk]) continue;

      const f = cg + heuristic(nc, nr, gc, gr);
      gScore[nk] = cg;
      parent[nk] = current;
      if (seen[nk] === gen) {
        // Zaten açık listede → anahtarı küçült (O(log n)).
        const at = heapPos[nk];
        heapF[at] = f;
        heapSiftUp(at);
      } else {
        seen[nk] = gen;
        heapPush(nk, f);
      }
    }
  }

  if (!found) return [];

  // Geri kurulum (indeks dizisinde, ayırma yok).
  let count = 0;
  for (let node = goalNode; node >= 0; node = parent[node]) {
    pathNodes[count++] = node;
    if (node === startNode) break;
  }

  const path: { x: number; y: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const node = pathNodes[i];
    path.push({ x: toWorldX(node % COLS), y: toWorldY((node / COLS) | 0) });
  }

  return smoothPath(path);
}

/* ── path smoothing ─────────────────────────────────────────── */

/**
 * Remove collinear waypoints so the character walks in
 * straight lines instead of zig-zagging cell-by-cell.
 */
function smoothPath(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length <= 2) return pts;

  const result: { x: number; y: number }[] = [pts[0]];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = result[result.length - 1];
    const next = pts[i + 1];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dx2 = pts[i].x - prev.x;
    const dy2 = pts[i].y - prev.y;

    // If the point is collinear (or very close), skip it.
    if (Math.abs(dx * dy2 - dy * dx2) > 0.5) {
      result.push(pts[i]);
    }
  }

  result.push(pts[pts.length - 1]);
  return result;
}
