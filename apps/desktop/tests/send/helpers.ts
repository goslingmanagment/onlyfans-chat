// Scaffolding for the SPEC §7 send-engine matrix: in-memory DataLayer, a
// controllable SendClient stub (deferred sends, scripted failures, tail
// payloads), and OFAPI message factories matching the live fixture shapes.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { createChangeBus, createDataLayer } from '@main/db/index';
import type { ChatUpsert, DataLayer, MessageUpsert } from '@main/db/index';
import type { SendClient } from '@main/send/engine';
import type { OfApiMessage, OfApiSentMessage } from '@main/ofapi/schemas';

export const TEST_DRIVER = 'bsqlite3-mc-node';
export const ACCT = 'acct_test';
export const CHAT = '101';

const FIXTURES_DIR = new URL('../../../../tests/fixtures/ofapi/', import.meta.url);

export function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(name, FIXTURES_DIR)), 'utf8'));
}

export function memoryDataLayer(): DataLayer {
  return createDataLayer({
    driverPath: TEST_DRIVER,
    filePath: ':memory:',
    encryptionKey: null,
    bus: createChangeBus(0),
  });
}

export function seedChat(data: DataLayer, overrides: Partial<ChatUpsert> = {}): void {
  data.chats.upsert({
    accountId: ACCT,
    chatId: CHAT,
    fanName: 'Fan One',
    avatar: null,
    unreadCount: 0,
    hasUnreadTips: false,
    lastMessageAt: null,
    lastMessagePreview: '',
    lastMessageIsSentByMe: false,
    lastMessageId: null,
    lastReadMessageId: null,
    pinned: false,
    canSendMessage: true,
    canNotSendReason: null,
    raw: {},
    ...overrides,
  });
}

export function seedMessage(data: DataLayer, overrides: Partial<MessageUpsert> = {}): void {
  data.messages.upsertMany([
    {
      accountId: ACCT,
      chatId: CHAT,
      messageId: 'm1',
      createdAt: new Date().toISOString(),
      isSentByMe: true,
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
      raw: {},
      ...overrides,
    },
  ]);
}

/** Minimal media entry matching the wire shape mapMediaItem expects. */
export function makeWireMedia(id: number): Record<string, unknown> {
  return {
    id,
    type: 'photo',
    canView: true,
    isReady: true,
    files: { thumb: { url: `https://cdn2.onlyfans.com/files/m${id}/300.jpg` } },
  };
}

/** POST-response shape (fixture send-message-success.json): no isSentByMe. */
export function makeSentMessage(overrides: {
  id: number;
  text?: string;
  createdAt?: string;
  price?: number;
  mediaIds?: number[];
}): OfApiSentMessage {
  return {
    id: overrides.id,
    text: overrides.text ?? `<p>msg ${overrides.id}</p>`,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    isOpened: false,
    isNew: true,
    cancelSeconds: 86_399,
    ...(overrides.price !== undefined ? { price: overrides.price } : {}),
    ...(overrides.mediaIds !== undefined
      ? { media: overrides.mediaIds.map(makeWireMedia), mediaCount: overrides.mediaIds.length }
      : {}),
  } as OfApiSentMessage;
}

/** List-endpoint row shape: isSentByMe present. */
export function makeTailMessage(overrides: {
  id: number;
  text?: string;
  createdAt?: string;
  fromMe?: boolean;
  price?: number;
  mediaIds?: number[];
}): OfApiMessage {
  return {
    id: overrides.id,
    text: overrides.text ?? `<p>msg ${overrides.id}</p>`,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    isSentByMe: overrides.fromMe ?? true,
    isNew: false,
    isTip: false,
    ...(overrides.price !== undefined ? { price: overrides.price } : {}),
    ...(overrides.mediaIds !== undefined
      ? { media: overrides.mediaIds.map(makeWireMedia), mediaCount: overrides.mediaIds.length }
      : {}),
  } as OfApiMessage;
}

export interface SendCall {
  accountId: string;
  chatId: string;
  text: string;
  /** PPV path (P5): present only when the engine sent a media/PPV body. */
  price?: number;
  mediaFiles?: ReadonlyArray<string | number>;
  previews?: ReadonlyArray<string | number>;
  lockedText?: boolean;
}

export interface StubSendClient {
  client: SendClient;
  sendCalls: SendCall[];
  listMessagesCalls: number;
  typingCalls: number;
  markReadCalls: number;
  deleteCalls: string[];
  /** Per-call send behavior: index = 0-based call order. Default: success, fresh id. */
  onSend(fn: (call: SendCall, index: number) => Promise<OfApiSentMessage>): void;
  setTail(messages: OfApiMessage[]): void;
  setMarkReadResult(success: boolean): void;
}

export function makeStubClient(): StubSendClient {
  let tail: OfApiMessage[] = [];
  let nextId = 9_000_000_001;
  let markReadSuccess = true;
  let sendFn: (call: SendCall, index: number) => Promise<OfApiSentMessage> = (call) =>
    Promise.resolve(makeSentMessage({ id: nextId++, text: call.text }));

  const state: StubSendClient = {
    sendCalls: [],
    listMessagesCalls: 0,
    typingCalls: 0,
    markReadCalls: 0,
    deleteCalls: [],
    onSend(fn) {
      sendFn = fn;
    },
    setTail(messages) {
      tail = messages;
    },
    setMarkReadResult(success) {
      markReadSuccess = success;
    },
    client: {
      sendMessage: vi.fn(
        (params: {
          accountId: string;
          chatId: string;
          text: string;
          price?: number;
          mediaFiles?: ReadonlyArray<string | number>;
          previews?: ReadonlyArray<string | number>;
          lockedText?: boolean;
        }) => {
          const call: SendCall = {
            accountId: params.accountId,
            chatId: params.chatId,
            text: params.text,
            ...(params.price !== undefined ? { price: params.price } : {}),
            ...(params.mediaFiles !== undefined ? { mediaFiles: params.mediaFiles } : {}),
            ...(params.previews !== undefined ? { previews: params.previews } : {}),
            ...(params.lockedText !== undefined ? { lockedText: params.lockedText } : {}),
          };
          const index = state.sendCalls.length;
          state.sendCalls.push(call);
          return sendFn(call, index);
        },
      ),
      listMessages: vi.fn(async () => {
        state.listMessagesCalls += 1;
        return { messages: tail, nextPageUrl: null };
      }),
      deleteMessage: vi.fn(async (params: { messageId: string }) => {
        state.deleteCalls.push(params.messageId);
        return { success: true };
      }),
      startTyping: vi.fn(async () => {
        state.typingCalls += 1;
      }),
      markChatRead: vi.fn(async () => {
        state.markReadCalls += 1;
        return { success: markReadSuccess };
      }),
    } as unknown as SendClient,
  };
  return state;
}

/** Settles the pump/verifier microtask chains without firing any timer. */
export async function drain(): Promise<void> {
  for (let i = 0; i < 500; i += 1) {
    await Promise.resolve();
  }
}

export const toMediaUrl = (url: string): string =>
  `media://${Buffer.from(url).toString('base64url')}`;
