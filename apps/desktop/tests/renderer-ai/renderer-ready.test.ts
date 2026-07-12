import { describe, expect, it, vi } from 'vitest';
import type { ChatGooseBridge } from '../../src/preload/contract';
import { signalRendererReady } from '../../src/renderer/src/bridge/rendererReady';

describe('signalRendererReady', () => {
  it('proves a settings round trip before sending the post-commit acknowledgement', async () => {
    const invoke = vi.fn<(channel: string, args: unknown) => Promise<unknown>>(async () => undefined);
    await signalRendererReady({ invoke: invoke as ChatGooseBridge['invoke'] });
    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      'query:settings.get',
      'cmd:app.rendererReady',
    ]);
  });

  it('does not acknowledge readiness when the bridge query rejects', async () => {
    const invoke = vi.fn<(channel: string, args: unknown) => Promise<unknown>>(async (channel) => {
      if (channel === 'query:settings.get') throw new Error('preload IPC unavailable');
    });
    await expect(
      signalRendererReady({ invoke: invoke as ChatGooseBridge['invoke'] }),
    ).rejects.toThrow(/preload IPC unavailable/i);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
