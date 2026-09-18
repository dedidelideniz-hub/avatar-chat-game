// 🕹️ BattleJoystick — savaş alanının tek hareket girdisi.
//
// Sahnelerden (bot + PvP) ayrıldı: kolun pointer matematiği, yatay-mod kilidi
// ve MOBA arayüz kabuğunun bindirilmesi burada yaşar. Sahneler yalnızca canlı
// yön vektörünü taşıyan ref'i verir.
//
// Dokunma durumu bir CSS sınıfıyla bildirilir: Android WebView'de bir <div>
// üzerinde :active güvenilir tetiklenmediği için kolun opaklık artışı bu
// sınıfa bağlıdır (React state yok, yeniden çizim yok).
import {
  LandscapeGate,
  useLandscapeGate,
} from "@/components/world/LandscapeGate";
import { MobaArenaChrome } from "@/components/world/moba/MobaHud";
// 🧪 Otomatik QA paneli (test botu + teşhis + FPS). Bu katman iki arenada da
// takılı olduğu için panel buradan render edilir.
import { QaPanel } from "@/components/world/qa/QaPanel";
import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";

/** Virtual joystick — drag anywhere on it to move (works with mouse + touch). */
export function BattleJoystick({
  stickRef,
  disabled = false,
}: {
  stickRef: MutableRefObject<{ x: number; y: number }>;
  /** Ek olarak kilitlenmek istendiğinde (örn. sonuç ekranı açıkken). */
  disabled?: boolean;
}) {
  // Savaş alanı yatay (landscape) düzende oynanır. Telefon dikeyken kol
  // girdisi yok sayılır ve "yan çevir" yönergesi ekranı kaplar; yönerge
  // burada render edilir çünkü bu katman iki arenada da (bot + PvP) her
  // zaman takılıdır.
  const gate = useLandscapeGate();
  const locked = disabled || gate.required;
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);

  // Kolun yarıçapı ölçülür (sabit piksel değil): yatay modda HUD ekran
  // boyutuna göre küçüldüğü için sabit 40px yarıçap topuzu tabanın dışına
  // taşırır ve girdi ölçeğini bozardı.
  const setKnob = (dx: number, dy: number) => {
    if (knobRef.current)
      knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const move = (px: number, py: number) => {
    const base = baseRef.current;
    if (!base || locked) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const R = Math.max(24, rect.width * 0.36);
    let dx = px - cx;
    let dy = py - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    stickRef.current = { x: dx / R, y: dy / R };
    setKnob(dx, dy);
  };

  const setActive = (on: boolean) => {
    baseRef.current?.classList.toggle("is-active", on);
  };

  const reset = () => {
    draggingRef.current = false;
    activePointerRef.current = null;
    stickRef.current = { x: 0, y: 0 };
    setActive(false);
    setKnob(0, 0);
  };

  // A phone can cancel a pointer stream when focus changes, the browser
  // starts a gesture, or a second finger touches the control. Always release
  // the live vector in those cases so movement never gets stuck or silently
  // waits for a new pointer event.
  useEffect(() => {
    const resetOnWindowExit = () => reset();
    const resetOnVisibilityChange = () => {
      if (document.hidden) reset();
    };
    window.addEventListener("blur", resetOnWindowExit);
    window.addEventListener("pagehide", resetOnWindowExit);
    document.addEventListener("visibilitychange", resetOnVisibilityChange);
    return () => {
      window.removeEventListener("blur", resetOnWindowExit);
      window.removeEventListener("pagehide", resetOnWindowExit);
      document.removeEventListener("visibilitychange", resetOnVisibilityChange);
      reset();
    };
  }, []);

  // Yönerge ekranı açılınca kol sıfırlanır — yoksa telefon yan çevrildiğinde
  // karakter "basılı kalmış" yöne yürümeye devam ederdi.
  useEffect(() => {
    if (locked) reset();
  }, [locked]);

  const finishPointer = (element: HTMLDivElement, pointerId: number) => {
    if (activePointerRef.current !== pointerId) return;
    reset();
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  };

  return (
    <>
      {/* MOBA savaş arayüzü: üst şerit, minimap, sağ ray, yetenek barı ve
          rakip kartı arena üzerine buradan bindirilir. Sahne store kaydını
          yapar; kayıt yoksa hiçbir şey render edilmez (eski HUD yedek kalır). */}
      <MobaArenaChrome storeKey={stickRef} />
      <QaPanel />
      <div
        ref={baseRef}
        className="battle-joystick battle-hud-stick pointer-events-auto absolute bottom-4 left-4 z-10 size-28 touch-none rounded-full border-4 border-white/40 bg-white/15 backdrop-blur-[2px]"
        onPointerDown={(e) => {
          // Ignore extra fingers instead of letting them replace the active
          // pointer and leave the joystick in an inconsistent state.
          if (activePointerRef.current !== null) return;
          e.preventDefault();
          e.stopPropagation();
          activePointerRef.current = e.pointerId;
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          setActive(true);
          move(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current && activePointerRef.current === e.pointerId) {
            e.preventDefault();
            move(e.clientX, e.clientY);
          }
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          e.stopPropagation();
          finishPointer(e.currentTarget, e.pointerId);
        }}
        onPointerCancel={(e) => finishPointer(e.currentTarget, e.pointerId)}
        onLostPointerCapture={(e) => {
          if (activePointerRef.current === e.pointerId) reset();
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Hareket joystick"
      >
        <div
          ref={knobRef}
          className="battle-hud-stick-knob pointer-events-none absolute inset-0 m-auto size-12 rounded-full border-2 border-white/70 bg-white/50 shadow-lg"
        />
      </div>

      {/* Telefon yatay değilse savaş başlamaz: tüm ekranı kaplayan yönerge
          ekranı (z-[100]) kontrol katmanıyla birlikte gelir. */}
      <LandscapeGate
        visible={gate.required}
        touch={gate.touch}
        canLock={gate.canLock}
      />
    </>
  );
}
