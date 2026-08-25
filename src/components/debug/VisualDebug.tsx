import { useState, useCallback, useRef } from "react";
import { snapdom } from "@zumer/snapdom";

/**
 * Developer-only Visual Debug panel.
 * Captures the game viewport and displays it with head/equipment overlay info.
 * Toggle with Ctrl+Shift+D (or the ? button in toolbar).
 */

interface VisualDebugProps {
  /** Ref to the game container element to capture. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Current equipped item IDs. */
  equipped: string[];
  /** Player username. */
  username: string;
  /** Close callback — called when user taps ✕. */
  onClose: () => void;
}

/** Head geometry constants (from AvatarPreview.tsx SVG viewBox 0 0 140 180). */
const HEAD = {
  cx: 70,
  cy: 56,
  r: 36,
  crownY: 20,
  chinY: 92,
  eyesY: 63,
  /** Hat slot config from EquippedItems.tsx */
  hat: { x: 70, y: 31, fontSize: 145 },
  /** Face/glasses slot config */
  face: { x: 70, y: 64, fontSize: 22 },
  /** Neck/scarf slot config */
  neck: { x: 70, y: 94, fontSize: 24 },
};

export function VisualDebug({
  containerRef,
  equipped,
  username,
  onClose,
}: VisualDebugProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const capture = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    setCapturing(true);
    try {
      const result = await snapdom(el, { fast: true, scale: 2 });
      const dataUrl = await result.toRaw();
      setScreenshot(dataUrl);
    } catch (err) {
      console.error("[VisualDebug] Capture failed:", err);
    } finally {
      setCapturing(false);
    }
  }, [containerRef]);

  const download = useCallback(() => {
    if (!screenshot) return;
    const a = document.createElement("a");
    a.href = screenshot;
    a.download = `debug-${username}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [screenshot, username]);

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/80 p-3 sm:items-center sm:p-4 backdrop-blur-sm"
    >
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border border-white/20 bg-gray-950 p-4 shadow-2xl">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">
            🔧 DEV — {username}
          </h2>
          <button
            onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
            onClick={() => onClose()}
            className="flex size-9 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white active:bg-white/20"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            ✕
          </button>
        </div>
        {/* Touch-friendly action buttons */}
        <div className="mb-3 flex gap-2">
          <button
            onTouchEnd={(e) => { e.preventDefault(); capture(); }}
            onClick={capture}
            disabled={capturing}
            className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white active:bg-blue-500 disabled:opacity-50"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {capturing ? "⏳ Capturing..." : "📸 CAPTURE SCREEN"}
          </button>
          {screenshot && (
            <button
              onTouchEnd={(e) => { e.preventDefault(); download(); }}
              onClick={download}
              className="rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white active:bg-green-500"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              💾
            </button>
          )}
        </div>

        {/* Screenshot display */}
        {screenshot ? (
          <div className="mb-4 flex justify-center">
            <img
              ref={imgRef}
              src={screenshot}
              alt="Game viewport capture"
              className="max-w-full rounded-lg border border-white/10"
              style={{ maxHeight: "60vh", objectFit: "contain" }}
            />
          </div>
        ) : (
          <div className="mb-4 flex h-48 items-center justify-center rounded-lg border border-dashed border-white/20 text-sm text-white/50">
            Click "📸 Capture" to capture the game viewport
          </div>
        )}

        {/* Head & Equipment Geometry Info */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Head Geometry */}
          <div className="rounded-lg bg-white/5 p-3">
            <h3 className="mb-2 text-xs font-bold text-white/80">
              📐 Head Geometry (SVG 140×180)
            </h3>
            <div className="space-y-1 text-[11px] text-white/60">
              <div>
                Center: <span className="text-white/90">({HEAD.cx}, {HEAD.cy})</span>
              </div>
              <div>
                Radius: <span className="text-white/90">{HEAD.r}</span>
              </div>
              <div>
                Crown (top): <span className="text-white/90">y={HEAD.crownY}</span>
              </div>
              <div>
                Chin (bottom): <span className="text-white/90">y={HEAD.chinY}</span>
              </div>
              <div>
                Eyes: <span className="text-white/90">y={HEAD.eyesY}</span>
              </div>
              <div>
                Head width: <span className="text-white/90">{HEAD.r * 2} px</span>
              </div>
            </div>
          </div>

          {/* Equipment Slots */}
          <div className="rounded-lg bg-white/5 p-3">
            <h3 className="mb-2 text-xs font-bold text-white/80">
              🎩 Equipment Slots
            </h3>
            <div className="space-y-1 text-[11px] text-white/60">
              <div>
                Hat:{" "}
                <span className="text-white/90">
                  ({HEAD.hat.x}, {HEAD.hat.y}) size={HEAD.hat.fontSize}
                </span>
              </div>
              <div>
                Glasses:{" "}
                <span className="text-white/90">
                  ({HEAD.face.x}, {HEAD.face.y}) size={HEAD.face.fontSize}
                </span>
              </div>
              <div>
                Scarf:{" "}
                <span className="text-white/90">
                  ({HEAD.neck.x}, {HEAD.neck.y}) size={HEAD.neck.fontSize}
                </span>
              </div>
              <div className="mt-2 border-t border-white/10 pt-2">
                Equipped:{" "}
                <span className="text-white/90">
                  {equipped.length > 0 ? equipped.join(", ") : "(none)"}
                </span>
              </div>
            </div>
          </div>

          {/* Hat Alignment Analysis */}
          <div className="rounded-lg bg-white/5 p-3 sm:col-span-2">
            <h3 className="mb-2 text-xs font-bold text-white/80">
              🎯 Hat Alignment Check
            </h3>
            <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <div className="rounded bg-white/5 p-2">
                <div className="text-white/50">Hat X</div>
                <div className="font-mono text-white/90">{HEAD.hat.x}</div>
                <div className="text-white/40">Head X: {HEAD.cx}</div>
                <div
                  className={
                    HEAD.hat.x === HEAD.cx ? "text-green-400" : "text-red-400"
                  }
                >
                  {HEAD.hat.x === HEAD.cx ? "✓ CENTERED" : "✗ OFF-CENTER"}
                </div>
              </div>
              <div className="rounded bg-white/5 p-2">
                <div className="text-white/50">Hat Y</div>
                <div className="font-mono text-white/90">{HEAD.hat.y}</div>
                <div className="text-white/40">Crown: {HEAD.crownY}</div>
                <div
                  className={
                    Math.abs(HEAD.hat.y - HEAD.crownY) <= 5
                      ? "text-green-400"
                      : "text-yellow-400"
                  }
                >
                  {Math.abs(HEAD.hat.y - HEAD.crownY) <= 5
                    ? "✓ AT CROWN"
                    : `✗ Δ${Math.abs(HEAD.hat.y - HEAD.crownY)}`}
                </div>
              </div>
              <div className="rounded bg-white/5 p-2">
                <div className="text-white/50">Hat Size</div>
                <div className="font-mono text-white/90">{HEAD.hat.fontSize}</div>
                <div className="text-white/40">Head: {HEAD.r * 2}</div>
                <div
                  className={
                    HEAD.hat.fontSize >= HEAD.r * 1.5
                      ? "text-green-400"
                      : "text-red-400"
                  }
                >
                  {HEAD.hat.fontSize >= HEAD.r * 1.5
                    ? "✓ HEAD-WIDTH"
                    : "✗ TOO SMALL"}
                </div>
              </div>
              <div className="rounded bg-white/5 p-2">
                <div className="text-white/50">Hat Scale</div>
                <div className="font-mono text-white/90">
                  {(HEAD.hat.fontSize / (HEAD.r * 2) * 100).toFixed(0)}%
                </div>
                <div className="text-white/40">of head width</div>
                <div
                  className={
                    HEAD.hat.fontSize >= HEAD.r * 1.8
                      ? "text-green-400"
                      : "text-yellow-400"
                  }
                >
                  {HEAD.hat.fontSize >= HEAD.r * 1.8
                    ? "✓ FULL COVERAGE"
                    : "⚠ PARTIAL"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-3 rounded-lg bg-white/5 p-2 text-center text-[10px] text-white/40">
          Tap 🔧 to open · 📸 to capture · 💾 to download for AI analysis.
        </div>
      </div>
    </div>
  );
}
