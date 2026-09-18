// 📋 QaPanel — mobil için OYUN İÇİ QA paneli.
//
// Sahne katmanı (QaScene) bulguları `qaStore`'a yazar; bu panel 600 ms'de bir
// okuyup gösterir. Böylece teşhis ölçümleri oyunun render döngüsünü hiç
// yavaşlatmaz (React yeniden çizimi yalnızca panel açıkken olur).
//
// Sağ kenarda küçük bir "QA" düğmesi durur (joystick ve yetenek butonlarının
// dışında, güvenli alan içinde). Dokununca tam ekran, yarı saydam bir panel
// açılır: sekmeler (Bulgular / Performans), canlı FPS + çizim yükü, test botu
// düğmesi, "Tara" ve "Kopyala" (logları başka bir yere yapıştırmak için).
import { useEffect, useRef, useState } from "react";
import {
  qa,
  qaClear,
  qaReport,
  qaRequestScan,
  qaSetBot,
  type QaLevel,
} from "./qaStore";

/** Seviye renkleri (karanlık zeminde okunur tonlar). */
const LEVEL_STYLE: Record<QaLevel, string> = {
  error: "text-rose-300 border-rose-400/40 bg-rose-500/10",
  warn: "text-amber-200 border-amber-300/40 bg-amber-400/10",
  info: "text-sky-200 border-sky-300/30 bg-sky-400/10",
};

function fmtCoord(x: number, y: number): string {
  if (x < 0 || y < 0) return "—";
  return `${Math.round(x)},${Math.round(y)}px · ${(x / 50).toFixed(1)},${(y / 50).toFixed(1)}`;
}

export function QaPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"findings" | "perf">("findings");
  const [rev, setRev] = useState(0);
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Panel açıkken 600 ms'de bir tazele (kapalıyken hiç çizim yok).
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setRev((v) => v + 1), 600);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const errors = qa.entries.filter((e) => e.level === "error").length;
  const warns = qa.entries.filter((e) => e.level === "warn").length;
  const badge = errors + warns;
  void rev; // yenileme sinyali

  const copy = async () => {
    const text = qaReport();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Pano izni yoksa (bazı WebView'ler): seçilebilir alana yaz.
      setCopied(true);
      window.prompt("QA raporu (kopyala):", text);
    }
  };

  const spots = [...qa.spots].sort(
    (a, b) => a.sumFps / a.samples - b.sumFps / b.samples,
  );

  return (
    <>
      {/* ── yüzen buton: her zaman görünür, dokunma alanı 44px ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="battle-hud-qa pointer-events-auto absolute right-2 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-0.5 rounded-l-xl rounded-r-md border border-lime-300/40 bg-slate-950/55 px-2 py-2 text-[10px] font-bold tracking-wider text-lime-200 backdrop-blur-[3px] active:bg-slate-900/80"
        style={{
          marginRight: "env(safe-area-inset-right, 0px)",
          opacity: 0.55,
        }}
        aria-label="QA teşhis paneli"
      >
        <span className="text-[13px] leading-none">QA</span>
        <span
          className={`rounded-full px-1 text-[9px] leading-tight ${
            errors > 0
              ? "bg-rose-500/80 text-white"
              : warns > 0
                ? "bg-amber-400/80 text-slate-900"
                : "bg-lime-400/70 text-slate-900"
          }`}
        >
          {badge}
        </span>
      </button>

      {open && (
        <div
          className="pointer-events-auto absolute inset-0 z-40 flex flex-col bg-slate-950/85 text-slate-100 backdrop-blur-[6px]"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {/* başlık */}
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span className="text-sm font-black tracking-wide text-lime-300">
              VAELOS · QA
            </span>
            <span className="text-[10px] text-slate-400">
              {qa.scanning
                ? `taranıyor… ${qa.scanned}`
                : `mesh ${qa.scanned} · tur ${qa.laps}`}
            </span>
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={() => setTab("findings")}
                className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                  tab === "findings"
                    ? "bg-lime-400/20 text-lime-200"
                    : "text-slate-300"
                }`}
              >
                Bulgular {badge > 0 ? `(${badge})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setTab("perf")}
                className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                  tab === "perf"
                    ? "bg-lime-400/20 text-lime-200"
                    : "text-slate-300"
                }`}
              >
                Performans
              </button>
            </div>
          </div>

          {/* canlı şerit */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-3 py-1.5 text-[10px] text-slate-300">
            <span>
              FPS{" "}
              <b
                className={
                  qa.fps < 40
                    ? "text-rose-300"
                    : qa.fps < 55
                      ? "text-amber-200"
                      : "text-lime-300"
                }
              >
                {qa.fps.toFixed(0)}
              </b>{" "}
              (ort {qa.avgFps.toFixed(0)})
            </span>
            <span>
              en düşük{" "}
              {qa.worstFps === 999
                ? "—"
                : `${qa.worstFps.toFixed(0)} @ ${qa.worstAt}`}
            </span>
            <span>
              çizim {qa.drawCalls} call · {qa.triangles.toLocaleString()} △
            </span>
            <span>
              geo {qa.geometries} · doku {qa.textures}
            </span>
            <span>
              bot {qa.botOn ? "açık" : "kapalı"} @ {fmtCoord(qa.botX, qa.botY)}
            </span>
          </div>

          {/* içerik */}
          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
          >
            {tab === "findings" ? (
              qa.entries.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-slate-400">
                  Bulgu yok. “Tara” ile sahneyi taratabilirsin.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {qa.entries.map((e) => (
                    <li
                      key={e.id}
                      className={`rounded-md border px-2 py-1.5 text-[11px] leading-snug ${LEVEL_STYLE[e.level]}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-black/30 px-1 text-[9px] font-black tracking-wide">
                          {e.tag}
                        </span>
                        <span className="truncate font-semibold">{e.msg}</span>
                        {e.count > 1 && (
                          <span className="ml-auto shrink-0 text-[9px] opacity-80">
                            ×{e.count}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] opacity-80">
                        {fmtCoord(e.x, e.y)}
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <div className="flex flex-col gap-3 text-[11px]">
                <section>
                  <h4 className="mb-1 font-black text-lime-300">
                    FPS DÜŞEN BÖLGELER (harita 6×5)
                  </h4>
                  {spots.length === 0 ? (
                    <p className="text-slate-400">
                      Henüz ölçüm yok — biraz gez.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {spots.slice(0, 8).map((s, i) => {
                        const avg = s.sumFps / s.samples;
                        return (
                          <li
                            key={`${s.col}-${s.row}`}
                            className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1"
                          >
                            <span
                              className={`w-14 shrink-0 font-black ${
                                avg < 40
                                  ? "text-rose-300"
                                  : avg < 55
                                    ? "text-amber-200"
                                    : "text-lime-300"
                              }`}
                            >
                              {i === 0 ? "▼ " : ""}
                              {avg.toFixed(0)} fps
                            </span>
                            <span className="shrink-0 text-slate-400">
                              min {s.minFps.toFixed(0)}
                            </span>
                            <span className="truncate font-mono text-[10px] text-slate-300">
                              hücre {s.col},{s.row} · {fmtCoord(s.x, s.y)}
                            </span>
                            <span className="ml-auto shrink-0 text-[9px] text-slate-500">
                              {s.samples}×
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section>
                  <h4 className="mb-1 font-black text-lime-300">
                    EN AĞIR OBJELER (üçgen sayısı)
                  </h4>
                  {qa.heavy.length === 0 ? (
                    <p className="text-slate-400">Tarama yapılmadı.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {qa.heavy.map((h) => (
                        <li
                          key={h.name}
                          className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1"
                        >
                          <span className="w-20 shrink-0 font-black text-amber-200">
                            {h.tris.toLocaleString()} △
                          </span>
                          <span className="truncate text-slate-200">
                            {h.name}
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-400">
                            {fmtCoord(h.x, h.y)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>

          {/* alt düğmeler */}
          <div
            className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
            }}
          >
            <button
              type="button"
              onClick={qaRequestScan}
              disabled={qa.scanning}
              className="rounded-lg border border-lime-300/40 bg-lime-400/15 px-3 py-2 text-xs font-bold text-lime-100 active:bg-lime-400/25 disabled:opacity-50"
            >
              {qa.scanning ? "Taranıyor…" : "Tara"}
            </button>
            <button
              type="button"
              onClick={() => qaSetBot(!qa.botOn)}
              className="rounded-lg border border-sky-300/40 bg-sky-400/15 px-3 py-2 text-xs font-bold text-sky-100 active:bg-sky-400/25"
            >
              Test botu: {qa.botOn ? "AÇIK" : "KAPALI"}
            </button>
            <button
              type="button"
              onClick={copy}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold text-slate-100 active:bg-white/20"
            >
              {copied ? "Kopyalandı ✓" : "Raporu kopyala"}
            </button>
            <button
              type="button"
              onClick={qaClear}
              className="rounded-lg border border-white/20 bg-transparent px-3 py-2 text-xs font-semibold text-slate-300 active:bg-white/10"
            >
              Temizle
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto rounded-lg bg-lime-400/90 px-4 py-2 text-xs font-black text-slate-900 active:bg-lime-300"
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </>
  );
}
