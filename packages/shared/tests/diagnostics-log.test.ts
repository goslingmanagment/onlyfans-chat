import { describe, expect, it } from 'vitest';
import {
  errorToFields,
  formatLogLine,
  levelRank,
  meetsLevel,
  redactEntry,
  redactSecrets,
  redactValue,
  REDACTED,
  RingBuffer,
  type LogEntry,
} from '../src/diagnostics/log';

describe('log levels', () => {
  it('orders debug < info < warn < error', () => {
    expect(levelRank('debug')).toBeLessThan(levelRank('info'));
    expect(levelRank('info')).toBeLessThan(levelRank('warn'));
    expect(levelRank('warn')).toBeLessThan(levelRank('error'));
  });

  it('meetsLevel gates by severity', () => {
    expect(meetsLevel('error', 'info')).toBe(true);
    expect(meetsLevel('info', 'info')).toBe(true);
    expect(meetsLevel('debug', 'info')).toBe(false);
  });
});

describe('redactSecrets', () => {
  it('masks exact known secret values (literal, no regex escaping needed)', () => {
    const secret = 'super.secret+value/with[regex]chars';
    const out = redactSecrets(`key is ${secret} ok`, [secret]);
    expect(out).toBe(`key is ${REDACTED} ok`);
  });

  it('ignores secrets shorter than 6 chars (too generic)', () => {
    expect(redactSecrets('the cat sat', ['cat'])).toBe('the cat sat');
  });

  it('masks Anthropic / OpenRouter / OFAPI / hub token shapes even when not enumerated', () => {
    expect(redactSecrets('sk-ant-api03-AbCdEfGhIjKlMnOpQrSt')).toBe(REDACTED);
    expect(redactSecrets('sk-or-v1-0123456789abcdef0123')).toBe(REDACTED);
    expect(redactSecrets('ofapi_AbCdEf0123456789ghij')).toBe(REDACTED);
    expect(redactSecrets('agency_hub_core_abc123def456')).toBe(REDACTED);
  });

  it('masks Bearer header values', () => {
    expect(redactSecrets('Authorization: Bearer abcdef0123456789')).toContain(REDACTED);
    expect(redactSecrets('Authorization: Bearer abcdef0123456789')).not.toContain('abcdef0123');
  });

  it('keeps the label but masks labelled secret values', () => {
    const out = redactSecrets('{"apiKey":"abcdef123456","note":"hello"}');
    expect(out).toContain('"apiKey":"' + REDACTED);
    expect(out).not.toContain('abcdef123456');
    expect(out).toContain('hello');
  });

  it('does NOT mask ordinary ids (acct_, numeric chat ids, words)', () => {
    const text = 'acct_9aZ openned chat 123456789 for fan Olivia';
    expect(redactSecrets(text)).toBe(text);
  });

  it('handles empty / no-secret input without changes', () => {
    expect(redactSecrets('plain text', [])).toBe('plain text');
    expect(redactSecrets('plain text')).toBe('plain text');
  });
});

describe('redactValue (deep)', () => {
  it('redacts string leaves in nested objects and arrays', () => {
    const out = redactValue(
      { a: 'sk-ant-api03-AbCdEfGhIjKlMnOpQr', b: [{ c: 'keepme' }], n: 5, ok: true },
      [],
    ) as Record<string, unknown>;
    expect(out['a']).toBe(REDACTED);
    expect((out['b'] as Array<{ c: string }>)[0]?.c).toBe('keepme');
    expect(out['n']).toBe(5);
    expect(out['ok']).toBe(true);
  });

  it('survives cyclic values', () => {
    const circular: Record<string, unknown> = { label: 'root' };
    circular['self'] = circular;
    const out = redactValue(circular) as Record<string, unknown>;
    expect(out['label']).toBe('root');
    expect(out['self']).toBe('[circular]');
  });

  it('bounds very deep and very large values', () => {
    let deep: Record<string, unknown> = { secret: 'sk-ant-api03-AbCdEfGhIjKlMnOpQr' };
    for (let i = 0; i < 20; i += 1) {
      deep = { child: deep };
    }
    const out = redactValue({
      deep,
      many: Array.from({ length: 105 }, (_, i) => i),
      long: `x${'a'.repeat(21_000)}`,
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).toContain('[max-depth]');
    expect(JSON.stringify(out)).toContain('5 items truncated');
    expect(JSON.stringify(out)).toContain('...[truncated]');
  });

  it('redacts before bounding long strings', () => {
    const secret = 'SECRET_VALUE_THAT_CROSSES_THE_BOUNDARY';
    const out = redactValue(`${'x'.repeat(19_990)}${secret}${'y'.repeat(2_000)}`, [secret]);
    expect(out).not.toContain(secret);
    expect(out).toContain(REDACTED);
    expect(out).toContain('...[truncated]');
  });
});

describe('redactEntry', () => {
  it('redacts both message and fields against known secrets', () => {
    const entry: LogEntry = {
      t: 0,
      level: 'error',
      scope: 'ofapi',
      msg: 'request failed with key MYSECRETKEY99',
      fields: { url: 'https://x?token=MYSECRETKEY99' },
    };
    const out = redactEntry(entry, ['MYSECRETKEY99']);
    expect(out.msg).not.toContain('MYSECRETKEY99');
    expect(JSON.stringify(out.fields)).not.toContain('MYSECRETKEY99');
    // untouched scalars survive
    expect(out.level).toBe('error');
    expect(out.t).toBe(0);
  });
});

describe('errorToFields', () => {
  it('extracts name/message/stack/code/cause from an Error', () => {
    const err = Object.assign(new Error('boom'), { code: 'CG-OF-03' });
    err.cause = new Error('inner');
    const fields = errorToFields(err);
    expect(fields['name']).toBe('Error');
    expect(fields['message']).toBe('boom');
    expect(fields['code']).toBe('CG-OF-03');
    expect(typeof fields['stack']).toBe('string');
    expect(fields['cause']).toMatchObject({ message: 'inner' });
  });

  it('wraps non-Error throws', () => {
    expect(errorToFields('nope')).toEqual({ value: 'nope' });
    expect(errorToFields({ weird: true })).toEqual({ value: { weird: true } });
  });
});

describe('formatLogLine', () => {
  it('renders an ISO timestamp, padded level, scope, code and fields', () => {
    const line = formatLogLine({
      t: Date.parse('2026-06-13T01:02:03.000Z'),
      level: 'warn',
      scope: 'sync',
      code: 'CG-NET-01',
      msg: 'network blip',
      fields: { attempt: 2 },
    });
    expect(line).toBe('2026-06-13T01:02:03.000Z WARN  [sync] CG-NET-01 network blip {"attempt":2}');
  });

  it('collapses newlines so each record stays one line', () => {
    const line = formatLogLine({ t: 0, level: 'info', scope: 's', msg: 'a\nb\r\nc' });
    expect(line).not.toMatch(/\n/);
    expect(line).toContain('a ⏎ b ⏎ c');
  });

  it('survives circular fields without throwing', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => formatLogLine({ t: 0, level: 'info', scope: 's', msg: 'x', fields: circular })).not.toThrow();
    expect(formatLogLine({ t: 0, level: 'info', scope: 's', msg: 'x', fields: circular })).toContain(
      '[circular]',
    );
  });
});

describe('RingBuffer', () => {
  it('keeps only the last N items', () => {
    const ring = new RingBuffer<number>(3);
    for (const n of [1, 2, 3, 4, 5]) ring.push(n);
    expect(ring.toArray()).toEqual([3, 4, 5]);
    expect(ring.size).toBe(3);
  });

  it('clears', () => {
    const ring = new RingBuffer<number>(2);
    ring.push(1);
    ring.clear();
    expect(ring.toArray()).toEqual([]);
    expect(ring.size).toBe(0);
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new RingBuffer<number>(0)).toThrow();
    expect(() => new RingBuffer<number>(-1)).toThrow();
  });
});
