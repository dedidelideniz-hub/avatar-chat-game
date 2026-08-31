import * as THREE from "three";

/* ── [Equip] debug logging ────────────────────────────────────── */
/* Every diagnostic the equipment system prints, in one place. The
 * output is identical to the previous inline console calls — this
 * module only centralizes them so GlbAvatar3D stays readable. */

const P = "[Equip]";

const fmt2 = (v: number) => v.toFixed(2);
const fmtArr = (v: THREE.Vector3) => v.toArray().map(fmt2).join(",");

export const equipDebug = {
  glbCached(url: string, size: THREE.Vector3, normalized: THREE.Vector3) {
    console.log(
      `${P} GLB cached+normalized:`, url,
      "| origSize:", size.toArray().map(fmt2),
      "| normalized:", normalized.toArray().map(fmt2),
    );
  },

  attachStart(count: number, modelHeight: number) {
    console.log(`${P} attachEquippedToModel — equipped:`, count, "items, modelHeight:", modelHeight.toFixed(2));
  },

  skipEmpty() {
    console.log(`${P} No equipped items — skipping`);
  },

  rootWs(rootWs: THREE.Vector3, expected: number) {
    console.log(`${P} rootWs:`, fmtArr(rootWs), "expected:", expected.toFixed(2));
  },

  noDef(id: string) {
    console.warn(`${P} No registry def for:`, id);
  },

  noBuilder(id: string) {
    console.warn(`${P} No builder for (GLB-only?):`, id);
  },

  itemHeader(id: string, slot: string, hasBuild: boolean, glbPath: string) {
    console.log(`${P} ═══`, id, "→ slot:", slot, "| hasBuild:", hasBuild, "| glbPath:", glbPath);
  },

  glbFromCache(path: string) {
    console.log(`${P} Loaded GLB from cache:`, path);
  },

  glbAsyncFallback(path: string) {
    console.log(`${P} GLB loading async, using procedural fallback:`, path);
  },

  fullBodyAttached(id: string, scale: number, worldPos: THREE.Vector3) {
    console.log(`${P} ✅ FullBody GLB attached to root:`, id, "| scale:", scale.toFixed(3), "| worldPos:", fmtArr(worldPos));
  },

  noBone(slot: string, id: string) {
    console.warn(`${P} ❌ No bone found for slot:`, slot, "item:", id);
  },

  singleTarget(slot: string, found: number, first: string) {
    console.log(`${P} Single-target slot`, slot, ":", found, "bones found, using only first:", first);
  },

  foundBones(names: string[], slot: string) {
    console.log(`${P} ✅ Found bones:`, names, "for slot:", slot);
  },

  bone(name: string, parent: string | undefined, worldScale: number) {
    console.log(`${P} bone:`, name, "| parent:", parent, "| worldScale:", worldScale.toFixed(2));
  },

  glbScale(localScale: number, targetH: number) {
    console.log(`${P} GLB scale:`, localScale.toFixed(4), "| targetH:", targetH.toFixed(2));
  },

  scaleFix(ratio: number) {
    console.warn(`${P} Scale fix applied:`, ratio.toFixed(3));
  },

  attached(id: string, bone: string, scale: THREE.Vector3, worldPos: THREE.Vector3) {
    console.log(
      `${P} ✅ Attached`, id, "→ bone:", bone,
      "| scale:", scale.toArray().map((v) => v.toFixed(3)).join(","),
      "| worldPos:", fmtArr(worldPos),
    );
  },

  total(count: number) {
    console.log(`${P} Total attached:`, count);
  },

  reattach(prev: string, next: string, firstFrame: boolean) {
    console.log(`${P} useFrame re-attaching. prev:`, prev, "new:", next, "firstFrame:", firstFrame);
  },
};
