/**
 * 🧯 WEBGL CANVAS EMNİYETİ — bağlamı koru, sökülünce BIRAK, hata olursa
 * yeniden dene.
 *
 * Bu dosya, 3D sahne kuran HER bileşenin paylaştığı üç parçayı toplar:
 *
 *   1. `WebglContextKeeper` — `<Canvas>`ın İÇİNE konur. Renderer kurulduğunda
 *      bağlamı kayıt defterine yazar ve canvas sökülürken bağlamı BIRAKIR.
 *      Bu olmadan `dispose()` bağlamı serbest bırakmaz; oyuncu ekranlar
 *      arasında gezdikçe bağlamlar birikir ve bir noktada
 *      `Error creating WebGL context.` ile oyun çöker.
 *
 *   2. `CanvasGuard` / `CanvasFailureWatch` — kurulum hatasını yakalayıp
 *      sahneyi söken sınırlar. SENKRON hatalar (React hata sınırı) için sınıf
 *      bileşeni, ASENKRON hatalar (`configure()` reddi) için supap aboneliği
 *      gerekir; ikisi ayrı mekanizmadır.
 *
 *   3. `useWebglRetry` — bağlamı kurulamayan sahneyi feda edilebilir bir
 *      bağlam bırakıp YENİDEN dener. Denemeler bitince `exhausted` olur ve
 *      çağıran taraf yedek içerik gösterir (oyun çökmez).
 *
 * NEDEN YENİDEN DENEMEK İŞE YARIYOR: `@react-three/fiber` renderer'ı yalnızca
 * `state.gl` boşken kurar. Kurulum patlarsa `state.gl` boş kalır; canvas
 * yeniden çizildiğinde `configure()` baştan çalışır. `key={attempt}` ile YENİ
 * bir `<canvas>` elementi kullanılır — bağlam açılamamış bir canvas'a ikinci
 * kez `getContext` çağrısı güvenilir değildir.
 */
import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useThree } from "@react-three/fiber";
import {
  CONTEXT_SETTLE_MS,
  cancelScheduledRelease,
  registerCanvasContext,
  releaseExpendableContext,
  reserveContextSlot,
  scheduleCanvasRelease,
  watchCanvasFailures,
  webglPowerPreference,
} from "./webglSupport";

/* ───────────────── 1) BAĞLAMI KORU (Canvas'ın içine) ───────────────── */

export interface WebglContextKeeperProps {
  /** Küçük = yer gerekince ilk feda edilen. Cadde `PROTECTED_PRIORITY`dir. */
  priority?: number;
  /** Renderer GERÇEKTEN kurulduğunda bir kez çağrılır. */
  onCreated?: () => void;
}

/**
 * `<Canvas>`ın çocuğu olarak kullanılır. Sahne kurulamazsa (bağlam hatası)
 * bu bileşen hiç MOUNT OLMAZ — bu yüzden "sahne gerçekten kuruldu mu?"
 * sorusunun en dürüst cevabıdır (`useWebglRetry` bunu bekler).
 */
export function WebglContextKeeper({
  priority = 10,
  onCreated,
}: WebglContextKeeperProps) {
  const gl = useThree((state) => state.gl);
  const createdRef = useRef(onCreated);
  createdRef.current = onCreated;

  useEffect(() => {
    cancelScheduledRelease(gl.domElement); // StrictMode: yeniden kuruldu
    registerCanvasContext(gl, priority);
    createdRef.current?.();
    return () => {
      scheduleCanvasRelease(gl);
    };
  }, [gl, priority]);

  return null;
}

/* ─────────────────── 2) SAHNE SINIRLARI (senkron hata) ─────────────────── */

export interface CanvasGuardProps {
  children: ReactNode;
  onFail?: () => void;
  /**
   * Bağlam HİÇ açılamıyor (cihaz/yuva): 3D sahne KURULMAZ.
   *
   * Ayrı bir geri çağırma olmasının sebebi: bu durumda R3F'ın `configure()`ı
   * hiç çalıştırılmaz — yani ne senkron (hata sınırı) ne asenkron (supap) bir
   * hata OLUŞUR. Çağıran tarafın yedeğe düşmesi gerektiğini bu sinyal söyler.
   * Aksi hâlde boş bir alan kalırdı.
   */
  onUnavailable?: () => void;
  /** Değişince sınır sıfırlanır (yeniden deneme turu). */
  resetKey?: unknown;
}

/**
 * BAĞLAM YUVASI KAPISI — yeni bir `<Canvas>` kurulmadan ÖNCE çalışır.
 *
 * İki iş yapar:
 *   1. Bu cihazda (bu yükle) bağlam AÇILABİLİYOR mu? — `webglPowerPreference()`
 *      bir deneme bağlamı açar ve hemen bırakır. Açılamıyorsa canvas HİÇ
 *      KURULMAZ: R3F'ın asenkron `configure()`ı hiç çalışmadığı için
 *      `Error creating WebGL context` de oluşmaz (bu hata React hata sınırına
 *      uğramadığı için oyunu düşürüyordu).
 *   2. Az önce bir bağlam bırakıldıysa (`webglContextSlotDelay`) yuvanın
 *      oturmasını BEKLER — "bırakma + yeni canvas" aynı anda iki/üç yuva
 *      tutmasın. Rota geçişlerinde (giriş → cadde → oda) hata buradan çıkıyordu.
 *
 * Deneme başarısız olursa feda edilebilir bağlamları bırakıp ARTAN aralıklarla
 * (`maxRounds` kez) tekrar dener; hâlâ olmazsa `unavailable` der ve çağıran
 * yedeğe düşer.
 */
export interface CanvasGateState {
  /** `<Canvas>` kurulabilir (yuva hazır + bağlam açılabiliyor). */
  ready: boolean;
  /** Cihaz/yuva 3D sahneyi kaldıramıyor: çağıran yedek içerik göstermeli. */
  unavailable: boolean;
}

export function useCanvasGate(maxRounds = 4): CanvasGateState {
  const [state, setState] = useState<CanvasGateState>({
    ready: false,
    unavailable: false,
  });

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;

    const open = (round: number) => {
      const power = webglPowerPreference();
      if (!power) {
        if (round < maxRounds) {
          // Yuva DOLU olabilir: az önce bir canvas bırakıldı ve `loseContext`
          // henüz işlenmedi. Feda edilebilir bir sahneyi daha bırakıp artan
          // aralıklarla TEKRAR dene. Tek denemede pes etmek, geçici bir
          // bağlam baskısını kalıcı "3D yok" durumuna çeviriyordu.
          if (round > 0) releaseExpendableContext();
          timer = window.setTimeout(
            () => !cancelled && open(round + 1),
            CONTEXT_SETTLE_MS * (round + 1),
          );
          return;
        }
        if (!cancelled) setState({ ready: false, unavailable: true });
        return;
      }
      // YERLEŞİM KUYRUĞU: denemenin yuvası + bekleyen bırakmalar otursun,
      // ayrıca AYNI ANDA kurulmak isteyen diğer sahneler sıraya girsin
      // (`reserveContextSlot`) — bağlam istekleri tırmanmasın, teker teker
      // açılsın (mobildeki toplu redlerin kaynağı buydu).
      const wait = reserveContextSlot();
      timer = window.setTimeout(() => {
        if (!cancelled) setState({ ready: true, unavailable: false });
      }, wait);
    };

    open(0);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [maxRounds]);

  return state;
}

/** Yalnızca SENKRON sahne hatalarını yakalayan sınır (React sınıfı). */
class CanvasErrorBoundary extends Component<
  CanvasGuardProps,
  { failed: boolean; key: unknown }
> {
  state = { failed: false, key: undefined as unknown };

  static getDerivedStateFromProps(
    props: CanvasGuardProps,
    state: { failed: boolean; key: unknown },
  ) {
    if (props.resetKey !== undefined && props.resetKey !== state.key) {
      return { failed: false, key: props.resetKey };
    }
    return null;
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[webgl sahnesi] 3D sahne kurulamadı:", error);
    this.props.onFail?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * 3D sahnelerin ORTAK kabı: önce bağlam kapısı (`useCanvasGate`), sonra
 * senkron hata sınırı. Kapı geçilmeden `children` (yani `<Canvas>`) hiç
 * kurulmaz.
 */
export function CanvasGuard({
  children,
  onFail,
  onUnavailable,
  resetKey,
}: CanvasGuardProps) {
  const gate = useCanvasGate();

  useEffect(() => {
    if (gate.unavailable) onUnavailable?.();
  }, [gate.unavailable, onUnavailable]);

  if (!gate.ready) return null;
  return (
    <CanvasErrorBoundary resetKey={resetKey} onFail={onFail}>
      {children}
    </CanvasErrorBoundary>
  );
}

/**
 * Sahne kurulumu ASENKRON olduğu için (`configure()`) renderer hatası React
 * hata sınırına düşmez; bu bileşen supaba abone olur ve `onFail`i bağlar.
 * `false` döndürürse supap bu hatayı kendi canvas'ı saymaz.
 */
export function CanvasFailureWatch({
  onFail,
}: {
  onFail: () => void | boolean;
}) {
  useEffect(
    () =>
      watchCanvasFailures(() => {
        onFail();
      }),
    [onFail],
  );
  return null;
}

/* ─────────────────── 3) YENİDEN DENEME (ortak kanca) ─────────────────── */

export interface WebglRetry {
  /** `<Canvas key={attempt}>` — her deneme TAZE bir canvas elementidir. */
  attempt: number;
  /** Denemeler tükendi: çağıran taraf yedek içerik göstermeli. */
  exhausted: boolean;
  /** `WebglContextKeeper`e verilir. */
  handleCreated: () => void;
}

/**
 * Bağlamı kurulamayan sahneyi yeniden dener.
 *
 * Akış: asenkron hata gelir → bu canvas HENÜZ kurulmadıysa (`handleCreated`
 * çağrılmadıysa) feda edilebilir bir bağlam bırakılır (yer açılır) ve deneme
 * sayacı artar → `<Canvas key={attempt}>` yeni elementle yeniden kurulur.
 * `maxAttempts` sonunda `exhausted` döner; oyun çökmez, yedek içerik kalır.
 *
 * Sahne SAĞLIKLI olduğunda abonelik hâlâ açıktır ama başka bir canvas'ın
 * hatası bu sahneyi etkilemez (`handleCreated` çağrıldığı için yok sayılır).
 *
 * ABONELİK NEDEN `useLayoutEffect` (useEffect DEĞİL): hatanın kendisi canvas'ın
 * LAYOUT etkisinde doğar (`configure()`), reddin "unhandled rejection" olarak
 * bildirilmesi ise aynı görevin sonunda olur. `useEffect` (passive) aboneliği
 * bir mikro göreve ertelendiği için bu bildirimle YARIŞABİLİYOR; aboneliği
 * layout etkisine almak supabın HER ZAMAN önce kurulmasını sağlar — bağlam
 * hatası yüzünden "hiç dinleyici yokken" sayfa düşmez.
 */
export function useWebglRetry(maxAttempts = 2): WebglRetry {
  const [attempt, setAttempt] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const createdRef = useRef(false);
  const attemptRef = useRef(0);
  // Bekleyen yeniden deneme zamanlayıcısı (aşağıdaki gecikme açıklaması).
  const retryTimer = useRef<number | null>(null);

  useEffect(() => {
    attemptRef.current = attempt;
  }, [attempt]);

  // Sökülürken bekleyen denemeyi iptal et (sökülmüş sahne için state yazma).
  useEffect(
    () => () => {
      if (retryTimer.current !== null) {
        window.clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    },
    [],
  );

  const handleCreated = useCallback(() => {
    createdRef.current = true;
  }, []);

  useLayoutEffect(
    () =>
      watchCanvasFailures(() => {
        if (createdRef.current) return; // bizim canvas değil
        if (attemptRef.current >= maxAttempts) {
          setExhausted(true);
          return;
        }
        if (retryTimer.current !== null) return; // bir deneme zaten sırada
        releaseExpendableContext(); // yer aç (önizleme/yedek canvas'lar feda)
        // `forceContextLoss()` ASENKRONdur: yuva bir sonraki göreve kadar
        // boşalmaz. Hemen yeni canvas açmak aynı dolu bütçeyle yine başarısız
        // olur ve denemeler boşa gider. Kısa bir bekleme, bırakmanın
        // gerçekleşmesine izin verir; böylece yeniden deneme işe yarar.
        retryTimer.current = window.setTimeout(() => {
          retryTimer.current = null;
          setAttempt((n) => n + 1);
        }, 220);
      }),
    [maxAttempts],
  );

  return { attempt, exhausted, handleCreated };
}
