import type { ChatGooseBridge } from '../../../preload/contract';
import { getBridge } from './bridge';

/** Prove a real main/preload round trip before declaring the committed app
 * ready. If the query fails, the ready signal is deliberately never sent. */
export async function signalRendererReady(
  bridge: Pick<ChatGooseBridge, 'invoke'> = getBridge(),
): Promise<void> {
  await bridge.invoke('query:settings.get', undefined);
  await bridge.invoke('cmd:app.rendererReady', undefined);
}
