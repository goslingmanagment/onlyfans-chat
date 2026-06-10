// Test scaffolding for the db layer. Tests run on the Node-ABI driver alias
// (bsqlite3-mc-node); the app injects the Electron-ABI build at runtime.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDataLayer, createChangeBus } from '@main/db/index';
import type { ChatUpsert, DataLayer, MessageUpsert } from '@main/db/index';

export const TEST_DRIVER = 'bsqlite3-mc-node';

export function memoryDataLayer(): DataLayer {
  return createDataLayer({
    driverPath: TEST_DRIVER,
    filePath: ':memory:',
    encryptionKey: null,
    bus: createChangeBus(0),
  });
}

export interface TempDir {
  file: string;
  cleanup(): void;
}

export function tempDbFile(): TempDir {
  const dir = mkdtempSync(join(tmpdir(), 'chatgoose-db-'));
  return {
    file: join(dir, 'test.db'),
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function sampleChat(overrides: Partial<ChatUpsert> = {}): ChatUpsert {
  return {
    accountId: 'acct_1',
    chatId: '101',
    fanName: 'Fan One',
    unreadCount: 0,
    hasUnreadTips: false,
    lastMessageAt: '2026-06-01T10:00:00.000Z',
    lastMessagePreview: 'hey',
    lastMessageIsSentByMe: false,
    lastReadMessageId: null,
    pinned: false,
    canSendMessage: true,
    canNotSendReason: null,
    raw: { id: 101 },
    ...overrides,
  };
}

export function sampleMessage(overrides: Partial<MessageUpsert> = {}): MessageUpsert {
  return {
    accountId: 'acct_1',
    chatId: '101',
    messageId: 'm1',
    createdAt: '2026-06-01T10:00:00.000Z',
    isSentByMe: false,
    textHtml: '<p>hello</p>',
    textPlain: 'hello',
    price: 0,
    isOpened: null,
    isNew: false,
    isTip: false,
    tipAmount: null,
    tipText: null,
    replyTo: null,
    media: [],
    deleted: false,
    raw: { id: 'm1' },
    ...overrides,
  };
}
