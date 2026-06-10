// Fixture-capture sanitization (SPEC §5): auth headers stripped, PII anonymized,
// structure preserved; the committed fixtures themselves stay PII-free.

import { describe, expect, it } from 'vitest';
import { createFixtureCapture } from '@main/ofapi/fixture-capture';
import { createOfApiSanitizer } from '@main/ofapi/sanitize';
import { loadFixture } from './helpers';

const REAL_ACCT = `acct_${'f'.repeat(32)}`;

describe('createOfApiSanitizer', () => {
  it('maps numeric ids stably and consistently across references', () => {
    const sanitizer = createOfApiSanitizer();
    const out = sanitizer.sanitize({
      fan: { id: 555, name: 'Real Name', username: 'realuser' },
      lastMessage: { fromUser: { id: 555 } },
    });
    const doc = JSON.parse(JSON.stringify(out));
    expect(doc.fan.id).not.toBe(555);
    expect(doc.fan.id).toBe(doc.lastMessage.fromUser.id);
    expect(doc.fan.name).toMatch(/^Fan \d+$/);
    expect(doc.fan.username).toMatch(/^fan\d{3}$/);
  });

  it('replaces texts, acct ids, URLs and drops contact fields', () => {
    const sanitizer = createOfApiSanitizer();
    const doc = JSON.parse(
      JSON.stringify(
        sanitizer.sanitize({
          account: REAL_ACCT,
          text: '<p>very private message</p>',
          tipText: 'secret note',
          avatar: 'https://public.onlyfans.com/files/x/y/photo.png?Policy=abc&Signature=def',
          email: 'fan@example.com',
          lockedText: false,
        }),
      ),
    );
    expect(doc.account).toMatch(/^acct_\d{2}0{30}$/);
    expect(doc.text).toBe('<p>Sample fan message text used in anonymized fixtures.</p>');
    expect(doc.tipText).toBe('Sample fan message text used in anonymized fixtures.');
    expect(doc.avatar).toBe('https://public.onlyfans.com/anonymized/sample.png');
    expect(doc.email).toBe('');
    expect(doc.lockedText).toBe(false); // booleans untouched
  });

  it('rewrites OFAPI next_page URLs but keeps pagination params usable', () => {
    const sanitizer = createOfApiSanitizer();
    const messageId = 9905078368395;
    const doc = JSON.parse(
      JSON.stringify(
        sanitizer.sanitize({
          data: [{ id: messageId }],
          _pagination: {
            next_page: `https://app.onlyfansapi.com/api/${REAL_ACCT}/chats/571617926/messages?limit=100&order=desc&first_id=${messageId}`,
          },
        }),
      ),
    );
    const nextPage = new URL(doc._pagination.next_page);
    expect(nextPage.pathname).not.toContain(REAL_ACCT);
    expect(nextPage.pathname).not.toContain('571617926');
    expect(nextPage.searchParams.get('limit')).toBe('100');
    expect(nextPage.searchParams.get('order')).toBe('desc');
    // cursor id stays consistent with the mapped message id
    expect(nextPage.searchParams.get('first_id')).toBe(String(doc.data[0].id));
  });

  it('scrubs profile anchors embedded in boilerplate strings', () => {
    const sanitizer = createOfApiSanitizer();
    const doc = JSON.parse(
      JSON.stringify(
        sanitizer.sanitize({
          subscriptionText: 'Paid for <a href="https://onlyfans.com/u12345">John Doe</a>',
        }),
      ),
    );
    expect(doc.subscriptionText).not.toContain('John Doe');
    expect(doc.subscriptionText).not.toContain('u12345');
  });
});

describe('createFixtureCapture', () => {
  const exchange = {
    method: 'GET',
    url: `https://app.onlyfansapi.com/api/${REAL_ACCT}/chats?limit=50`,
    requestHeaders: { authorization: 'Bearer super-secret-key', accept: 'application/json' },
    status: 200,
    responseHeaders: { 'set-cookie': 'session=abc', 'x-ofapi-credits-balance': '99' },
    responseBody: { data: [{ id: 1, text: 'hi there', fan: { id: 2, username: 'realfan' } }] },
  };

  it('writes a sanitized exchange with auth headers redacted', () => {
    const written: Array<{ path: string; contents: string }> = [];
    const capture = createFixtureCapture({
      dir: '/captures',
      enabled: true,
      writeFile: (path, contents) => written.push({ path, contents }),
      now: () => 1_770_000_000_000,
    });
    capture.record(exchange);

    expect(written).toHaveLength(1);
    const file = written[0];
    expect(file?.path).toContain('/captures/');
    expect(file?.path).toMatch(/get_.*\.json$/);
    const contents = file?.contents ?? '';
    expect(contents).not.toContain('super-secret-key');
    expect(contents).not.toContain('session=abc');
    expect(contents).not.toContain(REAL_ACCT);
    expect(contents).not.toContain('realfan');
    expect(contents).not.toContain('hi there');
    const doc = JSON.parse(contents);
    expect(doc.request.headers.authorization).toBe('[REDACTED]');
    expect(doc.response.headers['set-cookie']).toBe('[REDACTED]');
    expect(doc.response.headers['x-ofapi-credits-balance']).toBe('99');
    expect(doc.response.status).toBe(200);
    expect(doc._fixture.sanitized).toBe(true);
  });

  it('does nothing when disabled', () => {
    const written: string[] = [];
    const capture = createFixtureCapture({
      dir: '/captures',
      enabled: false,
      writeFile: (path) => written.push(path),
    });
    capture.record(exchange);
    expect(capture.enabled).toBe(false);
    expect(written).toHaveLength(0);
  });
});

describe('committed fixtures are PII-free and structurally intact', () => {
  const fixtures = ['list-chats.json', 'list-messages.json', 'user-details.json'];

  it('contains only fake acct ids, fake usernames, anonymized URLs', () => {
    for (const name of fixtures) {
      const raw = JSON.stringify(loadFixture(name));
      for (const match of raw.match(/acct_[0-9a-f]{32}/g) ?? []) {
        expect(match).toMatch(/^acct_\d{2}0{30}$/);
      }
      expect(raw).not.toMatch(/Policy=|Signature=/);
      for (const match of raw.match(/"username":\s*"([^"]+)"/g) ?? []) {
        expect(match).toMatch(/"username":\s*"(fan\d{3}|)"/);
      }
    }
  });

  it('keeps the envelope and counts the contract tests rely on', () => {
    const chats = JSON.parse(JSON.stringify(loadFixture('list-chats.json')));
    expect(chats.data).toHaveLength(10);
    expect(chats._meta._credits.used).toBe(1);
    expect(chats._pagination.next_page).toContain('limit=50');

    const messages = JSON.parse(JSON.stringify(loadFixture('list-messages.json')));
    expect(messages.data).toHaveLength(12);
    const lastId = messages.data[messages.data.length - 1].id;
    expect(messages._pagination.next_page).toContain(`first_id=${lastId}`);

    const user = JSON.parse(JSON.stringify(loadFixture('user-details.json')));
    expect(user.data.id).toBeTypeOf('number');
    expect(user._pagination).toBeUndefined(); // single-object envelope has no pagination
  });
});
