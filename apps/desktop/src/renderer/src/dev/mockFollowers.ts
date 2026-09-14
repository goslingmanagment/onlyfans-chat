import type {
  FollowerDetailVM,
  FollowerRowVM,
  FollowerStatus,
  FollowerTraceVM,
  FollowersChannels,
  FollowersSnapshotVM,
} from '../../../preload/followers-contract';

type Handlers = {
  [K in keyof FollowersChannels]: (
    args: FollowersChannels[K]['args'],
  ) => FollowersChannels[K]['result'] | Promise<FollowersChannels[K]['result']>;
};
const allStatuses: FollowerStatus[] = [
  'pending',
  'checking',
  'ready',
  'replied',
  'contacted',
  'unknown',
  'blocked',
  'sending',
  'sent',
];
const emptyCounts = () =>
  Object.fromEntries(allStatuses.map((s) => [s, 0])) as Record<
    FollowerStatus,
    number
  >;
interface Run {
  snapshot: FollowersSnapshotVM;
  details: Map<string, FollowerDetailVM>;
  traces: FollowerTraceVM[];
  timer: ReturnType<typeof setTimeout> | null;
}
/** Deterministic fixture transport. Never requests a platform or writes a real DM. */
export function createMockFollowers(
  changed: (accountId: string) => void,
  debug: () => boolean,
): Handlers {
  const runs = new Map<string, Run>();
  function get(accountId: string): Run {
    let run = runs.get(accountId);
    if (run === undefined) {
      run = {
        snapshot: {
          runId: null,
          state: 'idle',
          stage: '',
          from: null,
          to: null,
          startedAt: null,
          checked: 0,
          total: 0,
          requests: 0,
          cooldownUntil: null,
          truncated: false,
          error: null,
          counts: emptyCounts(),
          rows: [],
          matching: 0,
          debug: debug(),
        },
        details: new Map(),
        traces: [],
        timer: null,
      };
      runs.set(accountId, run);
    }
    return run;
  }
  function trace(
    run: Run,
    fanId: string | null,
    event: string,
    detail: FollowerTraceVM['detail'],
  ): void {
    if (!debug()) return;
    run.traces.push({
      seq: run.traces.length + 1,
      at: new Date().toISOString(),
      elapsedMs:
        Date.now() -
        Date.parse(run.snapshot.startedAt ?? new Date().toISOString()),
      fanId,
      event,
      detail,
    });
  }
  function tick(accountId: string): void {
    const run = get(accountId);
    if (run.snapshot.state !== 'running') return;
    const next = Math.min(run.snapshot.checked + 70, run.snapshot.total);
    for (let i = run.snapshot.checked; i < next; i++) {
      const row = run.snapshot.rows[i];
      if (row !== undefined) {
        const nextStatus =
          (
            [
              'ready',
              'contacted',
              'replied',
              'ready',
              'unknown',
              'blocked',
              'ready',
            ] as const
          )[i % 7] ?? 'ready';
        row.status = nextStatus;
        row.checkedAt = new Date().toISOString();
        row.reason =
          nextStatus === 'ready'
            ? 'Личных исходящих нет'
            : nextStatus === 'contacted'
              ? 'Найдено личное сообщение модели'
              : nextStatus === 'unknown'
                ? 'Нельзя отличить автоматическое сообщение от личного'
                : nextStatus === 'blocked'
                  ? 'Чат недоступен'
                  : 'Входящее сообщение фана';
        if (nextStatus === 'contacted' || nextStatus === 'replied') {
          const kind = nextStatus === 'contacted' ? 'personal' : 'incoming';
          const evidence = run.details
            .get(row.fanId)
            ?.messages.find((message) => message.kind === kind);
          row.proof =
            evidence === undefined
              ? null
              : {
                  at: evidence.at,
                  text: evidence.text,
                  kind,
                };
        }
        trace(run, row.fanId, 'fan.verdict', { status: row.status });
      }
    }
    run.snapshot.checked = next;
    run.snapshot.requests += 70;
    run.snapshot.stage =
      next === run.snapshot.total
        ? 'Готово'
        : `История · ${next}/${run.snapshot.total}`;
    changed(accountId);
    if (next === run.snapshot.total) {
      run.snapshot.state = 'complete';
      run.timer = null;
    } else run.timer = setTimeout(() => tick(accountId), 300);
  }
  return {
    'query:followers.snapshot': ({
      accountId,
      offset = 0,
      limit = 100,
      filter = 'all',
      search = '',
    }) => {
      const snapshot = get(accountId).snapshot;
      const counts = emptyCounts();
      for (const row of snapshot.rows) counts[row.status] += 1;
      const needle = search.toLowerCase();
      const rows = snapshot.rows.filter(
        (r) =>
          (filter === 'all' || r.status === filter) &&
          `${r.name} ${r.username} ${r.fanId}`.toLowerCase().includes(needle),
      );
      return structuredClone({
        ...snapshot,
        debug: debug(),
        counts,
        matching: rows.length,
        rows: rows.slice(offset, offset + Math.min(200, limit)),
      });
    },
    'query:followers.detail': ({ accountId, fanId }) =>
      structuredClone(get(accountId).details.get(fanId) ?? null),
    'cmd:followers.start': ({ accountId, hours, acknowledgeRead }) => {
      if (!acknowledgeRead)
        throw new Error('Explicit read acknowledgement required');
      const old = get(accountId);
      if (old.timer !== null) clearTimeout(old.timer);
      const now = Date.now();
      const run = get(accountId);
      run.snapshot = {
        ...run.snapshot,
        runId: `${accountId}-${now}`,
        state: 'running',
        startedAt: new Date(now).toISOString(),
        from: new Date(now - hours * 3_600_000).toISOString(),
        to: new Date(now).toISOString(),
        total: 700,
        matching: 700,
        checked: 0,
        requests: 36,
        stage: 'Проверка истории',
        rows: [],
        error: null,
      };
      run.details.clear();
      run.traces = [];
      const names = [
        'Leonidas92',
        'Ecstasy13',
        'hennyco',
        'Alexander',
        'sgtjohnson132',
        'James',
        'Marcus',
      ];
      for (let i = 0; i < 700; i++) {
        const id = String(91000 + i);
        const username = i < names.length ? (names[i] ?? `fan${i}`) : `fan${i}`;
        const row: FollowerRowVM = {
          fanId: id,
          name: username,
          username,
          avatarUrl: null,
          subscribedAt: new Date(
            now - (i * hours * 3_600_000) / 700,
          ).toISOString(),
          status: 'pending',
          reason: 'В очереди',
          checkedAt: null,
          proof: null,
          revision: `revision-${i}`,
          hasDraft: false,
        };
        run.snapshot.rows.push(row);
        run.details.set(id, {
          row,
          about: 'Hey, I am happy to be here.',
          draft: '',
          generating: false,
          sending: false,
          hasOlder: [1, 2, 4].includes(i % 7),
          messages: [
            ...([1, 2, 4, 5].includes(i % 7)
              ? [
                  {
                    id: `welcome-${i}`,
                    at: new Date(now - 3_600_000).toISOString(),
                    fromMe: true,
                    text: 'Welcome to my page! So happy you joined me ♥',
                    mediaCount: 1,
                    kind: 'ambiguous' as const,
                  },
                ]
              : []),
            ...(i % 7 === 1
              ? [
                  {
                    id: `personal-${i}`,
                    at: new Date(now - 1_800_000).toISOString(),
                    fromMe: true,
                    text: 'Hey! How is your week going?',
                    mediaCount: 0,
                    kind: 'personal' as const,
                  },
                ]
              : []),
            ...(i % 7 === 2
              ? [
                  {
                    id: `incoming-${i}`,
                    at: new Date(now - 1_000_000).toISOString(),
                    fromMe: false,
                    text: 'Hey, happy to be here!',
                    mediaCount: 0,
                    kind: 'incoming' as const,
                  },
                ]
              : []),
          ],
        });
      }
      trace(run, null, 'run.started', { hours, fans: 700 });
      changed(accountId);
      run.timer = setTimeout(() => tick(accountId), 300);
    },
    'cmd:followers.pause': ({ accountId }) => {
      const run = get(accountId);
      run.snapshot.state = 'paused';
      run.snapshot.stage = 'Пауза';
      if (run.timer !== null) clearTimeout(run.timer);
      changed(accountId);
    },
    'cmd:followers.resume': ({ accountId }) => {
      const run = get(accountId);
      run.snapshot.state = 'running';
      changed(accountId);
      tick(accountId);
    },
    'cmd:followers.recheck': ({ accountId, fanId }) => {
      const detail = get(accountId).details.get(fanId);
      if (detail && detail.row.status === 'unknown') {
        detail.row.reason =
          'Нельзя отличить автоматическое сообщение от личного';
        detail.row.checkedAt = new Date().toISOString();
        detail.row.revision += '-checked';
      }
      changed(accountId);
    },
    'cmd:followers.older': ({ accountId, fanId }) => {
      const detail = get(accountId).details.get(fanId);
      if (detail && detail.hasOlder) {
        detail.messages.unshift({
          id: `old-${fanId}`,
          at: new Date(Date.now() - 86_400_000).toISOString(),
          fromMe: true,
          text: 'A preview from my latest set',
          mediaCount: 2,
          kind: 'ambiguous',
        });
        detail.hasOlder = false;
      }
      changed(accountId);
    },
    'cmd:followers.draft': ({ accountId, fanId, text }) => {
      const detail = get(accountId).details.get(fanId);
      if (detail) {
        detail.draft = text;
        detail.row.hasDraft = text.trim() !== '';
      }
      changed(accountId);
    },
    'cmd:followers.generate': async ({ accountId, fanId }) => {
      const detail = get(accountId).details.get(fanId);
      if (!detail || detail.row.status !== 'ready')
        throw new Error('Fan is not ready');
      detail.generating = true;
      changed(accountId);
      await new Promise((r) => setTimeout(r, 500));
      detail.generating = false;
      detail.draft = `Hey ${detail.row.name}, happy to see you here! How has your day been?`;
      detail.row.hasDraft = true;
      changed(accountId);
    },
    'cmd:followers.send': ({ accountId, fanId, revision, text }) => {
      const detail = get(accountId).details.get(fanId);
      if (
        !detail ||
        detail.row.status !== 'ready' ||
        revision !== detail.row.revision
      )
        throw new Error('Review changed');
      detail.row.status = 'sent';
      detail.row.reason = 'Fixture send complete';
      detail.draft = '';
      detail.row.hasDraft = false;
      detail.messages.push({
        id: `sent-${Date.now()}`,
        at: new Date().toISOString(),
        text,
        fromMe: true,
        mediaCount: 0,
        kind: 'personal',
      });
      trace(get(accountId), fanId, 'send.confirmed', { fixture: true });
      changed(accountId);
    },
    'query:followers.trace': ({
      accountId,
      offset = 0,
      fanId,
      search = '',
    }) => {
      const run = get(accountId);
      const events = run.traces.filter(
        (e) =>
          (!fanId || e.fanId === fanId) &&
          JSON.stringify(e).toLowerCase().includes(search.toLowerCase()),
      );
      return structuredClone({
        runs:
          run.snapshot.runId && run.snapshot.startedAt
            ? [{ id: run.snapshot.runId, startedAt: run.snapshot.startedAt }]
            : [],
        events: events.slice(offset, offset + 1000),
        total: events.length,
        dropped: 0,
      });
    },
    'cmd:followers.export': () => ({ path: '/tmp/mock-followers-trace.txt' }),
  };
}
