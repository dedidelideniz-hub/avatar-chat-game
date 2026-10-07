/**
 * 🔎 `useGLTF` + işaret: model başladı/bitti satırlarını logcat'e düşürür.
 *
 * Davranış `useGLTF` ile BİREBİR aynıdır (aynı önbellek, aynı suspense); tek
 * farkı iki işaret basmasıdır:
 *   `[VAELOS_MODEL_START] <url>` → suspense fırlatılmadan hemen önce,
 *   `[VAELOS_MODEL_OK] <url>`    → model çözüldükten sonra.
 *
 * Neden ayrı dosya: `androidProbe` three/drei içe aktarmaz (her yerden
 * çağrılabilsin diye hafif kalır); drei bağımlılığı yalnızca burada bulunur.
 */
import { useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { modelError, modelOk, modelStart } from "./androidProbe";

export function useProbedGltf<T extends string>(url: T, id: string = url) {
  // Suspense fırlatmadan ÖNCE: "hangi model yükleniyordu?" — çökmeden önceki
  // logcat satırı tam olarak burasıdır.
  modelStart(id, url);
  try {
    const gltf = useGLTF(url);
    useEffect(() => {
      modelOk(id, url);
    }, [id, url]);
    return gltf;
  } catch (error) {
    // Suspense fırlatması normal akıştır; gerçek hata (404/parse) ise işaretle.
    if (!(error instanceof Promise)) modelError(id, url, error);
    throw error;
  }
}
