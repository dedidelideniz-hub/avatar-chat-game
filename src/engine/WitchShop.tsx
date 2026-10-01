/**
 * CADI DÜKKÂNI — yalnızca bu binaya ait GÖRÜNEN GİRİŞ YOLU.
 *
 * Binanın kendisi artık genel `GlbBuilding` bileşeniyle dikilir
 * (`constants.WITCH_SHOP_INDEX` → `modelUrl`); bu dosyada kalan tek şey,
 * dükkânın kapısına giden taş yolun çizimidir.
 *
 * Yol, `lib/shop.ts` içindeki YÜRÜNEBİLİR şeritle (`WITCH_SHOP_WALK_ZONES`)
 * AYNI sabitlerden üretilir, yani oyuncunun yürüdüğü yer ile gördüğü yol
 * ayrışmaz ("havada yürüme" görüntüsü oluşmaz). Sınırlar `constants.WITCH_SHOP_WALKWAY`.
 *
 * Yol KUZEY KALDIRIMINDA biter ve binanın CEPHE HATTIINDA sonlanır: evin içi
 * yürünemez — oyuncu kapının önüne kadar gelir, kapıda beliren "Evine gir"
 * düğmesiyle evine girer (bkz. `constants.HOUSE_*`).
 */
import { WITCH_SHOP_WALKWAY } from "./constants";

/** Yolun zemin seviyesi — çim (0) ile asfalt (0.008) arasında okunur bir taş. */
const WALKWAY_Y = 0.013;

function Plane({
  westX,
  eastX,
  southZ,
  northZ,
  y,
  color,
  roughness,
}: {
  westX: number;
  eastX: number;
  southZ: number;
  northZ: number;
  y: number;
  color: string;
  roughness: number;
}) {
  const w = eastX - westX;
  const d = southZ - northZ;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[(westX + eastX) / 2, y, (southZ + northZ) / 2]}
      receiveShadow
    >
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

/**
 * KUZEY KALDIRIMINDAN dükkânın kapısına uzanan taş yol: kaldırımda başlayıp
 * çimi geçen dar şerit, kapının önünde genişleyen avlu ve kapı eşiği. Şerit
 * çimin 0.013 birim üstüne oturur (kaldırım 0.005, asfalt 0.008).
 *
 * Üç parçanın sınırları `WITCH_SHOP_WALK_ZONES` ile BİREBİR aynı kaynaktan
 * türer: oyuncunun yürüdüğü yer ile gördüğü yol ayrışmaz.
 */
export function WitchShopWalkway() {
  const { x, pathHalfW, foreHalfW, pathSouthZ, pathNorthZ, frontZ } =
    WITCH_SHOP_WALKWAY;

  return (
    <group>
      {/* 1) YOL ŞERİDİ — kuzey kaldırımından avluya kadar dar taş yol. */}
      <Plane
        westX={x - pathHalfW}
        eastX={x + pathHalfW}
        southZ={pathSouthZ}
        northZ={pathNorthZ}
        y={WALKWAY_Y}
        color="#c9bda2"
        roughness={0.94}
      />
      {/* Kenar bordürü — yolu çimden/taştan ayırır, "patika" gibi okunur. */}
      <Plane
        westX={x - pathHalfW - 0.07}
        eastX={x - pathHalfW}
        southZ={pathSouthZ}
        northZ={pathNorthZ}
        y={WALKWAY_Y + 0.002}
        color="#a8977a"
        roughness={0.9}
      />
      <Plane
        westX={x + pathHalfW}
        eastX={x + pathHalfW + 0.07}
        southZ={pathSouthZ}
        northZ={pathNorthZ}
        y={WALKWAY_Y + 0.002}
        color="#a8977a"
        roughness={0.9}
      />
      {/* 2) ÖN AVLU — kapının önünde genişleyen taş alan. */}
      <Plane
        westX={x - foreHalfW}
        eastX={x + foreHalfW}
        southZ={pathNorthZ}
        northZ={frontZ}
        y={WALKWAY_Y + 0.002}
        color="#cfc4a9"
        roughness={0.93}
      />
      {/* 3) Kapı eşiği — avlunun cepheyle buluştuğu yerde koyu ahşap. */}
      <Plane
        westX={x - foreHalfW}
        eastX={x + foreHalfW}
        southZ={frontZ}
        northZ={frontZ - 0.35}
        y={WALKWAY_Y + 0.004}
        color="#6b4a2e"
        roughness={0.85}
      />
    </group>
  );
}
