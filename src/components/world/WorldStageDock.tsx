/**
 * 🐞 3D İZOLASYON PANELİ (uygulama içi).
 *
 * NEDEN VAR: APK'da ne URL parametresi eklenebilir ne konsol açılabilir.
 * Çökme tam olarak "Cadde verileri alınıyor" ekranında olduğu için test
 * aşamasını seçebilecek tek yer UYGULAMANIN KENDİSİDİR:
 *
 *   🐞 → aşama 1 (3D YOK) → çöküyor mu? → aşama 2 (boş canvas) → ...
 *
 * Seçim `localStorage`a yazılır ve sayfa yenilenir; çökme olursa seçim
 * korunur (uygulama aynı aşamada yeniden açılır) ve panel bir önceki
 * oturumun SON ADIMINI gösterir — yani "hangi aşamada, kaç ms sonra öldü"
 * bilgisi kaybolmaz.
 *
 * Panel yalnızca teşhis etkin olduğunda çizilir (izolasyon aşaması, `?worldDebug`,
 * `vaelos:worldDebug=1` ya da APK/WebView kabuğu — bkz. `worldDebug`).
 */
import { useCallback, useMemo, useState } from "react";
import {
  WORLD_STAGES,
  clearDiagnostics,
  crashCount,
  describeTrace,
  diagnosticsReport,
  noStreetAssetsEnabled,
  runtimeDiagnostics,
  setNoStreetAssets,
  setStageAssets,
  setStageDpr,
  setWorldStage,
  stageAssetOverride,
  stageDpr,
  stageInfo,
  stageSource,
  worldStage,
  type StageAssetId,
} from "@/engine/worldDebug";

/** "Tek tek model" seçici (madde 7): kümülatif aşamalar + aradaki kombinasyonlar. */
const ASSET_CHOICES: ReadonlyArray<{ id: StageAssetId; label: string }> = [
  { id: "ground", label: "zemin" },
  { id: "character", label: "karakter" },
  { id: "tree", label: "ağaç" },
  { id: "grass", label: "çim" },
  { id: "witchShop", label: "cadı" },
  { id: "skin", label: "skin" },
];

export function WorldStageDock() {
  const stage = worldStage();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [dpr, setDpr] = useState<number | "device">(() => stageDpr());
  const [picked, setPicked] = useState<readonly StageAssetId[]>(
    () => stageAssetOverride() ?? [],
  );
  const diag = useMemo(() => (open ? runtimeDiagnostics() : null), [open]);
  const current = useMemo(() => stageInfo(stage), [stage]);

  const copyReport = useCallback(async () => {
    const text = diagnosticsReport();
    try {
      await navigator.clipboard.writeText(text);
      setReport(`${text}\n\n(panoya kopyalandı ✔)`);
      return;
    } catch {
      // WebView'da pano izni olmayabilir: metni seçilebilir şekilde göster.
      setReport(text);
    }
  }, []);

  const chooseDpr = useCallback((value: number | "device") => {
    setStageDpr(value);
    setDpr(value);
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  const toggleAsset = useCallback((id: StageAssetId) => {
    const next = picked.includes(id)
      ? picked.filter((value) => value !== id)
      : [...picked, id];
    setPicked(next);
    setStageAssets(next);
    // Boş canvas (aşama 2) seçiliyse ilk model seçildiğinde aşama 3'e geç:
    // aksi halde seçim hiçbir şey çizmez (sonda yalnızca 2–8'de çalışır).
    if (next.length > 0 && worldStage() < 2) setWorldStage(3, false);
    if (typeof window !== "undefined") window.location.reload();
  }, [picked]);

  const toggleNoStreet = useCallback(() => {
    const on = !noStreetAssetsEnabled();
    setNoStreetAssets(on);
    // Bayrak açıkken sahne BOŞ canvas olmalı: aşama seçimini temizle.
    if (on) setWorldStage(2, false);
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        aria-label="3D izolasyon paneli"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[100000] flex h-9 items-center gap-1 rounded-full border border-white/20 bg-black/60 px-3 text-[11px] font-black text-white shadow-lg backdrop-blur-sm active:scale-95"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        🐞 <span className="tracking-wide">3D</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/60 p-2 backdrop-blur-sm">
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-[#0d1526] p-3 text-white shadow-2xl"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
            🐞 3D İzolasyon Testi
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold active:scale-95"
          >
            Kapat
          </button>
        </div>

        <p className="mt-2 text-[11px] font-semibold leading-4 text-white/60">
          Bir aşama seç → sayfa yenilenir → çökme olursa buraya geri dön ve
          satırın sonucunu not et. Seçim kalıcıdır.
        </p>

        <div className="mt-2 rounded-xl bg-black/40 p-2 text-[10px] font-bold leading-4 text-white/70">
          <div className="text-white/50">izin (önceki oturum):</div>
          <div>{describeTrace()}</div>
          <div className="mt-1 text-white/50">
            açılış #{diag?.boots ?? "?"} · tespit edilen çöküş:{" "}
            {diag?.crashes ?? crashCount()}
          </div>
        </div>

        <div className="mt-3 space-y-1">
          {WORLD_STAGES.map((info) => {
            const active = info.stage === stage;
            return (
              <button
                key={info.stage}
                type="button"
                onClick={() => setWorldStage(info.stage)}
                className={`flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors active:scale-[0.99] ${
                  active
                    ? "border-amber-300/60 bg-amber-300/15"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                    active ? "bg-amber-300 text-[#22160a]" : "bg-white/10"
                  }`}
                >
                  {info.stage}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-black">{info.label}</span>
                  <span className="block text-[10px] font-semibold leading-4 text-white/55">
                    {info.content}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-xl bg-black/40 p-2">
          <div className="text-[10px] font-black uppercase tracking-wide text-white/50">
            Tek tek model (aşama 2–8) — TEST C→D→E→F→G
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ASSET_CHOICES.map((choice) => {
              const on = picked.includes(choice.id);
              return (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => toggleAsset(choice.id)}
                  className={`rounded-lg px-2 py-1.5 text-[11px] font-bold active:scale-95 ${
                    on ? "bg-amber-300 text-[#22160a]" : "bg-white/10 text-white/70"
                  }`}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={toggleNoStreet}
            className={`mt-1.5 w-full rounded-lg px-2 py-1.5 text-[11px] font-black active:scale-95 ${
              noStreetAssetsEnabled()
                ? "bg-rose-400 text-[#22160a]"
                : "bg-white/10 text-white/70"
            }`}
          >
            {noStreetAssetsEnabled()
              ? "DEBUG WORLD açık — tüm sokak GLB'leri atlanıyor"
              : "DEBUG WORLD: tüm sokak GLB'lerini atla (boş canvas)"}
          </button>
        </div>

        <div className="mt-3 rounded-xl bg-black/40 p-2">
          <div className="text-[10px] font-black uppercase tracking-wide text-white/50">
            Piksel oranı (dpr) — boş canvas testi
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {([1, 1.5, "device"] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => chooseDpr(value)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold active:scale-95 ${
                  dpr === value ? "bg-amber-300 text-[#22160a]" : "bg-white/10 text-white/70"
                }`}
              >
                {value === "device" ? `cihaz (${runtimeDiagnostics().dpr}x)` : `${value}x`}
              </button>
            ))}
          </div>
        </div>

        {diag && (
          <div className="mt-3 space-y-0.5 rounded-xl bg-black/40 p-2 text-[10px] font-semibold leading-4 text-white/55">
            <div className="text-white/45">
              şu anki aşama: {current.content} (kaynak: {stageSource()})
            </div>
            <div>ekran: {diag.screen}</div>
            <div>webgl: {diag.webgl}</div>
            <div>bellek: {diag.memory}</div>
            <div>depolama: {diag.storage}</div>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={copyReport}
            className="flex-1 rounded-xl bg-amber-300 px-3 py-2 text-[12px] font-black text-[#22160a] active:scale-95"
          >
            📋 Raporu kopyala
          </button>
          <button
            type="button"
            onClick={() => {
              clearDiagnostics();
              setWorldStage(0, false);
              setOpen(false);
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="rounded-xl bg-white/10 px-3 py-2 text-[12px] font-bold text-white/80 active:scale-95"
          >
            Sıfırla (aşama 0)
          </button>
        </div>

        {report && (
          <textarea
            readOnly
            value={report}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 h-40 w-full resize-none rounded-xl bg-black/60 p-2 text-[10px] font-semibold leading-4 text-white/80"
          />
        )}
      </div>
    </div>
  );
}
