// Bridge accessor: real preload bridge in Electron, dev mock in plain vite.

import type { ChatGooseBridge } from '../../../preload/contract';
import { createMockBridge } from '../dev/mockBridge';

let cached: ChatGooseBridge | null = null;

export function getBridge(): ChatGooseBridge {
  cached ??= window.chatgoose ?? createMockBridge();
  return cached;
}
