/**
 * 🪑 OTURMA POZU — GERÇEK GLB MODELLERİ ÜZERİNDE ÖLÇÜM.
 *
 * `check-bench-sit.ts` modelleri ham glTF JSON'undan kurar; bu BETİK ise
 * oyunun kullandığı YOLUN AYNISINI kullanır (`GLTFLoader` + `MeshoptDecoder`)
 * ve oturma pozunu gerçek iskeletlere uygulayıp geometriyi ölçer. Fark önemli:
 * üç.js düğüm adlarını temizler (`UpperLeg.L` → `UpperLegL`) ve bu yüzden
 * varsayılan avatarın bacak kemikleri bir dönem HİÇ bulunamıyordu — karakter
 * bankta oturmuyor, bankın İÇİNDE ayakta duruyordu. Ham JSON'la kuran test
 * bunu göremez.
 *
 * Ölçülenler (her model için):
 *   • canSit / bulunan kemikler
 *   • diz, ayak bileği ve kalça yükseklikleri (poz uygulandıktan sonra)
 *   • kalça bölgesindeki en alt geometri (mindere değen doku) — gömülme testi
 *   • ayak bileğinin zemine göre konumu — gömülme/havada kalma testi
 *
 * Çalıştır: bun scripts/check-sit-model-pose.ts
 * (Node'da görüntü çözücü yok → dokular yüklenmeden önce ayıklanır.)
 */
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader, MeshoptDecoder } from "three-stdlib";
import {
  BENCH_SEAT_TOP,
  BENCH_SEAT_HEIGHT,
  PLAYER_3D_HEIGHT,
} from "../src/engine/constants";
import {
  applySitPose,
  canSit,
  findSitBones,
  measureSeatContact,
  tipOf,
} from "../src/engine/SitPose";

// three, ilerleme olayı için DOM tipi bekler; Node'da yok.
(globalThis as unknown as { ProgressEvent: unknown }).ProgressEvent = class {
  constructor(type: string, init: Record<string, unknown> = {}) {
    Object.assign(this, init, { type });
  }
};

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✔ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(label);
    console.log(`  ✘ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const MODELS = ["character", "skin-savasci", "skin-samuray", "skin-sevalye"];
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder());

function load(file: string): Promise<any> {
  const json = JSON.parse(readFileSync(`public/models/${file}.glb`, "utf8"));
  // Node'da görüntü çözme yok: dokuları ve malzeme referanslarını at.
  delete json.images;
  delete json.textures;
  delete json.samplers;
  delete json.materials;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) delete prim.material;
  }
  return new Promise((res, rej) =>
    loader.parse(JSON.stringify(json), "", res, rej),
  );
}

const worldPos = (o: THREE.Object3D) =>
  o.getWorldPosition(new THREE.Vector3());

/** Oturma pozu + kalça indirmesi uygulanmış dünyayı kurar. */
async function buildSeated(file: string) {
  const gltf = await load(file);
  const clone: THREE.Object3D = gltf.scene;
  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const size = new THREE.Vector3();
  box.getSize(size);
  const normScale = PLAYER_3D_HEIGHT / Math.max(size.y, 1e-4);

  // GlbAvatar3D'nin zinciri: dış grup → ölçekli iç grup (ayak payı).
  const inner = new THREE.Group();
  inner.scale.setScalar(normScale);
  inner.position.y = -box.min.y * normScale;
  const outer = new THREE.Group();
  outer.add(inner);
  inner.add(clone);
  outer.updateMatrixWorld(true);

  const bones = findSitBones(clone);
  const ready = canSit(bones);
  if (!ready)
    return { outer, clone, bones, ready, normScale, hips: null as null, contact: 0 };

  // Poz GERÇEKTEN GÖRÜNÜYOR mu: kemikler dönüyor ama MESH'ler takip ediyor mu?
  // (Bazı riglerde parçalar kemiğe bağlı değil, skini paylaşır.) Poz öncesi/
  // sonrası geometri sınır kutusu aynı kalsaydı poz sadece iskelette kalırdı.
  const restBox = new THREE.Box3().setFromObject(outer, true);
  applySitPose(clone, bones, 1, 1);
  outer.updateMatrixWorld(true);
  const doneBox = new THREE.Box3().setFromObject(outer, true);
  const posedHips = worldPos(bones.hips!).y;
  const posedKnee = worldPos(tipOf(bones.thighL!)!).y;
  const posedAnkle = worldPos(tipOf(bones.shinL!)!).y;
  // Kalça dokusu mindere değecek kadar aşağıda mı (oyunla aynı ölçüm).
  const contact = measureSeatContact(outer, bones);
  // Kalçayı mindere oturt: oyunun formülü (minder + ölçülen kalça dokusu).
  const target = BENCH_SEAT_TOP + contact;
  outer.position.y = target - posedHips;
  outer.updateMatrixWorld(true);

  return {
    outer,
    clone,
    bones,
    ready,
    normScale,
    contact,
    boneVsMesh: Math.max(
      Math.abs(doneBox.min.y - restBox.min.y),
      Math.abs(doneBox.min.z - restBox.min.z),
      Math.abs(doneBox.max.z - restBox.max.z),
    ),
    hips: {
      // Ölçülen kalça dokusu mindere konduktan sonraki konumlar.
      hips: target,
      knee: posedKnee + (target - posedHips),
      ankle: posedAnkle + (target - posedHips),
      pelvisBottom: target - contact,
    },
  };
}

console.log("── gerçek GLB'ler: oturma pozu ──");
for (const file of MODELS) {
  const r = await buildSeated(file);
  check(
    `${file}: oturma kemikleri bulundu (canSit)`,
    r.ready,
    r.ready
      ? `hips ${r.bones.hips?.name} · thigh ${r.bones.thighL?.name} · shin ${r.bones.shinL?.name}`
      : "kemik zinciri eksik → poz HİÇ uygulanmaz",
  );
  if (!r.ready || !r.hips) continue;

  check(
    `${file}: poz MESH'te görünüyor (kemik döndü → gövde takip etti)`,
    r.boneVsMesh > 0.02,
    `sınır kutusu farkı ${r.boneVsMesh.toFixed(3)} birim`,
  );
  const h = r.hips;
  console.log(
    `     ölçülen kalça dokusu derinliği ${r.contact.toFixed(3)} → gereken kalça yüksekliği ${(BENCH_SEAT_TOP + r.contact).toFixed(3)} · sabitimiz ${BENCH_SEAT_HEIGHT}`,
  );
  check(
    `${file}: minder yüksekliği kalça dokusunu gömüyor mu`,
    BENCH_SEAT_HEIGHT - BENCH_SEAT_TOP >= r.contact - 0.01,
    `gömülme ${(r.contact - (BENCH_SEAT_HEIGHT - BENCH_SEAT_TOP)).toFixed(3)} birim`,
  );
  // Poz gerçekten uygulandı mı: diz kalça seviyesinde/altında, bacak öne katlı.
  check(
    `${file}: bacaklar öne katlanmış (diz kalçanın 0.3 birim altına inmiyor)`,
    h.knee > h.hips - 0.3,
    `kalça ${h.hips.toFixed(2)} → diz ${h.knee.toFixed(2)}`,
  );
  // MİNDERE OTURMA: kalça dokusunun en alt noktası mindere değmeli — ne
  // derine gömülmeli ("bankın içine geçmiş" görünüm) ne de havada olmalı.
  // İki taraflı kontrol: sabit yükseklik hem yeterli hem de aşırı olmasın.
  const seatGap = (BENCH_SEAT_HEIGHT - r.contact) - BENCH_SEAT_TOP;
  check(
    `${file}: kalça mindere oturuyor (ne gömülü ne havada)`,
    seatGap > -0.06 && seatGap < 0.1,
    `kalça dokusu ${(BENCH_SEAT_HEIGHT - r.contact).toFixed(3)} · minder ${BENCH_SEAT_TOP} · fark ${seatGap.toFixed(3)} birim`,
  );
  // AYAK: uzun bacaklı modellerde yere basmalı, kısa bacaklılarda sarkabilir.
  check(
    `${file}: ayaklar zemine gömülmüyor`,
    h.ankle > -0.06,
    `ayak bileği y ${h.ankle.toFixed(3)}`,
  );
  check(
    `${file}: ayaklar havada asılı kalmıyor (sarkma < 0.35)`,
    h.ankle < 0.35,
    `ayak bileği y ${h.ankle.toFixed(3)}`,
  );
}

/* ── Kablo kontrolü: poz ölçümleri doğru olsa bile, oyunda oturma durumu
   avatarın deposuna bağlanmamışsa hiçbiri görünmez. ── */
console.log("── oyun kablosu (depo → avatar) ──");
const gameSrc = readFileSync("src/engine/GameEngine3D.tsx", "utf8");
const glbSrc = readFileSync("src/engine/GlbAvatar3D.tsx", "utf8");
check(
  "yerel oyuncu avatara `readSeatStore` geçiliyor (depo okunur)",
  /readSeatStore(\s|\n)*\/?>/.test(gameSrc),
);
check(
  "oturma durumu poz yeteneğine bağlı değil (iskelet tanınmasa da gömülmez)",
  /const want = activeSeat \? 1 : 0;/.test(glbSrc),
);
check(
  "otururken yürüyüş/idle klibi donduruluyor (mixer.timeScale)",
  /mixer\.timeScale/.test(glbSrc),
);
check(
  "oturma yönü tek kaynaktan: benchSeatYaw",
  /benchSeatYaw/.test(readFileSync("src/engine/benchSeat.ts", "utf8")) &&
    /activeSeat\.yaw/.test(glbSrc),
);

console.log(
  `\n${failures.length === 0 ? "TÜM KONTROLLER GEÇTİ ✔" : "BAŞARISIZ ✘"}`,
);
console.log(`${passed}/${passed + failures.length} kontrol geçti.`);
if (failures.length > 0) {
  console.log("Başarısız:", failures.join(", "));
  process.exit(1);
}
