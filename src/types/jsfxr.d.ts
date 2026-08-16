declare module "jsfxr" {
  export interface SfxrSynthDef {
    [key: string]: number | boolean | string;
  }

  export const sfxr: {
    /** Generate a sound definition from a preset algorithm ("pickupCoin", "laserShoot", ...). */
    generate(
      algorithm: string,
      options?: { sound_vol?: number; sample_rate?: number; sample_size?: number },
    ): SfxrSynthDef;
    /** Raw PCM samples (Float32Array) for a sound definition. */
    toBuffer(def: SfxrSynthDef): Float32Array;
    /** WAV data URI wrapper with .getAudio()/.play(). */
    toWave(def: SfxrSynthDef): { dataURI: string; getAudio(): HTMLAudioElement };
    /** HTMLAudioElement that plays immediately. */
    toAudio(def: SfxrSynthDef): HTMLAudioElement;
    /** WebAudio buffer source node for a definition + context. */
    toWebAudio(def: SfxrSynthDef, ctx: AudioContext): AudioBufferSourceNode;
    /** Play a definition immediately via a generated <audio> element. */
    play(def: SfxrSynthDef): HTMLAudioElement;
  };

  const jsfxr: { sfxr: typeof sfxr };
  export default jsfxr;
}
