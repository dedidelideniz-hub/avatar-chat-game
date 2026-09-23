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

**BU DOSYA ŞU AN PROJEDE YOK** — eklendiğinde kendiliğinden kullanılır.

⚠️ Gerçek (binary) bir GLB yüklenirse hosting boru hattı dosyayı UTF-8'e
çevirirken bozar (yukarıdaki kural: `.glb`'ler bu yüzden embedded-JSON'dır).
Bu yüzden dosyayı yüklemeden ÖNCE çevir:

```bash
node scripts/glb-to-embedded-json.mjs public/models/comical_bomb.glb
```

Ağız ateşi modele bağlı DEĞİLDİR: fünye ucu çalışma zamanında bulunur (adı
`fuse|wick|glow|flame|fire|ember|spark|alev` olan mesh/malzeme; yoksa modelin
en üst noktası) ve oraya canlı alev kurulur — bkz. `src/engine/BombFuseFlame.ts`.
Model değişse de ateş çalışır; yeni bir sabit gerekmez.

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
y ≈ 1.62.** Ölçek runtime'da dünya boyuna normalize edilir (hedef: 0.14 birim →
elin ölçüsü, bkz. `BOMB_TARGET_WORLD_SPAN`). Malzeme adları sabittir:
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
