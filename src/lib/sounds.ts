// 🔊 8-bit retro sound effects for the whole game — generated procedurally
// with the jsfxr library (sfxr port), so no audio files are needed.
// Sounds are cached as WebAudio buffers after their first play, muted state
// is remembered in localStorage, and everything is wrapped in try/catch so
// audio never breaks the game.
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
  | "explode"
  | "super"
  | "dash"
  | "win"
  | "lose"
  | "invite"
  | "accept"
  | "decline"
  | "vs";

const PRESETS: Record<SoundName, string> = {
  click: "blipSelect",
  chat: "blipSelect",
  coin: "pickupCoin",
  buy: "powerUp",
  vip: "synth",
  error: "hitHurt",
  shoot: "laserShoot",
  hit: "hitHurt",
  explode: "explosion",
  super: "powerUp",
  dash: "jump",
  win: "synth",
  lose: "hitHurt",
  invite: "blipSelect",
  accept: "powerUp",
  decline: "hitHurt",
  vs: "blipSelect",
};

const STORAGE_KEY = "sanalika-ses-kapali";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SoundName, AudioBuffer>();
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

function bufferFor(name: SoundName): AudioBuffer | null {
  const ac = ctx;
  if (!ac) return null;
  const cached = buffers.get(name);
  if (cached) return cached;
  try {
    const def = sfxr.generate(PRESETS[name]);
    const samples = sfxr.toBuffer(def);
    const buf = ac.createBuffer(1, samples.length, 44100);
    buf.getChannelData(0).set(samples);
    buffers.set(name, buf);
    return buf;
  } catch {
    return null;
  }
}

/** Play a retro sound effect (no-op until the first user gesture unlocks audio). */
export function playSound(
  name: SoundName,
  opts?: { volume?: number; rate?: number },
): void {
  const ac = ensureCtx();
  if (!ac || !master || muted) return;
  const buf = bufferFor(name);
  if (!buf) return;
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
