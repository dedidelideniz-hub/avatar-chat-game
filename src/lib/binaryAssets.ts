/**
 * Binary assets cannot be shipped as binaries in this project.
 *
 * The hosting pipeline re-encodes every uploaded file as UTF-8, so byte
 * sequences that are not valid UTF-8 (glTF headers, MP3 frames, WASM) get
 * replaced with U+FFFD. That silently destroys the file: the battle map failed
 * with "Could not load /models/5v5_game_map.glb: Offset is outside the bounds
 * of the DataView" and every sound effect went silent. Pure-ASCII files are
 * passed through untouched.
 *
 * Two ways the assets stay intact:
 *
 * 1. Models — `public/models/*.glb` are single-file JSON glTF documents whose
 *    binary chunk is embedded as a base64 `data:` URI (see
 *    `scripts/glb-to-embedded-json.mjs`). three.js's GLTFLoader parses an
 *    ArrayBuffer without the "glTF" magic as plain JSON, so every existing
 *    `useGLTF("/models/…")` call keeps working with no change.
 * 2. Sound effects — `public/sounds/*.mp3` ship as `<file>.mp3.b64` ASCII
 *    companions and are rebuilt here before being handed to WebAudio.
 */

const B64_SUFFIX = ".b64";

/** The base64 companion URL for a bundled audio asset path. */
export function binaryUrl(path: string): string {
  return `${path}${B64_SUFFIX}`;
}

/** Decode standard base64 (atob ignores whitespace) into raw bytes. */
export function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Fetch a bundled binary asset (as its base64 companion) and rebuild its exact
 * original bytes. `path` is the asset path as referenced in code, e.g.
 * "/sounds/select-click.mp3".
 */
export async function loadAssetBytes(path: string): Promise<ArrayBuffer> {
  const res = await fetch(binaryUrl(path));
  if (!res.ok) throw new Error(`asset ${binaryUrl(path)}: HTTP ${res.status}`);
  const bytes = decodeBase64(await res.text());
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
