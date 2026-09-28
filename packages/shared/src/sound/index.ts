// D44: notification sounds — synthesized, no audio files, no network.
//
// The same eight tones as the Fansly extension (fansly-chat E146,
// `src/shared/sound-synth.ts`) so a chatter hears one family of sounds; the
// DEFAULTS differ on purpose — here the message sound stays the app's classic
// `blip` and a new subscriber is `arpeggio`, while the extension defaults to
// `chime` / `double` — so a chatter working both clients hears which one rang.
// Platform-pure: the Web Audio surface is described by the minimal interfaces
// below, the renderer passes a real AudioContext.

export const SOUND_TONES = [
  'blip',
  'chime',
  'drop',
  'bell',
  'arpeggio',
  'knock',
  'double',
  'soft',
] as const;
export type SoundTone = (typeof SOUND_TONES)[number];

export const MESSAGE_SOUND_TONE_DEFAULT: SoundTone = 'blip';
export const SUBSCRIBER_SOUND_TONE_DEFAULT: SoundTone = 'arpeggio';

/** 50 % is the classic blip's loudness (peak 0.06); 100 % is +12 dB. */
export const SOUND_VOLUME_DEFAULT = 50;
export const SOUND_VOLUME_MIN = 5;
export const SOUND_VOLUME_MAX = 100;
export const SOUND_VOLUME_STEP = 5;
const MAX_PEAK_GAIN = 0.24;

/** Even a legitimate live burst must not machine-gun the speaker. */
export const MESSAGE_SOUND_MIN_INTERVAL_MS = 2_000;
/** A subscriber wave (a promo) rings at most this often, and never takes a
 * message's ring. */
export const SUBSCRIBER_SOUND_MIN_INTERVAL_MS = 10_000;

export function isSoundTone(value: unknown): value is SoundTone {
  return (SOUND_TONES as readonly unknown[]).includes(value);
}

export function normalizeSoundVolume(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return SOUND_VOLUME_DEFAULT;
  const stepped = Math.round(value / SOUND_VOLUME_STEP) * SOUND_VOLUME_STEP;
  return Math.min(SOUND_VOLUME_MAX, Math.max(SOUND_VOLUME_MIN, stepped));
}

/** Quadratic: loudness follows the slider the way ears expect. 50 → 0.06. */
export function volumeToGain(volume: number): number {
  const normalized = normalizeSoundVolume(volume) / 100;
  return MAX_PEAK_GAIN * normalized * normalized;
}

export interface ToneNote {
  wave: 'sine' | 'triangle';
  /** Seconds after the tone starts. */
  offset: number;
  startHz: number;
  endHz: number;
  /** Seconds (from the note's start) of the pitch glide; 0 = steady. */
  glide: number;
  attack: number;
  /** Seconds (from the note's start) where the gain is back at the floor. */
  release: number;
  stop: number;
}

const GAIN_FLOOR = 0.0001;

export const TONE_NOTES: Readonly<Record<SoundTone, readonly ToneNote[]>> = {
  /** The app's classic blip, note for note (880 → 1320 Hz, 0.2 s). */
  blip: [
    { wave: 'sine', offset: 0, startHz: 880, endHz: 1320, glide: 0.08, attack: 0.02, release: 0.18, stop: 0.2 },
  ],
  chime: [
    { wave: 'sine', offset: 0, startHz: 1047, endHz: 1047, glide: 0, attack: 0.01, release: 0.16, stop: 0.18 },
    { wave: 'sine', offset: 0.11, startHz: 1760, endHz: 1760, glide: 0, attack: 0.01, release: 0.3, stop: 0.32 },
  ],
  drop: [
    { wave: 'sine', offset: 0, startHz: 1400, endHz: 520, glide: 0.1, attack: 0.005, release: 0.16, stop: 0.18 },
  ],
  bell: [
    { wave: 'sine', offset: 0, startHz: 1568, endHz: 1568, glide: 0, attack: 0.005, release: 0.7, stop: 0.72 },
    { wave: 'sine', offset: 0, startHz: 3136, endHz: 3136, glide: 0, attack: 0.005, release: 0.25, stop: 0.27 },
  ],
  arpeggio: [
    { wave: 'triangle', offset: 0, startHz: 880, endHz: 880, glide: 0, attack: 0.008, release: 0.07, stop: 0.08 },
    { wave: 'triangle', offset: 0.07, startHz: 1109, endHz: 1109, glide: 0, attack: 0.008, release: 0.07, stop: 0.08 },
    { wave: 'triangle', offset: 0.14, startHz: 1319, endHz: 1319, glide: 0, attack: 0.008, release: 0.16, stop: 0.18 },
  ],
  knock: [
    { wave: 'triangle', offset: 0, startHz: 330, endHz: 220, glide: 0.05, attack: 0.004, release: 0.08, stop: 0.09 },
    { wave: 'triangle', offset: 0.14, startHz: 330, endHz: 220, glide: 0.05, attack: 0.004, release: 0.08, stop: 0.09 },
  ],
  double: [
    { wave: 'sine', offset: 0, startHz: 1320, endHz: 1320, glide: 0, attack: 0.01, release: 0.06, stop: 0.07 },
    { wave: 'sine', offset: 0.13, startHz: 1320, endHz: 1320, glide: 0, attack: 0.01, release: 0.06, stop: 0.07 },
  ],
  soft: [
    { wave: 'triangle', offset: 0, startHz: 660, endHz: 990, glide: 0.12, attack: 0.03, release: 0.35, stop: 0.37 },
  ],
};

interface AudioParamLike {
  setValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

interface AudioNodeLike {
  connect(destination: AudioNodeLike): AudioNodeLike;
}

interface OscillatorLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

interface GainLike extends AudioNodeLike {
  gain: AudioParamLike;
}

/** The slice of Web Audio a tone needs — the renderer's AudioContext, a fake in tests. */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: AudioNodeLike;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

/** Schedule every note of `tone` at `peakGain`, starting now. Throws if the
 * context refuses a node; the caller stays silent. */
export function scheduleTone(context: AudioContextLike, tone: SoundTone, peakGain: number): void {
  const t0 = context.currentTime;
  for (const note of TONE_NOTES[tone]) {
    const start = t0 + note.offset;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.startHz, start);
    if (note.glide > 0 && note.endHz !== note.startHz) {
      oscillator.frequency.exponentialRampToValueAtTime(note.endHz, start + note.glide);
    }
    gain.gain.setValueAtTime(GAIN_FLOOR, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(GAIN_FLOOR, peakGain), start + note.attack);
    gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, start + note.release);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + note.stop);
  }
}
