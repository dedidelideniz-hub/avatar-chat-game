// 🔊 Vaelos sound engine — plays real recorded sound effects (Mixkit
// royalty-free files, bundled in /public/sounds) through WebAudio for low
// latency. Files are fetched + decoded lazily and cached as AudioBuffers. If a
// file can't load (offline / missing), jsfxr procedural blips are used as a
// fallback so audio never breaks. Muted state is remembered in localStorage.
//
// The MP3s ship as ASCII base64 companions ("<file>.mp3.b64") because the
// hosting pipeline re-encodes binary files as UTF-8 and destroys their frames
// (which is exactly how the game went silent). See @/lib/binaryAssets.
//
// ── Signal flow (why the mix sounds "produced" instead of raw) ──────────────
//
//   source ─▸ voice gain ─▸ pan ─┬─▸ bus (sfx / ui / music) ─┐
//                                └─▸ reverb send ─▸ convolver ─┴─▸ limiter ▸ out
//
//   • LOUDNESS NORMALIZATION — every decoded file is measured once (RMS + peak)
//     and scaled to a common target, so a quiet footstep and a metal explosion
//     sit in the same mix instead of the explosion drowning everything.
//   • LIMITER — a fast compressor after the buses. Battle scenes stack dozens
//     of overlapping hits (player + bot + tower shots); without it the sum
//     clipped and the whole mix crackled.
//   • REVERB — a procedurally generated impulse (no asset) on `sfx`, which is
//     what makes impacts and supers read as "in the arena" rather than dry.
//   • LAYERS — synthesized transients (thump / crack / spark / sub / zap)
//     mixed *under* the recording: the sample gives character, the layers give
//     the punch. This is what turns a soft punch into a real hit impact.
//   • VARIATION — each sound has several variants plus random rate/gain jitter,
//     so repeated sword hits don't machine-gun as one identical sample.
//   • VOICE MANAGEMENT — per-sound throttle + concurrency cap, so a burst of
//     hits stays readable instead of turning into noise.
import { sfxr } from "jsfxr";
import { loadAssetBytes } from "@/lib/binaryAssets";

export type SoundName =
  | "click"
  | "chat"
  | "coin"
  | "buy"
  | "vip"
  | "error"
  | "shoot"
  | "hit"
  | "hurt"
  | "explode"
  | "super"
  | "dash"
  | "win"
  | "lose"
  | "invite"
  | "accept"
  | "decline"
  | "vs"
  | "step"
  | "thud"
  | "whoosh"
  /** Aktif kulenin ateşi — silaha göre daha ağır, alçak ve yankılı. */
  | "towerShot"
  /** Kule aktivasyonu / güçlendirmesi (inşa geri bildirimi). */
  | "towerUp";

type FileName = SoundName | "ambience";

/** Real sound files (royalty-free, Mixkit license). */
const FILES: Partial<Record<FileName, string>> & { ambience: string } = {
  click: "/sounds/select-click.mp3",
  chat: "/sounds/double-click.mp3",
  coin: "/sounds/winning-coin.mp3",
  buy: "/sounds/fairy-arcade-sparkle.mp3",
  vip: "/sounds/magic-notification-ring.mp3",
  error: "/sounds/wrong-answer-fail.mp3",
  shoot: "/sounds/short-laser-gun-shot.mp3",
  hit: "/sounds/impact-strong-punch.mp3",
  hurt: "/sounds/soft-quick-punch.mp3",
  explode: "/sounds/dramatic-metal-explosion.mp3",
  super: "/sounds/magic-sparkle-whoosh.mp3",
  dash: "/sounds/video-game-spin-jump.mp3",
  win: "/sounds/trumpet-fanfare.mp3",
  lose: "/sounds/sad-game-over-trombone.mp3",
  invite: "/sounds/select-click.mp3",
  accept: "/sounds/game-success-alert.mp3",
  decline: "/sounds/wrong-answer-fail.mp3",
  vs: "/sounds/epic-orchestra-transition.mp3",
  step: "/sounds/footsteps-tall-grass.mp3",
  thud: "/sounds/air-in-a-hit.mp3",
  whoosh: "/sounds/air-woosh.mp3",
  towerShot: "/sounds/short-laser-gun-shot.mp3",
  towerUp: "/sounds/fairy-arcade-sparkle.mp3",
  ambience: "/sounds/drums-of-war.mp3",
};

/**
 * Extra recordings used as alternates (round-robin) of an existing sound:
 * alternating samples is the cheapest way to stop repeated events (footsteps,
 * sword hits) from sounding like one copy-pasted click.
 */
const ALT_FILES: Record<string, string> = {
  "step:b": "/sounds/heavy-grass-step.mp3",
  "hit:b": "/sounds/soft-quick-punch.mp3",
  "hit:c": "/sounds/air-in-a-hit.mp3",
  "hurt:b": "/sounds/air-in-a-hit.mp3",
};

/** jsfxr fallback presets — used only when a real file can't be fetched. */
const FALLBACK_PRESETS: Partial<Record<SoundName, string>> = {
  click: "blipSelect",
  chat: "blipSelect",
  coin: "pickupCoin",
  buy: "powerUp",
  vip: "synth",
  error: "hitHurt",
  shoot: "laserShoot",
  hit: "hitHurt",
  hurt: "hitHurt",
  explode: "explosion",
  super: "powerUp",
  dash: "jump",
  win: "synth",
  lose: "hitHurt",
  invite: "blipSelect",
  accept: "powerUp",
  decline: "hitHurt",
  vs: "blipSelect",
  step: "blipSelect",
  thud: "hitHurt",
  whoosh: "jump",
  towerShot: "laserShoot",
  towerUp: "powerUp",
};

const STORAGE_KEY = "vaelos-ses-kapali";

/** Common loudness every sample is scaled to (RMS), inside the limiter head. */
const TARGET_RMS = 0.13;
/** Hard ceiling per sample so one loud file can never dominate the bus. */
const TARGET_PEAK = 0.94;

/* ------------------------------------------------------------------ */
/* Mixer                                                              */
/* ------------------------------------------------------------------ */

type Bus = "sfx" | "ui" | "music";
type Layer = "thump" | "crack" | "spark" | "sub" | "zap";

interface Variant {
  /** Key into FILES/ALT_FILES (e.g. "hit", "hit:b", "step:b"). */
  key: FileName | string;
  rate?: number;
  gain?: number;
}

interface SoundSpec {
  variants: readonly Variant[];
  bus?: Bus;
  /** Base gain (before normalization + jitter). */
  gain?: number;
  /** Base playback rate (pitch). */
  rate?: number;
  /** Reverb send, 0..1. */
  reverb?: number;
  /** ± random playback-rate jitter (0.08 = ±8%). */
  jitter?: number;
  /** ± random gain jitter. */
  gainJitter?: number;
  /** Synthesized layers mixed under the recording. */
  layers?: readonly Layer[];
  /** Layer level relative to the voice volume. */
  layerGain?: number;
  /** Minimum gap between two plays of this sound (ms). */
  throttleMs?: number;
  /** Max simultaneous voices of this sound. */
  maxVoices?: number;
}

const SPECS: Record<SoundName, SoundSpec> = {
  // ── UI ──────────────────────────────────────────────────────────────────
  click: {
    variants: [{ key: "click" }],
    bus: "ui",
    gain: 0.5,
    throttleMs: 28,
    maxVoices: 4,
  },
  chat: { variants: [{ key: "chat" }], bus: "ui", gain: 0.6, throttleMs: 60 },
  coin: {
    variants: [{ key: "coin" }],
    bus: "ui",
    gain: 0.7,
    layers: ["spark"],
    layerGain: 0.22,
    reverb: 0.12,
  },
  buy: {
    variants: [{ key: "buy" }],
    bus: "ui",
    gain: 0.8,
    layers: ["spark", "thump"],
    layerGain: 0.3,
    reverb: 0.22,
  },
  vip: {
    variants: [{ key: "vip" }],
    bus: "ui",
    gain: 0.85,
    reverb: 0.35,
  },
  error: { variants: [{ key: "error" }], bus: "ui", gain: 0.7 },
  invite: {
    variants: [{ key: "invite", rate: 0.92 }],
    bus: "ui",
    gain: 0.7,
    reverb: 0.15,
  },
  accept: {
    variants: [{ key: "accept" }],
    bus: "ui",
    gain: 0.85,
    layers: ["spark"],
    layerGain: 0.25,
    reverb: 0.2,
  },
  decline: {
    variants: [{ key: "decline", rate: 0.9 }],
    bus: "ui",
    gain: 0.8,
  },

  // ── Battle — attacks ────────────────────────────────────────────────────
  shoot: {
    variants: [{ key: "shoot" }, { key: "shoot", rate: 1.06 }],
    gain: 0.85,
    jitter: 0.05,
    reverb: 0.18,
    layers: ["zap"],
    layerGain: 0.3,
    throttleMs: 45,
    maxVoices: 7,
  },
  /**
   * Darbe sesi. Kayıt tek başına "yumuşak" kalıyordu: artık üç farklı kayıt
   * arasında seçim yapılır, altına sentetik gövde (thump) + kırılma transienti
   * (crack) bindirilir ve her vuruşta pitch/hacim hafifçe değişir. Böylece
   * "her vuruşta" duyulur, net bir çarpma olur ve tekrar hissi kaybolur.
   */
  hit: {
    variants: [
      { key: "hit" },
      { key: "hit:b", rate: 1.04 },
      { key: "hit:c", rate: 1.02 },
    ],
    gain: 0.95,
    reverb: 0.24,
    jitter: 0.09,
    gainJitter: 0.12,
    layers: ["thump", "crack"],
    layerGain: 0.75,
    throttleMs: 26,
    maxVoices: 8,
  },
  hurt: {
    variants: [{ key: "hurt" }, { key: "hurt:b", rate: 0.95 }],
    gain: 1,
    reverb: 0.16,
    jitter: 0.08,
    layers: ["thump"],
    layerGain: 0.6,
    throttleMs: 40,
    maxVoices: 6,
  },
  thud: {
    variants: [{ key: "thud" }, { key: "thud", rate: 0.82 }],
    gain: 0.72,
    jitter: 0.07,
    layers: ["thump"],
    layerGain: 0.5,
    throttleMs: 45,
    maxVoices: 4,
  },
  whoosh: {
    variants: [{ key: "whoosh" }, { key: "whoosh", rate: 1.08 }],
    gain: 0.75,
    reverb: 0.25,
    jitter: 0.07,
    throttleMs: 55,
    maxVoices: 4,
  },
  explode: {
    variants: [{ key: "explode" }, { key: "explode", rate: 0.94 }],
    gain: 0.95,
    reverb: 0.32,
    jitter: 0.1,
    layers: ["sub", "thump"],
    layerGain: 0.85,
    throttleMs: 90,
    maxVoices: 3,
  },
  super: {
    variants: [{ key: "super" }],
    gain: 0.95,
    reverb: 0.36,
    layers: ["spark"],
    layerGain: 0.3,
    throttleMs: 120,
    maxVoices: 3,
  },
  dash: {
    variants: [{ key: "dash" }],
    gain: 0.7,
    reverb: 0.16,
    throttleMs: 70,
    maxVoices: 3,
  },
  step: {
    variants: [
      { key: "step" },
      { key: "step:b", rate: 0.96 },
      { key: "step", rate: 1.04 },
    ],
    gain: 0.42,
    jitter: 0.1,
    gainJitter: 0.18,
    reverb: 0.1,
    throttleMs: 65,
    maxVoices: 3,
  },

  // ── Battle — towers ─────────────────────────────────────────────────────
  towerShot: {
    variants: [
      { key: "towerShot", rate: 0.8 },
      { key: "towerShot", rate: 0.86 },
    ],
    gain: 0.8,
    reverb: 0.3,
    jitter: 0.06,
    layers: ["sub", "zap"],
    layerGain: 0.7,
    throttleMs: 85,
    maxVoices: 4,
  },
  towerUp: {
    variants: [{ key: "towerUp", rate: 0.92 }],
    gain: 0.9,
    reverb: 0.34,
    layers: ["sub", "spark"],
    layerGain: 0.6,
  },

  // ── Match flow ──────────────────────────────────────────────────────────
  win: { variants: [{ key: "win" }], bus: "ui", gain: 0.9, reverb: 0.3 },
  lose: { variants: [{ key: "lose" }], bus: "ui", gain: 0.9, reverb: 0.3 },
  vs: { variants: [{ key: "vs" }], bus: "ui", gain: 0.85, reverb: 0.35 },
};

/* ------------------------------------------------------------------ */
/* Audio graph                                                        */
/* ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let limiter: DynamicsCompressorNode | null = null;
let buses: Record<Bus, GainNode> | null = null;
let reverb: ConvolverNode | null = null;
let reverbReturn: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

const buffers = new Map<string, Promise<LoadedSound | null>>();
const voices = new Map<SoundName, { active: number; lastAt: number }>();

let muted =
  typeof localStorage !== "undefined" &&
  localStorage.getItem(STORAGE_KEY) === "1";

interface LoadedSound {
  buffer: AudioBuffer;
  /** Loudness-normalization gain measured from the decoded audio. */
  norm: number;
}

/** Decaying-noise impulse response — gives the arena its short reverb tail. */
function buildImpulse(ac: AudioContext): AudioBuffer {
  const seconds = 1.5;
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Low-passed noise = dark tail (avoids the metallic "tin can" reverb).
      lp = lp * 0.74 + (Math.random() * 2 - 1) * 0.26;
      // Very short fade-in keeps the transient dry, long decay adds depth.
      const attack = i < ac.sampleRate * 0.008 ? i / (ac.sampleRate * 0.008) : 1;
      data[i] = lp * attack * Math.pow(1 - t, 2.3);
    }
  }
  return buf;
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    // Limiter → output. Every bus lands here so stacked hits can't clip.
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -7;
    limiter.knee.value = 8;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;

    out = ctx.createGain();
    out.gain.value = muted ? 0 : 1;
    limiter.connect(out);
    out.connect(ctx.destination);

    const mk = (level: number) => {
      const g = ctx!.createGain();
      g.gain.value = level;
      g.connect(limiter!);
      return g;
    };
    buses = { sfx: mk(1), ui: mk(0.85), music: mk(0.4) };

    // Shared reverb return: voices send a little signal here via `reverb`.
    reverb = ctx.createConvolver();
    reverb.buffer = buildImpulse(ctx);
    reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.55;
    reverb.connect(reverbReturn);
    reverbReturn.connect(limiter);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Measure a decoded buffer and return its loudness-normalization gain. */
function measureNorm(buf: AudioBuffer): number {
  const ch = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(buf.sampleRate / 500));
  let sum = 0;
  let count = 0;
  let peak = 0;
  for (let i = 0; i < ch.length; i += step) {
    const s = ch[i];
    sum += s * s;
    count += 1;
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  if (!Number.isFinite(rms) || rms <= 0.0002) return 1;
  let norm = TARGET_RMS / rms;
  if (peak > 0) norm = Math.min(norm, TARGET_PEAK / peak);
  return Math.min(8, Math.max(0.2, norm));
}

/** Strip an ID3v2 tag if present — some decoders choke on tagged MP3s. */
function stripId3(bytes: ArrayBuffer): ArrayBuffer {
  const head = new Uint8Array(bytes, 0, Math.min(10, bytes.byteLength));
  if (head.length < 10) return bytes;
  if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return bytes; // "ID3"
  const size =
    ((head[6] & 0x7f) << 21) |
    ((head[7] & 0x7f) << 14) |
    ((head[8] & 0x7f) << 7) |
    (head[9] & 0x7f);
  const start = 10 + size;
  if (start >= bytes.byteLength - 2) return bytes;
  return bytes.slice(start);
}

function fileFor(key: string): string | undefined {
  if (key in ALT_FILES) return ALT_FILES[key];
  return FILES[key as FileName];
}

/** Fetch + decode + normalize one sound file, cached. Resolves null on failure. */
function loadSound(key: string): Promise<LoadedSound | null> {
  const cached = buffers.get(key);
  if (cached) return cached;
  const ac = ctx;
  const p = (async (): Promise<LoadedSound | null> => {
    if (!ac) return null;
    const path = fileFor(key);
    if (!path) return null;
    try {
      const data = await loadAssetBytes(path);
      const buffer = await ac.decodeAudioData(stripId3(data));
      return { buffer, norm: measureNorm(buffer) };
    } catch {
      return null;
    }
  })();
  buffers.set(key, p);
  return p;
}

/* ------------------------------------------------------------------ */
/* Procedural layers                                                  */
/* ------------------------------------------------------------------ */

/** One second of white noise, reused by every noise-based layer. */
function getNoise(ac: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = Math.floor(ac.sampleRate);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

/**
 * Synthesized transient layers. These carry the "punch" of an impact — the
 * recording supplies the character, the layer supplies the hit.
 */
function synthLayer(
  kind: Layer,
  at: number,
  level: number,
  bus: GainNode,
): void {
  const ac = ctx;
  if (!ac || level <= 0) return;

  if (kind === "crack" || kind === "spark") {
    const dur = kind === "crack" ? 0.07 : 0.16;
    const src = ac.createBufferSource();
    const noise = getNoise(ac);
    src.buffer = noise;
    const filt = ac.createBiquadFilter();
    filt.type = kind === "crack" ? "bandpass" : "highpass";
    filt.frequency.value = kind === "crack" ? 2300 : 5200;
    filt.Q.value = kind === "crack" ? 0.9 : 0.7;
    const g = ac.createGain();
    const peak = level * (kind === "crack" ? 0.55 : 0.3);
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(bus);
    const offset = Math.random() * Math.max(0, noise.duration - dur - 0.01);
    src.start(at, offset, dur);
    src.stop(at + dur + 0.02);
    return;
  }

  // Tonal layers: an oscillator sweeping down for weight / energy.
  const osc = ac.createOscillator();
  const g = ac.createGain();
  let stop = at + 0.22;
  if (kind === "thump") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(190, at);
    osc.frequency.exponentialRampToValueAtTime(52, at + 0.17);
    g.gain.setValueAtTime(level * 0.5, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    stop = at + 0.22;
  } else if (kind === "sub") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(96, at);
    osc.frequency.exponentialRampToValueAtTime(34, at + 0.42);
    g.gain.setValueAtTime(level * 0.45, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    stop = at + 0.52;
  } else {
    // zap — high saw sweep, the "energy" half of a shot.
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1600, at);
    osc.frequency.exponentialRampToValueAtTime(240, at + 0.12);
    const filt = ac.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 420;
    osc.connect(filt);
    filt.connect(g);
    g.gain.setValueAtTime(level * 0.28, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
    g.connect(bus);
    osc.start(at);
    osc.stop(at + 0.16);
    return;
  }
  g.connect(bus);
  osc.connect(g);
  osc.start(at);
  osc.stop(stop);
}

/* ------------------------------------------------------------------ */
/* Playback                                                           */
/* ------------------------------------------------------------------ */

export interface PlayOptions {
  /** Extra gain multiplier (backwards compatible with old call sites). */
  volume?: number;
  /** Extra playback-rate multiplier. */
  rate?: number;
  /** Stereo position, -1 (sol) … 1 (sağ). */
  pan?: number;
  /** Reverb send override, 0..1. */
  reverb?: number;
}

const rand = (spread: number) => (Math.random() * 2 - 1) * spread;

/**
 * Play a sound effect: real recording (normalized + layered + reverbed) or, if
 * the file is unavailable, the jsfxr fallback blip.
 */
export function playSound(name: SoundName, opts?: PlayOptions): void {
  const ac = ensureCtx();
  const bus = buses?.[SPECS[name].bus ?? "sfx"];
  if (!ac || !bus || !limiter || muted) return;

  const spec = SPECS[name];
  const now = performance.now();
  let gate = voices.get(name);
  if (gate) {
    if (spec.throttleMs && now - gate.lastAt < spec.throttleMs) return;
    if (spec.maxVoices && gate.active >= spec.maxVoices) return;
  } else {
    gate = { active: 0, lastAt: 0 };
    voices.set(name, gate);
  }
  gate.lastAt = now;

  const variant = spec.variants[(Math.random() * spec.variants.length) | 0];
  const volume = opts?.volume ?? 1;
  const rate =
    (spec.rate ?? 1) *
    (variant.rate ?? 1) *
    (opts?.rate ?? 1) *
    (1 + rand(spec.jitter ?? 0));
  const gain =
    (spec.gain ?? 1) *
    (variant.gain ?? 1) *
    volume *
    (1 + rand(spec.gainJitter ?? 0));
  const pan = Math.min(1, Math.max(-1, opts?.pan ?? 0));

  void loadSound(variant.key).then((loaded) => {
    if (!loaded) {
      synthFallback(name, opts);
      return;
    }
    try {
      // Layers are scheduled at the SAME instant as the sample and only once
      // the buffer is in hand: a slow first load used to fire the synthesized
      // transient ahead of the recording, which read as two separate hits.
      const at = ac.currentTime + 0.002;
      for (const layer of spec.layers ?? []) {
        synthLayer(layer, at, (spec.layerGain ?? 1) * volume * (spec.gain ?? 1), bus);
      }
      const src = ac.createBufferSource();
      src.buffer = loaded.buffer;
      src.playbackRate.value = rate;
      const g = ac.createGain();
      g.gain.value = gain * loaded.norm;
      src.connect(g);
      let tail: AudioNode = g;
      if ("createStereoPanner" in ac && pan !== 0) {
        const panner = ac.createStereoPanner();
        panner.pan.value = pan;
        g.connect(panner);
        tail = panner;
      }
      tail.connect(bus);
      const send = opts?.reverb ?? spec.reverb ?? 0;
      if (send > 0 && reverb) {
        const sendGain = ac.createGain();
        sendGain.gain.value = send;
        tail.connect(sendGain);
        sendGain.connect(reverb);
      }
      gate!.active += 1;
      src.onended = () => {
        gate!.active = Math.max(0, gate!.active - 1);
      };
      src.start();
    } catch {
      synthFallback(name, opts);
    }
  });
}

/** Tiny procedural blip — only used when the real file is unavailable. */
function synthFallback(name: SoundName, opts?: PlayOptions): void {
  const ac = ctx;
  const preset = FALLBACK_PRESETS[name];
  if (!ac || !buses || !preset) return;
  try {
    const def = sfxr.generate(preset);
    const samples = sfxr.toBuffer(def);
    const buf = ac.createBuffer(1, samples.length, 44100);
    buf.getChannelData(0).set(samples);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts?.rate ?? 1;
    const gain = ac.createGain();
    gain.gain.value = (opts?.volume ?? 0.6) * 0.9;
    src.connect(gain);
    gain.connect(buses.sfx);
    src.start();
  } catch {
    // Audio is a bonus — never crash the game over it.
  }
}

/**
 * Decode sounds ahead of time so the first hit of a match doesn't arrive late.
 * Runs in idle time; failure is silent (the file simply falls back later).
 */
export function warmUpSounds(
  names: readonly SoundName[] = [
    "hit",
    "hurt",
    "shoot",
    "explode",
    "whoosh",
    "thud",
    "super",
    "towerShot",
    "step",
  ],
): void {
  const ac = ensureCtx();
  if (!ac || muted) return;
  const run = () => {
    for (const name of names) {
      for (const v of SPECS[name].variants) void loadSound(v.key);
    }
  };
  const idle = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
    }
  ).requestIdleCallback;
  // Idle-time decode: the first warp of a match must not wait on the network.
  if (idle) idle(run, { timeout: 2500 });
  else window.setTimeout(run, 600);
}

/** Call from a user gesture (first tap/click) to unlock audio on mobile browsers. */
export function unlockAudio(): void {
  const ac = ensureCtx();
  if (!ac) return;
  // iOS keeps the context suspended until resume() runs inside a real gesture.
  if (ac.state === "suspended") void ac.resume();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // ignore
  }
  if (out && ctx) {
    // Short ramp instead of a hard cut: no click / pop when toggling.
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(next ? 0 : 1, t, 0.02);
  }
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

/* ------------------------------------------------------------------ */
/* Continuous battle ambience — the war drums loop, with a low         */
/* synth-drone fallback if the file can't load.                        */
/* ------------------------------------------------------------------ */

interface Ambience {
  stop: (fade?: number) => void;
}

let ambience: Ambience | null = null;

/** Start the battle drum loop (idempotent). Must follow a user gesture. */
export async function startBattleAmbience(): Promise<void> {
  const ac = ensureCtx();
  const bus = buses?.music;
  if (!ac || !bus || ambience) return;
  // Savaş sesleri geri planda çözülür: ilk vuruşun sesi gecikmesin. (Sokak
  // sahnesinde gereksiz indirme olmasın diye burada, maç açılışında çağrılır.)
  warmUpSounds();
  try {
    const loaded = await loadSound("ambience");
    if (loaded) {
      const src = ac.createBufferSource();
      src.buffer = loaded.buffer;
      src.loop = true;
      // Tone control: rolling off the top keeps the loop behind the SFX.
      const tone = ac.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 6800;
      const gain = ac.createGain();
      const target = 0.6 * loaded.norm;
      const t = ac.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.02, target), t + 1.2);
      src.connect(tone);
      tone.connect(gain);
      gain.connect(bus);
      const sendGain = ac.createGain();
      sendGain.gain.value = 0.18;
      gain.connect(sendGain);
      if (reverb) sendGain.connect(reverb);
      src.start();
      ambience = {
        stop: (fade = 0.5) => {
          const now = ac.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
          try {
            src.stop(now + fade + 0.05);
          } catch {
            // ignore
          }
        },
      };
      return;
    }
  } catch {
    // fall through to the synth drone
  }
  synthDrone();
}

/** Stop the battle ambience (fades out — no hard cut). */
export function stopBattleAmbience(): void {
  if (!ambience) return;
  const a = ambience;
  ambience = null;
  try {
    a.stop();
  } catch {
    // ignore
  }
}

/** Procedural fallback — a low, slowly-breathing drone (no files needed). */
function synthDrone(): void {
  const ac = ctx;
  const bus = buses?.music;
  if (!ac || !bus) return;
  try {
    const gain = ac.createGain();
    gain.gain.value = 0.05;
    const oscs = [55, 82.4, 110.2].map((freq, i) => {
      const osc = ac.createOscillator();
      osc.type = i === 1 ? "sawtooth" : "sine";
      osc.frequency.value = freq;
      const og = ac.createGain();
      og.gain.value = i === 1 ? 0.1 : 0.32;
      const filt = ac.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 300 + i * 60;
      osc.connect(og);
      og.connect(filt);
      filt.connect(gain);
      osc.start();
      return osc;
    });
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.045;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
    gain.connect(bus);
    ambience = {
      stop: () => {
        oscs.forEach((o) => o.stop());
        lfo.stop();
        gain.disconnect();
      },
    };
  } catch {
    // ignore
  }
}
