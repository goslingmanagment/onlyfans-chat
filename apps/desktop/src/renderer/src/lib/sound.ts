// Tiny synthesized notification blip — no audio assets, no network.

/** Even a legitimate live burst must not machine-gun the speaker. */
const BLIP_MIN_INTERVAL_MS = 2_000;

let ctx: AudioContext | null = null;
let lastBlipAtMs = Number.NEGATIVE_INFINITY;

export function __resetBlipThrottleForTests(): void {
  lastBlipAtMs = Number.NEGATIVE_INFINITY;
}

export function playNotificationBlip(nowMs: number = Date.now()): void {
  if (nowMs - lastBlipAtMs < BLIP_MIN_INTERVAL_MS) {
    return;
  }
  lastBlipAtMs = nowMs;
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.exponentialRampToValueAtTime(1320, t0 + 0.08);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  } catch {
    // audio unavailable — stay silent
  }
}
