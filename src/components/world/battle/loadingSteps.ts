// 🎬 Yükleme ekranı varlıkları — durum satırları ve uçan FX listesi.
//
// İki arena da aynı yükleme ekranını kullandığı için metinler ve FX listesi
// sahnelerden ayrıldı: içerik değişince tek yerden güncellenir.

/** Status lines that cycle under the loading bar while the arena loads. */
export const LOAD_STEPS = [
  "Arena hazırlanıyor…",
  "Rakip bulunuyor…",
  "Silahlar kalibre ediliyor…",
  "Enerji yükleniyor…",
];

/** GIF-style emoji FX that float up through the loading screen. */
export const LOAD_FX = [
  { e: "⚔️", left: "6%", delay: 0, dur: 4.2, size: "text-2xl" },
  { e: "⚡", left: "16%", delay: 0.9, dur: 3.4, size: "text-xl" },
  { e: "🗡️", left: "28%", delay: 1.6, dur: 4.8, size: "text-2xl" },
  { e: "✨", left: "41%", delay: 0.4, dur: 3.8, size: "text-lg" },
  { e: "💥", left: "55%", delay: 1.1, dur: 4.4, size: "text-2xl" },
  { e: "⚡", left: "66%", delay: 2.0, dur: 3.2, size: "text-xl" },
  { e: "🛡️", left: "78%", delay: 0.7, dur: 5.0, size: "text-2xl" },
  { e: "✨", left: "88%", delay: 1.4, dur: 3.6, size: "text-lg" },
  { e: "🔥", left: "95%", delay: 2.4, dur: 4.6, size: "text-xl" },
  { e: "⭐", left: "10%", delay: 2.8, dur: 4.0, size: "text-lg" },
];
