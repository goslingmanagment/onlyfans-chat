import { describe, expect, it } from 'vitest';
import {
  ofapiChatMessageSchema,
  parseOfapiChatMessages,
  type OfapiChatMessage,
} from '../src/transcript/ofapi-message';
import {
  estimateTargetPages,
  extractOldestMessageId,
  normalizeTranscriptMessages,
  transcriptWindowStartMs,
  OFAPI_MESSAGES_PAGE_SIZE,
  TRANSCRIPT_EMPTY_WINDOW_MS,
  type TranscriptMessage,
} from '../src/transcript/normalize';

// Legacy provenance: each case marked `legacy:` re-expresses a case from
// ~/code/goose/fansly-ext tests/transcript.test.ts, adapted from Fansly page/attachment
// shapes to OFAPI message fields (SPEC §8.2). Fansly orderhistory-evidence cases
// do not survive the mapping (PPV state is now direct on the message).

function makeMsg(overrides: Partial<OfapiChatMessage> = {}): OfapiChatMessage {
  return ofapiChatMessageSchema.parse({
    id: 1,
    text: '<p>hello</p>',
    giphyId: null,
    lockedText: false,
    isFree: true,
    price: 0,
    mediaCount: 0,
    media: [],
    previews: [],
    isTip: false,
    isFromQueue: false,
    isOpened: false,
    isNew: false,
    isSentByMe: false,
    createdAt: '2026-06-01T00:00:00+00:00',
    changedAt: '2026-06-01T00:00:00+00:00',
    ...overrides,
  });
}

function photo(id = 1): { id: number; type: string } {
  return { id, type: 'photo' };
}

function video(id = 2): { id: number; type: string } {
  return { id, type: 'video' };
}

describe('ofapiChatMessageSchema', () => {
  it('parses a live probe-shaped message with extra unknown fields intact', () => {
    // Verbatim shape from tmp/probe-messages.json (first item).
    const raw = {
      responseType: 'message',
      text: '<p>Mmm, legs are nice, I have a couple of interesting videos with legs 😏</p>',
      giphyId: null,
      lockedText: false,
      isFree: true,
      price: 0,
      isMediaReady: true,
      mediaCount: 0,
      media: [],
      previews: [],
      isTip: false,
      isReportedByMe: false,
      isCouplePeopleMedia: false,
      queueId: 41557325423,
      isMarkdownDisabled: true,
      releaseForms: [],
      fromUser: { id: 518588958, _view: 's' },
      isFromQueue: false,
      id: 9968460373551,
      isOpened: false,
      isNew: true,
      createdAt: '2026-06-10T14:56:16+00:00',
      changedAt: '2026-06-10T14:56:16+00:00',
      cancelSeconds: 72553,
      isLiked: false,
      canPurchase: false,
      canPurchaseReason: 'free',
      canReport: false,
      canBePinned: true,
      isPinned: false,
      isSentByMe: true,
    };
    const [parsed] = parseOfapiChatMessages([raw]);
    expect(parsed?.id).toBe(9968460373551);
    expect(parsed?.isSentByMe).toBe(true);
    const [normalized] = normalizeTranscriptMessages(parsed ? [parsed] : []);
    expect(normalized?.sender).toBe('Model');
    expect(normalized?.text).toBe(
      'Mmm, legs are nice, I have a couple of interesting videos with legs 😏',
    );
    expect(normalized?.createdAtMs).toBe(Date.parse('2026-06-10T14:56:16+00:00'));
  });

  it('parses media entries loosely (probe media carry files/videoSources/etc.)', () => {
    const parsed = ofapiChatMessageSchema.parse({
      id: 5,
      isSentByMe: true,
      createdAt: '2026-06-10T14:56:16+00:00',
      mediaCount: 1,
      media: [
        {
          id: 4017194483,
          type: 'photo',
          convertedToVideo: false,
          canView: true,
          hasError: false,
          createdAt: '2025-08-30T19:57:03+00:00',
          isReady: true,
          files: { full: { url: 'https://example.invalid/x.jpg' } },
          duration: 0,
          videoSources: { '240': null, '720': null },
        },
      ],
    });
    expect(parsed.media?.[0]?.type).toBe('photo');
  });

  it('rejects an unparseable createdAt', () => {
    expect(() => makeMsg({ createdAt: 'not-a-date' })).toThrow();
  });
});

describe('normalizeTranscriptMessages', () => {
  // legacy: 'normalizes messages from multiple pages, deduplicates, and sorts by createdAt'
  it('deduplicates by id (first occurrence wins) and sorts ascending across pages', () => {
    const page1 = [
      makeMsg({ id: 2, text: '<p>second</p>', createdAt: '2026-06-01T00:00:20+00:00' }),
      makeMsg({ id: 1, text: '<p>first</p>', isSentByMe: true, createdAt: '2026-06-01T00:00:10+00:00' }),
    ];
    const page2 = [
      makeMsg({ id: 2, text: '<p>duplicate</p>', createdAt: '2026-06-01T00:00:20+00:00' }),
      makeMsg({ id: 3, text: '<p>third</p>', createdAt: '2026-06-01T00:00:30+00:00' }),
    ];
    const result = normalizeTranscriptMessages([...page1, ...page2]);
    expect(result.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(result[0]?.sender).toBe('Model');
    expect(result[1]?.sender).toBe('Fan');
    expect(result[1]?.text).toBe('second');
  });

  it('tiebreaks equal createdAt by ascending id', () => {
    const result = normalizeTranscriptMessages([
      makeMsg({ id: 20, createdAt: '2026-06-01T00:00:00+00:00' }),
      makeMsg({ id: 3, createdAt: '2026-06-01T00:00:00+00:00' }),
    ]);
    expect(result.map((m) => m.id)).toEqual([3, 20]);
  });

  it('strips OF HTML and decodes entities in message text', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({ text: '<p>I &amp; you</p><p>line two</p>' }),
    ]);
    expect(result?.text).toBe('I & you\nline two');
  });

  // legacy: 'adds tip labels when totalTipAmount > 0' (mills 25000 → OFAPI dollars 25)
  it('labels tips with caller-joined amounts as [Tip: $25.00]', () => {
    const [result] = normalizeTranscriptMessages(
      [makeMsg({ id: 9, text: '<p>nice</p>', isTip: true })],
      { tipAmountsByMessageId: new Map([[9, 25]]) },
    );
    expect(result?.labels).toContain('[Tip: $25.00]');
  });

  it('prefers a message-level tipAmount over the caller join (ladder step 1)', () => {
    const [result] = normalizeTranscriptMessages(
      [makeMsg({ id: 9, isTip: true, tipAmount: 7 })],
      { tipAmountsByMessageId: new Map([[9, 25]]) },
    );
    expect(result?.labels).toEqual(['[Tip: $7.00]']);
  });

  it('renders a bare [Tip] when no amount source resolves (never fabricates)', () => {
    const [result] = normalizeTranscriptMessages([makeMsg({ isTip: true })]);
    expect(result?.labels).toEqual(['[Tip]']);
  });

  // legacy: 'resolves media labels from accountMedia map'
  it('labels a single photo as [Photo]', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({ text: '<p>look</p>', mediaCount: 1, media: [photo()] }),
    ]);
    expect(result?.labels).toContain('[Photo]');
  });

  // legacy: 'uses nested media.media.mimetype in preference...' (video classification)
  it('labels a single video as [Video] and a single audio as [Audio]', () => {
    const [v] = normalizeTranscriptMessages([makeMsg({ mediaCount: 1, media: [video()] })]);
    const [a] = normalizeTranscriptMessages([
      makeMsg({ mediaCount: 1, media: [{ id: 3, type: 'audio' }] }),
    ]);
    expect(v?.labels).toContain('[Video]');
    expect(a?.labels).toContain('[Audio]');
  });

  it('labels media type gif as [GIF]', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({ mediaCount: 1, media: [{ id: 4, type: 'gif' }] }),
    ]);
    expect(result?.labels).toContain('[GIF]');
  });

  // legacy: 'emits no label for unknown attachment contentType' — adapted: an entry in
  // media[] is definitely media, so unknown types degrade to [Media] instead of silence.
  it('falls back to [Media] for unknown single media types without claiming PPV state', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({ mediaCount: 1, media: [{ id: 5, type: 'document' }] }),
    ]);
    expect(result?.labels).toEqual(['[Media]']);
  });

  // legacy: 'returns conservative [Media] for unresolved contentType:1 attachments'
  it('labels an unresolved single (mediaCount 1, empty media[]) as [Media] with no PPV claims', () => {
    const [result] = normalizeTranscriptMessages([makeMsg({ text: '<p>mystery</p>', mediaCount: 1 })]);
    expect(result?.labels).toContain('[Media]');
    expect(result?.labels.join(' ')).not.toContain('PPV');
  });

  // legacy: 'preserves bundle identity for contentType:2 attachments missing from bundleMap'
  it('labels an unresolved multi-media message as bare [Media Bundle] with no state claims', () => {
    const [result] = normalizeTranscriptMessages([makeMsg({ mediaCount: 5 })]);
    expect(result?.labels).toContain('[Media Bundle]');
    const joined = result?.labels.join(' ') ?? '';
    expect(joined).not.toContain('PPV');
    expect(joined).not.toContain('purchased');
    expect(joined).not.toContain('unknown');
  });

  // legacy: 'counts bundle children resolved via accountMediaIds when bundleContent is missing'
  it('counts photos and videos for multi-media messages', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({ mediaCount: 2, media: [photo(1), video(2)] }),
    ]);
    expect(result?.labels).toContain('[Media Bundle: 1 Photo, 1 Video]');
  });

  // legacy: 'counts bundle children resolved via bundleContent (order is irrelevant for counts)'
  it('keeps Photos-then-Videos label order regardless of media[] order', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({ mediaCount: 2, media: [video(2), photo(1)] }),
    ]);
    expect(result?.labels).toContain('[Media Bundle: 1 Photo, 1 Video]');
  });

  // legacy: 'handles a mixed message: ... free bundle counts independently' (count formatting)
  it('pluralizes bundle counts: 4 Photos, 1 Video', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({
        mediaCount: 5,
        media: [video(1), photo(2), photo(3), photo(4), photo(5)],
      }),
    ]);
    expect(result?.labels).toEqual(['[Media Bundle: 4 Photos, 1 Video]']);
  });

  // legacy: 'survives bundles with unresolved child ids by counting only resolved ones'
  it('counts only photo/video entries, ignoring unknown-typed bundle members', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({
        mediaCount: 3,
        media: [photo(1), { id: 2, type: 'document' }, { id: 3, type: null }],
      }),
    ]);
    expect(result?.labels).toContain('[Media Bundle: 1 Photo]');
  });

  // legacy: 'labels PPV single as "PPV $X, purchased" only when an exact fan order matches'
  // — adapted: sent + isOpened === true is the OFAPI purchase evidence (SPEC §8.2).
  it('labels sent + opened PPV media as purchased with the dollar price', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({
        isSentByMe: true,
        price: 80,
        isFree: false,
        isOpened: true,
        mediaCount: 1,
        media: [video()],
      }),
    ]);
    expect(result?.labels).toContain('[Video — PPV $80.00, purchased]');
    expect(result?.labels.join(' ')).not.toContain('unknown');
  });

  // legacy: 'labels a PPV single as not purchased only when exact verifier evidence checked empty'
  it('labels sent + unopened PPV media as not purchased', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({
        isSentByMe: true,
        price: 33,
        isFree: false,
        isOpened: false,
        mediaCount: 1,
        media: [video()],
      }),
    ]);
    expect(result?.labels).toContain('[Video — PPV $33.00, not purchased]');
    expect(result?.labels.join(' ')).not.toContain(', purchased]');
  });

  // legacy: 'treats viewer-side `purchased: true` with no fan order as PPV unknown (key regression)'
  // — adapted: when isOpened is absent the state is genuinely unavailable.
  it('keeps PPV state unknown when isOpened is missing', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({
        isSentByMe: true,
        price: 33,
        isFree: false,
        isOpened: null,
        mediaCount: 1,
        media: [video()],
      }),
    ]);
    expect(result?.labels).toContain('[Video — PPV $33.00, unknown]');
  });

  // legacy: 'keeps PPV unknown when fanAccountId is null even if verifier evidence is supplied'
  // — adapted: purchase semantics only exist for the model's own sent messages.
  it('keeps PPV state unknown for paid messages not sent by the model', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({
        isSentByMe: false,
        price: 5,
        isFree: false,
        isOpened: true,
        mediaCount: 1,
        media: [video()],
      }),
    ]);
    expect(result?.labels).toContain('[Video — PPV $5.00, unknown]');
  });

  // legacy: 'labels purchased PPV bundles with counts when the inline order matches'
  it('labels purchased multi-media PPV with counts', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({
        isSentByMe: true,
        price: 20,
        isFree: false,
        isOpened: true,
        mediaCount: 2,
        media: [video(1), video(2)],
      }),
    ]);
    expect(result?.labels).toContain('[Media Bundle: 2 Videos — PPV $20.00, purchased]');
  });

  // legacy: 'labels a PPV bundle as not purchased only with exact checked verifier evidence'
  it('labels an unresolved multi-media PPV message as not purchased when sent and unopened', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({ isSentByMe: true, price: 8, isFree: false, isOpened: false, mediaCount: 3 }),
    ]);
    expect(result?.labels).toContain('[Media Bundle — PPV $8.00, not purchased]');
  });

  it('labels a paid message without media as a standalone [PPV …] label', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({
        isSentByMe: true,
        price: 5,
        isFree: false,
        isOpened: false,
        lockedText: true,
        text: '',
      }),
    ]);
    expect(result?.labels).toEqual(['[PPV $5.00, not purchased]']);
  });

  it('treats OFAPI price as dollars — never divides by 1000', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({ isSentByMe: true, price: 9.99, isFree: false, isOpened: true, mediaCount: 1, media: [photo()] }),
    ]);
    expect(result?.labels).toContain('[Photo — PPV $9.99, purchased]');
  });

  // legacy: 'does not infer PPV from a tip on free media (regression: tips ≠ purchases)'
  it('does not infer PPV from a tip on a free media message', () => {
    const [result] = normalizeTranscriptMessages(
      [makeMsg({ id: 7, text: '<p>thanks</p>', isTip: true, mediaCount: 1, media: [photo()] })],
      { tipAmountsByMessageId: new Map([[7, 5]]) },
    );
    expect(result?.labels).toContain('[Photo]');
    expect(result?.labels).toContain('[Tip: $5.00]');
    expect(result?.labels.join(' ')).not.toContain('PPV');
  });

  // legacy: 'treats a tip-only attachment (contentType:7) as silent — no [Media] label'
  it('labels a tip-only message with just the tip — no [Media]', () => {
    const [result] = normalizeTranscriptMessages(
      [makeMsg({ id: 7, text: '', isTip: true })],
      { tipAmountsByMessageId: new Map([[7, 100]]) },
    );
    expect(result?.labels).toEqual(['[Tip: $100.00]']);
  });

  // legacy: 'treats a tip attachment alongside text as silent on the attachment side'
  it('keeps text and adds only the tip label for tip messages with text', () => {
    const [result] = normalizeTranscriptMessages(
      [makeMsg({ id: 7, text: '<p>thanks!</p>', isTip: true })],
      { tipAmountsByMessageId: new Map([[7, 100]]) },
    );
    expect(result?.text).toBe('thanks!');
    expect(result?.labels).toEqual(['[Tip: $100.00]']);
  });

  // legacy: 'emits no label for embed-only fan messages' — deliberately changed:
  // SPEC §8.2 maps giphyId GIFs to an explicit [GIF] label instead of silence.
  it('labels giphy messages as [GIF], never as [Media]', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({ text: '<p>haha</p>', giphyId: 'abc123' }),
    ]);
    expect(result?.labels).toEqual(['[GIF]']);
  });

  it('does not duplicate [GIF] when the gif is already in media[]', () => {
    const [result] = normalizeTranscriptMessages([
      makeMsg({ giphyId: 'abc123', mediaCount: 1, media: [{ id: 4, type: 'gif' }] }),
    ]);
    expect(result?.labels).toEqual(['[GIF]']);
  });

  // legacy: 'emits only [Tip] for embed-only tipped messages, never [Media]'
  it('emits only the tip label for tipped messages without media', () => {
    const [result] = normalizeTranscriptMessages(
      [makeMsg({ id: 8, text: '', isTip: true })],
      { tipAmountsByMessageId: new Map([[8, 100]]) },
    );
    expect(result?.labels).toEqual(['[Tip: $100.00]']);
    expect(result?.labels.join(' ')).not.toContain('[Media]');
  });

  // legacy: 'legacy fallback: contentType missing and id unresolved — emits no label'
  it('emits no labels for a plain text message', () => {
    const [result] = normalizeTranscriptMessages([makeMsg({ text: '<p>old</p>' })]);
    expect(result?.labels).toEqual([]);
  });
});

describe('estimateTargetPages', () => {
  // legacy cases used Fansly's 25/page; OFAPI serves 100/page (SPEC §8.2) — same ceil/min behavior.
  it('returns 1 for counts up to one page', () => {
    expect(OFAPI_MESSAGES_PAGE_SIZE).toBe(100);
    expect(estimateTargetPages(1)).toBe(1);
    expect(estimateTargetPages(100)).toBe(1);
  });

  it('returns ceil(count/pageSize) for larger counts', () => {
    expect(estimateTargetPages(101)).toBe(2);
    expect(estimateTargetPages(250)).toBe(3);
    expect(estimateTargetPages(1500)).toBe(15);
  });

  it('never returns less than 1', () => {
    expect(estimateTargetPages(0)).toBe(1);
  });
});

describe('extractOldestMessageId', () => {
  it('returns null for an empty page', () => {
    expect(extractOldestMessageId([])).toBeNull();
  });

  it('returns the last element id (oldest in newest-first pages)', () => {
    const page = [
      makeMsg({ id: 300, createdAt: '2026-06-01T00:05:00+00:00' }),
      makeMsg({ id: 100, createdAt: '2026-06-01T00:01:00+00:00' }),
    ];
    expect(extractOldestMessageId(page)).toBe(100);
  });
});

describe('transcriptWindowStartMs', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('returns 90 days ago when no messages', () => {
    const now = Date.parse('2026-06-10T00:00:00Z');
    expect(TRANSCRIPT_EMPTY_WINDOW_MS).toBe(90 * DAY_MS);
    expect(transcriptWindowStartMs([], now)).toBe(now - 90 * DAY_MS);
  });

  it('returns the first message createdAtMs when messages exist', () => {
    const first: TranscriptMessage = {
      id: 1,
      createdAtMs: 1700000000000,
      sender: 'Fan',
      text: 'hello',
      labels: [],
    };
    expect(transcriptWindowStartMs([first], Date.now())).toBe(1700000000000);
  });
});
