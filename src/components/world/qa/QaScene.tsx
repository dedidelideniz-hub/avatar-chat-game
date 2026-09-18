// 🤖 QaScene — otomatik QA katmanının SAHNE içi yarısı.
//
// Üç işi var, hiçbiri oyun mantığına dokunmaz (hasar/cooldown/ağ yok):
//
//   1) AUTO-PATROL TEST BOTU — haritanın koridor + orman noktalarında sürekli
//      gezen, görünür ve dövüşmeyen bir test karakteri. Dövüşçülerle AYNI
//      fizikten geçer (MovementComponent.moveOnGround → kapsül kayması +
//      görünmez düz taban collider'ı), yani yürüyüş alanını gerçekten test eder.
//      Yolu kesilirse nokta "görünmez engel" olarak koordinatıyla loglanır ve
//      bot en yakın açık noktaya alınıp devam eder.
//
//   2) SAHNE TEŞHİSİ — tüm mesh'ler KADEMELİ olarak (kare başına birkaç mesh,
//      mobilde takılma olmasın) taranır: dokusu eksik/okunamayan, beyaz kalmış
//      (kaplama yok), mor (klasik eksik doku rengi) veya simsiyah modeller
//      koordinatlarıyla raporlanır. Yüksek poligonlu objeler ayrı listede.
//      Efekt havuzları (MeshBasicMaterial) kasten taranmaz: onlar zaten
//      dokusuz düz renkli ışıklardır ve gerçek bir bulgu değildir. Dövüşçü
//      rig'i (GLB gövde + zırh kemikleri + prosedürel yedek + kendi efektleri)
//      `userData.qaIgnore` ile işaretlidir ve taranmaz: skinned mesh'lerin
//      bounding box'ı bind-pose'dur, dünya konumu da karakteri takip eder →
//      "harita sınırının dışında" / "siyah yüzey" gibi onlarca yanlış bulgu
//      üretiyordu.
//
//   3) PERFORMANS — FPS sürekli ölçülür ve harita 6×5 bölgeye ayrılarak her
//      bölgenin ortalaması/minimumu tutulur ("FPS düşen yer" raporu). Ayrıca
//      çizim çağrısı/üçgen/geometri/doku sayıları panelde canlı görünür.
import { useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { BattleFighter } from "@/components/world/Arena3D";
import {
  collisionDiagnostics,
  DIAG_MIN_OBSTACLE_H,
  findNearestWalkablePosition,
  hitsRockCollision,
} from "@/components/world/BattleMapModel";
import {
  ARENA_H,
  ARENA_W,
  moveOnGround,
  type GroundConfig,
} from "@/components/world/arena/MovementComponent";
import { S } from "@/components/world/arena/shared";
import { qa, qaLog, qaScanTrigger } from "./qaStore";

/** Test botunun gövde yarıçapı — dövüşçülerle aynı (px). */
const BOT_R = 22;
/** Gezi hızı (px/s) — dövüşçü yürüyüşüne yakın. */
const BOT_SPEED = 300;
/** Test botunun takip ettiği rota (px). Kırmızı üs → koridor → mavi üs +
 *  orman/nehir çevresi: hem lane hem yan arazi yürünebilirliği denenir. */
const PATROL: [number, number][] = [
  [420, 130],
  [560, 250],
  [700, 380],
  [860, 520],
  [1020, 660],
  [1180, 820],
  [1300, 980],
  [1180, 1000],
  [980, 880],
  [820, 720],
  [660, 620],
  [520, 760],
  [620, 900],
  [820, 1010],
  [1000, 500],
  [980, 280],
  [700, 200],
];

/** FPS bölge ızgarası (harita bölgeleri). */
const SPOT_COLS = 6;
const SPOT_ROWS = 5;
const SPOT_W = ARENA_W / SPOT_COLS;
const SPOT_H = ARENA_H / SPOT_ROWS;

/** Tarama: kare başına işlenen mesh sayısı (mobilde takılma olmasın). */
const SCAN_PER_FRAME = 40;
/** Üçgen sayısı bunun üstündeki mesh'lerde sınır kontrolü atlanır (arazi
 *  parçalarının bbox'ını hesaplamak mobilde pahalıdır). */
const BOUNDS_TRI_LIMIT = 40_000;
/** Görünür bir mesh haritanın bu kadar dışına taşarsa raporlanır (birim). */
const BOUNDS_MARGIN = 2;

const blocked = (x: number, y: number, r: number) => hitsRockCollision(x, y, r);

/**
 * ENGEL TEŞHİSİ.
 *
 * "Haritadaki taşlar engel mi?" sorusunu sayıyla yanıtlar: ızgarada kaç engel
 * hücre var, kaç mesh engel sayıldı ve — asıl kanıt — o mesh'lerin MERKEZİNDE
 * duran bir dövüşçü gerçekten engelleniyor mu (`probe`). Oran 1'in altındaysa o
 * mesh'ler görselde duruyor ama fizikte yok demektir (yanlış pozitif değil,
 * gerçek bulgu).
 */
function logCollisionDiag(): void {
  const d = collisionDiagnostics();
  if (!d) {
    qaLog(
      "info",
      "COLLISION",
      "engel ızgarası henüz kurulmadı (harita yükleniyor)",
    );
    return;
  }
  const ratio = d.probes > 0 ? d.blockedProbes / d.probes : 0;
  qaLog(
    ratio >= 0.6 ? "info" : "warn",
    "COLLISION",
    `ızgara ${d.cols}×${d.rows}: ${d.blocked} engel hücre / ${d.walkable} yürünebilir | ` +
      `${d.obstacleMeshes} engel mesh | merkez probe ${d.blockedProbes}/${d.probes} blokeli | ` +
      `${d.restored} kaya hücresi erozyondan kurtarıldı`,
  );
  // Yükseklik kapısının altındaki prop'lar engel SAYILMAZ (yerde yatan yama,
  // piknik taşı) — geçirgen olmaları normaldir, ayrı sayılır.
  if (d.expectedPass > 0) {
    qaLog(
      "info",
      "COLLISION",
      `${d.expectedPass} prop yükseklik kapısının altında (< ${DIAG_MIN_OBSTACLE_H.toFixed(2)} birim) — ` +
        `engel değil, üzerinden geçilir (tasarım gereği) | ${d.obstacleMeshes - d.expectedPass} prop engel olmalı`,
    );
  }
  // Gerçek bulgu: engel sayılmalı ama merkezinde karakter durmuyor. Ad +
  // konum verilir ki haritada doğrudan o noktaya bakılabilsin.
  for (const m of d.misses) {
    qaLog(
      "warn",
      "COLLISION",
      `engel sayıldı ama geçilir: ${m.label} @ (${Math.round(m.x * S)}, ${Math.round(m.z * S)})px ` +
        `· yükseklik ${m.h.toFixed(2)} birim`,
    );
  }
}

/**
 * Bulgu etiketi. Harita GLB'sinde çoğu yaprak mesh adsızdır ("(isimsiz)") ve
 * rapor bu yüzden hangi objeden bahsedildiğini söyleyemiyordu. İsmin yanına
 * üst zincir eklenir: `(isimsiz) ← Group_3/PGD_M_20BaseRedPart_01` gibi.
 * Etiket deterministik olduğu için `qaLog` yine aynı bulguyu tek satırda toplar.
 */
function meshLabel(mesh: THREE.Mesh): string {
  const name = mesh.name || "(isimsiz)";
  const trail: string[] = [];
  for (let p = mesh.parent, i = 0; p && i < 2; p = p.parent, i++) {
    trail.push(p.name || "(isimsiz)");
  }
  return trail.length ? `${name} ← ${trail.join("/")}` : name;
}

interface ScanState {
  queue: THREE.Mesh[];
  index: number;
  heavy: { name: string; tris: number; x: number; y: number }[];
  found: number;
}

/**
 * Sahne teşhis katmanı. `player` verilirse FPS bölgeleri oyuncunun bulunduğu
 * yere göre işaretlenir (oyuncunun gerçekten hissettiği performans).
 */
export function QaScene({
  player,
}: {
  player: MutableRefObject<BattleFighter>;
}) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const botGroup = useRef<THREE.Group>(null);
  const botBody = useRef<THREE.Mesh>(null);
  const botRing = useRef<THREE.Mesh>(null);
  const botBeam = useRef<THREE.Mesh>(null);

  // Gezen test botunun simülasyon durumu (dövüşçü DEĞİL: hasar/ağ yok).
  const bot = useRef({
    x: PATROL[0][0],
    y: PATROL[0][1],
    facing: 1,
    vy: 0,
    moving: false,
    phase: 0,
    wp: 1,
    stuck: 0,
    fails: new Set<number>(),
  });
  const scan = useRef<ScanState>({
    queue: [],
    index: 0,
    heavy: [],
    found: 0,
  });
  const clockRef = useRef({
    fps: 0,
    tick: 0,
    avg: 0,
    avgN: 0,
    // Geçen karenin GERÇEK çizim toplamları (bkz. autoReset notu).
    calls: 0,
    tris: 0,
    geos: 0,
    texs: 0,
  });
  const lastScanTrigger = useRef(0);
  // Gövde ölçümü teşhisi bir kez panele yazılır (bkz. kare döngüsü).
  const bodyLogged = useRef(false);

  const cfg = useMemo<GroundConfig>(() => ({ radius: BOT_R, blocked }), []);

  /* ------------------------- başlangıç logları -------------------------- */
  useEffect(() => {
    qaLog(
      "info",
      "BOT",
      `test botu ${PATROL.length} noktalı rotada başlatıldı (hareket = dövüşçü fiziği)`,
      PATROL[0][0],
      PATROL[0][1],
    );
    qaLog(
      "info",
      "SYS",
      `arena ${ARENA_W}×${ARENA_H}px — yürünebilirlik hitsRockCollision'dan`,
    );
  }, []);

  /* ------------------- çizim istatistikleri (renderer.info) ------------- */
  // EffectComposer bir kareyi BİRDEN FAZLA kez `render()` eder ve
  // `renderer.info` varsayılan `autoReset` ile HER çağrıda sıfırlanır: panel
  // bu yüzden zincirin sonundaki tam ekran quad'ını okuyordu ("1 call /
  // 1 üçgen") ve gerçek çizim yükü hiç görünmüyordu. Sayaç burada kapatılıp
  // QA'nın kendi kare döngüsünde kare başına bir kez sıfırlanır → gölge +
  // sahne + bloom + çıkış pass'lerinin tümü birikir.
  useEffect(() => {
    const info = gl.info;
    const prev = info.autoReset;
    info.autoReset = false;
    return () => {
      info.autoReset = prev;
      info.reset();
    };
  }, [gl]);

  /* ---------------------------- tarama motoru --------------------------- */
  const startScan = () => {
    const list: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // QA'nın kendi görselleri taranmaz.
      if (/^qa-/.test(mesh.name || "")) return;
      // Görünürlük ve dışlama ZİNCİRDE aranır — yalnızca mesh'in kendi
      // bayrağına bakmak yetmiyor:
      //   · Efekt havuzları çoğu zaman GRUP üzerinden gizlenir
      //     (`group.visible = false`) ama çocuk mesh'in kendi `visible`
      //     bayrağı true kalır. Havuzun dibinde, dünyada (0,0)'da bekleyen bu
      //     parçalar (ör. yer yarığı havuzunun koyu taş parçası) haritada
      //     "kaplamasız simsiyah yüzey" gibi raporlanıyordu — oysa sahne onları
      //     hiç çizmiyor.
      //   · Dövüşçü rig'i harita geometrisi DEĞİLDİR (bkz. dosya başı notu):
      //     kemikli gövde/zırh parçaları bind-pose bbox'ı ve karakteri takip eden
      //     dünya konumu yüzünden yanlış "sınır ihlali" üretir, siyah kalan
      //     göz/kaş dokusu da kasıtlıdır. İşaret `Arena3D`'deki rig kökünde.
      for (let p: THREE.Object3D | null = mesh; p; p = p.parent) {
        if (!p.visible) return;
        if (p.userData?.qaIgnore) return;
      }
      list.push(mesh);
    });
    const s = scan.current;
    s.queue = list;
    s.index = 0;
    s.heavy.length = 0;
    s.found = 0;
    qa.scanning = true;
    qaLog("info", "SCAN", `tarama başladı: ${list.length} görünür mesh`);
    // Harita bu noktada kesin yüklü: engel ızgarasını da raporla.
    logCollisionDiag();
  };

  /** Tek karede bir dilim mesh tarar (mobilde takılma olmaması için). */
  const scanSlice = () => {
    const s = scan.current;
    if (s.index >= s.queue.length) return;
    const end = Math.min(s.queue.length, s.index + SCAN_PER_FRAME);
    for (let i = s.index; i < end; i++) {
      const mesh = s.queue[i];
      const geo = mesh.geometry as THREE.BufferGeometry | undefined;
      const name = meshLabel(mesh);
      const wp = new THREE.Vector3();
      mesh.getWorldPosition(wp);
      const px = wp.x * S;
      const py = wp.z * S;
      qa.scanned = i + 1;

      if (!geo) {
        qaLog("error", "GEOMETRY", `${name}: geometri yok`, px, py);
        continue;
      }
      const pos = geo.getAttribute("position");
      const tris = geo.index ? geo.index.count / 3 : pos ? pos.count / 3 : 0;
      if (!pos || tris === 0) {
        qaLog(
          "error",
          "GEOMETRY",
          `${name}: boş/bozuk geometri (0 üçgen)`,
          px,
          py,
        );
        continue;
      }
      s.heavy.push({ name, tris, x: px, y: py });
      s.found += 1;

      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      // Haritaya ait mi? (Efekt katmanları Basic/additive'dir — bkz. sınır testi)
      let litStandard = false;
      for (const entry of materials) {
        const mat = entry as THREE.MeshStandardMaterial | undefined;
        if (!mat) {
          qaLog("error", "MATERIAL", `${name}: materyal yok`, px, py);
          continue;
        }
        const map = mat.map as THREE.Texture | null | undefined;
        if (map) {
          const img = map.image as
            | HTMLImageElement
            | HTMLCanvasElement
            | undefined;
          const broken =
            !img ||
            (img instanceof HTMLImageElement && !img.complete) ||
            (img instanceof HTMLCanvasElement && img.width === 0);
          if (broken) {
            qaLog(
              "error",
              "LOADFAIL",
              `${name}: doku yüklenemedi (${map.name || "isimsiz doku"})`,
              px,
              py,
            );
          }
        }
        // Efekt/ışık mesh'leri (Basic) kasten atlanır: dokusuz düz renk normaldir.
        // (Runtime'da materyal Basic de olabildiği için bu bayrak gerçek
        //  nesneden okunur; tip tarafında MeshStandardMaterial görünür.)
        if (!mat.isMeshStandardMaterial) continue;
        litStandard = true;
        const c = mat.color;
        if (!c) continue;
        const max = Math.max(c.r, c.g, c.b);
        const min = Math.min(c.r, c.g, c.b);
        // "Mor" = kırmızı + MAVİ yüksek, yeşil düşük. Mavi şartı olmadan
        // doygun sıcak ışımalar da yakalanıyordu: Three.js renkleri lineer
        // uzaya çevirdiği için `#ff6a1f` bile (1.00, 0.15, 0.01) oluyor, yani
        // g < 0.25 — dikilitaş rünü ve lavlar "eksik doku" sanılıyordu.
        if (
          !map &&
          mat.emissive &&
          mat.emissive.r > 0.45 &&
          mat.emissive.b > 0.45 &&
          mat.emissive.g < 0.25
        ) {
          qaLog(
            "warn",
            "MAGENTA",
            `${name}: mor/hatalı ışıma (eksik doku?)`,
            px,
            py,
          );
        } else if (!map && c.b > 0.45 && c.r > 0.45 && c.g < 0.25) {
          qaLog(
            "warn",
            "MAGENTA",
            `${name}: mor yüzey (klasik eksik doku rengi)`,
            px,
            py,
          );
        } else if (!map && max > 0.85 && max - min < 0.06) {
          qaLog(
            "warn",
            "TEXTURE",
            `${name}: kaplamasız beyaz yüzey (material.map yok, renk #${c.getHexString()})`,
            px,
            py,
          );
        } else if (!map && max < 0.05) {
          // Renk hex olarak (sRGB) yazılır: koyu deri/kumaş gibi kasıtlı
          // yüzeyler ile gerçekten bozuk (0,0,0) yüzeyler böylece ayrılır.
          qaLog(
            "info",
            "DARK",
            `${name}: dokusuz simsiyah yüzey (renk #${c.getHexString()}, kasıtlı olabilir)`,
            px,
            py,
          );
        }
      }

      // Sınır kontrolü: yalnızca haritaya ait (kaplamalı/standart materyalli)
      // hafif mesh'lerde bbox hesaplanır. Efekt katmanları (nişan çemberi,
      // yetenek şeridi, zemindeki halka: Basic + additive) oyuncuyu takip
      // ettikleri için harita kenarında "sınır ihlali" gibi görünürlerdi.
      if (litStandard && tris <= BOUNDS_TRI_LIMIT) {
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox;
        if (bb && !bb.isEmpty()) {
          // Kutu DÜNYA birimindedir (harita arenaya sığdırılmış), o yüzden
          // sınırlar da birim cinsinden: 34×22 birim.
          const box = bb.clone().applyMatrix4(mesh.matrixWorld);
          if (
            box.min.x < -BOUNDS_MARGIN ||
            box.max.x > ARENA_W / S + BOUNDS_MARGIN ||
            box.min.z < -BOUNDS_MARGIN ||
            box.max.z > ARENA_H / S + BOUNDS_MARGIN
          ) {
            qaLog(
              "info",
              "BOUNDS",
              `${name}: geometri 34×22'lik harita kutusunun dışına taşıyor (elmas yerleşim + çevre arazisi, normal)`,
              px,
              py,
            );
          }
        }
      }
    }
    s.index = end;

    if (s.index >= s.queue.length) {
      s.heavy.sort((a, b) => b.tris - a.tris);
      qa.heavy = s.heavy.slice(0, 6);
      qa.scanning = false;
      qa.scanAt = performance.now();
      const errs = qa.entries.filter((e) => e.level === "error").length;
      const warns = qa.entries.filter((e) => e.level === "warn").length;
      qaLog(
        "info",
        "SCAN",
        `tarama bitti: ${s.found} mesh / ${errs} hata / ${warns} uyarı`,
      );
    }
  };

  /* ------------------------------ kare döngüsü --------------------------- */
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const now = performance.now();
    const c = clockRef.current;

    // ── 0) gövde ölçümü: karakter hangi ölçekle çiziliyor?
    //    Her görünüm (varsayılan / Samuray / Kraliyet Savaşçısı / Şövalye)
    //    aynı gövde boyuna normalize edilir; ölçek hâlâ ufak geliyorsa
    //    `BODY_SCALE_GAIN` (Arena3D) bu satırdaki sayıya göre büyütülür. ──
    const bm = player.current.bodyMetrics;
    if (bm && !bodyLogged.current) {
      bodyLogged.current = true;
      qaLog(
        "info",
        "BODY",
        `${bm.skin ? "tam gövde skini" : "varsayılan görünüm"}: sınır kutusu ` +
          `${bm.boxH.toFixed(2)} | uygulanan ölçek ${bm.scale.toFixed(3)} | ` +
          `dünya gövde yüksekliği ${bm.worldH.toFixed(2)} birim | ` +
          `zemine oturtma ${bm.groundOffset >= 0 ? "+" : ""}${bm.groundOffset.toFixed(2)}`,
      );
    }

    // ── 1) çizim istatistikleri: önce GEÇEN karenin toplamı alınır (bu ana
    //    kadar tüm pass'ler birikmiştir), sonra sayaç bu kare için sıfırlanır.
    //    autoReset kapatıldığı için sıfırlama tek yerden — buradan — yapılır. ──
    const info = gl.info;
    c.calls = info.render.calls;
    c.tris = info.render.triangles;
    c.geos = info.memory.geometries;
    c.texs = info.memory.textures;
    info.reset();

    // ── 2) FPS ölçümü (yumuşatılmış) ──
    const inst = 1 / Math.max(rawDt, 1 / 240);
    c.fps += (inst - c.fps) * 0.12;
    qa.fps = c.fps;

    // ── 3) tarama dilimi ──
    if (qa.scanning) scanSlice();
    if (qaScanTrigger.at !== lastScanTrigger.current) {
      lastScanTrigger.current = qaScanTrigger.at;
      startScan();
    }

    // ── 4) yarım saniyelik ölçümler: bölge FPS, çizim yükü, sınır kontrolü ──
    if (now - c.tick > 500) {
      c.tick = now;
      c.avg += c.fps;
      c.avgN += 1;
      qa.avgFps = c.avg / c.avgN;

      const f = player.current;
      const col = Math.min(
        SPOT_COLS - 1,
        Math.max(0, Math.floor(f.x / SPOT_W)),
      );
      const row = Math.min(
        SPOT_ROWS - 1,
        Math.max(0, Math.floor(f.y / SPOT_H)),
      );
      const id = row * SPOT_COLS + col;
      let spot = qa.spots.find((s) => s.col + s.row * SPOT_COLS === id);
      if (!spot) {
        spot = {
          col,
          row,
          minFps: c.fps,
          sumFps: 0,
          samples: 0,
          x: (col + 0.5) * SPOT_W,
          y: (row + 0.5) * SPOT_H,
        };
        qa.spots.push(spot);
      }
      spot.samples += 1;
      spot.sumFps += c.fps;
      if (c.fps < spot.minFps) spot.minFps = c.fps;
      if (c.fps < qa.worstFps) {
        qa.worstFps = c.fps;
        qa.worstAt = `hücre ${col},${row} @ (${Math.round(spot.x)}px, ${Math.round(spot.y)}px)`;
        qaLog(
          "info",
          "PERF",
          `yeni en düşük FPS ${c.fps.toFixed(1)} (hücre ${col},${row})`,
          spot.x,
          spot.y,
        );
      }

      // Kare döngüsünde toplanan toplamlar: tek pass değil, karenin TÜM
      // çizim zinciri (gölge + sahne + bloom + çıkış).
      qa.drawCalls = c.calls;
      qa.triangles = c.tris;
      qa.geometries = c.geos;
      qa.textures = c.texs;

      // Sınır ihlali: fizik ARENA_W/H içinde tutar; tutmuyorsa gerçek bir hata.
      const outside = (x: number, y: number) =>
        x < 0 || x > ARENA_W || y < 0 || y > ARENA_H;
      if (outside(f.x, f.y)) {
        qaLog("error", "BOUNDS", "oyuncu harita sınırının dışında", f.x, f.y);
      }
      const b = bot.current;
      if (qa.botOn && outside(b.x, b.y)) {
        qaLog(
          "error",
          "BOUNDS",
          "test botu harita sınırının dışında",
          b.x,
          b.y,
        );
      }
    }

    // ── 5) test botu: rota takibi + takılma teşhisi ──
    const b = bot.current;
    const g = botGroup.current;
    if (!qa.botOn) {
      if (g && g.visible) g.visible = false;
      return;
    }
    if (g && !g.visible) g.visible = true;

    const [tx, ty] = PATROL[b.wp];
    const dx = tx - b.x;
    const dy = ty - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 28) {
      b.wp = (b.wp + 1) % PATROL.length;
      if (b.wp === 0) qa.laps += 1;
      b.stuck = 0;
    } else {
      const step = BOT_SPEED * dt;
      const moved = moveOnGround(b, (dx / d) * step, (dy / d) * step, dt, cfg);
      if (moved) {
        b.stuck = 0;
      } else {
        b.stuck += dt;
        if (b.stuck > 0.7) {
          // Yol kesildi: bu bir BULGUDUR (görünmez engel ya da erişilemeyen
          // nokta). Bot en yakın açık noktaya alınıp rotaya devam eder.
          const spot = findNearestWalkablePosition(b.x, b.y, BOT_R);
          if (spot) {
            const alt = Math.hypot(spot[0] - b.x, spot[1] - b.y);
            qaLog(
              alt > 6 ? "warn" : "info",
              "BLOCKED",
              alt > 6
                ? `yol kesildi: (${Math.round(b.x)},${Math.round(b.y)})px engelli, en yakın açık nokta ${Math.round(alt)}px ötede`
                : `yol kesildi: ${Math.round(b.x)},${Math.round(b.y)}px çevresinde geçit yok (hedef ${b.wp}. nokta)`,
              b.x,
              b.y,
            );
            b.x = spot[0];
            b.y = spot[1];
          } else {
            qaLog(
              "error",
              "BLOCKED",
              "çarpışma ızgarası hazır değil — bot bekliyor",
              b.x,
              b.y,
            );
          }
          b.fails.add(b.wp);
          b.wp = (b.wp + 1) % PATROL.length;
          b.stuck = 0;
        }
      }
    }
    qa.botX = b.x;
    qa.botY = b.y;

    // Görsel: gövde + zemin halkası + uzaktan görünen ışın.
    if (g) {
      g.position.set(b.x / S, 0, b.y / S);
      const t = state.clock.elapsedTime;
      if (botBody.current) {
        botBody.current.position.y = 0.34 + 0.03 * Math.sin(t * 3.4);
        botBody.current.rotation.y = t * 1.2;
      }
      if (botRing.current) {
        const k = 1 + 0.12 * Math.sin(t * 2.6);
        botRing.current.scale.set(k, k, 1);
        botRing.current.rotation.z = t * 0.8;
      }
      if (botBeam.current) {
        (botBeam.current.material as THREE.MeshBasicMaterial).opacity =
          0.1 + 0.05 * Math.sin(t * 1.8);
      }
    }
  });

  /* ------------------------------ görseller ----------------------------- */
  return (
    <group ref={botGroup} name="qa-bot">
      {/* uzaktan görünen dikey ışın */}
      <mesh
        ref={botBeam}
        position={[0, 2.2, 0]}
        raycast={() => null}
        name="qa-beam"
      >
        <cylinderGeometry args={[0.06, 0.1, 4.4, 8, 1, true]} />
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* dönen zemin halkası (test botu işareti) */}
      <mesh
        ref={botRing}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.04, 0]}
        raycast={() => null}
        name="qa-ring"
      >
        <ringGeometry args={[0.3, 0.38, 28, 1]} />
        <meshBasicMaterial
          color="#a3e635"
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* gövde: kapsül + tel kafes (QA botu olduğu uzaktan belli olsun) */}
      <mesh ref={botBody} position={[0, 0.34, 0]} name="qa-body">
        <capsuleGeometry args={[0.11, 0.32, 4, 12]} />
        <meshStandardMaterial
          color="#a3e635"
          emissive="#65a30d"
          emissiveIntensity={0.9}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>
      <mesh position={[0, 0.34, 0]} raycast={() => null} name="qa-body-wire">
        <capsuleGeometry args={[0.13, 0.34, 4, 10]} />
        <meshBasicMaterial
          color="#ecfccb"
          wireframe
          transparent
          opacity={0.55}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
