import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetBlipThrottleForTests,
  playNotificationSound,
} from '../../src/renderer/src/lib/sound';

let oscillatorStarts: number;
let frequencies: number[];

class FakeParam {
  constructor(private readonly record?: number[]) {}
  setValueAtTime(value: number): void {
    this.record?.push(value);
  }
  exponentialRampToValueAtTime(): void {}
}

class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam(frequencies);
  type = '';

  connect(next: unknown): unknown {
    return next;
  }

  start(): void {
    oscillatorStarts += 1;
  }

  stop(): void {}
}

class FakeAudioContext {
  currentTime = 0;
  destination = new FakeNode();

  createOscillator(): FakeNode {
    return new FakeNode();
  }

  createGain(): FakeNode {
    return new FakeNode();
  }
}

describe('playNotificationSound (D44)', () => {
  beforeEach(() => {
    oscillatorStarts = 0;
    frequencies = [];
    vi.stubGlobal('AudioContext', FakeAudioContext);
    __resetBlipThrottleForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays at most one message sound per 2s window', () => {
    expect(playNotificationSound('message', 'blip', 50, 1_000)).toBe(true);
    expect(playNotificationSound('message', 'blip', 50, 1_100)).toBe(false);
    expect(playNotificationSound('message', 'blip', 50, 2_900)).toBe(false);
    expect(oscillatorStarts).toBe(1);
    expect(playNotificationSound('message', 'blip', 50, 3_100)).toBe(true);
    expect(oscillatorStarts).toBe(2);
  });

  it('plays the chosen tone — the classic blip starts at 880 Hz', () => {
    playNotificationSound('message', 'blip', 50, 1_000);
    expect(frequencies[0]).toBe(880);
    frequencies = [];
    playNotificationSound('message', 'chime', 50, 4_000);
    expect(frequencies[0]).toBe(1047);
  });

  it('never lets a subscriber sound take a message\'s ring', () => {
    expect(playNotificationSound('subscriber', 'arpeggio', 50, 1_000)).toBe(true);
    expect(playNotificationSound('message', 'blip', 50, 1_100)).toBe(true);
    // A subscriber waits out a recent message and its own 10 s pause.
    expect(playNotificationSound('subscriber', 'arpeggio', 50, 2_000)).toBe(false);
    expect(playNotificationSound('subscriber', 'arpeggio', 50, 5_000)).toBe(false);
    expect(playNotificationSound('subscriber', 'arpeggio', 50, 11_000)).toBe(true);
  });

  it('plays a preview whenever it is pressed', () => {
    playNotificationSound('message', 'blip', 50, 1_000);
    expect(playNotificationSound('preview', 'bell', 100, 1_050)).toBe(true);
    expect(playNotificationSound('preview', 'bell', 100, 1_060)).toBe(true);
  });
});
