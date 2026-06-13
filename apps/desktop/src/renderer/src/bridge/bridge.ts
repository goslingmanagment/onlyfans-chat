// Bridge accessor: real preload bridge in Electron, dev mock in plain vite.
// Wrapped once so EVERY failed invoke (react-query queries/mutations AND direct
// calls) is mirrored into the main-process log file — the single chokepoint that
// makes user-side IPC failures show up in the exported diagnostics, with no
// per-handler wiring on the main side.

import type {
  ChatGooseBridge,
  InvokeChannelName,
  InvokeChannels,
} from '../../../preload/contract';
import { createMockBridge } from '../dev/mockBridge';
import { CLIENT_LOG_CHANNEL, logClient } from '../lib/clientLog';

let cached: ChatGooseBridge | null = null;

function withFailureLogging(base: ChatGooseBridge): ChatGooseBridge {
  return {
    platform: base.platform,
    on: base.on,
    invoke<C extends InvokeChannelName>(channel: C, args: InvokeChannels[C]['args']) {
      const result = base.invoke(channel, args);
      // Side-observe the rejection (the original promise is still returned, so
      // callers handle it exactly as before). Skip the log channel to avoid a
      // logging→logging loop.
      if (channel !== CLIENT_LOG_CHANNEL) {
        void result.catch((error: unknown) => {
          logClient('error', 'invoke', `${channel} failed`, {
            channel,
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }
      return result;
    },
  };
}

export function getBridge(): ChatGooseBridge {
  cached ??= withFailureLogging(window.chatgoose ?? createMockBridge());
  return cached;
}
