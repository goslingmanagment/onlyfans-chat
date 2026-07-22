import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetBlipThrottleForTests,
  playNotificationBlip,
} from '../../src/renderer/src/lib/sound';

let oscillatorStarts: number;

class FakeGainParam {
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
}

class FakeNode {
  gain = new FakeGainParam();
  frequency = new FakeGainParam();
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

describe('playNotificationBlip throttle', () => {
  beforeEach(() => {
    oscillatorStarts = 0;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    __resetBlipThrottleForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays at most one blip per 2s window', () => {
    playNotificationBlip(1_000);
    playNotificationBlip(1_100);
    playNotificationBlip(2_900);
    expect(oscillatorStarts).toBe(1);
  });

  it('plays again once the window elapsed', () => {
    playNotificationBlip(1_000);
    playNotificationBlip(3_100);
    expect(oscillatorStarts).toBe(2);
  });
});
