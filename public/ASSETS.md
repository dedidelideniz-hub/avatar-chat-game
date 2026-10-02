# Bundled assets - why they are not plain binaries

The hosting pipeline re-encodes every uploaded file as UTF-8. Any byte that is
not valid UTF-8 is replaced with U+FFFD, which destroys binary files: the
battle map failed to load ("Offset is outside the bounds of the DataView") and
all sound effects went silent. ASCII-only files survive untouched.

## `models/*.glb`

These files contain **single-file JSON glTF**, not GLB, even though they keep
the `.glb` extension. The model's binary chunk is embedded as a base64 `data:`
URI buffer, so the asset stays byte-exact while being pure ASCII.

three.js's `GLTFLoader` parses an ArrayBuffer that does not start with the
`glTF` magic as plain JSON, so `useGLTF("/models/5v5_game_map.glb")` and every
other existing path keep working unchanged. Mesh names, materials, skins and
animations are identical to the original binary file.

Regenerate from a real GLB:

```bash
node scripts/glb-to-embedded-json.mjs public/models/5v5_game_map.glb
```

### `models/witch_shop.glb` (caddedeki CADI DÜKKÂNI binası)

Cadde sırasındaki bir bina bu modelle çizilir (`WITCH_SHOP_INDEX` →
`src/engine/WitchShop.tsx`). Sketchfab dışa aktarımı olarak **binary** geldiği
ve yukarıdaki kural gereği hosting boru hattında bozulacağı için çevrildi:

```bash
node scripts/glb-to-embedded-json.mjs public/models/witch_shop.glb
# 20.05MiB -> 26.72MiB (ascii-only, byte-exact base64 buffer)
```

Model 18 mesh + 43 PNG doku taşır (uzantı gerektirmez; `EXT_meshopt` yok).
Dosya ~26.7MiB olduğu için ÖN YÜKLEME listesine (`streetPreload.STREET_BUILDING_MODELS`)
eklenmiştir: indirme **giriş ekranında** başlar ve oyuncu caddeye girdiğinde
bina yerinde olur. Eskiden cadde kurulduktan SONRA inmeye başlıyordu ve oyuncu
bir süre boşluğa bakıyordu ("ev gelmemiş") — bu yüzden `World` yükleme
kapısı bu modelleri de bekler (`readyModelUrls`), 12 sn'lik emniyet supabı
yine devredir.

Bu model caddedeki OYUNCU EVİDİR: kapısına gelince "Evine gir" düğmesi çıkar,
oyuncunun KENDİ odası açılır (odanın İÇİ ayrı bir modeldir — bkz.
`models/empty_office_space.glb`, `src/engine/RoomStage.tsx`). Evin içi
yürünemez; bina katıdır.

NOT: Dosya boyutunun ~21MiB'ı 43 PNG dokudur. Görünüşü bozmadan küçültmek
(dokuları 1K'ya indirmek) yüklemeyi belirgin hızlandırır; yapılırsa bu satır
güncellenmelidir.

Model bir dioramadır: dükkânın yanı sıra önünde bir `Road` ve dökülmüş
yapraklar içerir. Bunlar binanın parçası sayılmaz; ölçek/konum yalnızca bina
gövdesinden ÖLÇÜLEREK hesaplanır (`src/engine/witchShopPrep.ts`) — cephe hattı
komşu dükkânlarla aynı hizaya oturur, önündeki yol o hattın önüne taşar.

### `models/empty_office_space.glb` (oyuncu evinin ODASI — iç mekân)

Evin kapısından girilen odanın içi bu modeldir (`src/engine/constants.ts` →
`ROOM_MODEL_URL`, `src/engine/RoomStage.tsx`). Diğer modeller gibi **embedded
JSON glTF** olarak durmalıdır (yukarıdaki kural: hosting boru hattı binary
dosyayı bozar). Gerçek bir GLB geldiğinde:

```bash
node scripts/glb-to-embedded-json.mjs public/models/empty_office_space.glb
```

Uygulandı: **7,06MiB binary GLB → 9,40MiB ascii-only embedded JSON** (19 mesh,
13 PNG, 1 gömülü buffer). Dosya artık `{` ile başlar; `useGLTF` bunu düz JSON
glTF olarak ayrıştırır. Binary hâliyken istek `Failed to fetch` ile düşüyordu
(boru hattı gövdeyi UTF-8'e çevirirken bağlantıyı bozuyordu) — dönüştürülmüş
dosyada bu olmaz.

**Ana haritadan İZOLE**: oda, dünya uzayında X/Z **2000**'e yerleştirilir
(`ROOM_ISO.origin`); ana harita ±24 birimde bittiği için orada hiçbir şey
yoktur — cadde/çim/ağaçla çakışmaz.

**İÇ MEKÂN KESİTİ (Sanalika/Habbo)**: model kapalı bir kutudur (zemin + tavan +
dört duvar; duvarlar binanın TÜM gövdesi kadar yüksek olabilir). Kamera
dışarıda kalırsa oyuncu odanın içini değil kutunun DIŞINI görür. Bu yüzden
yüzeyler GEOMETRİDEN sınıflandırılır (isim varsayımı yok — adlar jenerik
`Plane.041`): en geniş yatay parça = ZEMİN, ondan belirgin yükseklikteki en üst
yatay parça = TAVAN, dikey/düzlemsi parçalar = DUVARLAR (`analyzeRoomSurfaces`).
Kesit tavanı + **kameraya bakan** iki duvarı gizler (`cutRoomForInterior`),
duvarların oda dışına taşan gövdesi dikey KIRPMA ile oda yüksekliğine indirilir
(`RoomStage` → `gl.clippingPlanes`). Ölçüm MODEL UZAYINDA yapılır (yerel
matrisler); sahne R3F grubuna bağlıyken `setFromObject` kullanılırsa 2000'lik
origin ölçüme sızar ve oda yanlış yere oturur.

Ölçek/konum SABİT DEĞİLDİR: model `Box3` ile ölçülür
(`src/engine/roomModelPrep.ts`). Ham açıklık dünya birimindeyse `scale: 1`
aynen kullanılır;
ham açıklık `fitBand` (2,5–60 birim) dışındaysa oda `span`a (10 birim) otomatik
ölçeklenir — 312 birimlik bir diorama odayı yutmaz. Plan İÇ hacimden kurulur
(`roomInteriorBox`: zeminin ayak izi + tavan yüksekliği), böylece merkez X/Z
origin'e, **taban y 0'a** oturur ve karakter zemine basar.

Kamera **İZOMETRİKTİR**: `origin + (12, 10, 12)` yönünden odanın merkezine
bakar (`camera.lookAt(2000, 0, 2000)`). Yükseklik 10 (~30°) Sanalika/Habbo
tarzı yumuşak izometrik açı verir. İç mekânda kamera biraz yaklaşır
(`camera.distanceScale = 0,55`) ki oda ekranı doldursun; oda büyükse mesafe oda
yine çerçevede kalacak kadar AÇILIR, yön asla değişmez. Oyuncu odanın TAM
merkezine doğar (`player.position = (2000, 0, 2000)`), zemine dokunarak yürür ve
**duvar sınırından** (ölçülen ayak izi) dışarı çıkamaz (`clampToRoom` +
`WallColliders`) — odanın dışında zemin yoktur.

**DÜZENLEME (build mode)**: modelin zemin mesh'i (adında `floor`/`zemin`/`taban`/
`ground` geçen en geniş parça; yoksa en geniş + en ince parça) `placementZone`
olarak işaretlenir ve eşya dizme raycaster'ı bunu hedefler. Zemin hiç
ayırt edilemezse ölçülen kutudan kodla bir zemin düzlemi kurulur. Dizilen
eşyalar **0,5 m ızgaraya** (`ROOM_ISO.grid`) oturur ve duvar sınırının dışına
ÇIKAMAZ (`src/engine/roomBuild.ts` → `placeFurniture`). Düzenleme **yalnızca
istemcidedir**, hiçbir yere kaydedilmez ve oda kapanınca sıfırlanır; araçlar
yalnızca odanın sahibine görünür.

**Dosya yoksa/bozuksa oyun çökmez:** oda, kodla çizilen YEDEK odaya
(`HouseRoom` → `ProceduralRoom`) düşer ve oyuncu yine odasını görür; model
hazır olduğunda 3D oda yumuşakça üstüne açılır. Model, cadde ön yüklemesine
EKLENMEZ (ağır iç mekân caddenin açılışını geciktirmesin); indirme kapıdaki
"Evine gir" yükleme ekranı sırasında başlar (`preloadRoomModel`).

### `models/comical_bomb.glb` (samurayın elindeki bomba — birincil model)

Samurayın elindeki bomba **bu dosyadan** yüklenir; yüklenemezse sırayla
`models/bomba.glb` ve en son prosedürel `buildStructuralBomb()` devreye girer
(sıra: `src/engine/SamuraiBomb.ts` → `BOMB_URLS`).

**Dosya projede ve AKTİF** (Sketchfab dışa aktarımı: 1 mesh, 587 yüzey köşesi,
4 PNG doku, `KHR_materials_emissive_strength`). Geldiği hâliyle **binary** bir
GLB olduğu için yukarıdaki kural gereği çevrildi:

```bash
node scripts/glb-to-embedded-json.mjs public/models/comical_bomb.glb
# 14.63MiB -> 19.51MiB (ascii-only, byte-exact base64 buffer)
```

Not: dosya ağır (4 doku: iki tanesi 4K PNG). Bomba elde küçük bir prop olduğu
İçin dokuları 1K'ya indirmek görünüşü değiştirmeden dosyayı ~1.5MiB'a düşürür;
yapılırsa bu satır güncellenmelidir. Model `SamuraiBomb` içinde ARKA PLANDA
yüklenir (önce prosedürel bomba çizilir, GLB hazır olunca yerine geçer), yani
ilk kareyi bloklamaz.

Ağız ateşi modele bağlı DEĞİLDİR: fünye ucu çalışma zamanında bulunur (adı
`fuse|wick|glow|flame|fire|ember|spark|alev` olan mesh/malzeme; yoksa modelin
en üst noktası) ve oraya canlı alev kurulur — bkz. `src/engine/BombFuseFlame.ts`.
Model değişse de ateş çalışır; yeni bir sabit gerekmez.

**Modelin pivot'u ve fünye ekseni de sorun değildir:** yükleme anında gövdenin
(fitil hariç) merkezi ve fünyenin yönü ölçülür; gövde merkezi avucun oturma
noktasına çekilir ve fünye istenen yöne hizalanır (`measureBodyCenter` /
`measureFuseDirection` → `SamuraiBomb.mount`). Yani Blender'da origin tabanda
kalmış ya da fitil yana çizilmiş bir model de doğru oturur.

Ölçüm **gerçek yüzey köşelerinden** yapılır (`BombFuseFlame.bodyPoints`) ve
ölçek referansı **gövde küresinin çapıdır** (`measureBodyBall`): en geniş kesit
aranır, merkezi ve yarıçapı oradan gelir. Bu iki ayrıntı olmadan model elde
bozuk duruyordu:

- eksen-hizalı kaba kutu, döndürülmüş bir modelde gövdeyi olduğundan büyük
  ölçüp bombayı **küçük** ölçekliyordu (bu modelde 3.63 yerine gerçek 1.96);
- üçgene bağlı olmayan "başıboş" köşeler (bu modelde 1182 köşenin 595'i) ve
  yukarı uzayan boyun/kapak, kutu merkezini yukarı kaydırıp bombayı avuca
  **gömüyordu**.

Avuçta oturma mesafesi (`BOMB_SEAT_OUT` ≈ normalize edilmiş yarıçap) bu ölçek
referansından türediği için top, model ne olursa olsun avuç çukurunda durur.

### `models/bomba.glb` (samurayın elindeki bomba — yedek model)

Bu dosya hazır bir GLB'den çevrilmedi, **üretildi**: `scripts/build-bomba-glb.mjs`
bombayı üç.js geometrileriyle kurar (gövde + pirinç bilezikler + fitil + yanan uç),
malzeme başına bir primitive olacak şekilde tek JSON glTF'ye yazar ve binary
chunk'ı base64 `data:` URI olarak gömer — yani yukarıdaki tüm kurallara uyar
(saf ASCII, `.glb` uzantısı, `useGLTF` ile doğrudan çalışır).

Yeniden üretmek için:

```bash
node scripts/build-bomba-glb.mjs
```

Model uzayı sözleşmesi (runtime bu uzayı bilir, `src/engine/HandGrip.ts`):
**gövde merkezi orijinde, gövde çapı 2.08 birim, fünye +Y yönünde, yanan uç
y ≈ 1.62.** Ölçek runtime'da gövde küresine göre normalize edilir. Hedef
**0.42 birim** (`BOMB_TARGET_WORLD_SPAN` — fırlatılan/tuzak bombayla aynı ölçü:
`0.105 × CHAR_HUD` × 2) — savaşçı ≈1.48 arena birimi olduğu için bu, karakter
boyunun ~%28'i: kuş bakışı (top-down) oyunlarda elde taşınan
prop **kasten** gerçek ölçüsünden ~1.6× büyük çizilir, yoksa oyuncu onu
karakterin silüeti ve zemin karmaşasında ayırt edemez (önceki 0.26 = %18'lik
"gerçekçi" ölçü tam bu yüzden elde okunmuyordu). Normalizasyon **gövde
küresinin çapına** göre yapılır (bkz. yukarıdaki ölçüm notları); fitil/kıvılcım
mesh'leri ölçümden çıkarılır (`measureBodySpan`), yoksa yana uzanan bir fitil
kutuyu şişirip bombayı olduğundan küçük ölçeklerdi. Avuçta oturma mesafesi bu
yarıçaptan türediği için ölçü değişse de bomba avuca tam oturur. Fitil alevinin
ölçeği ayrıdır ve bomba büyüdükçe birebir büyümez: `BOMB_FLAME_SPAN` = 0.20.
Bombada ayrıca iki okunurluk katmanı vardır: fünye ucunda canlı alev
(`createFuseFlame`) ve gövdede kızıl-turuncu hâle + zayıf nokta ışığı
(`createBombAura`) — ikisi de dokudan bağımsız, modele sabit gömülmez.
Malzeme adları sabittir:
`BombaBody`, `BombaBrass`, `BombaFuse`, `BombaFuseGlow` (fitil ucu runtime'da bu
adla bulunup `emissiveIntensity` yükseltilir). Dosya yüklenemezse aynı uzayda
üretilen prosedürel `buildStructuralBomb()` devreye girer — el boş kalmaz.

### `models/maple_tree.glb` (cadde ağacı — depoya eklenen model)

Caddenin ağaç sıraları bu modelden yüklenir. Dosya depoya **binary GLB** olarak
eklendi (4.63MiB, `glTF` magic'li gerçek GLB): yukarıdaki kural gereği
çevrilmeden servis edilemez, bu yüzden proje standardıyla ASCII'ye alındı:

```bash
node scripts/glb-to-embedded-json.mjs public/models/maple_tree.glb
# 4.63MiB -> 5.43MiB (ascii-only, byte-exact base64 buffer, aynı yol/uzantı)
```

Yani `useGLTF("/models/maple_tree.glb")` değişmeden çalışır; dönüşüm
**kayıpsızdır** (binary chunk base64 gömülü). Kaynak: Sketchfab "Maple tree"
(atrodler), CC-BY-4.0.

**Model bir SAHNE olarak geliyor, tek ağaç değil.** Ölçüm (`bun
scripts/check-veg-models.ts`, gerçek vertex verisi):

| Parça | Malzeme | Mesh | Vertex | Üçgen | İşlem |
|---|---|---|---|---|---|
| gövde + taç | `sugar_maple_bark` | 446 | 13 353 | 5 939 | çizilir |
| yaprak kartları | `sugar_maple_leaf` | 1622 | 12 976 | 6 488 | çizilir (çift yüz, gölge yok) |
| çim zemini | `grass` | 1 | 140 | 84 | **atılır** |
| groundcover | `Groundcover_Wood_Mix` | 1 | 24 | 22 | **atılır** |

Atılan iki kart 240×240 ve 84×84 birim: yerleştirilse her ağacın dibine
caddeyi kaplayan bir zemin yaması basardı (`skipMaterial` → `vegModelPrep.ts`).

**2070 mesh → 2 draw call.** Model her yaprak kartını ayrı bir node olarak
taşıyor; aynı malzemeye ait bütün geometriler yükleme anında TEK geometride
birleştirilir (`mergeGeometries`). Birleştirme olmasa malzeme başına 2070
`InstancedMesh`, yani 2070 draw call olurdu.

**Yön ve boy ölçülür, varsayılmaz:** gövde ham hâlde 239×325×242 birim
(yani ~324 birim boyunda, oyuncunun ~170 katı). Yükleme anında zemin kartları
"yer" kabul edilip ağacın hangi yöne uzandığı ölçülür; model baş aşağı
kaydedilmişse 180° X düzeltmesi otomatik uygulanır (`flipped` bayrağı konsola
yazılır). Sonra taban y=0'a, XZ merkezi orijine çekilir ve boy 1 birime
ölçeklenir — sahne sadece "kaç birim boyunda duracak" der (`VEG_SIZES.tree =
2.4` → uygulanan gerçek ölçek ≈ 0.0074, taç genişliği ≈ 1.8 birim).

**Yaprak kartlarında iki malzeme düzeltmesi yapılır:** `side = DoubleSide`
(GLB'de `doubleSided` yok; kartlar arkadan bakınca kaybolurdu) ve
`emissiveIntensity = 0.3` (GLB yaprak emissive'i 0.55 — gün ışığında kendi
kendine parlar). Kartlar ayrıca **gölge çizmez**: yaprak dokusunda alfa kanalı
yok (`colorType=2` RGB), yani kartlar opak ve yere dikdörtgen gölge basardı.

> Not: yaprak dokusu alfasız olduğu için taç, opak kartlardan oluşan bir kütle
> olarak çizilir (Sketchfab'daki görünümün aynısı). Taç "kare kare" görünürse
> çözüm modelin dokusuna alfa kanalı eklenip (`alphaMode: MASK`) dosyanın
> yeniden çevrilmesidir — kod tarafında tek satırlık `alphaTest` ayarı kalır.

Yerleşim: `constants.ts` → `TREE_ROWS` (iki sıra, eşit aralık; güney sırası
yarım adım kaydırılmış), örnek başına rastgele Y rotasyonu + ±%15 boyut.
Yapraklar GPU'da hafifçe salınır (vertex shader enjeksiyonu, `foliageSway.ts`):
kare başına tek uniform yazımı, ek draw call yok.

### `models/grass_ground.glb` (caddenin çim zemini — depoya eklenen model)

Caddenin yeşil alanları bu modellen döşenir. Kodla çizilen düz renkli ve
satranç/grid dokulu çim düzlemleri **tamamen kaldırıldı** (`GrassPatch`,
`makeGrassPlane`, `makeGrassTexture`, `GrassBorders`, `GRASS_TONES`,
`GRASS_TILE`, `GRASS_LIFT`, `GRASS_BORDERS`).

Depoya `simple_grass_ground_free_low_model (1).glb` adıyla **binary GLB** olarak
eklendi; kural gereği ASCII'ye çevrildi (dosya adı da sadeleştirildi):

```bash
mv "public/models/simple_grass_ground_free_low_model (1).glb" public/models/grass_ground.glb
node scripts/glb-to-embedded-json.mjs public/models/grass_ground.glb
# 6.57MiB -> 8.76MiB (ascii-only, byte-exact base64 buffer, aynı uzantı)
```

Ölçüm (`bun scripts/check-grass-ground.ts`, gerçek dosya): **1 mesh · 2 üçgen ·
4×4×0 birim düz zemin · normal +Y · UV 0…1 · 3 PNG doku (1024² basecolor +
normal + ORM)**. Model tek bir karo olduğu için zemin büyütülmez, **kendi
boyutu kadar (4 birim) adımla döşenir** (`GrassGround.tsx` +
`grassGroundPrep.ts`): 36×22'lik alan için 9×6 = **54 örnek → 1 draw call**,
komşu karo kenarları tam uç uca gelir. Doku kenar uyumu da ölçüldü: sol-sağ
11.3/255 ve üst-alt 11.5/255 → dikiş görünmez, ek düzeltme gerekmiyor.

İki malzeme düzeltmesi yapılır: `metalness = 0` (glTF varsayılanı
`metallicFactor = 1`; düzeltilmezse zemin koyu/metalik görünür) ve
`side = DoubleSide`.

Yükseklik: `GRASS_GROUND_Y = 0` — asfalt 0.008, kaldırım 0.005, yani çim
 yol/kaldırımın hemen altında kalır; tabanı 0 olan tüm proplar (akçaağaçlar,
banklar, otobüs durakları, lambalar, çöp kutuları, çitler) doğrudan bu zeminin
üstünde durur. Ağaç ve çim öbeği katmanı da `baseY = GRASS_GROUND_Y` kullanır.

### `models/tree.glb` · `models/bush.glb` · `models/grass_clump.glb`

Çalı ve çim örtüsü bu modellerden yüklenir (`VegetationModels.tsx` → `useGLTF`
+ `InstancedMesh`); prosedürel (üst üste küre/silindir) ağaç ve küre çalı
fonksiyonları **tamamen kaldırıldı**. `tree.glb` (üretilen low-poly ağaç,
144 üçgen) artık sahnede kullanılmıyor: akçaağaç yerine o istenirse
`vegModelPrep.ts` içindeki `TREE_MODEL_CONFIG`'in `url`'ünü `/models/tree.glb`
yapmak yeterli (normalizasyon + instancing kodu aynı kalır).

Bu üç dosya üretiliyor:

Hazır bir GLB'den çevrilmediler, **üretildiler**: `scripts/build-foliage-glb.mjs`
modelleri three.js geometrileriyle kurar, malzeme başına tek primitive olacak
şekilde glTF JSON'a yazar ve binary chunk'ı base64 `data:` URI olarak gömer —
yani yukarıdaki tüm kurallara uyar (saf ASCII, `.glb` uzantısı, `useGLTF` ile
doğrudan çalışır).

Yeniden üretmek için:

```bash
node scripts/build-foliage-glb.mjs
```

| Model | İçerik | Üçgen | Malzemeler |
|---|---|---|---|
| `tree.glb` | stilize yapraklı ağaç (gövde + 2 dal + 5 yaprak lobu) — kullanılmıyor | 144 | `TreeTrunk`, `TreeFoliageLight`, `TreeFoliageDark` |
| `bush.glb` | şekilli organik çalı (6 iç içe lob) — kullanılmıyor (çalılar sahneden kaldırıldı) | 120 | `BushFoliage`, `BushFoliageDark` |
| `grass_clump.glb` | 7 yapraklı 3D çim öbeği | 28 | `GrassBladeLight`, `GrassBladeDark` |

**Model uzayı ölçülerek uygulanır** (`useModelParts`): yükleme anında kaba kutu
alınır, taban y=0'a, XZ merkezi orijine çekilir ve boy 1 birime ölçeklenir.
Yani modeli değiştirip script'i yeniden çalıştırmak yerleşim kodunu bozmaz;
sahne tarafı sadece "kaç birim boyunda duracak" der (`VEG_SIZES`). Her örnek
rastgele Y rotasyonu (0–360°) ve 0.85–1.15 boyut çarpanı alır; parlaklık
0.9–1.1 arası `instanceColor` ile oynatılır (hepsi fabrikasyon durmasın).

Yerleşim verisi `constants.ts`'tedir (`TREE_ROWS`, `GRASS_CLUMP_ZONES`).
Malzemeler örnekler arasında paylaşılır ve modelin her malzemesi tek bir
`InstancedMesh`'e dönüşür → 15 akçaağaç + ~244 çim öbeği için toplam
**4 draw call**. Modeller bir hata sınırının (`ModelErrorBoundary`) arkasında
yüklenir: dosya bozuksa sadece o katman düşer, cadde çalışmaya devam eder
(ilkel yedek çizilmez).

Doğrulama: `bun scripts/check-veg-models.ts` gerçek dosyaları sahnenin kullandığı
AYNI hazırlık kodundan geçirir ve ölçümü yazar (draw call, yön düzeltmesi,
normalize boy, caddedeki taç genişliği).

Not: `stylized_bush.glb` (Sketchfab "Stylized Bush", CC-BY-4.0) depoda duruyor
ama artık hiçbir katman onu yüklemiyor — çalılar istendiği üzere sahneden
kaldırıldı. Geri istenirse `VegetationModels.tsx` içinde aynı desen
(`useGLTF` + `InstancedMesh`) ile birkaç satırda bağlanır.

## `sounds/*.mp3.b64`

Sound effects ship as standard base64 text companions (`base64 -w0`). The app
fetches `<name>.mp3.b64` and rebuilds the exact MP3 bytes before handing them
to WebAudio (see `src/lib/binaryAssets.ts`). Add a new sound by dropping the
MP3 in and running:

```bash
base64 -w0 public/sounds/new-sound.mp3 > public/sounds/new-sound.mp3.b64
```

Reference it in `src/lib/sounds.ts` as `/sounds/new-sound.mp3` - the `.b64`
suffix is added automatically.
