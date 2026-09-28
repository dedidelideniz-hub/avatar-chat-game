/**
 * KAMERA ÇERÇEVELEME — bina arkası / üst sokak için otomatik görüş açma.
 *
 * Saydamlık KULLANILMAZ. Oyuncu dükkan sırasının arkasına (üst/arka sokağa)
 * geçtiğinde kamera daha dik (top-down) bir açıya ve biraz daha yükseğe
 * taşınır; caddeye döndüğünde eski açıya yumuşakça döner.
 *
 * Saf (React'siz) tutulur ki hem `FollowCamera` kullansın hem de
 * `scripts/check-camera-framing.ts` doğrudan doğrulayabilsin.
 */
import {
  CAMERA_BACK_ELEVATION,
  CAMERA_BACK_ZOOM,
  CAMERA_ELEVATION,
  CAMERA_OPEN_Z_FULL,
  CAMERA_OPEN_Z_START,
  CAMERA_ZOOM,
} from "./constants";

/**
 * Oyuncunun (yumuşatılmış) Z konumundan kamera açıklığı: 0 = cadde kamerası,
 * 1 = tam açık (bina arkası) kamera. Z kuzeye doğru KÜÇÜLDÜĞÜ için
 * `CAMERA_OPEN_Z_START`ta geçiş başlar, `CAMERA_OPEN_Z_FULL`de tamamlanır ve
 * uçlarda [0, 1] aralığına kıstırılır.
 */
export function cameraOpenAmount(z: number): number {
  const raw =
    (CAMERA_OPEN_Z_START - z) / (CAMERA_OPEN_Z_START - CAMERA_OPEN_Z_FULL);
  return raw < 0 ? 0 : raw > 1 ? 1 : raw;
}

/** Açıklık değerine karşılık gelen kamera yükseklik açısı ve mesafesi. */
export function cameraFraming(open: number): { elevation: number; zoom: number } {
  const t = open < 0 ? 0 : open > 1 ? 1 : open;
  return {
    elevation: CAMERA_ELEVATION + (CAMERA_BACK_ELEVATION - CAMERA_ELEVATION) * t,
    zoom: CAMERA_ZOOM + (CAMERA_BACK_ZOOM - CAMERA_ZOOM) * t,
  };
}
