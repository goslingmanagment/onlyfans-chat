// Exercise the checked-in workflow's event filters, job conditions and
// concurrency against real event shapes. No runner, release or network calls.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
// ESLint is a direct devDependency and uses js-yaml to read its own config.
// Reuse that parser instead of maintaining a YAML-shaped regex parser.
const require = createRequire(import.meta.url);
const eslintRequire = createRequire(require.resolve('eslint/package.json'));
const { load } = eslintRequire('js-yaml') as { load: (text: string) => unknown };

interface Job {
  name?: string;
  if?: string | boolean;
  steps?: { name?: string; if?: string; run?: string }[];
}
interface Workflow {
  on: Record<string, { types?: string[]; branches?: string[]; tags?: string[] } | null>;
  jobs: Record<string, Job>;
  concurrency: { group: string; 'cancel-in-progress': string | boolean };
}
interface Event {
  event_name: string;
  ref: string;
  run_id: number;
  event: { action?: string; pull_request?: { draft: boolean } };
}

function workflow(file = 'ci.yml'): Workflow {
  return load(readFileSync(resolve(repoRoot, '.github/workflows', file), 'utf8')) as Workflow;
}
const ci = workflow();

function pr(action: string, draft: boolean, run_id = 1): Event {
  return { event_name: 'pull_request', ref: 'refs/pull/7/merge', run_id, event: { action, pull_request: { draft } } };
}
function event(event_name: string, ref: string, run_id = 1): Event {
  return { event_name, ref, run_id, event: {} };
}

// These workflow conditions use boolean/string comparisons and &&/||, whose
// results agree in JS and Actions for the typed fixtures below. actionlint
// separately validates Actions syntax; this is not a general Actions emulator.
function expression(value: string | boolean | undefined, github: Event, inputs = {}): unknown {
  if (value === undefined) return true;
  if (typeof value === 'boolean') return value;
  return runInNewContext(value.replace(/^\$\{\{\s*|\s*\}\}$/g, ''), {
    github, inputs, startsWith: (text: string, prefix: string) => text.startsWith(prefix),
  }, { timeout: 100 });
}
function matches(pattern: string, value: string): boolean {
  return pattern.endsWith('*') ? value.startsWith(pattern.slice(0, -1)) : pattern === value;
}
function triggered(w: Workflow, e: Event): boolean {
  if (!(e.event_name in w.on)) return false;
  const filter = w.on[e.event_name];
  if (e.event_name === 'pull_request') {
    return (filter?.types ?? ['opened', 'synchronize', 'reopened']).includes(e.event.action ?? '');
  }
  if (e.event_name === 'push' && filter) {
    if (e.ref.startsWith('refs/heads/')) {
      return filter.branches ? filter.branches.some((p) => matches(p, e.ref.slice(11))) : !filter.tags;
    }
    if (e.ref.startsWith('refs/tags/')) {
      return filter.tags ? filter.tags.some((p) => matches(p, e.ref.slice(10))) : !filter.branches;
    }
    return false;
  }
  return true;
}
function jobsFor(w: Workflow, e: Event): string[] {
  if (!triggered(w, e)) return [];
  return Object.entries(w.jobs).filter(([, job]) => expression(job.if, e)).map(([id]) => id).sort();
}
function group(e: Event): string {
  return ci.concurrency.group.replace(/\$\{\{(.*?)\}\}/g, (_, value: string) => String(expression(value, e)));
}

describe('CI Draft / Ready policy', () => {
  it.each([
    ['opened', true], ['synchronize', true], ['reopened', true], ['converted_to_draft', true],
  ])('a draft %s schedules no expensive job', (action, draft) => {
    const e = pr(action, draft);
    expect(triggered(ci, e)).toBe(true);
    expect(jobsFor(ci, e)).toEqual([]);
  });

  it.each(['opened', 'synchronize', 'reopened', 'ready_for_review'])('%s on a ready PR runs the required check', (action) => {
    expect(jobsFor(ci, pr(action, false))).toEqual(['check']);
    expect(ci.jobs.check?.name ?? 'check').toBe('pnpm check');
  });

  it('returning to Draft cancels the earlier PR run without cancelling main pushes', () => {
    const running = pr('synchronize', false, 10);
    const draft = pr('converted_to_draft', true, 11);
    expect(group(draft)).toBe(group(running));
    expect(expression(ci.concurrency['cancel-in-progress'], draft)).toBe(true);
    const first = event('push', 'refs/heads/main', 12);
    const second = event('push', 'refs/heads/main', 13);
    expect(expression(ci.concurrency['cancel-in-progress'], second)).toBe(false);
    expect(group(first)).not.toBe(group(second));
  });

  it('keeps the main push checks and does not introduce branch, tag or manual CI', () => {
    expect(jobsFor(ci, event('push', 'refs/heads/main'))).toEqual(['check', 'windows-check']);
    expect(jobsFor(ci, event('push', 'refs/heads/feature'))).toEqual([]);
    expect(jobsFor(ci, event('push', 'refs/tags/v2.0.0'))).toEqual([]);
    expect(jobsFor(ci, event('workflow_dispatch', 'refs/heads/main'))).toEqual([]);
  });
});

describe('Windows release boundaries remain independent of Draft CI', () => {
  const release = workflow('windows-build.yml');

  it.each([
    ['opened', true], ['synchronize', true], ['ready_for_review', false],
  ])('a PR %s cannot trigger the release workflow', (action, draft) => {
    expect(jobsFor(release, pr(action, draft))).toEqual([]);
  });

  it('keeps tag/manual builds and publication opt-in for manual validation', () => {
    const tag = event('push', 'refs/tags/v0.2.0');
    const manual = event('workflow_dispatch', 'refs/heads/main');
    expect(jobsFor(release, event('push', 'refs/heads/main'))).toEqual([]);
    expect(jobsFor(release, tag)).toEqual(['build']);
    expect(jobsFor(release, manual)).toEqual(['build']);
    const publish = release.jobs.build?.steps?.find((step) => step.name === 'Upload to the update feed');
    expect(publish?.if).toBeDefined();
    expect(expression(publish?.if, manual, { publishFeed: false })).toBe(false);
    expect(expression(publish?.if, tag, { publishFeed: false })).toBe(true);
    expect(expression(publish?.if, event('workflow_dispatch', tag.ref), { publishFeed: true })).toBe(true);
  });

  it('release proof asks only for successful main push runs, never a Draft/Ready PR run', () => {
    const proof = release.jobs.build?.steps?.find((step) => step.run?.includes('assert-ci-success.mjs'))?.run;
    const query = proof?.match(/actions\/workflows\/ci\.yml\/runs\?([^"\s]+)/)?.[1];
    expect(query).toBeDefined();
    const params = new URLSearchParams(query);
    expect(params.get('event')).toBe('push');
    expect(params.get('branch')).toBe('main');
    expect(params.get('head_sha')).toBe('$release_sha');
    expect(params.get('status')).toBe('success');
  });
});
