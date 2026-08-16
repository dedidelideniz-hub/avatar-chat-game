// 🔊 Game sound engine — plays real recorded sound effects (Mixkit royalty-free
// files, bundled in /public/sounds) through WebAudio for low latency. Files are
// fetched + decoded lazily and cached as AudioBuffers. If a file can't load
// (offline / missing), the old jsfxr procedural blips are used as a fallback so
// audio never breaks. Muted state is remembered in localStorage.
import { sfxr } from "jsfxr";

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
  | "whoosh";

type FileName = SoundName | "ambience";

/** Real sound files (royalty-free, Mixkit license). */
const FILES: Record<FileName, string> = {
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
  ambience: "/sounds/drums-of-war.mp3",
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
};

const STORAGE_KEY = "sanalika-ses-kapali";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<FileName, Promise<AudioBuffer | null>>();
let muted =
  typeof localStorage !== "undefined" &&
  localStorage.getItem(STORAGE_KEY) === "1";

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Fetch + decode one sound file, cached. Resolves null on failure. */
function loadBuffer(name: FileName): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached) return cached;
  const ac = ctx;
  const p = (async () => {
    if (!ac) return null;
    try {
      const res = await fetch(FILES[name]);
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      return await ac.decodeAudioData(data);
    } catch {
      return null;
    }
  })();
  buffers.set(name, p);
  return p;
}

/** Play a sound effect (real file, with jsfxr fallback). */
export function playSound(
  name: SoundName,
  opts?: { volume?: number; rate?: number },
): void {
  const ac = ensureCtx();
  if (!ac || !master || muted) return;
  void (async () => {
    const buf = await loadBuffer(name);
    if (!buf) {
      playFallback(name, opts);
      return;
    }
    try {
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts?.rate ?? 1;
      const gain = ac.createGain();
      gain.gain.value = opts?.volume ?? 1;
      src.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      playFallback(name, opts);
    }
  })();
}

/** Tiny procedural blip — only used when the real file is unavailable. */
function playFallback(
  name: SoundName,
  opts?: { volume?: number; rate?: number },
): void {
  const ac = ctx;
  const preset = FALLBACK_PRESETS[name];
  if (!ac || !master || !preset) return;
  try {
    const def = sfxr.generate(preset);
    const samples = sfxr.toBuffer(def);
    const buf = ac.createBuffer(1, samples.length, 44100);
    buf.getChannelData(0).set(samples);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts?.rate ?? 1;
    const gain = ac.createGain();
    gain.gain.value = opts?.volume ?? 0.6;
    src.connect(gain);
    gain.connect(master);
    src.start();
  } catch {
    // Audio is a bonus — never crash the game over it.
  }
}

/** Call from a user gesture (first tap/click) to unlock audio on mobile browsers. */
export function unlockAudio(): void {
  ensureCtx();
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
  if (master && ctx) master.gain.value = next ? 0 : 0.5;
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
  stop: () => void;
}

let ambience: Ambience | null = null;

/** Start the battle drum loop (idempotent). Must follow a user gesture. */
export async function startBattleAmbience(): Promise<void> {
  const ac = ensureCtx();
  if (!ac || !master || ambience) return;
  try {
    const buf = await loadBuffer("ambience");
    if (buf) {
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ac.createGain();
      gain.gain.value = 0.5;
      src.connect(gain);
      gain.connect(master);
      src.start();
      ambience = { stop: () => src.stop() };
      return;
    }
  } catch {
    // fall through to the synth drone
  }
  startDrone();
}

/** Stop the battle ambience. */
export function stopBattleAmbience(): void {
  if (!ambience) return;
  try {
    ambience.stop();
  } catch {
    // ignore
  }
  ambience = null;
}

/** Procedural fallback — a low, slowly-breathing drone (no files needed). */
function startDrone(): void {
  const ac = ctx;
  if (!ac || !master) return;
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
    gain.connect(master);
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
