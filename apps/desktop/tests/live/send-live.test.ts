// P3 gate evidence: ONE benign send through the PRODUCTION send stack — real
// OfApiClient → SendEngine pump (outbox row persisted before the POST) →
// verifier bookkeeping → unsend — against the owner-designated controlled
// test fan ONLY (.env P3_SEND_TEST_FAN_ID; an account the owner controls).
//
// NOT a regular test: runs only with P3_LIVE_SEND=1 + ONLYFANSAPI_API_KEY +
// P3_SEND_TEST_FAN_ID, performs real OFAPI calls (a few credits), and cleans
// up after itself (unsend). NEVER point it at any other chat id.
//
//   P3_LIVE_SEND=1 npx vitest run tests/live --testTimeout=120000
import { describe, expect, it } from 'vitest';
import { createDataLayer, createChangeBus } from '@main/db/index';
import { createOfApiClient } from '@main/ofapi/client';
import { createSendEngine } from '@main/send/engine';
import { auditOutbox } from '@main/send/audit';

const ENABLED =
  process.env['P3_LIVE_SEND'] === '1' &&
  typeof process.env['ONLYFANSAPI_API_KEY'] === 'string' &&
  typeof process.env['P3_SEND_TEST_FAN_ID'] === 'string' &&
  process.env['P3_SEND_TEST_FAN_ID'] !== '';

const ACCOUNT_ID = process.env['P3_LIVE_ACCOUNT_ID'] ?? 'acct_fbaf2216a7c84147a599f349e0a6fb87';

describe.skipIf(!ENABLED)('LIVE send-pipeline gate check (test fan only)', () => {
  it('send → outbox sent → message persisted → unsend tombstone', async () => {
    const chatId = process.env['P3_SEND_TEST_FAN_ID'] ?? '';
    const data = createDataLayer({
      driverPath: 'bsqlite3-mc-node',
      filePath: ':memory:',
      encryptionKey: null,
      bus: createChangeBus(0),
    });
    const client = createOfApiClient({ apiKey: process.env['ONLYFANSAPI_API_KEY'] ?? '' });
    const engine = createSendEngine({
      client,
      data,
      toMediaUrl: () => null,
      getSettings: async () => ({ markAsReadOnOpen: false }),
    });

    try {
      // The engine gates on the chats row — seed it from reality (read-only).
      const tail = await client.listMessages({ purpose: 'message-tail', accountId: ACCOUNT_ID, chatId, limit: 5 });
      data.chats.upsert({
        accountId: ACCOUNT_ID,
        chatId,
        fanName: 'P3 test fan',
        avatar: null,
        unreadCount: 0,
        hasUnreadTips: false,
        lastMessageAt: null,
        lastMessagePreview: '',
        lastMessageIsSentByMe: true,
        lastMessageId: tail.messages[0] ? String(tail.messages[0].id) : null,
        lastReadMessageId: null,
        pinned: false,
        canSendMessage: true,
        canNotSendReason: null,
        raw: {},
      });

      const marker = `p3-gate-${Math.floor(Date.now() / 1000)}`;
      const { localIds } = engine.sendParts({
        accountId: ACCOUNT_ID,
        chatId,
        parts: [`almost forgot to say goodnight 🌙 (${marker})`],
      });
      const localId = localIds[0] ?? '';
      expect(localId).not.toBe('');

      // Pump runs in the background; poll the journal like the UI would.
      let row = data.outbox.get(localId);
      const deadline = Date.now() + 60_000;
      while (row !== null && row.state !== 'sent' && row.state !== 'failed' && row.state !== 'unconfirmed') {
        if (Date.now() > deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
        row = data.outbox.get(localId);
      }

      expect(row?.state).toBe('sent');
      const messageId = row?.messageId ?? '';
      expect(messageId).not.toBe('');
      // The POST response was upserted into messages as our own send.
      const persisted = data.messages.get(ACCOUNT_ID, chatId, messageId);
      expect(persisted?.isSentByMe).toBe(true);
      expect(persisted?.textPlain).toContain(marker);

      // Journal audit over the live run: exactly one clean send, no findings.
      const report = auditOutbox(data);
      expect(report.cleanSends).toBe(1);
      expect(report.doubleClaims).toHaveLength(0);
      expect(report.suspectDuplicates).toHaveLength(0);

      // Cleanup: unsend through the production path; tombstone locally.
      await engine.unsend(ACCOUNT_ID, chatId, messageId);
      expect(data.messages.get(ACCOUNT_ID, chatId, messageId)?.deleted).toBe(true);
    } finally {
      engine.dispose();
      data.close();
    }
  });
});
