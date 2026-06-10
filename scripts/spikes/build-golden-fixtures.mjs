// Build the P2 minimal golden set inputs (PLAN P2) from live captures in
// tmp/golden/ (gitignored, PII) → tests/fixtures/golden/<case>/input.json
// (anonymized, committed). Each case: OFAPI messages (ascending-age page,
// desc order as fetched) + the chat-embedded fan object + optional user-details.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { anonymize } from './anonymize-lib.mjs';

const root = process.cwd();
const probeChats = JSON.parse(readFileSync(join(root, 'tmp/probe-chats.json'), 'utf8'));

const CASES = [
  {
    name: 'rich-spender',
    chatId: 310112051,
    userDetails: null, // user-details 404s for this fan (deactivated) — degraded-path case
    note: 'Long conversation (100 msgs), $582 lifetime spender; user-details endpoint 404s (fail-open path).',
  },
  {
    name: 'tipper',
    chatId: 5969226,
    userDetails: null,
    note: 'Medium history with tip messages (tipAmount/tipText).',
  },
  {
    name: 'short-convo',
    chatId: 536206647,
    userDetails: 'tmp/golden/user-536206647.json',
    note: 'Short conversation (~25 msgs) with working user-details.',
  },
];

for (const c of CASES) {
  const messages = JSON.parse(
    readFileSync(join(root, `tmp/golden/messages-${c.chatId}.json`), 'utf8'),
  ).data;
  const fan = probeChats.data.find((chat) => chat.fan?.id === c.chatId)?.fan;
  if (!fan) throw new Error(`fan ${c.chatId} not in probe-chats`);
  const userDetails = c.userDetails
    ? JSON.parse(readFileSync(join(root, c.userDetails), 'utf8')).data
    : null;

  const fixture = anonymize(
    {
      _meta: {
        capturedAt: '2026-06-10',
        source: 'live OFAPI capture, anonymized (scripts/spikes/build-golden-fixtures.mjs)',
        note: c.note,
        anonymized: true,
      },
      messages,
      fan,
      userDetails,
    },
    { variedText: true },
  );
  const dir = join(root, 'tests/fixtures/golden', c.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'input.json'), JSON.stringify(fixture, null, 2) + '\n');
  console.log(`${c.name}: ${fixture.messages.length} messages, fan totalSumm=${fixture.fan.subscribedOnData?.totalSumm ?? 'n/a'}`);
}
