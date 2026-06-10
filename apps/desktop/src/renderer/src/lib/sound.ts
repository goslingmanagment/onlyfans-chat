// Tiny synthesized notification blip — no audio assets, no network.

let ctx: AudioContext | null = null;

export function playNotificationBlip(): void {
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
