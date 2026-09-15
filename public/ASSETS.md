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
