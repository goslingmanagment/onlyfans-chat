import { describe, expect, it } from 'vitest';
import {
  MESSAGE_SOUND_TONE_DEFAULT,
  SOUND_TONES,
  SUBSCRIBER_SOUND_TONE_DEFAULT,
  TONE_NOTES,
  isSoundTone,
  normalizeSoundVolume,
  scheduleTone,
  volumeToGain,
  type AudioContextLike,
} from '../src/sound/index';

function fakeContext() {
  const starts: number[] = [];
  const ramps: Array<[number, number]> = [];
  const param = { setValueAtTime: () => undefined, exponentialRampToValueAtTime: (value: number, at: number) => ramps.push([value, at]) };
  const node = { connect: (next: unknown) => next };
  const context = {
    currentTime: 1,
    destination: node,
    createOscillator: () => ({ ...node, type: '', frequency: param, start: (at: number) => starts.push(at), stop: () => undefined }),
    createGain: () => ({ ...node, gain: param }),
  } as unknown as AudioContextLike;
  return { context, starts, ramps };
}

describe('notification sounds (D44)', () => {
  it('offers eight tones with defaults unlike the Fansly extension', () => {
    expect(SOUND_TONES).toHaveLength(8);
    expect(Object.keys(TONE_NOTES).sort()).toEqual([...SOUND_TONES].sort());
    // The extension defaults to chime / double (fansly-chat E146).
    expect(MESSAGE_SOUND_TONE_DEFAULT).toBe('blip');
    expect(SUBSCRIBER_SOUND_TONE_DEFAULT).toBe('arpeggio');
    expect(isSoundTone('bell')).toBe(true);
    expect(isSoundTone('siren')).toBe(false);
  });

  it('schedules every tone with valid ramps: target above zero, after the note start', () => {
    for (const tone of SOUND_TONES) {
      const { context, starts, ramps } = fakeContext();
      scheduleTone(context, tone, 0.06);
      expect(starts.length, tone).toBe(TONE_NOTES[tone].length);
      for (const [value, at] of ramps) {
        expect(value, tone).toBeGreaterThan(0);
        expect(at, tone).toBeGreaterThan(1);
      }
    }
  });

  it('maps 50 % to the classic peak and clamps the volume', () => {
    expect(volumeToGain(50)).toBeCloseTo(0.06, 10);
    expect(volumeToGain(100)).toBeCloseTo(0.24, 10);
    expect(normalizeSoundVolume(0)).toBe(5);
    expect(normalizeSoundVolume(62)).toBe(60);
    expect(normalizeSoundVolume('x')).toBe(50);
  });
});
