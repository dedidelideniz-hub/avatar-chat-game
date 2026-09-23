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
