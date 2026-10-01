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
 * Ara sokaktan (batı) dükkân cephesi boyunca kapıya uzanan taş şerit +
 * kapı eşiği. Şerit çimin 0.013 birim üstüne oturur (kaldırım 0.005,
 * asfalt 0.008), yani yürünebilir bandın tamamı görünür biçimde döşelidir.
 */
export function WitchShopWalkway() {
  const { pathWestX, entryEastX, pathSouthZ, pathNorthZ, entryWestX, frontZ } =
    WITCH_SHOP_WALKWAY;

  return (
    <group>
      {/* 1) Cephe boyunca uzanan ana şerit. */}
      <Plane
        westX={pathWestX}
        eastX={entryEastX}
        southZ={pathSouthZ}
        northZ={pathNorthZ}
        y={WALKWAY_Y}
        color="#c9bda2"
        roughness={0.94}
      />
      {/* Kenar bordürü — şeridin caddeye bakan kenarını belirginleştirir. */}
      <Plane
        westX={pathWestX}
        eastX={entryEastX}
        southZ={pathSouthZ}
        northZ={pathSouthZ - 0.12}
        y={WALKWAY_Y + 0.002}
        color="#a8977a"
        roughness={0.9}
      />
      {/* 2) Kapı eşiği — koridorun cepheyle buluştuğu yerde koyu ahşap. */}
      <Plane
        westX={entryWestX}
        eastX={entryEastX}
        southZ={pathNorthZ}
        northZ={frontZ - 0.35}
        y={WALKWAY_Y + 0.004}
        color="#6b4a2e"
        roughness={0.85}
      />
    </group>
  );
}
