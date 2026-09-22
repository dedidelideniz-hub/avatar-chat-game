// ⚔️/🎯 Sahne yetenek düğmelerinin GÖRÜNÜM İŞARETLERİ.
//
// Sahne dosyalarının (BattleScene / PvpBattleScene) sağ-alt kontrol kümesi
// JSX'i düzenleme aracının dosya penceresinin (~43 KB) dışında kalıyor: oradan
// ne bir sınıf ne bir ikon eklenebiliyor. Bu yüzden düğmelerin görünümü iki
// parçaya bölünür:
//
//   · bu modül — düğme DOM'una iki küçük işaret koyar (React'in yönettiği
//     öznitelikler DEĞİLLER, bu yüzden yeniden çizimlerde dokunulmazlar):
//       data-state="ready" | "waiting"              → yetenek doldu mu?
//       data-ability="bomb|heal|sparkle|bolt|flame|swords|crown" → hangisi?
//   · styles/moba-glass.css — işarete karşılık gelen vektör ikonu çizer.
//
// İşaretler düğmenin KENDİ içeriğinden okunur: hazırken yuva skine ait emojiyi,
// dolarken yüzdeyi taşır ("%42"). Yani ikon, HUD'un yetenek yuvasıyla AYNI
// eşlemeden gelir (bkz. moba/MobaHud.tsx → `abilityIconKey`) ve emoji arayüzde
// hiç görünmez — CSS onu `font-size: 0` ile gizler.
//
// Neden MutationObserver: içeriği React yazar. Yetenek dolduğunda/boşaldığında,
// samuray ultisi sonradan göründüğünde ya da maç fazı değiştiğinde işaretlerin
// kendiliğinden tazelenmesi gerekir; sahne kare döngüsüne (rAF) hiç
// dokunulmaz — gözlemci yalnız gerçek bir değişimde çalışır.

import { abilityIconKey } from "@/components/world/moba/MobaHud";

/** İşaretlenen düğmeler: süper yetenek + Kraliyet ultisi (melee düğmesi hariç). */
const ABILITY_BUTTONS = ".battle-hud-super, .battle-hud-ult";

/** Yetenek emojisi taşıyan yuva (yüzde okuması da burada yazılır). */
const ICON_SLOT = ".battle-hud-icon";

/**
 * Kökün altındaki yetenek düğmelerini tarar ve işaretleri tazeler.
 * Aynı değer tekrar yazılmaz: gereksiz DOM yazımı (ve gereksiz kare) olmaz.
 */
export function syncAbilityButtonState(root: ParentNode): void {
  for (const btn of root.querySelectorAll<HTMLElement>(ABILITY_BUTTONS)) {
    const text = btn.querySelector<HTMLElement>(ICON_SLOT)?.textContent?.trim() ?? "";
    // Hazır yetenek yuvada ikon (emoji), dolarken yüzde taşır.
    const ready = text.length > 0 && !text.includes("%");
    const state = ready ? "ready" : "waiting";
    if (btn.dataset.state !== state) btn.dataset.state = state;
    if (!ready) {
      // Dolarken ikon anahtarı silinir: CSS yüzde diskini çizer.
      if (btn.dataset.ability) delete btn.dataset.ability;
      continue;
    }
    // Ulti düğmesi her skinde aynı Kraliyet tacını taşır; süper düğmesi ise
    // skinin kendi yeteneğini (HUD yuvasıyla birebir aynı ikon).
    const key = btn.classList.contains("battle-hud-ult")
      ? "crown"
      : abilityIconKey(text);
    if (btn.dataset.ability !== key) btn.dataset.ability = key;
  }
}

/**
 * Düğmeleri izler: React içeriği değiştirdiği an işaretler tazelenir.
 * Dönen fonksiyon izlemeyi kapatır (sahne sökülürken çağrılır).
 */
export function observeAbilityButtonState(root: HTMLElement): () => void {
  syncAbilityButtonState(root);
  const observer = new MutationObserver(() => syncAbilityButtonState(root));
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    // Yalnız `class` değişimi izlenir: bu modülün yazdığı `data-*` öznitelikleri
    // gözlemciyi yeniden tetiklemez (sonsuz döngü olmaz).
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}
