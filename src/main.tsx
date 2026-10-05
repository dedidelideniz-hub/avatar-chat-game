import "@vly-ai/integrations";
import { ensureWebglFailureGuard } from "@/engine/webglSupport";
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting

/** Bir rota parça (chunk) isteği indirilemediğinde tarayıcının ürettiği
 *  mesajlar. Bu durumda aynı adresi tekrar denemek asla işe yaramaz: dosya
 *  sunucuda artık yok. Tek çare güncel `index.html`'i yeniden çekmektir. */
function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  // Yalnızca MODÜL indirme hatalarını eşle (çıplak "Failed to fetch" ağ
  // hatalarına da uyar; onları yenilemek sonsuz yenileme döngüsü yapar).
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    msg,
  );
}

// Yeniden yükleme kalkanı: bozuk bir dağıtımda sonsuz döngüye girmemek için
// kısa bir pencere içinde yalnızca BİR kez otomatik yenilenir.
const RELOAD_GUARD_KEY = "vaelos:chunk-reload-at";
const RELOAD_GUARD_MS = 10_000;

/** Eski bir `index.html` yeni bir dağıtımdaki parçaları isteyip 404 aldığında
 *  ("Failed to fetch dynamically imported module …/assets/Entry-XXXX.js")
 *  sayfayı bir kez tazeleyerek kendi kendini onarır. */
function reloadOnceForChunkError(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? "0");
    if (Number.isFinite(last) && Date.now() - last < RELOAD_GUARD_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* özel mod / kilitli depolama — tek seferlik en iyi çaba olarak devam et */
  }
  window.location.reload();
  return true;
}

/** Lazy-load a route chunk with retry. Vite's dev server can briefly fail a
 *  module request while it recompiles after a batch of edits, which browsers
 *  surface as "Failed to fetch dynamically imported module" and blank the
 *  preview. Retrying turns that into a momentary pause instead. When the
 *  failure is a *missing hashed chunk* (stale HTML after a redeploy), retries
 *  cannot help, so we refresh the page once instead of crashing. */
function lazyRetry<T extends React.ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
  retries = 5,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await loader();
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 700 * attempt));
        }
      }
    }
    if (isChunkLoadError(lastErr)) {
      reloadOnceForChunkError();
    }
    throw lastErr;
  });
}

const Landing = lazyRetry(() => import("./pages/Landing.tsx"));
const AuthPage = lazyRetry(() => import("./pages/Auth.tsx"));
const Entry = lazyRetry(() => import("./pages/Entry.tsx"));
const Studio = lazyRetry(() => import("./pages/Studio.tsx"));
const World = lazyRetry(() => import("./pages/World.tsx"));
const Admin = lazyRetry(() => import("./pages/Admin.tsx"));
const NotFound = lazyRetry(() => import("./pages/NotFound.tsx"));
// Savaş alanı test laboratuvarı: aynı `<BattleScene>` bileşenini doğrudan
// çalıştırır (menüde listelenmez, giriş gerektirmez). Üretimde kapatmak
// isterseniz rotayı silin ya da koşulu `import.meta.env.DEV &&` yapın.
const ArenaTest = lazyRetry(() => import("./pages/ArenaTest.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
    // Parça indirme hatası kök sınırına kadar sızdıysa (ör. olay dinleyicisi
    // kaçırdıysa) yine de kendi kendini onarmayı dene.
    if (isChunkLoadError(err)) {
      reloadOnceForChunkError();
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// The app UI is Turkish. Declaring the language and blocking auto-translate
// prevents browser translation extensions from wrapping text nodes, which
// corrupts React's DOM and causes "insertBefore" runtime crashes on re-render.
document.documentElement.setAttribute("lang", "tr");
document.documentElement.setAttribute("translate", "no");

// 🧯 WebGL supabı: R3F'ın asenkron `configure()` reddi ("Error creating WebGL
// context") React hata sınırına UĞRAMAZ; açılışta kurulan bu dinleyici onu
// yakalar ve sayfaya düşmesini engeller (sahne kendi kendini yeniden dener).
ensureWebglFailureGuard();

// 🧩 Eski HTML ve yeni dağıtım uyuşmazlığı: Vite, bir dinamik import'un parçası
// (veya modulepreload bağlantısı) indirilemediğinde bu olayı yayar. Sayfayı bir
// kez tazeleyip güncel `index.html`'i çekerek "Failed to fetch dynamically
// imported module" ekranının kullanıcıya düşmesini engeller.
window.addEventListener("vite:preloadError", (event: Event) => {
  event.preventDefault();
  reloadOnceForChunkError();
});

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/entry" />}
              />
              {/* MOBA tarzı oyun girişi: yükleme ekranı → lig/üyelik kartı ve
                  karakter rengi seçimi → oyun dünyası. */}
              <Route
                path="/entry"
                element={
                  <RequireAuth>
                    <Entry />
                  </RequireAuth>
                }
              />
              <Route
                path="/studio"
                element={
                  <RequireAuth>
                    <Studio />
                  </RequireAuth>
                }
              />
              <Route
                path="/world"
                element={
                  <RequireAuth>
                    <World />
                  </RequireAuth>
                }
              />
              {/* Standalone admin panel (own admin/admin login) */}
              <Route path="/admin" element={<Admin />} />
              {/* Arena testi: cadde/giriş/duel akışını atlayıp savaş alanını
                  doğrudan açar (renk, skin, yetenek, bot seviyesi seçilebilir). */}
              <Route path="/test" element={<ArenaTest />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
