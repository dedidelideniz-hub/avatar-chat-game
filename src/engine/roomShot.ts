/**
 * 📸 ODA FOTOĞRAFI (screenshot) — profil kartındaki "ev resmi".
 *
 * NEDEN: oyuncu bir karakterin profiline dokunduğunda evinin GERÇEK görüntüsü
 * (odanın ta kendisi, İÇİNDEKİ EŞYALARA KADAR) görünmeli. Odayı profil kartının
 * içinde yeniden çizmek (ikinci bir WebGL bağlamı) mobilde bağlam kıtlığından
 * çöküyordu; bunun yerine oda açıkken canvas BİR KEZ fotoğraflanır ve burada
 * `roomId` bazında saklanır.
 *
 * SAKLAMA: küçük bir JPEG data-URL'i bellekte tutulur ve `localStorage`a
 * yazılır — böylece oyuncu odaya girdikten sonra (aynı cihazda) profil kartı,
 * caddede/kim nerede olursa olsun gerçek evi gösterir. Depolama reddederse
 * (gizli mod/kota) yalnız bellekle çalışır; oyun asla bozulmaz.
 *
 * REAKTİFLİK: `useSyncExternalStore` ile abonelik — yeni fotoğraf gelince
 * profildeki önizleme kendiliğinden tazelenir.
 */
import { useSyncExternalStore } from "react";

const STORAGE_PREFIX = "vaelos:roomshot:";

/** roomId → dataURL (bu oturumda yakalananlar). */
const mem = new Map<string, string>();
/** En son yakalanan fotoğraf (oda kimliği bilinmeyen bağlamlar için yedek). */
let latest: string | null = null;

const subscribers = new Set<() => void>();
function emit(): void {
  for (const fn of subscribers) fn();
}

/** Yeni oda fotoğrafını kaydet (oda canvas'ından yakalanır). */
export function setRoomShot(roomId: string, dataUrl: string): void {
  if (!roomId || !dataUrl) return;
  mem.set(roomId, dataUrl);
  latest = dataUrl;
  try {
    localStorage.setItem(STORAGE_PREFIX + roomId, dataUrl);
  } catch {
    // Kota/gizli mod: bellekteki kopya yeter.
  }
  emit();
}

/** Bir odanın fotoğrafı (yoksa `null`). */
export function getRoomShot(roomId: string | null | undefined): string | null {
  if (!roomId) return null;
  const cached = mem.get(roomId);
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + roomId);
    if (stored) {
      mem.set(roomId, stored);
      return stored;
    }
  } catch {
    // Depolama yok.
  }
  return null;
}

/**
 * En son yakalanan oda fotoğrafı. Oda kimliği bilinmediğinde (ör. gerçek bir
 * `houses` satırı olmayan cadde sakinleri) temsilî görüntü olarak kullanılır.
 */
export function getLatestRoomShot(): string | null {
  if (latest) return latest;
  let last: string | null = null;
  for (const v of mem.values()) last = v;
  return last;
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Belirli bir odanın fotoğrafını reaktif oku (profil kartı). */
export function useRoomShot(roomId: string | null | undefined): string | null {
  return useSyncExternalStore(
    subscribe,
    () => getRoomShot(roomId),
    () => null,
  );
}

/** En son oda fotoğrafını reaktif oku (kimliği olmayan evler için). */
export function useLatestRoomShot(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => getLatestRoomShot(),
    () => null,
  );
}

