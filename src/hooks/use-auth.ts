import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import {
  AUTH_GUEST_FALLBACK_MS,
  AUTH_TIMEOUT_MS,
  withTimeout,
} from "@/lib/withTimeout";

/** `isLoading` bu süreden uzun sürerse oturum "takıldı" sayılır (APK/WebView'da
 *  ölü soket yüzünden sorgular hiç sonuçlanmayabiliyor). */
export const AUTH_STALL_MS = 5000;

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();

  // Derive isLoading directly from the dependencies instead of managing separate state
  const isLoading = isAuthLoading || user === undefined;

  // ⏱️ Takılma dedektörü: yükleme 5 sn'yi geçerse arayüz "Yeniden Dene"
  //    gösterebilsin. Yükleme bitince sıfırlanır, yani normal akış etkilenmez.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setStalled(false);
      return;
    }
    const id = window.setTimeout(() => setStalled(true), AUTH_STALL_MS);
    return () => window.clearTimeout(id);
  }, [isLoading]);

  // ⏱️ Misafir düşüşü zamanı: 8 sn boyunca kimlik çözülmezse süreç kilitli
  //    kalmasın diye anonim (konuk) oturuma geçilir.
  const [guestFallbackDue, setGuestFallbackDue] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setGuestFallbackDue(false);
      return;
    }
    const id = window.setTimeout(
      () => setGuestFallbackDue(true),
      AUTH_GUEST_FALLBACK_MS,
    );
    return () => window.clearTimeout(id);
  }, [isLoading]);

  // 🔑 Konuk (anonim) oturum: `signIn("anonymous")` mobil ağda HİÇ
  //    sonuçlanmayabilir; zaman aşımı koymazsak ekran sonsuza kadar döner.
  const signInAsGuest = useCallback(async () => {
    return await withTimeout(
      signIn("anonymous"),
      AUTH_TIMEOUT_MS,
      "Misafir girişi",
    );
  }, [signIn]);

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
    /** Yükleme beklenenden uzun sürdü (arayüz "Yeniden Dene" gösterebilir). */
    stalled,
    /** Konuk oturumuna düşme zamanı geldi. */
    guestFallbackDue,
    /** Zaman aşımlı, çökmeyen konuk girişi. */
    signInAsGuest,
  };
}
