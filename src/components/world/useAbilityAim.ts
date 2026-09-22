// 🎯 Yeteneklerde "basılı tut → nişan al → bırak → ateş et" girdisi.
//
// Yetenek butonları (süper / ulti) eskiden basıldığı ANDA ateş ediyordu, yani
// nişan almak imkânsızdı. Bu hook, butonların üzerine gelen pointer olaylarını
// YAKALAMA (capture) fazında ele alır:
//
//   · basılı tut → menzil çemberi + yön oku görünür, parmakla nişan alınır
//   · bırak → yetenek bırakıldığı yöne (nişan yoksa menzil içi otomatik
//     kilide, o da yoksa karakterin baktığı yöne) fırlatılır
//   · hızlı dokunup bırakma (quick tap) → nişan 0 kalır, yani yalnızca menzil
//     içindeki düşmana kilitlenir
//
// Butonun kendi React `onPointerDown` işleyicisi çalışmasın diye olay yakalama
// fazında durdurulur (`stopPropagation`); bu yüzden basılı tutma görseli için
// butona `is-aiming` sınıfı elle eklenir (CSS tarafında parlar).
import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
import { playSound } from "@/lib/sounds";
import { aimState } from "./arena/skillshot";
// Düğmelerin görünüm işaretleri (hazır / hangi yetenek): ikonlar CSS'te bu
// işaretlere göre çizilir. Sahne JSX'i araç penceresinin dışında kaldığı için
// ikon eşlemesi düğmeye buradan yazılır (bkz. battle/abilityButtonState.ts).
import { observeAbilityButtonState } from "./battle/abilityButtonState";

export type AbilityKind = "super" | "ult";

/** HUD'daki yetenek butonları (index.css'teki sınıflarla aynı). */
const ABILITY_SELECTOR = ".battle-hud-super, .battle-hud-ult";
/** Nişanın sıfır sayıldığı ölü bölge (px) — parmak butonun üstündeyken kilit. */
const DEAD_ZONE_PX = 12;

export function useAbilityAim(
  /** Olayların dinleneceği sahne kökü (arena <main>). */
  containerRef: MutableRefObject<HTMLElement | null>,
  /** Bırakıldığında yeteneği verilen yönde ateşler. */
  onFire: (kind: AbilityKind, dx: number, dy: number) => void,
  /** Yetenek dolu mu? Dolu değilse dokunma eski davranışa bırakılır. */
  isReady: (kind: AbilityKind) => boolean,
) {
  // Render sırasında ref yazmamak için geri çağrılar effect içinde tazelenir.
  const cbs = useRef({ onFire, isReady });
  useEffect(() => {
    cbs.current = { onFire, isReady };
  });

  // Sahne düğmelerinin görünüm işaretleri: yalnız gerçek bir içerik/class
  // değişiminde çalışır (kare döngüsüne ek yük getirmez).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return observeAbilityButtonState(container);
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Sahne bağlanırken paylaşılan nişan durumu sıfırlanır: önceki maçtan
    // kalma bir "nişan alıyorum" durumu yeni sahnede gösterge bırakmasın.
    aimState.basic = false;
    aimState.basicDx = 0;
    aimState.basicDy = 0;
    aimState.ability = false;
    aimState.dx = 0;
    aimState.dy = 0;

    let pointerId: number | null = null;
    let button: HTMLElement | null = null;
    let kind: AbilityKind = "super";

    /** Nişan, butonun merkezinden parmağa doğru olan vektördür. */
    const readAim = (ev: PointerEvent) => {
      if (!button) return;
      const r = button.getBoundingClientRect();
      const ax = ev.clientX - (r.left + r.width / 2);
      const ay = ev.clientY - (r.top + r.height / 2);
      const d = Math.hypot(ax, ay);
      if (d < DEAD_ZONE_PX) {
        aimState.dx = 0;
        aimState.dy = 0;
        return;
      }
      const full = Math.max(48, r.width * 0.8); // tam sapma yarıçapı
      const k = Math.min(1, d / full) / d;
      aimState.dx = ax * k;
      aimState.dy = ay * k;
    };

    const reset = () => {
      aimState.ability = false;
      aimState.dx = 0;
      aimState.dy = 0;
      button?.classList.remove("is-aiming");
      pointerId = null;
      button = null;
    };

    const onDown = (ev: PointerEvent) => {
      if (pointerId !== null) return; // ikinci parmak nişanı bozmasın
      const target = ev.target as HTMLElement | null;
      const btn = (target?.closest?.(ABILITY_SELECTOR) ?? null) as HTMLElement | null;
      if (!btn) return;
      const k: AbilityKind = btn.classList.contains("battle-hud-ult")
        ? "ult"
        : "super";
      // Dolmamış yetenekte nişan alınacak bir şey yok. Eskiden dokunuş sessizce
      // yutuluyordu ve oyuncu "bastım ama hiçbir şey olmadı" hissiyle kalıyordu:
      // artık kısa, kısık bir "kilitli" vuruşu duyulur ve düğme minik bir
      // titreme yapar (CSS: .is-locked). Nişan akışı değişmez — olay serbest
      // bırakılır, yani düğmenin kendi davranışı aynen korunur.
      if (!cbs.current.isReady(k)) {
        playSound("error", { volume: 0.32, rate: 0.72 });
        btn.classList.remove("is-locked");
        void btn.offsetWidth; // animasyonu baştan başlatmak için zorunlu okuma
        btn.classList.add("is-locked");
        window.setTimeout(() => btn.classList.remove("is-locked"), 360);
        return;
      }

      // Hazır yetenek: basış onayı (ateş sesi parmağı kaldırınca gelir).
      playSound("click", { volume: 0.22, rate: 1.15 });

      pointerId = ev.pointerId;
      button = btn;
      kind = k;
      aimState.ability = true;
      aimState.kind = k;
      aimState.dx = 0;
      aimState.dy = 0;
      btn.classList.add("is-aiming");
      // Butonun "basınca ateş et" davranışını paketle.
      ev.stopPropagation();
      ev.preventDefault();
      try {
        el.setPointerCapture(ev.pointerId);
      } catch {
        /* pointer zaten bırakılmış olabilir */
      }
      readAim(ev);
    };

    const onMove = (ev: PointerEvent) => {
      if (pointerId !== ev.pointerId) return;
      ev.stopPropagation();
      readAim(ev);
    };

    const finish = (ev: PointerEvent, fire: boolean) => {
      if (pointerId !== ev.pointerId) return;
      const dx = aimState.dx;
      const dy = aimState.dy;
      const k = kind;
      ev.stopPropagation();
      if (fire) {
        // Ateş edilene kadar nişan durumu okunabilir kalmalı.
        cbs.current.onFire(k, dx, dy);
      }
      try {
        if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
      } catch {
        /* yok say */
      }
      reset();
    };

    const onUp = (ev: PointerEvent) => finish(ev, true);
    const onCancel = (ev: PointerEvent) => {
      if (ev.type !== "pointercancel") ev.preventDefault();
      finish(ev, false);
    };

    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointermove", onMove, true);
    el.addEventListener("pointerup", onUp, true);
    el.addEventListener("pointercancel", onCancel, true);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointermove", onMove, true);
      el.removeEventListener("pointerup", onUp, true);
      el.removeEventListener("pointercancel", onCancel, true);
      reset();
    };
  }, [containerRef]);
}
