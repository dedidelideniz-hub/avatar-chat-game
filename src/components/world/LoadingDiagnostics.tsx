/**
 * 🔍 YÜKLEME TEŞHİS PANELİ (yükleme ekranının üstünde, mobil öncelikli).
 *
 * NEDEN VAR: mobilde yükleme ekranı ilerlemiyor ve ekranda hata görünmüyor.
 * APK'da konsol yok, tarayıcıda da kullanıcı konsol açmak zorunda kalmasın:
 * bu panel tek dokunuşla (a) hangi adımda sıkıştığını, (b) ana iş parçacığının
 * donup donmadığını, (c) model dosyalarının sunucudan gelip gelmediğini
 * gösterir ve hepsini kopyalanabilir tek rapora çevirir (`engine/loadDiag`).
 *
 * Ayrı bir bayrak GEREKTİRMEZ: yükleme ekranı görünürken her cihazda erişilir.
 * (Diğer teşhis panelleri bayrak/kabuk şartı arar; bu ekran tam da "hiçbir şey
 * çalışmıyor" durumunda gerektiği için koşulsuzdur.)
 */
import { useCallback, useState } from "react";
import {
  MODEL_PROBE_LIST,
  buildLoadReport,
  diagErrors,
  heartbeat,
  mountInfo,
  probeModelUrls,
  type LoadSnapshot,
  type ProbeResult,
} from "@/engine/loadDiag";
import { describeTrace } from "@/engine/worldDebug";

function mib(bytes: number | null): string {
  return bytes === null ? "?" : `${(bytes / 1048576).toFixed(2)} MiB`;
}

export function LoadingDiagnostics({ snapshot }: { snapshot: LoadSnapshot }) {
  const [open, setOpen] = useState(false);
  const [probes, setProbes] = useState<ProbeResult[] | null>(null);
  const [testing, setTesting] = useState(false);

  const runProbe = useCallback(async () => {
    setTesting(true);
    try {
      setProbes(await probeModelUrls(MODEL_PROBE_LIST));
    } finally {
      setTesting(false);
    }
  }, []);

  // ⚠️ Bilinçli olarak memo YOK: panel yalnızca açıkken çizilir ve rapor bir
  // metin kurulumudur (~50 µs). `useMemo` + her tıkta yeni kimlik alan
  // `snapshot` yanıltıcı bir bağımlılık listesi gerektirirdi.
  const report = open
    ? buildLoadReport({ ...snapshot, trace: describeTrace() }, probes)
    : "";

  const copyReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      /* pano izni yok: rapor zaten seçilebilir metin olarak görünüyor */
    }
  }, [report]);

  const beat = heartbeat();
  const mount = mountInfo("World");
  const errors = diagErrors();

  if (!open) {
    return (
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          setOpen(true);
          void runProbe();
        }}
        className="fixed inset-x-0 bottom-3 z-[130] mx-auto flex w-fit items-center gap-2 rounded-full border border-amber-300/50 bg-black/80 px-4 py-2.5 text-[12px] font-black text-amber-200 shadow-xl backdrop-blur active:scale-95"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        🔍 Yükleme teşhisi
        <span className="text-[10px] font-bold text-white/60">%{snapshot.pct.toFixed(0)}</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 p-2 backdrop-blur-sm">
      <div
        className="max-h-[86vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-[#0d1526] p-3 text-white shadow-2xl"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">
            🔍 Yükleme teşhisi
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold active:scale-95"
          >
            Kapat
          </button>
        </div>

        <div className="mt-2 space-y-0.5 rounded-xl bg-black/40 p-2 text-[10px] font-semibold leading-4 text-white/70">
          <div>
            kapı: <b className="text-amber-200">%{snapshot.pct.toFixed(1)}</b> (hedef %
            {snapshot.target.toFixed(0)}) · sahne hazır={String(snapshot.sceneReady)} ·
            zorlandı={String(snapshot.forced)}
          </div>
          <div>
            adım {snapshot.stepIndex}: {snapshot.step} ·{" "}
            {(snapshot.elapsedMs / 1000).toFixed(1)} sn
          </div>
          <div className={beat.maxGap > 1000 ? "text-rose-300" : ""}>
            nabız: son {beat.lastGap} ms · en uzun bloke {beat.maxGap} ms
            {beat.maxGap > 1000 ? " ⚠️ ana iş parçacığı dondu" : ""}
          </div>
          <div className={mount.count > 2 ? "text-rose-300" : ""}>
            World montajı: {mount.count} kez{mount.count > 2 ? " ⚠️ döngü" : ""}
          </div>
          <div>
            sekme: {typeof document === "undefined" ? "?" : document.visibilityState} · ağ:{" "}
            {navigator.onLine ? "çevrimiçi" : "ÇEVRİMDIŞI"}
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => void runProbe()}
            disabled={testing}
            className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-[11px] font-black active:scale-95 disabled:opacity-50"
          >
            {testing ? "Test ediliyor…" : "Model erişimini test et"}
          </button>
          <button
            type="button"
            onClick={() => void copyReport()}
            className="flex-1 rounded-xl bg-amber-300 px-3 py-2 text-[11px] font-black text-[#22160a] active:scale-95"
          >
            📋 Raporu kopyala
          </button>
        </div>

        <div className="mt-2 rounded-xl bg-black/40 p-2 text-[10px] font-semibold leading-4">
          <div className="text-white/45">MODEL ERİŞİM TESTİ (HEAD/Range)</div>
          {probes === null ? (
            <div className="text-white/55">test çalıştırılmadı</div>
          ) : (
            probes.map((probe) => (
              <div
                key={probe.url}
                className={probe.ok ? "text-emerald-300" : "text-rose-300"}
              >
                {probe.ok ? "✔" : "✘"} {probe.url} · {probe.status ?? "ağ hatası"} ·{" "}
                {probe.ms} ms · {mib(probe.bytes)}
                {probe.note ? ` · ${probe.note}` : ""}
              </div>
            ))
          )}
        </div>

        {errors.length > 0 && (
          <div className="mt-2 rounded-xl bg-black/40 p-2 text-[10px] font-semibold leading-4 text-rose-200">
            <div className="text-white/45">YAKALANAN HATALAR</div>
            {errors.slice(-8).map((error, index) => (
              <div key={`${error.at}-${index}`} className="truncate">
                [{error.kind}] +{error.at} ms — {error.detail}
              </div>
            ))}
          </div>
        )}

        <textarea
          readOnly
          value={report}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-2 h-40 w-full resize-none rounded-xl bg-black/60 p-2 text-[10px] font-semibold leading-4 text-white/80"
        />
      </div>
    </div>
  );
}
