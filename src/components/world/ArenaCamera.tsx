// Aspect-aware arena follow camera — Wild Rift style.
//
// The battle-map GLB is fitted as a ROTATED (diamond) island, so a tall
// portrait viewport only ever showed its central lane and the original fixed
// framing (60° vertical FOV, ~57° elevation, 12 units back) looked right
// there. On a landscape viewport that same vertical FOV opens a ~100°
// horizontal cone: the near edge of the arena balloons while the far corner
// collapses to a point, so the map read as a squashed pyramid instead of a
// battlefield. Pulling the camera far back fixed the pyramid but exposed the
// void around the island, which read as a floating diorama.
//
// What this controller guarantees:
//   1. Responsive — the projection is re-derived from the renderer's live
//      size, so a resize or an orientation change can never leave the camera
//      with a stale aspect (that stale aspect IS the "stretched map" bug:
//      world→screen x/y are scaled differently).
//   2. Aspect ratio — `camera.aspect` is always set from the real drawing
//      buffer, so geometry keeps its proportions on every device.
//   3. İzometrik lens — kamera tam MOBA açısında: 46–49° elevation, 44–46°
//      dikey FOV ve oyuncunun hemen üstünde duran YAKIN bir takip konumu
//      (sin(el)·dist ≈ 5.9 / 6.0 birim). Geniş ama yakın lens + izometrik
//      pitch "basık piramit" görüntüsünü bitirir: arazi ve karakterler doğal
//      oranlarında okunur, derinlik kısalması (foreshortening) azalır.
//   4. Atmosphere — the void around the island is closed by a soft night-
//      violet background (0x151a38) plus an environment haze: a FogExp2
//      (0x2b3568) that is gentle in portrait (FOG_DENSITY_P) and dense in
//      landscape (FOG_DENSITY_L), so the horizon melts into haze instead of
//      showing black space. The fill lights are balanced so grass, lane and
//      fighters read clearly WITHOUT flattening the scene: the flat ambient
//      floor is kept low and the directional key light carries the
//      brightness, so real-time shadows (ArenaShadowLight) stay readable and
//      characters/rocks do not look pasted onto the ground.
//   5. Tracking — the camera is a close offset follow (player X/Z plus a
//      small movement lookahead), then clamped to a thin margin inside the
//      arena, so the player always sits near screen center and the map's
//      dark, fogged edge can never dominate the view.
//
// The arena constants below must stay in sync with Arena3D (`S`) and
// BattleMapModel.tsx — they mirror that file's export convention.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
// Kule istemi ("Kuleyi Aktif Et") ekranın köşesinde değil, haritadaki kulenin
// TAM ÜSTÜNDE durur: HUD, kulenin tepe noktasını bu kamerayla piksele çevirir.
import {
  clearTowerScreenProjection,
  setTowerScreenProjection,
} from "@/engine/BattleTowers";

const S = 50; // px per 3D unit — must match Arena3D
const ARENA_W = 34;
const ARENA_D = 22;
const CX = ARENA_W / 2;
const CZ = ARENA_D / 2;

// Portrait (aspect ≤ 0.9) → landscape (aspect ≥ 1.8) blend.
const WIDE_FROM = 0.9;
const WIDE_TO = 1.8;

// Portrait → landscape çerçeveleme. İkisi de aynı izometrik MOBA dilini
// konuşur: 46° / 44° lens, 46–49° pitch ve oyuncunun hemen üstünde duran
// YAKIN takip kamerası.
//
// KAMERA YAKINLAŞTIRILDI (takip mesafesi 17.6 → 7.8 birim): karakter ekranda
// "karınca" gibi kalıyordu — 0.72 birimlik dövüşçü, ~15 birimlik görünen
// yükseklikte ekranın yalnızca ~%3'ünü kaplıyordu. Yeni çerçevede görünen
// yükseklik ≈ 6.6 birim:
//   · dövüşçü ekran yüksekliğinin ~%7'si (eskinin 2.2 KATI — artık net),
//   · 4 birimlik maksimum menzil çemberi ekrana sığıyor (%61),
//   · dövüşün çevresi (lane + yan arazi) kadrajda kalıyor.
// Dünya HUD'u aynı oranda küçültüldü (bkz. arena/shared → HUD), yani can
// barları / hasar yazısı / kimlik halkası ekranda ESKİSİ GİBİ görünür.
const FOV_P = 46; // izometrik MOBA lensi (istenen 45–50° FOV bandı)
const FOV_L = 44; // yatayda aynı aile: basık görüntü oluşmaz
// Dövüşçü gövdesi `Arena3D → BODY_SCALE_GAIN` ile büyüdü (0.72 → 1.48 birim,
// yani 2×) ve artık kadrajı kendisi dolduruyor; bu yüzden takip mesafesi
// ESKİ değerine alındı — harita bağlamı (lane + yan arazi) korunur, karakter
// görünen yüksekliğin ~%22'si olur. 4 birimlik menzil çemberi %61'de kalır.
const DIST_P = 7.8; // görünen yükseklik ≈ 2·7.8·tan23° ≈ 6.6 birim
const DIST_L = 8.3; // yatayda aynı dikey ölçek (FOV 44° ≈ 2·8.3·tan22° ≈ 6.7)
// PITCH YÜKSELTİLDİ (49° / 46° → 56.7° / 55.3°): kamera "çökük" okunuyordu,
// karakter öne doğru yatık duruyor ve ön yüzü fazla görünüyordu. MOBA
// kamerası tepeden daha dik bakar (Wild Rift ~55°); pitch yükselince zemin ve
// karakter üstten okunur, derinlik kısalması azalır. Takip mesafesi ve FOV
// bilinçli olarak korundu: kamera yalnızca daha yukarıdan bakar (dikey
// çerçeveleme aynı kalır, karakter ekranda eskisi kadar büyüktür).
const EL_P = 0.99; // ~56.7° — dikey mod
const EL_L = 0.965; // ~55.3° — yatayda aynı dik izometrik aile
// Harita kenar payı: kamera hedefi bu kadar içeride kalsın. Yakın kamerada
// görünür yarı-yükseklik ≈ 3.3 birim olduğu için pay da yükseltildi —
// böylece harita kenarında ekranın boşluğa taşması engellenir.
const CLAMP_P = 3.0;
// The -90° map runs its lane from the red base (~z 2) to the blue base
// (~z 20) diagonally, so landscape must let the camera follow the player the
// whole way; only a thin margin keeps it from leaving the island outright.
const CLAMP_L = 2.2;
// Lookahead (units the camera leads the fighter) — yakın kamerada liderlik de
// küçültülür, yoksa hızlı koşarken karakter kadrajın dışına itilir.
const LOOK_P = 0.55;
const LOOK_L = 0.8;
// Bakış yüksekliği (göğüs/omuz hizası). Kamera odağı karakterin ayak/bele
// hizasına değil üst gövdesine kilitlenir. Odak, karakter ölçeğiyle AYNI adımı
// izler: dünya boyu 0.60 → 0.72 olduğu için hedef de 0.60 → 0.72 çıktı, yani
// kamera merkezi karakterin hemen üstünde kalmaya devam eder.
const LOOK_Y = 0.78;
// Fog: dense dark haze in landscape so anything at/behind the map edge melts
// into the background instead of reading as "island floating in space".
// Volkanik MOBA paleti: dikey modda da gökyüzü artık gündüz mavisi değil,
// isli mor-kızıl bir ufuk — arenanın lav atmosferiyle bütünleşir.
//
// ATMOSFER SİSİ (canlı palet): sis ve gökyüzü artık haritanın tema rengine
// bağlandı — nötr gri-lacivert yerine DOYGUN indigo-mor bir ufuk. Sisin rengi
// haritanın canlı yeşil/kahve zeminini "kirletmez" (gri bir peçe yerine
// kendiyle uyumlu bir renk perdesi kalır) ve uzak köşelerde zemin ile
// gökyüzü arasında renkli bir derinlik gradyanı oluşur. Yoğunluk yatayda bir
// tık azaltıldı: sisin kapatmadığı mesafede canlı renkler okunur, ufukta ise
// harita hâlâ boşluğa taşmaz.
const SKY = new THREE.Color("#151a38"); // gökyüzü — doygun gece indigosu
const FOG = new THREE.Color("#2b3568"); // ufuk = tema rengine bağlı yumuşak sis
const FOG_DENSITY_P = 0.0095; // FogExp2 yoğunluğu — dikey mod
const FOG_DENSITY_L = 0.0185; // FogExp2 yoğunluğu — yatay mod

// --- YÖNLÜ IŞIK DENGESİ ---
// Ana ışığın eski yönü (12, 16, 8) ışığı arenanın ön-sol köşesinden
// getiriyordu: sahnenin sağ tarafı, üs çevresi ve kulelerin arka yüzleri
// gölgede siyaha yakın kalıyordu. Yeni yön ışığı arenanın köşegeni üzerinden
// yüksekten indirir (≈56°), böylece iki üs ve koridor aynı dolgu düzeyini
// alır. ArenaShadowLight aynı yatay yönü (+14, −10) kullandığı için karakter
// gölgeleri ışıkla tutarlı kalır.
const KEY_LIGHT_DIR: [number, number, number] = [14, 26, -10];
// Karşı dolgu: gölgede kalan yüzleri (kule/kaya gövdesi, karakter arkası)
// tamamen siyaha düşürmemek için karşı köşeden zayıf, soğuk bir ışık gelir.
// `mobaLight` işareti, aşağıdaki ana ışık geçişinin bu dolguyu kendi sıcak
// rengi + yüksek şiddetiyle ezmesini engeller.
const FILL_LIGHT_DIR: [number, number, number] = [-14, 9, 20];
const FILL_LIGHT_COLOR = "#b9d2ff";
// Karşı dolgu da kısıldı: gölgedeki yüzleri kaldırır ama ana ışığın
// kontrastını (ve dolayısıyla rengin doygunluğunu) yıkamaz.
const FILL_LIGHT_INTENSITY = 0.3;

/* --- DERİNLİK KONTRASTI (gölge dengesi) ------------------------------
 * Wild Rift / LoL Mobile referansında karakterin, kayanın ve kulenin ALTINDA
 * net, koyu bir temas gölgesi vardır; zemin ile nesne birbirine yapışık
 * görünmez. Bunun tek koşulu "ışığın bir yönü olması": düz (yönsüz) dolgu
 * ışığı ne kadar yüksekse gölge o kadar silikleşir.
 *
 * Eski denge ambient 1.5 + hemisfer 0.85 idi: her yüz neredeyse aynı
 * parlaklıkta okunuyordu, yani gölge düşse bile görünmezdi. Yeni denge düz
 * dolguyu düşürüp yönlü ana ışığı öne çıkarır; gölgeler (ArenaShadowLight)
 * böylece sahnenin ana "biçim" bilgisi olur.
 * Gölge düşüremeyen cihazlarda (Canvas shadows kapalı: pointer coarse)
 * aynı değerler sahneyi gereksiz karanlığa itmesin diye daha yüksek bir
 * yedek denge kullanılır — mobilde görünüm eskisi gibi kalır.
 */
/* --- CANLI PALET DENGESİ (mat/gri görünümü bitirir) -------------------
 * "Harita ölü, gri-kahve tonlar baskın" şikâyetinin kaynağı düz dolgu
 * ışığıydı: yüksek ambient + hemisfer her yüzü aynı parlaklığa çekiyor,
 * dolayısıyla ÇİM soluk yosun rengine, taş griye dönüyordu (doygunluk
 * yalnızca ışık farkı olduğunda okunur).
 *
 * Yeni denge: düz dolgu iyice geri çekilir, parlaklığı yönlü ana ışık
 * taşır. Böylece renkler kendi doygunluğunda okunur, gölgeler koyulaşır ve
 * gerçek zamanlı temas gölgeleri (ArenaShadowLight) görünür kalır.
 * Ambient AŞIRI düşürülmez: 0'ın altına inildiğinde gölgedeki yüzler
 * tamamen siyaha düşer ve kare "delik" görünür. */
const AMBIENT_SHADOWED = 0.4;
const AMBIENT_FLAT = 1.05;
const HEMI_SHADOWED = 0.32;
const HEMI_FLAT = 0.6;
/* Ana yönlü ışık: gölge varken yükü kendisi üstlenir (düz dolgu kısıldı),
 * gölge yoksa (dokunmatik) parlaklığı yine o taşır. */
const KEY_INTENSITY_SHADOWED = 1.4;
const KEY_INTENSITY_FLAT = 1.35;

/**
 * Follows the player with an aspect-aware framing. Called from the player's
 * fighter rig — i.e. mounted after `<FollowCamera>` inside the Canvas — so its
 * `useFrame` runs later in the frame and its camera placement is the one that
 * is rendered. Pass `null` for rigs that must not drive the camera (the bot).
 */
export function useArenaCamera(
  playerRef: MutableRefObject<{ x: number; y: number }> | null,
) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const target = useRef(new THREE.Vector3(CX, 0.6, CZ));
  const smoothed = useRef(new THREE.Vector3(CX, 0.6, CZ));
  // Smoothed world-space velocity (units/s) used for the lookahead.
  const vel = useRef({ x: 0, z: 0 });
  const prev = useRef({ x: 0, z: 0, ready: false });
  // Reusable fog/background state (no per-frame allocation).
  const fog = useRef<THREE.FogExp2 | null>(null);
  const bg = useRef<THREE.Color | null>(null);

  // --- palet: Arena3D'nin nötr dolgu ışıkları (gündüz beyazı ortam +
  // gökyüzü/zemin hemisferi) volkanik MOBA paletine çekilir. Fog ve arka
  // planı da bu modül yönettiği için arenanın tüm ışık/atmosfer dili tek
  // yerden ayarlanır. WarAtmosphere'in kendi ışıkları `userData.mobaLight`
  // ile işaretlidir ve bu geçişte dokunulmaz.
  //
  // Işık dengesi: düz dolgu (ambient/hemisfer) ARTIK GERİ PLÂNDA — yalnız
  // sahneyi karanlığa boğmasın diye durur; parlaklığı ve biçimi yönlü ana
  // ışık taşır ki gölgeler okunsun (bkz. dosya başı → DERİNLİK KONTRASTI).
  // Gökyüzü tarafı gece moru, hemisferin zemin rengi nötr-sıcak: arazi
  // kahverengi bir peçeyle değil temiz bir dolguyla okunur.
  useEffect(() => {
    // Canvas gölgeleri bu cihazda açık mı? Renderer'ın kendi bayrağı tek
    // doğru kaynaktır (Arena3D `shadows={!coarse}` ile kurar).
    const shadowed = gl.shadowMap.enabled;
    scene.traverse((obj) => {
      const light = obj as THREE.Light;
      if (!light.isLight || light.userData?.mobaLight) return;
      if ((light as THREE.AmbientLight).isAmbientLight) {
        // DÜZ DOLGU (yönsüz ışık): DERİNLİĞİ ÖLDÜREN katman bu. Eski 1.5
        // değeri her yüzü aynı parlaklığa çekiyor, dolayısıyla karakter ile
        // zemin birbirine yapışık ve düz görünüyordu. Gölge çalışan cihazda
        // düşürülür: karanlık artık ambient'ten değil, GERÇEK gölgeden gelir.
        light.intensity = shadowed ? AMBIENT_SHADOWED : AMBIENT_FLAT;
      } else if ((light as THREE.HemisphereLight).isHemisphereLight) {
        const hemi = light as THREE.HemisphereLight;
        // Gökyüzü tarafı gece moru, zemin tarafı nötr-sıcak: arazi kahverengi
        // bir peçeye değil, temiz bir dolguya boyanır. Gölgeli sahnede şiddet
        // kısılır (yönsüz dolgu yine kontrastı yer).
        // Gökyüzü dolgusu temiz mavi, zemin sıçraması ise ÇİM yeşili:
        // eski kahve (0x8d7a63) tonlu zemin dolgusu bütün araziye "kahve
        // peçe" bindiriyordu — çimler bu yüzden yeşil değil, soluk yosun
        // rengi okunuyordu.
        hemi.color.set("#7cb6e6");
        hemi.groundColor.set("#6f7d4c");
        hemi.intensity = shadowed ? HEMI_SHADOWED : HEMI_FLAT;
      } else if ((light as THREE.DirectionalLight).isDirectionalLight) {
        // Arena3D'nin nötr ana ışığı: yumuşak sıcak. Parlaklığın büyük kısmını
        // üstlenir ki her yüz aynı düzeyde aydınlanmasın ve form/gölge okunsun.
        light.color.set("#fff0dc");
        light.intensity = shadowed
          ? KEY_INTENSITY_SHADOWED
          : KEY_INTENSITY_FLAT;
        // IŞIK AÇISI DENGESİ: yönlü ışığın yönü konumundan gelir; eski düşük
        // yan açı sahnenin bir tarafını gölgede bırakıyordu. Yeni yön ışığı
        // arenanın köşegeni üzerinden yükseğe taşır ve ışığı iki üsse de
        // dengeli yayar (hedef arenanın merkezidir).
        light.position.set(...KEY_LIGHT_DIR);
      }
    });

    // Karşı dolgu ışığı: sahne grafiğinde bir kez oluşturulur (React ağacı
    // dışında), unmount'ta temizlenir. Yönlü ışık olduğu için gölge düşürmez,
    // yalnızca gölgede kalan yüzleri kaldırır.
    const fill = new THREE.DirectionalLight(
      FILL_LIGHT_COLOR,
      FILL_LIGHT_INTENSITY,
    );
    fill.userData.mobaLight = true;
    fill.position.set(...FILL_LIGHT_DIR);
    scene.add(fill);
    return () => {
      scene.remove(fill);
      fill.dispose();
    };
  }, [scene, gl]);

  // Orientation changes and window resizes are handled by the renderer's own
  // resize observer, but we also re-assert the projection (and atmosphere)
  // right away so the new aspect is applied on the very next frame instead of
  // after a measure tick (otherwise a rotated phone renders one stale frame).
  useEffect(() => {
    const sync = () => {
      // The canvas' own CSS box is the authoritative size: whatever the
      // renderer ends up with, the projection matches it exactly.
      const el = gl.domElement;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const aspect = w / h;
      if (camera.aspect !== aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    window.visualViewport?.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, [camera, gl]);

  // Kule isteminin izdüşümü için kamera + canvas'ı HUD'a tanıt (bkz.
  // engine/BattleTowers → nearTowerScreenAnchor). Canvas'ın kendi CSS kutusu
  // referanstır: izdüşüm ile HUD aynı kutuyu paylaşır.
  useEffect(() => {
    setTowerScreenProjection(camera, gl.domElement);
    return () => clearTowerScreenProjection(camera);
  }, [camera, gl]);

  useFrame((state, rawDt) => {
    const f = playerRef ? playerRef.current : null;
    if (!f) return;

    // --- responsive projection: never render a stale (stretched) aspect ---
    // `state.size` is R3F's live measured size (updates on resize and on
    // orientation change), so the projection always matches the canvas.
    const aspect = state.size.width / Math.max(1, state.size.height);
    if (Number.isFinite(aspect) && aspect > 0) {
      const wideF = THREE.MathUtils.clamp(
        (aspect - WIDE_FROM) / (WIDE_TO - WIDE_FROM),
        0,
        1,
      );
      const fov = THREE.MathUtils.lerp(FOV_P, FOV_L, wideF);
      if (
        Math.abs(camera.aspect - aspect) > 1e-4 ||
        Math.abs(camera.fov - fov) > 1e-4
      ) {
        camera.aspect = aspect;
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    const wide = THREE.MathUtils.clamp(
      (aspect - WIDE_FROM) / (WIDE_TO - WIDE_FROM),
      0,
      1,
    );
    const el = THREE.MathUtils.lerp(EL_P, EL_L, wide);
    const dist = THREE.MathUtils.lerp(DIST_P, DIST_L, wide);
    const clamp = THREE.MathUtils.lerp(CLAMP_P, CLAMP_L, wide);
    const look = THREE.MathUtils.lerp(LOOK_P, LOOK_L, wide);
    const smoothK = THREE.MathUtils.lerp(5, 7, wide);

    // --- atmosphere: arka plan artık zifiri siyah değil — gece moru bir
    // gökyüzü (0x1a1a2e) ve yumuşak bir çevre sisi var. Sis dikey modda
    // hafif (FOG_DENSITY_P), yatayda belirgin (FOG_DENSITY_L); arka plan da
    // gökyüzü renginden sis rengine yumuşakça geçer, böylece ufukta "harita
    // bitiyor" hissi yerine pus içinde eriyen bir manzara okunur.
    if (!fog.current) {
      fog.current = new THREE.FogExp2(FOG.getHex(), 0);
      scene.fog = fog.current;
    }
    fog.current.density = THREE.MathUtils.lerp(
      FOG_DENSITY_P,
      FOG_DENSITY_L,
      wide,
    );
    if (scene.background instanceof THREE.Color) {
      bg.current = scene.background;
    } else if (!bg.current) {
      bg.current = new THREE.Color(SKY);
      scene.background = bg.current;
    }
    bg.current.lerpColors(SKY, FOG, wide);

    // --- delta-time based (frame rate independent) ---
    const dt = Math.min(rawDt, 1 / 20);
    const px = f.x / S;
    const pz = f.y / S;
    if (prev.current.ready) {
      const k = 1 - Math.exp(-dt * 6);
      vel.current.x += ((px - prev.current.x) / dt - vel.current.x) * k;
      vel.current.z += ((pz - prev.current.z) / dt - vel.current.z) * k;
    } else {
      prev.current.ready = true;
    }
    prev.current.x = px;
    prev.current.z = pz;

    // Lead the camera by an amount proportional to the current speed, capped
    // so a dash does not yank the view and a stand-still does not drift.
    const speed = Math.hypot(vel.current.x, vel.current.z);
    const lead = speed > 0.05 ? Math.min(look, speed * 0.25) : 0;
    const lx = speed > 0.05 ? (vel.current.x / speed) * lead : 0;
    const lz = speed > 0.05 ? (vel.current.z / speed) * lead : 0;

    // Tight lookAt binding: the target sits on the player's X/Z (plus the
    // lookahead), nudged toward the lane center only in portrait. In
    // landscape the camera centers exactly on the player, then both are
    // clamped so the visible ground always stays over the map.
    const centerNudge = (CZ - pz) * 0.22 * (1 - wide);
    target.current.set(
      THREE.MathUtils.clamp(px + lx, clamp, ARENA_W - clamp),
      LOOK_Y,
      THREE.MathUtils.clamp(pz + centerNudge + lz, clamp, ARENA_D - clamp),
    );
    smoothed.current.lerp(target.current, Math.min(1, dt * smoothK));
    camera.position.set(
      smoothed.current.x,
      smoothed.current.y + Math.sin(el) * dist,
      smoothed.current.z + Math.cos(el) * dist,
    );
    camera.lookAt(smoothed.current.x, LOOK_Y, smoothed.current.z);
  });
}
