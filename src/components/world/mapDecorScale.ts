// 🪨 mapDecorScale — haritanın DEKORATİF çevre objelerini karakterle doğru
// orana getirir (ağaç, çalı, orman çimi, yaprak, mantar, kaya grubu, yer
// propları). Böylece karakter yerdeki taşlardan belirgin şekilde büyük okunur.
//
// NEDEN GEOMETRİ ÖLÇEKLEMESİ (node.scale DEĞİL):
//   Harita iki örnek hâlinde duruyor: drei önbelleğindeki KAYNAK sahne ve
//   BattleMapModel'in çizdiği KLON. `SkeletonUtils.clone` (Object3D.clone)
//   node dönüşümlerini KOPYALAR ama geometri/materyali REFERANSLA paylaşır.
//   Yani sonradan yapılan bir `node.scale` değişikliği ekrandaki klona asla
//   yansımaz; geometrinin kendisi ölçeklenirse hem kaynak hem klon aynı anda
//   küçülür. Bu yüzden ölçek, her mesh'in geometrisine uygulanır.
//
// PİVOT (objeler yerinden oynamasın):
//   Her mesh kendi ayak izinin MERKEZİNDEN (x/z) ve ait olduğu dekor grubunun
//   ZEMİN temasından (grup kutusunun min.y) ölçeklenir. Böylece:
//     · obje yatayda yerinde kalır (harita düzeni kaymaz),
//     · tabanı yere basmaya devam eder (havada asılı kalmaz, zemine gömülmez),
//     · aynı ağacın gövde + yaprak mesh'leri aynı taban pivotunu paylaştığı
//       için parçalar birbirinden kopmaz.
//
// KOLLİZYON: haritanın engel ızgarası (`buildCollisionGrid`) bu ölçeklemeden
// SONRA kurulur (bkz. MapPalette → BattleMapGuard sırası), yani küçülen
// kayanın engeli de küçülür: görsel ile fizik aynı kalır, "görünmez duvar"
// oluşmaz.
import * as THREE from "three";

/** Dekoratif çevre objelerinin yeni ölçeği — istenen %40-50 küçültme. */
export const DECOR_SCALE = 0.52;

/** Dekoratif objeler (küçültülecekler). */
const DECOR_RE =
  /(tree|foliage|grass|bush|shrub|plant|flower|fern|reed|mushroom|underbrush|groundcover|props|truck|rock)/i;

/** Yapısal/yürünen yüzeyler — ölçeklenmez. */
const KEEP_RE =
  /(terrain|ground|decal|river|water|stream|lake|pond|bridge|crossing|walkway|station|baseblue|basered|tower|wall|block|perimeter|sidewall|island)/i;

function isDecor(node: THREE.Object3D): boolean {
  const name = node.name;
  if (!name || KEEP_RE.test(name)) return false;
  return DECOR_RE.test(name);
}

/**
 * Dekoratif objeleri `scale` oranında küçültür (varsayılan %48).
 * Sahne başına BİR KEZ çalışır (drei önbelleği paylaşıldığı için areneye her
 * girişte tekrar küçülmesini engeller). Dönüş: kaç grup / kaç mesh ölçeklendi.
 */
export function scaleMapDecor(
  scene: THREE.Object3D,
  scale = DECOR_SCALE,
): { groups: number; meshes: number } {
  if (scene.userData.mapDecorScaled) return { groups: 0, meshes: 0 };
  scene.userData.mapDecorScaled = true;
  scene.updateMatrixWorld(true);

  // En ÜST dekor düğümleri (bir grup birden fazla obje taşıyabilir; alt
  // düğümleri tekrar ölçeklememek için yalnızca kökler toplanır).
  const props: THREE.Object3D[] = [];
  scene.traverse((node) => {
    if (!isDecor(node)) return;
    for (let p: THREE.Object3D | null = node.parent; p; p = p.parent) {
      if (isDecor(p)) return;
    }
    props.push(node);
  });

  const propBox = new THREE.Box3();
  const meshBox = new THREE.Box3();
  const pivot = new THREE.Vector3();
  const toLocal = new THREE.Matrix4();
  const scaled = new THREE.Matrix4();
  const transform = new THREE.Matrix4();
  let meshes = 0;

  for (const prop of props) {
    prop.updateWorldMatrix(true, true);
    propBox.setFromObject(prop);
    if (propBox.isEmpty()) continue;
    // Grubun zemin teması: tüm parçalar aynı tabandan ölçeklenir.
    const baseY = propBox.min.y;

    prop.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      // Grup içinde kalan yapısal parçalara (duvar, zemin, kule) dokunulmaz.
      if (mesh.name && KEEP_RE.test(mesh.name)) return;
      meshBox.setFromObject(mesh);
      if (meshBox.isEmpty()) return;
      pivot.set(
        (meshBox.min.x + meshBox.max.x) / 2,
        baseY,
        (meshBox.min.z + meshBox.max.z) / 2,
      );

      let geo = mesh.geometry as THREE.BufferGeometry;
      if (geo.userData.mapDecorScaled) {
        // Geometri başka bir örnekle paylaşılıyor: bu örnek kendi pivotuyla
        // ölçeklenebilsin diye bağımsız kopya alınır.
        geo = geo.clone();
        geo.userData = { ...geo.userData, mapDecorScaled: false };
        mesh.geometry = geo;
      }

      // p' = P + s·(p − P)  →  M⁻¹ · T(P − sP) · S(s) · M
      scaled.makeScale(scale, scale, scale);
      transform.makeTranslation(
        pivot.x * (1 - scale),
        pivot.y * (1 - scale),
        pivot.z * (1 - scale),
      );
      transform.multiply(scaled); // T · S
      toLocal.copy(mesh.matrixWorld).invert();
      transform.premultiply(toLocal); // M⁻¹ · T · S
      transform.multiply(mesh.matrixWorld); // M⁻¹ · T · S · M
      geo.applyMatrix4(transform);
      geo.userData.mapDecorScaled = true;
      meshes += 1;
    });
  }

  return { groups: props.length, meshes };
}
